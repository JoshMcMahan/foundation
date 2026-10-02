import { describe, expect, it } from 'vitest'
import {
  ApiError,
  codeForStatus,
  FieldError,
  fromResponseBody,
  pointerToPath,
  problemMiddleware,
  toApiError,
} from './index.js'

describe('toApiError', () => {
  it('reads a problem with a code, params and field errors', () => {
    const err = toApiError({
      type: '/problems/validation',
      title: 'Invalid request',
      status: 422,
      detail: 'validation failed',
      code: 'validation',
      errors: [
        {
          type: '/problems/too_long',
          code: 'too_long',
          pointer: '#/items/0/name',
          params: { max: 64 },
        },
        { type: '/problems/required', code: 'required', parameter: 'team', in: 'query' },
        { detail: 'no code, skipped' },
      ],
    })
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(422)
    expect(err.code).toBe('validation')
    expect(err.type).toBe('/problems/validation')
    expect(err.message).toBe('validation failed')
    expect(err.fields.map((f) => [f.code, f.path, f.params])).toEqual([
      ['too_long', 'items[0].name', { max: 64 }],
      ['required', 'team', {}],
    ])
    expect(err.field).toBe('items[0].name')
  })

  it('derives the code of an about:blank problem from its status', () => {
    const err = toApiError({ type: 'about:blank', title: 'Not Found', status: 404 })
    expect(err.code).toBe('not_found')
    expect(err.message).toBe('Not Found')
  })

  it('reads the older envelope, with or without a code', () => {
    expect(toApiError({ error: true, message: 'x', status: 403 }).code).toBe('forbidden')
    expect(
      toApiError({ error: true, message: 'x', code: 'product_disabled', status: 403 }).code,
    ).toBe('product_disabled')
  })

  it('reads an axios error from its response', () => {
    const err = toApiError({
      isAxiosError: true,
      message: 'Request failed with status code 409',
      response: { status: 409, data: { error: true, message: 'Name taken' } },
    })
    expect([err.status, err.code, err.message]).toEqual([409, 'conflict', 'Name taken'])
    expect(toApiError({ isAxiosError: true, message: 'Network Error' }).code).toBe('network')
  })

  it('treats a TypeError from fetch as a network failure', () => {
    const err = toApiError(new TypeError('Failed to fetch'))
    expect([err.status, err.code]).toEqual([0, 'network'])
  })

  it('treats anything else as unknown', () => {
    expect(toApiError(new Error('boom')).code).toBe('unknown')
    expect(toApiError('boom').code).toBe('unknown')
    expect(toApiError(undefined).code).toBe('unknown')
  })

  it('returns an ApiError unchanged', () => {
    const err = new ApiError({ status: 409, code: 'name_taken' })
    expect(toApiError(err)).toBe(err)
  })

  it('ignores params that are not strings or numbers', () => {
    const err = fromResponseBody(
      { code: 'x', params: { a: 1, b: 'two', c: { nested: true } } },
      400,
    )
    expect(err.params).toEqual({ a: 1, b: 'two' })
  })
})

describe('codeForStatus', () => {
  it.each([
    [400, 'invalid_request'],
    [401, 'unauthenticated'],
    [403, 'forbidden'],
    [404, 'not_found'],
    [409, 'conflict'],
    [413, 'invalid_request'],
    [429, 'rate_limited'],
    [500, 'internal'],
    [502, 'internal'],
    [503, 'unavailable'],
  ])('%i is %s', (status, code) => {
    expect(codeForStatus(status)).toBe(code)
  })
})

describe('pointerToPath', () => {
  it.each([
    ['#', ''],
    ['#/name', 'name'],
    ['#/items/0/name', 'items[0].name'],
    ['#/a~1b/c~0d', 'a/b.c~d'],
    ['#/with%20space', 'with space'],
    ['#/0', '0'],
  ])('%s is %s', (pointer, path) => {
    expect(pointerToPath(pointer)).toBe(path)
  })

  it('gives a FieldError the parameter name when there is no pointer', () => {
    expect(new FieldError({ code: 'required', parameter: 'limit' }).path).toBe('limit')
  })
})

describe('problemMiddleware', () => {
  it('adds problem+json to Accept', () => {
    const req = problemMiddleware.onRequest({ request: new Request('https://x.test/') })
    expect(req.headers.get('Accept')).toBe('application/json, application/problem+json')
    const json = problemMiddleware.onRequest({
      request: new Request('https://x.test/', { headers: { Accept: 'application/json' } }),
    })
    expect(json.headers.get('Accept')).toBe('application/json, application/problem+json')
  })

  it("copies a localized problem's Content-Language into its body", async () => {
    const res = await problemMiddleware.onResponse({
      response: new Response(
        JSON.stringify({ type: 'about:blank', status: 404, detail: 'ありません。' }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/problem+json', 'Content-Language': 'ja' },
        },
      ),
    })
    const body: unknown = await res.json()
    expect(body).toMatchObject({ detail: 'ありません。', language: 'ja' })
    expect(toApiError(body).language).toBe('ja')
    expect(res.status).toBe(404)
  })

  it('leaves responses without Content-Language, and successes, alone', async () => {
    const plain = new Response('{"status":404}', {
      status: 404,
      headers: { 'Content-Type': 'application/problem+json' },
    })
    expect(await problemMiddleware.onResponse({ response: plain })).toBe(plain)
    const ok = new Response('{}', { status: 200, headers: { 'Content-Language': 'ja' } })
    expect(await problemMiddleware.onResponse({ response: ok })).toBe(ok)
  })

  it("sends the page's language as Accept-Language, unless the request has one", () => {
    const doc = { documentElement: { lang: 'ja' } }
    Object.defineProperty(globalThis, 'document', { value: doc, configurable: true })
    try {
      const req = problemMiddleware.onRequest({ request: new Request('https://x.test/') })
      expect(req.headers.get('Accept-Language')).toBe('ja')
      const own = problemMiddleware.onRequest({
        request: new Request('https://x.test/', { headers: { 'Accept-Language': 'es' } }),
      })
      expect(own.headers.get('Accept-Language')).toBe('es')
    } finally {
      Reflect.deleteProperty(globalThis, 'document')
    }
  })

  it('leaves an Accept that already asks for problems', () => {
    const req = problemMiddleware.onRequest({
      request: new Request('https://x.test/', { headers: { Accept: 'application/problem+json' } }),
    })
    expect(req.headers.get('Accept')).toBe('application/problem+json')
  })
})

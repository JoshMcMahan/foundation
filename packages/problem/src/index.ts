/** The RFC 9457 media type for a problem details object. */
export const problemMediaType = 'application/problem+json'

/** Values a code's localized message shows, such as `max` for `too_long`. */
export type Params = Record<string, string | number>

/**
 * A code with a message in the shared catalog: the codes clients derive from
 * the status of an `about:blank` problem, the validation rules, and
 * `network` and `unknown` for failures that never reached the server.
 */
export type SharedCode =
  | 'invalid_request'
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  | 'internal'
  | 'unavailable'
  | 'network'
  | 'unknown'
  | 'validation'
  | 'invalid'
  | 'required'
  | 'too_short'
  | 'too_long'
  | 'too_few'
  | 'too_many'
  | 'below_minimum'
  | 'above_maximum'
  | 'invalid_format'
  | 'invalid_choice'
  | 'invalid_type'
  | 'unexpected_field'
  | 'duplicate_items'

/** The code for an `about:blank` problem, or any response without one. */
export function codeForStatus(status: number): SharedCode {
  if (status === 401) return 'unauthenticated'
  if (status === 403) return 'forbidden'
  if (status === 404) return 'not_found'
  if (status === 409) return 'conflict'
  if (status === 429) return 'rate_limited'
  if (status === 503) return 'unavailable'
  if (status >= 400 && status < 500) return 'invalid_request'
  return 'internal'
}

/** One invalid field or parameter in a validation problem. */
export class FieldError {
  readonly code: string
  readonly type: string
  readonly params: Params
  /** English, for developers and logs. */
  readonly detail: string
  /** The JSON Pointer to a body field, such as `#/items/0/name`. */
  readonly pointer: string | undefined
  /** The name of a query, path, header or cookie parameter. */
  readonly parameter: string | undefined
  /**
   * The field as a form path, such as `items[0].name`: the body field
   * `pointer` locates, or else the parameter's name.
   */
  readonly path: string

  constructor(init: {
    code: string
    type?: string
    params?: Params
    detail?: string
    pointer?: string
    parameter?: string
  }) {
    this.code = init.code
    this.type = init.type ?? `/problems/${init.code}`
    this.params = init.params ?? {}
    this.detail = init.detail ?? ''
    this.pointer = init.pointer
    this.parameter = init.parameter
    this.path = init.pointer !== undefined ? pointerToPath(init.pointer) : (init.parameter ?? '')
  }
}

/**
 * A failed request. `code` and `params` pick its localized message (see
 * `useErrorMessage`). `message` is the server's detail: in `language` when
 * the server localized it, and otherwise English, for logs. `status` is 0 for
 * a failure that never got a response.
 */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly type: string
  readonly params: Params
  readonly fields: readonly FieldError[]
  readonly language: string | undefined

  constructor(init: {
    status: number
    code: string
    message?: string
    type?: string
    params?: Params
    fields?: readonly FieldError[]
    language?: string
  }) {
    super(init.message ?? init.code)
    this.name = 'ApiError'
    this.status = init.status
    this.code = init.code
    this.type = init.type ?? 'about:blank'
    this.params = init.params ?? {}
    this.fields = init.fields ?? []
    this.language = init.language
  }

  /** The form path of the first invalid field, when there is one. */
  get field(): string | undefined {
    return this.fields[0]?.path
  }
}

type Json = Record<string, unknown>

function isObject(v: unknown): v is Json {
  return typeof v === 'object' && v !== null
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v !== '' ? v : undefined
}

function params(v: unknown): Params {
  const out: Params = {}
  if (!isObject(v)) return out
  for (const [k, value] of Object.entries(v)) {
    if (typeof value === 'string' || typeof value === 'number') out[k] = value
  }
  return out
}

function fieldErrors(v: unknown): FieldError[] {
  if (!Array.isArray(v)) return []
  const out: FieldError[] = []
  for (const e of v) {
    const code = isObject(e) ? str(e['code']) : undefined
    if (!isObject(e) || code === undefined) continue
    const pointer = str(e['pointer'])
    const parameter = str(e['parameter'])
    const type = str(e['type'])
    const detail = str(e['detail'])
    out.push(
      new FieldError({
        code,
        params: params(e['params']),
        ...(type !== undefined && { type }),
        ...(detail !== undefined && { detail }),
        ...(pointer !== undefined && { pointer }),
        ...(parameter !== undefined && { parameter }),
      }),
    )
  }
  return out
}

/**
 * Builds an ApiError from a response body and status. It reads a problem
 * details object, and also the older `{ error, message, code }` envelope and
 * bodies from outside the API, such as a proxy's, which carry no code.
 */
export function fromResponseBody(body: unknown, status: number): ApiError {
  const b = isObject(body) ? body : {}
  const s = typeof b['status'] === 'number' ? b['status'] : status
  const type = str(b['type'])
  const message = str(b['detail']) ?? str(b['message']) ?? str(b['title'])
  const language = str(b['language'])
  return new ApiError({
    status: s,
    code: str(b['code']) ?? codeForStatus(s),
    params: params(b['params']),
    fields: fieldErrors(b['errors']),
    ...(type !== undefined && { type }),
    ...(message !== undefined && { message }),
    ...(language !== undefined && { language }),
  })
}

/**
 * Turns anything thrown or returned as an error into an ApiError:
 *
 * - an ApiError, unchanged;
 * - an error body with a numeric `status`, as openapi-fetch clients that
 *   record the status return it;
 * - an axios error, from its response;
 * - a TypeError, which is how fetch reports a request that never completed:
 *   code `network`;
 * - anything else: code `unknown`.
 */
export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err
  if (isObject(err) && err['isAxiosError'] === true) {
    const response = err['response']
    if (isObject(response) && typeof response['status'] === 'number') {
      return fromResponseBody(response['data'], response['status'])
    }
    return new ApiError({ status: 0, code: 'network', message: str(err['message']) ?? 'network' })
  }
  if (err instanceof TypeError) {
    return new ApiError({ status: 0, code: 'network', message: err.message })
  }
  if (isObject(err) && typeof err['status'] === 'number' && !(err instanceof Error)) {
    return fromResponseBody(err, err['status'])
  }
  return new ApiError({
    status: 0,
    code: 'unknown',
    message: err instanceof Error ? err.message : String(err),
  })
}

/**
 * Converts a JSON Pointer in URI fragment form to a form path:
 * `#/items/0/name` becomes `items[0].name`, and `#` the empty string.
 */
export function pointerToPath(pointer: string): string {
  const raw = pointer.startsWith('#') ? pointer.slice(1) : pointer
  if (raw === '') return ''
  let path = ''
  for (const seg of raw.slice(1).split('/')) {
    const s = decodeURIComponent(seg).replaceAll('~1', '/').replaceAll('~0', '~')
    if (/^\d+$/.test(s) && path !== '') path += `[${s}]`
    else path += path === '' ? s : `.${s}`
  }
  return path
}

/**
 * An openapi-fetch middleware that asks for problem details, for servers
 * that still send an older error shape to clients that do not, in the page's
 * language (`<html lang>`) when it has one. A problem the
 * server wrote in the reader's language comes with Content-Language, which it
 * copies into the body as `language`, so `useErrorMessage` can show the
 * server's detail.
 */
export const problemMiddleware = {
  async onResponse({ response }: { response: Response }): Promise<Response> {
    const language = response.headers.get('Content-Language')
    if (
      response.ok ||
      !language ||
      !response.headers.get('Content-Type')?.includes(problemMediaType)
    ) {
      return response
    }
    const body: unknown = await response
      .clone()
      .json()
      .catch(() => undefined)
    if (!isObject(body)) return response
    return new Response(JSON.stringify({ ...body, language }), {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    })
  },
  onRequest({ request }: { request: Request }): Request {
    // The page's language, which LocaleProvider keeps current, so a server
    // that localizes writes problems in the language the reader sees.
    const lang = globalThis.document?.documentElement.lang
    if (lang && !request.headers.has('Accept-Language')) {
      request.headers.set('Accept-Language', lang)
    }
    const accept = request.headers.get('Accept')
    if (!accept?.includes(problemMediaType)) {
      request.headers.set(
        'Accept',
        accept ? `${accept}, ${problemMediaType}` : `application/json, ${problemMediaType}`,
      )
    }
    return request
  },
}

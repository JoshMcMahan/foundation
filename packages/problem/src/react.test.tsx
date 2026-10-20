import { renderToString } from 'react-dom/server'
import { IntlProvider } from 'use-intl'
import { describe, expect, it } from 'vitest'
import { ApiError, FieldError } from './index.js'
import { sharedMessages, sharedMessagesFor, typeApp } from './messages.js'
import { type FieldMessage, useCodeMessage, useErrorMessage, useFieldMessages } from './react.js'

function render(err: unknown, locale = 'en', messages: Record<string, unknown> = {}) {
  let shown = ''
  function Message() {
    shown = useErrorMessage()(err)
    return null
  }
  renderToString(
    <IntlProvider locale={locale} messages={messages} onError={() => {}}>
      <Message />
    </IntlProvider>,
  )
  return shown
}

const tooLong = new FieldError({ code: 'too_long', pointer: '#/name', params: { max: 64 } })

// An app's catalog with a workflow engine's messages under its name: the app's own unknown_input
// takes other params than the engine's.
const withEngine = {
  apiErrors: {
    unknown_input: 'The form has no field "{field}".',
    name_taken: '{name} is taken.',
    workflow: { unknown_input: 'There\'s no input "{input}".' },
  },
}
const engineType = '/problems/workflow/unknown_input'
const noInput = new FieldError({
  code: 'unknown_input',
  type: engineType,
  pointer: '#/inputs/rundir',
  params: { input: 'rundir', field: 'title' },
})

describe('useErrorMessage', () => {
  it('shows the shared message for a status code', () => {
    expect(render({ type: 'about:blank', status: 403 })).toBe(sharedMessages.en.apiErrors.forbidden)
  })

  it('shows the shared message in the active language', () => {
    expect(render({ type: 'about:blank', status: 403 }, 'es-MX')).toBe(
      sharedMessages.es.apiErrors.forbidden,
    )
  })

  it("prefers the app's own message", () => {
    const messages = { apiErrors: { name_taken: '{name} is taken.', forbidden: 'Ask an admin.' } }
    const taken = new ApiError({ status: 409, code: 'name_taken', params: { name: 'Core' } })
    expect(render(taken, 'en', messages)).toBe('Core is taken.')
    expect(render({ status: 403 }, 'en', messages)).toBe('Ask an admin.')
  })

  it("prefers the message under the app the error's type names, or its field's", () => {
    const params = { input: 'rundir', field: 'title' }
    const err = new ApiError({ status: 422, code: 'unknown_input', type: engineType, params })
    expect(render(err, 'en', withEngine)).toBe('There\'s no input "rundir".')
    const mine = new ApiError({
      status: 422,
      code: 'unknown_input',
      type: '/problems/shop/unknown_input',
      params,
    })
    expect(render(mine, 'en', withEngine)).toBe('The form has no field "title".')
    const one = new ApiError({ status: 422, code: 'validation', fields: [noInput] })
    expect(render(one, 'en', withEngine)).toBe('There\'s no input "rundir".')
  })

  it('formats rule params', () => {
    expect(render(tooLong)).toBe('Must be at most 64 characters.')
    const exclusive = new FieldError({
      code: 'below_minimum',
      params: { min: 0, exclusive: 'true' },
    })
    expect(render(exclusive)).toBe('Must be greater than 0.')
  })

  it("shows a single invalid field's rule instead of the generic validation message", () => {
    const one = new ApiError({ status: 422, code: 'validation', fields: [tooLong] })
    expect(render(one)).toBe('Must be at most 64 characters.')
    const two = new ApiError({ status: 422, code: 'validation', fields: [tooLong, tooLong] })
    expect(render(two)).toBe(sharedMessages.en.apiErrors.validation)
  })

  it('shows unknown for a code with no message, and network for a failed fetch', () => {
    expect(render(new ApiError({ status: 409, code: 'from_a_newer_server' }))).toBe(
      sharedMessages.en.apiErrors.unknown,
    )
    expect(render(new TypeError('Failed to fetch'))).toBe(sharedMessages.en.apiErrors.network)
  })
})

describe('useErrorMessage with a server that localizes', () => {
  const localized = {
    type: 'about:blank',
    status: 404,
    detail: 'クラスタ gpu-1 はありません。',
    language: 'ja',
  }

  it("shows the server's detail when it is in the active language", () => {
    expect(render(localized, 'ja-JP')).toBe('クラスタ gpu-1 はありません。')
  })

  it('falls back to the catalog when the server wrote another language', () => {
    expect(render(localized, 'es')).toBe(sharedMessages.es.apiErrors.not_found)
  })

  it('ignores a detail with no language, as from a server that does not localize', () => {
    expect(render({ type: 'about:blank', status: 404, detail: 'no such cluster' }, 'en')).toBe(
      sharedMessages.en.apiErrors.not_found,
    )
  })

  it("shows a single invalid field's localized detail", () => {
    const body = {
      type: '/problems/validation',
      status: 422,
      code: 'validation',
      detail: 'Revisa los campos.',
      language: 'es',
      errors: [
        {
          code: 'too_long',
          pointer: '#/name',
          params: { max: 64 },
          detail: 'Máximo 64 caracteres.',
        },
      ],
    }
    expect(render(body, 'es')).toBe('Máximo 64 caracteres.')
  })
})

function fieldMessages(err: unknown, locale = 'en', messages: Record<string, unknown> = {}) {
  let shown: FieldMessage[] = []
  function Messages() {
    shown = useFieldMessages()(err)
    return null
  }
  renderToString(
    <IntlProvider locale={locale} messages={messages} onError={() => {}}>
      <Messages />
    </IntlProvider>,
  )
  return shown
}

describe('useFieldMessages', () => {
  const body = {
    type: '/problems/validation',
    status: 422,
    code: 'validation',
    language: 'es',
    errors: [
      { code: 'too_long', pointer: '#/hosts/0/name', params: { max: 64 }, detail: 'Máximo 64.' },
      { code: 'required', pointer: '#/a~1b/m~0n' },
      { code: 'invalid', parameter: 'page' },
      { code: 'invalid', pointer: '#' },
    ],
  }

  it('gives each body field its form path and its message in the active language', () => {
    expect(fieldMessages(body, 'en')).toEqual([
      { path: 'hosts[0].name', message: 'Must be at most 64 characters.' },
      { path: 'a/b.m~n', message: sharedMessages.en.apiErrors.required },
    ])
  })

  it("shows the server's detail when it wrote the active language", () => {
    expect(fieldMessages(body, 'es')[0]).toEqual({ path: 'hosts[0].name', message: 'Máximo 64.' })
  })

  it('gives none for an error that names no field', () => {
    expect(fieldMessages({ type: 'about:blank', status: 403 })).toEqual([])
    expect(fieldMessages(new TypeError('Failed to fetch'))).toEqual([])
  })

  it("prefers the message under the app a field's type names", () => {
    const fields = new ApiError({ status: 422, code: 'validation', fields: [noInput, tooLong] })
    expect(fieldMessages(fields, 'en', withEngine)).toEqual([
      { path: 'inputs.rundir', message: 'There\'s no input "rundir".' },
      { path: 'name', message: 'Must be at most 64 characters.' },
    ])
  })

  it('takes a lone field error', () => {
    expect(fieldMessages(tooLong)).toEqual([
      { path: 'name', message: 'Must be at most 64 characters.' },
    ])
  })
})

describe('useCodeMessage', () => {
  function codeMessage(
    code: string,
    params?: Record<string, string | number>,
    {
      locale = 'en',
      messages = {},
      type,
    }: { locale?: string; messages?: Record<string, unknown>; type?: string | undefined } = {},
  ) {
    let shown: string | undefined
    function Message() {
      shown = useCodeMessage()(code, params, type)
      return null
    }
    renderToString(
      <IntlProvider locale={locale} messages={messages} onError={() => {}}>
        <Message />
      </IntlProvider>,
    )
    return shown
  }
  const messages = {
    apiErrors: {
      unknown_input:
        'There\'s no input "{input}".{suggested, select, true { Did you mean "{suggestion}"?} other {}}',
    },
  }

  it("gives the app's message for its code, with its params", () => {
    expect(
      codeMessage(
        'unknown_input',
        { input: 'rundir', suggested: 'true', suggestion: 'run_dir' },
        { messages },
      ),
    ).toBe('There\'s no input "rundir". Did you mean "run_dir"?')
    expect(
      codeMessage('unknown_input', { input: 'rundir', suggested: 'false' }, { messages }),
    ).toBe('There\'s no input "rundir".')
  })

  it('gives the shared message in the active language', () => {
    expect(codeMessage('too_long', { max: 64 })).toBe('Must be at most 64 characters.')
    expect(codeMessage('forbidden', undefined, { locale: 'ja' })).toBe(
      sharedMessages.ja.apiErrors.forbidden,
    )
  })

  it('gives nothing for a code no catalog has, so the caller keeps its own text', () => {
    expect(codeMessage('from_a_newer_server')).toBeUndefined()
  })

  it('gives the message under the app its type names over the top-level one for its code', () => {
    const params = { input: 'rundir', field: 'title' }
    for (const type of [
      '/problems/workflow/unknown_input',
      'https://engine.example.com/problems/workflow/unknown_input?lang=es#why',
    ]) {
      expect(codeMessage('unknown_input', params, { messages: withEngine, type })).toBe(
        'There\'s no input "rundir".',
      )
    }
    // Only the app the type names: another app's type, a shared one or none reads the top level.
    for (const type of [
      undefined,
      'about:blank',
      '/problems/unknown_input',
      '/problems/shop/unknown_input',
    ]) {
      expect(codeMessage('unknown_input', params, { messages: withEngine, type })).toBe(
        'The form has no field "title".',
      )
    }
  })

  it('falls back from the app its type names to the top level, then to the shared message', () => {
    const at = (code: string) => ({ messages: withEngine, type: `/problems/workflow/${code}` })
    expect(codeMessage('name_taken', { name: 'Core' }, at('name_taken'))).toBe('Core is taken.')
    expect(codeMessage('too_long', { max: 64 }, at('too_long'))).toBe(
      'Must be at most 64 characters.',
    )
    expect(codeMessage('from_a_newer_server', undefined, at('from_a_newer_server'))).toBeUndefined()
  })
})

describe('typeApp', () => {
  it('names the app of a relative or absolute type, past its query or fragment', () => {
    expect(typeApp('/problems/workflow/unknown_input')).toBe('workflow')
    expect(typeApp('https://engine.example.com/problems/workflow/unknown_input')).toBe('workflow')
    expect(typeApp('/problems/workflow/unknown_input?lang=es')).toBe('workflow')
    expect(typeApp('/problems/workflow/unknown_input#why')).toBe('workflow')
  })

  it('names none for a shared type, about:blank, no type, or one that is no problem type', () => {
    expect(typeApp('/problems/too_long')).toBeUndefined()
    expect(typeApp('about:blank')).toBeUndefined()
    expect(typeApp(undefined)).toBeUndefined()
    expect(typeApp(null)).toBeUndefined()
    expect(typeApp('')).toBeUndefined()
    expect(typeApp('/docs/workflow/unknown_input')).toBeUndefined()
    expect(typeApp('http://')).toBeUndefined()
  })
})

describe('sharedMessagesFor', () => {
  it('picks the catalog by base language, whichever separator the locale uses', () => {
    expect(sharedMessagesFor('zh-CN')).toBe(sharedMessages.zh)
    expect(sharedMessagesFor('zh_CN')).toBe(sharedMessages.zh)
    expect(sharedMessagesFor('ES_mx')).toBe(sharedMessages.es)
  })

  it('falls back to English for a language it has no catalog for', () => {
    expect(sharedMessagesFor('fr-FR')).toBe(sharedMessages.en)
    expect(sharedMessagesFor('')).toBe(sharedMessages.en)
  })
})

describe('sharedMessages', () => {
  it('has the same keys in every language', () => {
    const keys = Object.keys(sharedMessages.en.apiErrors).sort()
    for (const [lang, m] of Object.entries(sharedMessages)) {
      expect(Object.keys(m.apiErrors).sort(), lang).toEqual(keys)
    }
  })
})

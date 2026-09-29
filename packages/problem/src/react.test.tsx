import { renderToString } from 'react-dom/server'
import { IntlProvider } from 'use-intl'
import { describe, expect, it } from 'vitest'
import { ApiError, FieldError } from './index.js'
import { sharedMessages } from './messages.js'
import { useErrorMessage } from './react.js'

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

describe('sharedMessages', () => {
  it('has the same keys in every language', () => {
    const keys = Object.keys(sharedMessages.en.apiErrors).sort()
    for (const [lang, m] of Object.entries(sharedMessages)) {
      expect(Object.keys(m.apiErrors).sort(), lang).toEqual(keys)
    }
  })
})

import { describe, expect, it } from 'vitest'
import { apiErrorMessage } from './errors'

describe('apiErrorMessage', () => {
  it('returns a string message as-is', () => {
    expect(apiErrorMessage({ message: 'boom' }, 'fallback')).toBe('boom')
  })

  it('extracts a nested message from an object error', () => {
    expect(apiErrorMessage({ error: { code: 'x', message: 'boom' } }, 'fallback')).toBe('boom')
  })

  it('returns the JSON string when the object has no nested message', () => {
    expect(apiErrorMessage({ error: { code: 'x' } }, 'fallback')).toBe('{"code":"x"}')
  })

  it('returns the fallback for an empty or undefined body', () => {
    expect(apiErrorMessage(undefined, 'fallback')).toBe('fallback')
    expect(apiErrorMessage({}, 'fallback')).toBe('fallback')
  })
})

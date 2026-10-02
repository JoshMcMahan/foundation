import { describe, expect, it } from 'vitest'
import { getPlaceholder } from './getPlaceholder'

describe('getPlaceholder', () => {
  it('should return placeholder when explicitly set to a non-empty string', () => {
    expect(getPlaceholder('Enter name', 'John')).toBe('Enter name')
  })

  it('should return empty string when placeholder is explicitly set to empty string', () => {
    expect(getPlaceholder('', 'John')).toBe('')
  })

  it('should return default value when placeholder is undefined', () => {
    expect(getPlaceholder(undefined, 'John')).toBe('John')
  })

  it('should return empty string when both placeholder and default are undefined', () => {
    expect(getPlaceholder(undefined, undefined)).toBe('')
  })

  it('should convert number default to string', () => {
    expect(getPlaceholder(undefined, 42)).toBe('42')
  })

  it('should handle null default value', () => {
    expect(getPlaceholder(undefined, null)).toBe('')
  })

  it('should prioritize empty placeholder over default', () => {
    // This allows users to explicitly clear the placeholder even when default is set
    expect(getPlaceholder('', 'default value')).toBe('')
  })
})

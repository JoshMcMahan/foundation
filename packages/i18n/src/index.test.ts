import { describe, expect, it } from 'vitest'
import { detectLocale, negotiateLocale } from './index.js'

const locales = ['en', 'es', 'zh-TW', 'ja']

describe('negotiateLocale', () => {
  it('prefers an exact match, ignoring case', () => {
    expect(negotiateLocale(['zh-tw', 'en'], locales, 'en')).toBe('zh-TW')
  })
  it('falls back to the base language', () => {
    expect(negotiateLocale(['es-MX'], locales, 'en')).toBe('es')
    expect(negotiateLocale(['ja-JP', 'es'], locales, 'en')).toBe('ja')
  })
  it('takes the first preference that matches', () => {
    expect(negotiateLocale(['fr-FR', 'es'], locales, 'en')).toBe('es')
  })
  it('returns the fallback when nothing matches or a tag is malformed', () => {
    expect(negotiateLocale(['fr', '!!'], locales, 'en')).toBe('en')
    expect(negotiateLocale([], locales, 'en')).toBe('en')
  })
})

describe('detectLocale', () => {
  it("uses the server's choice, negotiated", () => {
    expect(detectLocale(locales, { fallback: 'en', injected: 'es-AR' })).toBe('es')
  })
  it('ignores an unsupported injected locale', () => {
    const got = detectLocale(locales, { fallback: 'en', injected: 'fr' })
    expect(locales).toContain(got)
  })
})

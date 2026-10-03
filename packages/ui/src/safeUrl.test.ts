import { describe, expect, it } from 'vitest'
import { safeUrl } from './safeUrl'

describe('safeUrl', () => {
  it.each([
    '/runs/1',
    'runs/1',
    '?tab=logs',
    '#top',
    '//cdn.example.com/a',
    'https://example.com/a',
    'http://example.com/a',
    'blob:https://example.com/0b8f',
  ])('keeps %s', (url) => {
    expect(safeUrl(url)).toBe(url)
  })

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    ' javascript:alert(1)',
    'java\tscript:alert(1)',
    '\njavascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
  ])('drops %j', (url) => {
    expect(safeUrl(url)).toBeUndefined()
  })

  it('drops empty values', () => {
    expect(safeUrl('')).toBeUndefined()
    expect(safeUrl(undefined)).toBeUndefined()
    expect(safeUrl(null)).toBeUndefined()
  })
})

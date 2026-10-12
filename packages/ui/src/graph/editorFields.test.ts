import { describe, expect, it } from 'vitest'
import { parseScalar, rowsFrom, rowsTo } from './editorFields'

describe('parseScalar', () => {
  it('reads a number only when the number writes back as the same text', () => {
    expect(parseScalar('4')).toBe(4)
    expect(parseScalar('-2.5')).toBe(-2.5)
    expect(parseScalar('3.10')).toBe('3.10')
    expect(parseScalar('01')).toBe('01')
    expect(parseScalar('true')).toBe(true)
  })
})

describe('rowsTo', () => {
  it('writes an untouched row back exactly as it was read', () => {
    const rows = rowsFrom({ python: '3.10', workers: 4, debug: 'true' })
    expect(rowsTo(rows, parseScalar)).toEqual({
      python: '3.10',
      workers: 4,
      debug: 'true',
    })
  })
})

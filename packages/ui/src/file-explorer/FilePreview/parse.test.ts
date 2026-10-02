import { describe, expect, it } from 'vitest'
import { joinSource, parseDelimited, parseNotebook, stripAnsi } from './parse'

describe('parseDelimited', () => {
  it('parses simple comma-separated rows', () => {
    expect(parseDelimited('a,b,c\n1,2,3\n', ',')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ])
  })

  it('honors quoted fields containing the delimiter and newlines', () => {
    const text = 'name,note\n"Doe, Jane","line1\nline2"\n'
    expect(parseDelimited(text, ',')).toEqual([
      ['name', 'note'],
      ['Doe, Jane', 'line1\nline2'],
    ])
  })

  it('unescapes doubled quotes', () => {
    expect(parseDelimited('"he said ""hi"""\n', ',')).toEqual([['he said "hi"']])
  })

  it('handles CRLF line endings and tab delimiters', () => {
    expect(parseDelimited('a\tb\r\n1\t2\r\n', '\t')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('keeps interior blank rows but drops trailing blank lines', () => {
    expect(parseDelimited('id\na\n\nb\n\n', ',')).toEqual([['id'], ['a'], [''], ['b']])
  })
})

describe('parseNotebook', () => {
  it('parses a notebook with cells', () => {
    const nb = JSON.stringify({
      cells: [{ cell_type: 'code', source: ['print(1)'], execution_count: 1 }],
    })
    expect(parseNotebook(nb)?.cells).toHaveLength(1)
  })

  it('returns null for invalid or non-notebook JSON', () => {
    expect(parseNotebook('not json')).toBeNull()
    expect(parseNotebook('{"foo":1}')).toBeNull()
  })
})

describe('joinSource', () => {
  it('joins array sources and passes strings through', () => {
    expect(joinSource(['a', 'b'])).toBe('ab')
    expect(joinSource('abc')).toBe('abc')
    expect(joinSource(undefined)).toBe('')
  })
})

describe('stripAnsi', () => {
  it('removes ANSI color escape codes', () => {
    expect(stripAnsi('\x1b[31mred\x1b[0m')).toBe('red')
  })
})

import { describe, expect, it } from 'vitest'
import {
  countLines,
  normalizeNewlines,
  pasteInlineMaxBytes,
  splitPastes,
  utf8Bytes,
} from './pastes'

describe('pastes', () => {
  it('is a tenth of the window at four bytes a token, capped at 1MiB', () => {
    expect(pasteInlineMaxBytes(undefined)).toBe(51_200)
    expect(pasteInlineMaxBytes(200_000)).toBe(80_000)
    expect(pasteInlineMaxBytes(1_000_000)).toBe(400_000)
    expect(pasteInlineMaxBytes(10_000_000)).toBe(1 << 20)
  })

  it('counts lines and bytes the way a paste is labeled', () => {
    expect(countLines('a\nb\n')).toBe(2)
    expect(countLines('one line')).toBe(1)
    expect(normalizeNewlines('a\r\nb\rc')).toBe('a\nb\nc')
    expect(utf8Bytes('é')).toBe(2)
  })

  it('splits a message around the placeholders it has pastes for', () => {
    const inline = {
      placeholder: '[Pasted text #1 +2 lines]',
      id: 1,
      lines: 2,
      bytes: 4,
      inline: true,
      text: 'a\nb\n',
    }
    const file = {
      placeholder: '[Pasted text #2 +900 lines]',
      id: 2,
      lines: 900,
      bytes: 90_000,
    }
    expect(
      splitPastes(
        'see [Pasted text #1 +2 lines] and [Pasted text #2 +900 lines], not [Pasted text #3 4 chars]',
        [inline, file],
      ),
    ).toEqual(['see ', inline, ' and ', file, ', not [Pasted text #3 4 chars]'])
  })
})

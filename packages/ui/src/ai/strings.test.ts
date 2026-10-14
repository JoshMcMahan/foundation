import { describe, expect, it } from 'vitest'
import { countOf } from './agent/toolStrings'
import { defaultChatStrings as t } from './strings'

describe('chat strings', () => {
  it('names a count with its noun in the reader’s digits', () => {
    expect(countOf(1, 'file', 'files')).toBe('1 file')
    expect(countOf(0, 'file', 'files')).toBe('0 files')
    expect(countOf(1024, 'file', 'files')).toBe(`${(1024).toLocaleString()} files`)
  })

  it('takes the values it names as arguments rather than placeholders', () => {
    expect(t.blockedGroup.title('research')).toBe('Billing group “research” is over its allocation')
    expect(t.agentTranscript.moreLines(1)).toBe('+1 more line')
    expect(t.agentTranscript.moreLines(12)).toBe('+12 more lines')
  })

  it('pluralizes every count', () => {
    expect(t.input.filesAttached(1)).toBe('1 file attached')
    expect(t.input.filesAttached(3)).toBe('3 files attached')
    expect(t.paste.lines(1)).toBe('1 line')
    expect(t.thinking.ranToolCalls(2)).toBe('Ran 2 tool calls')
    expect(t.messageMeta.tokens(1)).toBe('1 token')
    expect(t.attachmentUpload.maxFilesAllowed(1)).toBe('Maximum 1 file allowed')
  })

  it('offers status words for the working line', () => {
    expect(t.activity.words.length).toBeGreaterThan(0)
  })
})

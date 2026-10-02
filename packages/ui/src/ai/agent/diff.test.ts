import { describe, expect, it } from 'vitest'
import { classifyPseudoUserMessage } from './classifier'
import {
  computeEditDiff,
  computeWriteRows,
  editSummary,
  lineDelta,
  MAX_EDIT_DIFF_LINES,
  MAX_WRITE_DIFF_LINES,
  wordEmphasisRanges,
} from './diff'

describe('lineDelta', () => {
  it('counts adds and removes across hunks', () => {
    expect(lineDelta(['a', 'b', 'c'], ['a', 'x', 'c', 'd'])).toEqual([2, 1])
    expect(lineDelta([], ['a'])).toEqual([1, 0])
    expect(lineDelta(['a'], [])).toEqual([0, 1])
  })
})

describe('computeEditDiff', () => {
  it('renders a unified hunk with context and markers', () => {
    const old = 'one\ntwo\nthree\nfour\nfive\n'
    const next = 'one\ntwo\nTHREE\nfour\nfive\n'
    const d = computeEditDiff(old, next)
    expect(d.added).toBe(1)
    expect(d.removed).toBe(1)
    const kinds = d.rows.map((r) => r.kind)
    expect(kinds).toEqual(['ctx', 'ctx', 'del', 'add', 'ctx', 'ctx'])
    expect(d.rows.find((r) => r.kind === 'del')?.text).toBe('three')
    expect(d.rows.find((r) => r.kind === 'add')?.text).toBe('THREE')
  })

  it('numbers lines from startLine when resolved', () => {
    const d = computeEditDiff('a\nb\n', 'a\nB\n', 10)
    const del = d.rows.find((r) => r.kind === 'del')
    const add = d.rows.find((r) => r.kind === 'add')
    expect(del?.oldNo).toBe(11)
    expect(add?.newNo).toBe(11)
    const ctx = d.rows.find((r) => r.kind === 'ctx')
    expect(ctx?.oldNo).toBe(10)
    expect(ctx?.newNo).toBe(10)
  })

  it('collapses long unchanged runs into a gap row', () => {
    const mid = Array.from({ length: 20 }, (_, i) => `same${i}`)
    const old = ['start', ...mid, 'end'].join('\n')
    const next = ['START', ...mid, 'END'].join('\n')
    const d = computeEditDiff(old, next)
    expect(d.rows.some((r) => r.kind === 'gap')).toBe(true)
    const ctxCount = d.rows.filter((r) => r.kind === 'ctx').length
    expect(ctxCount).toBe(6)
  })

  it('caps the rendered rows and reports truncation', () => {
    const old = Array.from({ length: 300 }, (_, i) => `o${i}`).join('\n')
    const next = Array.from({ length: 300 }, (_, i) => `n${i}`).join('\n')
    const d = computeEditDiff(old, next)
    expect(d.rows.length).toBe(MAX_EDIT_DIFF_LINES)
    expect(d.truncated).toBe(true)
    expect(d.added).toBe(300)
    expect(d.removed).toBe(300)
  })
})

describe('computeWriteRows', () => {
  it('numbers new content from 1 and caps at the write limit', () => {
    const short = computeWriteRows('a\nb\n')
    expect(short.rows.map((r) => [r.newNo, r.text])).toEqual([
      [1, 'a'],
      [2, 'b'],
    ])
    expect(short.truncated).toBe(false)

    const long = computeWriteRows(Array.from({ length: 80 }, (_, i) => `l${i}`).join('\n'))
    expect(long.rows.length).toBe(MAX_WRITE_DIFF_LINES)
    expect(long.truncated).toBe(true)
    expect(long.total).toBe(80)
  })
})

describe('editSummary', () => {
  it('summarizes EditFile deltas', () => {
    const args = JSON.stringify({ old_string: 'a\nb\n', new_string: 'a\n' })
    expect(editSummary('EditFile', args)).toBe('Removed 1 line')
  })
  it('summarizes WriteFile with the path', () => {
    const args = JSON.stringify({ path: 'x.ts', content: '1\n2\n3\n' })
    expect(editSummary('WriteFile', args)).toBe('Wrote 3 lines to x.ts')
  })
  it('is empty for a missing content argument', () => {
    expect(editSummary('WriteFile', JSON.stringify({ path: 'x' }))).toBe('')
  })
})

describe('classifyPseudoUserMessage', () => {
  it('classifies recorded blocks and compaction summaries', () => {
    expect(classifyPseudoUserMessage('user', '<command-input>/status')).toBe('command-input')
    expect(classifyPseudoUserMessage('user', '  <shell-input>ls')).toBe('shell-input')
    expect(
      classifyPseudoUserMessage('user', '[Conversation summary from automatic compaction]\n…'),
    ).toBe('compaction')
  })
  it('leaves real prompts and other roles alone', () => {
    expect(classifyPseudoUserMessage('user', 'run the tests')).toBeNull()
    expect(classifyPseudoUserMessage('assistant', '<command-input>')).toBeNull()
    expect(classifyPseudoUserMessage('user', '')).toBeNull()
  })
})

describe('wordEmphasisRanges', () => {
  it('marks only the changed word of a similar pair', () => {
    const r = wordEmphasisRanges('const a = 1', 'const b = 1')
    expect(r).toEqual([[6, 7]])
  })

  it('merges adjacent changed tokens into one range', () => {
    const r = wordEmphasisRanges('log.info(msg)', 'log.warn(newMsg)')
    expect(r).toEqual([
      [4, 8],
      [9, 15],
    ])
  })

  it('returns null when the lines share no word', () => {
    expect(wordEmphasisRanges('alpha beta', 'gamma delta')).toBeNull()
  })

  it('returns null for empty sides', () => {
    expect(wordEmphasisRanges('', 'anything')).toBeNull()
    expect(wordEmphasisRanges('anything', '')).toBeNull()
  })

  it('covers a pure insertion span on the new line', () => {
    const r = wordEmphasisRanges('a c', 'a b c')
    expect(r).toEqual([[2, 4]])
  })
})

describe('computeEditDiff emphasis', () => {
  it('attaches emphasis to paired replaced lines and leaves dels bare', () => {
    const m = computeEditDiff('const a = 1\n', 'const b = 1\n')
    const add = m.rows.find((r) => r.kind === 'add')
    const del = m.rows.find((r) => r.kind === 'del')
    expect(add?.emphasis).toEqual([[6, 7]])
    expect(del).not.toHaveProperty('emphasis')
  })

  it('skips emphasis on unpaired added lines', () => {
    const m = computeEditDiff('x\n', 'x\nbrand new line\n')
    const add = m.rows.find((r) => r.kind === 'add')
    expect(add?.emphasis).toBeUndefined()
  })

  it('skips emphasis when the replacement shares nothing', () => {
    const m = computeEditDiff('alpha beta\n', 'gamma delta\n')
    const add = m.rows.find((r) => r.kind === 'add')
    expect(add?.emphasis).toBeUndefined()
  })
})

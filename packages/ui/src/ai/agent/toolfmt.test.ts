import { describe, expect, it } from 'vitest'
import { editSummary } from './diff'
import {
  agentColorHex,
  bashExitCode,
  clip,
  isGroupableTool,
  resultFailed,
  rollupSentence,
  sanitizeLabel,
  sanitizePanelText,
  summarizeToolArgs,
  toolHeaderFor,
  toolSummary,
} from './toolfmt'

describe('toolHeaderFor', () => {
  it('maps known tools and falls back to the wire name', () => {
    expect(toolHeaderFor('EditFile')).toEqual({ label: 'Update', arg: 'path' })
    expect(toolHeaderFor('mcp__linear__create_issue')).toEqual({
      label: 'mcp__linear__create_issue',
    })
  })
})

describe('clip', () => {
  it('is rune-aware and appends an ellipsis', () => {
    expect(clip('hello', 10)).toBe('hello')
    expect(clip('hello world', 8)).toBe('hello...')
    expect(clip('日本語テキスト', 5)).toBe('日本...')
  })
})

describe('sanitize', () => {
  it('flattens newlines and strips control characters for labels', () => {
    expect(sanitizeLabel('a\nb\tc\x1b[31md\x7f')).toBe('a b c[31md')
  })
  it('keeps newlines in panel text', () => {
    expect(sanitizePanelText('a\nb\x1bc')).toBe('a\nbc')
  })
})

describe('summarizeToolArgs', () => {
  it('leads with the primary arg bare, then salient keys in order', () => {
    const s = summarizeToolArgs(
      'pattern',
      JSON.stringify({ path: 'src', pattern: 'foo', output_mode: 'content' }),
    )
    expect(s).toBe('foo, path: "src", output_mode: "content"')
  })
  it('elides large fields entirely', () => {
    const s = summarizeToolArgs(
      'path',
      JSON.stringify({ path: 'a.ts', old_string: 'x'.repeat(500) }),
    )
    expect(s).toBe('a.ts')
  })
  it('clips long values and the total line', () => {
    const s = summarizeToolArgs('command', JSON.stringify({ command: 'x'.repeat(200) }))
    expect(s.length).toBeLessThanOrEqual(100)
    expect(s.endsWith('...')).toBe(true)
  })
  it('returns empty for unparsable args', () => {
    expect(summarizeToolArgs('path', 'not json')).toBe('')
  })
})

describe('toolSummary', () => {
  it('summarizes ReadFile line counts with truncation note', () => {
    const body = 'l1\nl2\nl3\n... (truncated, 40 more lines)'
    expect(toolSummary('ReadFile', '{}', body, false)).toBe('Read 3 lines (40 more)')
  })
  it('summarizes grep content mode by matches and files', () => {
    const body = 'a.ts:1:x\na.ts:9:y\nb.ts:2:z'
    const args = JSON.stringify({ output_mode: 'content' })
    expect(toolSummary('GrepSearch', args, body, false)).toBe('Found 3 matches in 2 files')
  })
  it('summarizes bash exit code and line count', () => {
    const body = 'out1\nout2\n\nExit code: 1'
    expect(toolSummary('Bash', '{}', body, false)).toBe('Exit 1 · 2 lines')
  })
  it('summarizes WebFetch status and body lines', () => {
    const body = 'HTTP 200 OK\n\nline1\nline2\nline3'
    expect(toolSummary('WebFetch', '{}', body, false)).toBe('HTTP 200 · 3 lines')
  })
  it('uses the edit summary for EditFile', () => {
    const args = JSON.stringify({
      path: 'a.ts',
      old_string: 'a\nb\n',
      new_string: 'a\nc\nd\n',
    })
    expect(toolSummary('EditFile', args, 'ok', false, editSummary)).toBe(
      'Added 2 lines, removed 1 line',
    )
  })
  it('falls back to the first line for errors', () => {
    expect(toolSummary('Bash', '{}', 'Error: nope', true)).toBe('Error: nope')
  })
  it('reports no output', () => {
    expect(toolSummary('GlobSearch', '{}', '   ', false)).toBe('(no output)')
  })
})

describe('resultFailed', () => {
  it('detects bash failure via the exit-code footer', () => {
    expect(resultFailed('Bash', 'boom\n\nExit code: 2')).toBe(true)
    expect(resultFailed('Bash', 'all good')).toBe(false)
    expect(resultFailed('Bash', 'Error: raw stdout\nmore')).toBe(false)
    expect(resultFailed('Bash', 'Error: malformed call')).toBe(true)
  })
  it('detects WebFetch failures by status and error prefix', () => {
    expect(resultFailed('WebFetch', 'HTTP 404: not found')).toBe(true)
    expect(resultFailed('WebFetch', 'HTTP 200 OK\n\nbody')).toBe(false)
    expect(resultFailed('WebFetch', 'Error fetching URL: x')).toBe(true)
  })
  it('detects generic Error: results', () => {
    expect(resultFailed('ReadFile', 'Error: no such file')).toBe(true)
    expect(resultFailed('ReadFile', 'contents')).toBe(false)
  })
})

describe('bashExitCode', () => {
  it('splits output from the footer', () => {
    expect(bashExitCode('a\nb\n\nExit code: 3')).toEqual(['a\nb', 3, true])
    expect(bashExitCode('Exit code: 1')).toEqual(['', 1, true])
    expect(bashExitCode('plain')).toEqual(['plain', 0, false])
  })
})

describe('rollupSentence', () => {
  it('groups by category in reading order', () => {
    const s = rollupSentence(['GrepSearch', 'ReadFile', 'GlobSearch', 'ReadFile', 'mcp__x__y'])
    expect(s).toBe('Searched for 2 patterns, read 2 files, called 1 MCP tool')
  })
  it('returns empty for no names', () => {
    expect(rollupSentence([])).toBe('')
  })
})

describe('agentColorHex', () => {
  it('resolves known colors and rejects unknown', () => {
    expect(agentColorHex('blue')).toBe('#3b82f6')
    expect(agentColorHex('taupe')).toBeNull()
    expect(agentColorHex(undefined)).toBeNull()
  })
})

describe('isGroupableTool', () => {
  it.each([
    ['ReadFile', true],
    ['GrepSearch', true],
    ['GlobSearch', true],
    ['Bash', true],
    ['WebFetch', true],
    ['Skill', true],
    ['SendMessage', true],
    ['mcp__server__tool', true],
    ['EditFile', false],
    ['WriteFile', false],
    ['TodoWrite', false],
    ['Task', false],
  ])('%s -> %s', (name, expected) => {
    expect(isGroupableTool(name)).toBe(expected)
  })
})

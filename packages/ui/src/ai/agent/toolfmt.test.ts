import { describe, expect, it } from 'vitest'
import { editSummary } from './diff'
import {
  agentColorHex,
  bashExitCode,
  clip,
  fullToolArgs,
  isGroupableTool,
  isUserInterruptedTool,
  parseRejection,
  resultFailed,
  rollupSentence,
  runClauses,
  sanitizeLabel,
  sanitizePanelText,
  shownResult,
  summarizeToolArgs,
  toolHeaderFor,
  toolSummary,
} from './toolfmt'

// The results a coding agent records for a call it did not run.
const REJECTED =
  "The user doesn't want to proceed with this tool use. The tool use was rejected (eg. if it was a file edit, the new_string was NOT written to the file). STOP what you are doing and wait for the user to tell you how to proceed."
const REJECTED_WITH_FEEDBACK =
  "The user doesn't want to proceed with this tool use. The tool use was rejected (eg. if it was a file edit, the new_string was NOT written to the file). To tell you how to proceed, the user said:\nuse b.go"
const UNATTENDED =
  'Permission for this tool use was denied. It requires approval, and this session has no approval surface — nobody can answer a permission prompt here — so it was denied automatically. The action was NOT performed; do not claim it succeeded, and do not retry it: this action, and anything else that requires approval, will be denied the same way for the rest of this session. Tell the user what was blocked and why you needed it, then continue with the parts of the task that do not require approval. What required approval: rm -rf build'

describe('calls that did not run', () => {
  it('reads a declined call as the person who declined it, with what they said', () => {
    expect(parseRejection(REJECTED)).toEqual({ feedback: '' })
    expect(parseRejection(REJECTED_WITH_FEEDBACK)).toEqual({ feedback: 'use b.go' })
    expect(parseRejection('Error: user denied Bash: not now')).toEqual({ feedback: 'not now' })
    expect(parseRejection('ok')).toBeNull()
    const edit = '{"path":"a.go","old_string":"a","new_string":"b"}'
    expect(shownResult('EditFile', edit, REJECTED_WITH_FEEDBACK)).toBe(
      'User rejected update to a.go: use b.go',
    )
    expect(shownResult('WriteFile', '{"path":"a.go"}', REJECTED)).toBe(
      'User rejected write to a.go',
    )
    expect(toolSummary('ReadFile', '{"path":"a"}', REJECTED, false)).toBe('Tool use rejected')
  })

  it('says nobody could approve a call, and counts that as a failure', () => {
    expect(toolSummary('Bash', '{"command":"rm"}', UNATTENDED, false)).toBe(
      'Denied: nobody could approve it here',
    )
    expect(resultFailed('Bash', UNATTENDED)).toBe(true)
    expect(resultFailed('Bash', REJECTED)).toBe(false)
  })

  it('says a stop cut a call off, by the tool’s own name as the terminal does', () => {
    const stopped = 'The user interrupted ReadFile before it finished.'
    expect(isUserInterruptedTool(stopped)).toBe(true)
    expect(isUserInterruptedTool('Tool execution was interrupted by the user.')).toBe(true)
    expect(toolSummary('ReadFile', '{"path":"a"}', stopped, false)).toBe(
      'The user interrupted ReadFile before it finished.',
    )
    expect(resultFailed('ReadFile', stopped)).toBe(false)
  })
})

describe('fullToolArgs', () => {
  it('keeps the line breaks of a script, and gives a multi-line value its own rows', () => {
    expect(fullToolArgs('command', '{"command":"cat <<EOF\\na\\nEOF\\n"}')).toBe(
      'cat <<EOF\na\nEOF',
    )
    expect(fullToolArgs('command', '{"command":"cat <<EOF\\na\\nEOF","timeout":5}')).toBe(
      'cat <<EOF\na\nEOF\ntimeout: 5',
    )
    expect(summarizeToolArgs('command', '{"command":"a\\nb"}')).toBe('a b')
  })
})

describe('tool headers', () => {
  it('names a call by the argument its tool leads with', () => {
    expect(toolHeaderFor('SendMessage')).toEqual({ label: 'SendMessage', arg: 'message' })
    expect(toolHeaderFor('BashOutput')).toEqual({ label: 'BashOutput', arg: 'bash_id' })
    expect(toolHeaderFor('KillShell')).toEqual({ label: 'KillShell', arg: 'shell_id' })
    expect(toolHeaderFor('NotebookRun')).toEqual({ label: 'Run in kernel', arg: 'code' })
  })
})

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
  it('keeps a long primary arg whole, ahead of the rest, for the row to cut', () => {
    const command = `GOOS=linux golangci-lint run --timeout=20m ${'./cmd/... '.repeat(10)}`
    const s = summarizeToolArgs(
      'command',
      JSON.stringify({ command, timeout: 600000, workdir: '/src' }),
    )
    expect(s).toBe(`${command}, timeout: 600000, workdir: "/src"`)
  })
  it('caps a huge arg', () => {
    const s = summarizeToolArgs('command', JSON.stringify({ command: 'x'.repeat(5000) }))
    expect(s.length).toBeLessThanOrEqual(300)
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
    expect(toolSummary('EditFile', args, 'ok', false, { editSummary })).toBe(
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

describe('runClauses', () => {
  it('reads as under way while a call runs', () => {
    expect(runClauses(['ReadFile', 'GrepSearch', 'Bash'], true)).toEqual([
      'searching for 1 pattern',
      'reading 1 file',
      'running 1 shell command',
    ])
  })

  it('gives each tool server its own clause, after the built-in tools', () => {
    const names = ['mcp__linear-server__get', 'mcp__github__a', 'mcp__linear-server__b', 'Bash']
    expect(runClauses(names, false)).toEqual([
      'ran 1 shell command',
      'called linear-server 2 times',
      'called github 1 time',
    ])
    expect(runClauses(['mcp__github__a'], true)).toEqual(['calling github 1 time'])
  })

  it('counts an unknown tool', () => {
    expect(runClauses(['Other'], false)).toEqual(['ran 1 tool'])
    expect(runClauses(['Other'], true)).toEqual(['running 1 tool'])
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

// The tool-formatting layer of a terminal coding agent. Pure functions over the recorded (name, args,
// result) triple, so a replayed transcript renders like a live one.

export interface ToolHeader {
  label: string
  arg?: string
}

// Mirrors the CLI tool registry's headers; unmapped tools (MCP) fall back to
// their wire name.
const TOOL_HEADERS: Record<string, ToolHeader> = {
  Bash: { label: 'Bash', arg: 'command' },
  ReadFile: { label: 'Read', arg: 'path' },
  WriteFile: { label: 'Write', arg: 'path' },
  EditFile: { label: 'Update', arg: 'path' },
  GlobSearch: { label: 'Glob', arg: 'pattern' },
  GrepSearch: { label: 'Grep', arg: 'pattern' },
  WebFetch: { label: 'WebFetch', arg: 'url' },
  Task: { label: 'Task', arg: 'description' },
  Skill: { label: 'Skill', arg: 'name' },
  SendMessage: { label: 'SendMessage', arg: 'to' },
  AskUserQuestion: { label: 'AskUserQuestion', arg: 'question' },
  TodoWrite: { label: 'TodoWrite' },
}

export function toolHeaderFor(name: string): ToolHeader {
  return TOOL_HEADERS[name] ?? { label: name }
}

// Rune-aware truncation with an ellipsis.
export function clip(s: string, max: number): string {
  const r = [...s]
  if (r.length <= max) {
    return s
  }
  if (max <= 3) {
    return r.slice(0, max).join('')
  }
  return `${r.slice(0, max - 3).join('')}...`
}

// Model-controlled text made safe for single-line chrome: newlines and tabs
// flatten to spaces, remaining control characters are stripped.
export function sanitizeLabel(s: string): string {
  let out = ''
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0
    if (ch === '\n' || ch === '\t') {
      out += ' '
    } else if (c < 0x20 || c === 0x7f) {
      // stripped
    } else {
      out += ch
    }
  }
  return out
}

// Multi-line variant: newlines survive for wrapping.
export function sanitizePanelText(s: string): string {
  let out = ''
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0
    if (ch === '\t') {
      out += ' '
    } else if (ch === '\n') {
      out += ch
    } else if (c < 0x20 || c === 0x7f) {
      // stripped
    } else {
      out += ch
    }
  }
  return out
}

interface ArgStyle {
  valueClip: number
  totalClip: number
}

const SALIENT_ARG_ORDER = [
  'command',
  'pattern',
  'path',
  'file_path',
  'glob',
  'url',
  'query',
  'output_mode',
  'question',
  'header',
]

// Omitted from summaries: too large to inline.
const ELIDED_ARGS = new Set(['content', 'new_string', 'old_string', 'edits', 'options'])

function clipArg(s: string, style: ArgStyle): string {
  const flat = s.replaceAll('\n', ' ')
  if (style.valueClip <= 0) {
    return flat
  }
  return clip(flat, style.valueClip)
}

function displayArg(v: unknown, style: ArgStyle): string {
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  return sanitizeLabel(clipArg(s ?? '', style))
}

function formatToolArgs(primary: string | undefined, argsJSON: string, style: ArgStyle): string {
  let m: Record<string, unknown>
  try {
    m = JSON.parse(argsJSON)
  } catch {
    return ''
  }
  if (!m || typeof m !== 'object' || Object.keys(m).length === 0) {
    return ''
  }

  const seen = new Set<string>()
  const parts: string[] = []
  const add = (k: string) => {
    if (!(k in m) || seen.has(k)) {
      return
    }
    seen.add(k)
    const v = m[k]
    const rendered =
      typeof v === 'string'
        ? `${k}: "${clipArg(sanitizeLabel(v), style)}"`
        : `${k}: ${displayArg(v, style)}`
    parts.push(rendered)
  }

  if (primary && primary in m) {
    seen.add(primary)
    parts.push(displayArg(m[primary], style))
  }
  for (const k of SALIENT_ARG_ORDER) {
    add(k)
  }
  const rest = Object.keys(m)
    .filter((k) => !ELIDED_ARGS.has(k) && !seen.has(k))
    .sort()
  for (const k of rest) {
    add(k)
  }

  const joined = parts.join(', ')
  if (style.totalClip <= 0) {
    return joined
  }
  return clip(joined, style.totalClip)
}

// Compact one-line argument summary for a collapsed tool header.
export function summarizeToolArgs(primary: string | undefined, argsJSON: string): string {
  return formatToolArgs(primary, argsJSON, { valueClip: 50, totalClip: 100 })
}

// Unclipped form for an expanded block.
export function fullToolArgs(primary: string | undefined, argsJSON: string): string {
  return formatToolArgs(primary, argsJSON, { valueClip: 0, totalClip: 0 })
}

export function plural(n: number, noun: string): string {
  return `${n} ${pluralNoun(n, noun)}`
}

function pluralNoun(n: number, noun: string): string {
  if (n === 1) {
    return noun
  }
  if (/(?:s|x|ch|sh)$/.test(noun)) {
    return `${noun}es`
  }
  return `${noun}s`
}

// limitToolResult appends this to an oversized result; summaries cut it off
// before counting.
const TOOL_OUTPUT_TRUNCATION_MARKER = '\n\n... output truncated to '

function trimToolOutputNotice(body: string): [string, boolean] {
  const i = body.lastIndexOf(TOOL_OUTPUT_TRUNCATION_MARKER)
  if (i >= 0) {
    return [body.slice(0, i).replace(/\n+$/, ''), true]
  }
  return [body, false]
}

function summarizeToolResult(result: string): string {
  const trimmed = result.replace(/\n+$/, '')
  if (trimmed.trim() === '') {
    return '(no output)'
  }
  const lines = trimmed.split('\n')
  const first = clip((lines[0] ?? '').trim(), 100)
  if (lines.length > 1) {
    return `${first}  (+${lines.length - 1} lines)`
  }
  return first
}

// Failures are recorded in-band as "Error: …"; history carries no flag.
function isErrorResult(text: string): boolean {
  return text.trim().startsWith('Error:')
}

const RIPGREP_ERROR_PREFIX = 'ripgrep error (exit '

// Whether a recorded result is a failure, per tool-specific in-band formats.
export function resultFailed(name: string, result: string): boolean {
  const body = result.trim()
  switch (name) {
    case 'Bash': {
      if (bashExitCode(body)[2]) {
        return true
      }
      return isErrorResult(body) && !body.includes('\n')
    }
    case 'WebFetch':
      return webFetchFailed(body)
    case 'GrepSearch':
      return body.startsWith(RIPGREP_ERROR_PREFIX) || isErrorResult(body)
    default:
      return isErrorResult(body)
  }
}

function webFetchFailed(body: string): boolean {
  if (body.startsWith('Error ')) {
    return true
  }
  const m = body.match(/^HTTP (\d+)/)
  if (m) {
    return Number(m[1]) >= 400
  }
  return false
}

// Splits off the "... (…)" footer a tool adds when it caps itself.
function trailingNote(body: string): [string, string] {
  const i = body.lastIndexOf('\n')
  const last = body.slice(i + 1)
  if (last.startsWith('... (')) {
    return [body.slice(0, Math.max(i, 0)), last]
  }
  return [body, '']
}

function contentLines(body: string): [string[], string] {
  const [rest, note] = trailingNote(body)
  if (rest === '') {
    return [[], note]
  }
  return [rest.split('\n'), note]
}

function readFileSummary(body: string): string {
  if (body === '(empty file)') {
    return 'Empty file'
  }
  if (body.startsWith('Read image ')) {
    return 'Read image'
  }
  const [lines, note] = contentLines(body)
  let more = 0
  const m = note.match(/^\.\.\. \(truncated, (\d+) more lines\)/)
  if (m) {
    more = Number(m[1])
  }
  if (more > 0) {
    return `Read ${plural(lines.length, 'line')} (${more} more)`
  }
  return `Read ${plural(lines.length, 'line')}`
}

// Path off a `path:line:text` ripgrep match; context lines and separators
// report null.
const GREP_CONTENT_PATH = /^(.+?):\d+:/

function grepMatchPath(line: string, lineNums: boolean): string | null {
  if (!lineNums) {
    const i = line.indexOf(':')
    return i >= 0 ? line.slice(0, i) : null
  }
  const m = GREP_CONTENT_PATH.exec(line)
  return m ? (m[1] ?? null) : null
}

function grepSearchSummary(argsJSON: string, body: string): string {
  if (body === 'No matches found.' || body === 'No results after applying offset.') {
    return 'No matches'
  }
  if (body.startsWith(RIPGREP_ERROR_PREFIX)) {
    return summarizeToolResult(body)
  }
  const [lines, note] = contentLines(body)
  let outputMode = ''
  let lineNums = true
  try {
    const a = JSON.parse(argsJSON)
    outputMode = a.output_mode ?? ''
    if (typeof a.n === 'boolean') {
      lineNums = a.n
    }
  } catch {
    // summary still renders without arg context
  }

  let s: string
  if (outputMode === 'content') {
    const files = new Set<string>()
    let matches = 0
    for (const l of lines) {
      const path = grepMatchPath(l, lineNums)
      if (path === null) {
        continue
      }
      matches++
      files.add(path)
    }
    s = `Found ${plural(matches, 'match')} in ${plural(files.size, 'file')}`
  } else if (outputMode === 'count') {
    let total = 0
    for (const l of lines) {
      const i = l.lastIndexOf(':')
      const tail = i >= 0 ? l.slice(i + 1) : l
      const n = Number.parseInt(tail, 10)
      if (!Number.isNaN(n)) {
        total += n
      }
    }
    s = `Found ${plural(total, 'match')} in ${plural(lines.length, 'file')}`
  } else {
    s = `Found ${plural(lines.length, 'file')}`
  }
  if (note !== '') {
    s += ' (truncated)'
  }
  return s
}

function globSearchSummary(body: string): string {
  if (body === 'No files matched the pattern.') {
    return 'No files matched'
  }
  const [lines, note] = contentLines(body)
  let s = `Found ${plural(lines.length, 'file')}`
  if (note !== '') {
    s += ' (truncated)'
  }
  return s
}

// Splits a Bash result into output and the exit code from the "Exit code: N"
// footer; ok=false for a successful run (no footer).
export function bashExitCode(body: string): [string, number, boolean] {
  let i = body.lastIndexOf('\nExit code: ')
  if (i < 0) {
    if (!body.startsWith('Exit code: ')) {
      return [body, 0, false]
    }
    i = 0
  }
  const footer = body.slice(i).replace(/^\n/, '')
  const m = footer.match(/^Exit code: (\d+)/)
  const code = m ? Number(m[1]) : 0
  return [body.slice(0, i).replace(/\n+$/, ''), code, true]
}

function bashSummary(body: string): string {
  if (body === '(no output)') {
    return '(no output)'
  }
  const [out, code, ok] = bashExitCode(body)
  if (!ok) {
    return summarizeToolResult(body)
  }
  if (out === '') {
    return `Exit ${code}`
  }
  return `Exit ${code} · ${plural(out.split('\n').length, 'line')}`
}

function webFetchSummary(body: string): string {
  const m = body.match(/^HTTP (\d+)/)
  if (!m) {
    return summarizeToolResult(body)
  }
  const status = Number(m[1])
  const sep = body.indexOf('\n\n')
  if (sep < 0) {
    return clip(body.split('\n')[0] ?? '', 100)
  }
  const rest = body.slice(sep + 2)
  return `HTTP ${status} · ${plural(rest.split('\n').length, 'line')}`
}

// Condenses a finished tool call to one line from only the recorded triple.
// editSummaryFn breaks the import cycle with the diff module.
export function toolSummary(
  name: string,
  args: string,
  result: string,
  isError: boolean,
  editSummaryFn?: (toolName: string, argsJSON: string) => string,
): string {
  const [body, spilled] = trimToolOutputNotice(result.replace(/\n+$/, ''))
  if (isError || body.trim() === '' || isErrorResult(body)) {
    return summarizeToolResult(result)
  }
  let s: string
  switch (name) {
    case 'EditFile':
    case 'WriteFile': {
      const e = editSummaryFn?.(name, args) ?? ''
      return e !== '' ? e : summarizeToolResult(result)
    }
    case 'ReadFile':
      s = readFileSummary(body)
      break
    case 'GrepSearch':
      s = grepSearchSummary(args, body)
      break
    case 'GlobSearch':
      s = globSearchSummary(body)
      break
    case 'Bash':
      s = bashSummary(body)
      break
    case 'WebFetch':
      s = webFetchSummary(body)
      break
    default:
      return summarizeToolResult(result)
  }
  if (spilled) {
    s += ' (output truncated)'
  }
  return s
}

const ROLLUP_CATEGORIES: [(name: string) => boolean, (n: number) => string][] = [
  [(n) => n === 'GrepSearch' || n === 'GlobSearch', (n) => `searched for ${plural(n, 'pattern')}`],
  [(n) => n === 'ReadFile', (n) => `read ${plural(n, 'file')}`],
  [(n) => n === 'Bash', (n) => `ran ${plural(n, 'shell command')}`],
  [(n) => n === 'WebFetch', (n) => `fetched ${plural(n, 'URL')}`],
  [(n) => n === 'Skill', (n) => `loaded ${plural(n, 'skill')}`],
  [(n) => n === 'SendMessage', (n) => `sent ${plural(n, 'message')}`],
  [(n) => n.startsWith('mcp__'), (n) => `called ${plural(n, 'MCP tool')}`],
  [() => true, (n) => `ran ${plural(n, 'tool')}`],
]

// Tools whose calls carry standalone weight in a transcript; they end a
// rollup run instead of folding into it (mirrors fs_transcript.go).
const NON_GROUPABLE_TOOLS = new Set(['EditFile', 'WriteFile', 'TodoWrite', 'Task'])

export function isGroupableTool(name: string): boolean {
  return !NON_GROUPABLE_TOOLS.has(name)
}

// "Searched for 7 patterns, read 6 files"
export function rollupSentence(names: string[]): string {
  const counts = ROLLUP_CATEGORIES.map(() => 0)
  for (const name of names) {
    for (let i = 0; i < ROLLUP_CATEGORIES.length; i++) {
      const cat = ROLLUP_CATEGORIES[i]
      if (cat?.[0](name)) {
        counts[i] = (counts[i] ?? 0) + 1
        break
      }
    }
  }
  const parts: string[] = []
  for (let i = 0; i < counts.length; i++) {
    const n = counts[i] ?? 0
    if (n > 0) {
      const cat = ROLLUP_CATEGORIES[i]
      if (cat) {
        parts.push(cat[1](n))
      }
    }
  }
  if (parts.length === 0) {
    return ''
  }
  const s = parts.join(', ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// Renderable agent colors, ordered for auto-assignment (red last so it keeps
// its error connotation longest).
export const AGENT_COLOR_NAMES = [
  'blue',
  'green',
  'yellow',
  'purple',
  'cyan',
  'orange',
  'pink',
  'red',
] as const

const AGENT_COLOR_HEX: Record<string, string> = {
  red: '#ef4444',
  blue: '#3b82f6',
  green: '#22c55e',
  yellow: '#eab308',
  purple: '#a855f7',
  orange: '#f97316',
  pink: '#ec4899',
  cyan: '#06b6d4',
}

// Hex for an agent color name; null falls back to default chrome styling.
export function agentColorHex(name: string | undefined): string | null {
  return name ? (AGENT_COLOR_HEX[name] ?? null) : null
}

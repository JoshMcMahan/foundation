// The tool-formatting layer of a terminal coding agent. Pure functions over the recorded (name, args,
// result) triple, so a replayed transcript renders like a live one.

import { defaultToolStrings, type ToolStrings } from './toolStrings'

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
  SendMessage: { label: 'SendMessage', arg: 'message' },
  BashOutput: { label: 'BashOutput', arg: 'bash_id' },
  KillShell: { label: 'KillShell', arg: 'shell_id' },
  NotebookRead: { label: 'Read notebook', arg: 'notebook_path' },
  NotebookEdit: { label: 'Update notebook', arg: 'notebook_path' },
  NotebookRun: { label: 'Run in kernel', arg: 'code' },
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
  /** Keeps a value's line breaks, as a script or heredoc needs them to read. */
  multiline?: boolean
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
  // A script usually ends in a newline, which would read as a blank row before the closing parenthesis.
  const shaped = style.multiline ? s.replace(/\n+$/, '') : s.replaceAll('\n', ' ')
  if (style.valueClip <= 0) {
    return shaped
  }
  return clip(shaped, style.valueClip)
}

function sanitizeArg(s: string, style: ArgStyle): string {
  return style.multiline ? sanitizePanelText(s) : sanitizeLabel(s)
}

function displayArg(v: unknown, style: ArgStyle): string {
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  return sanitizeArg(clipArg(s ?? '', style), style)
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
        ? `${k}: "${clipArg(sanitizeArg(v, style), style)}"`
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

  // A multi-line value ends its own row, so a comma-joined tail would dangle off its last line.
  const joined = parts.join(style.multiline && parts.some((p) => p.includes('\n')) ? '\n' : ', ')
  if (style.totalClip <= 0) {
    return joined
  }
  return clip(joined, style.totalClip)
}

// The row it sits in ends it with an ellipsis wherever the row ends, so the cap
// only keeps a huge argument out of the DOM; it is past any row's width.
const SUMMARY_MAX_CHARS = 300

// One-line argument summary for a collapsed tool header.
export function summarizeToolArgs(primary: string | undefined, argsJSON: string): string {
  return formatToolArgs(primary, argsJSON, { valueClip: 0, totalClip: SUMMARY_MAX_CHARS })
}

// Unclipped form for an expanded block, line breaks kept.
export function fullToolArgs(primary: string | undefined, argsJSON: string): string {
  return formatToolArgs(primary, argsJSON, { valueClip: 0, totalClip: 0, multiline: true })
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

function summarizeToolResult(result: string, t: ToolStrings): string {
  const trimmed = result.replace(/\n+$/, '')
  if (trimmed.trim() === '') {
    return t.noOutput
  }
  const lines = trimmed.split('\n')
  return t.firstLine(clip((lines[0] ?? '').trim(), 100), lines.length - 1)
}

// Failures are recorded in-band as "Error: …"; history carries no flag.
function isErrorResult(text: string): boolean {
  return text.trim().startsWith('Error:')
}

const RIPGREP_ERROR_PREFIX = 'ripgrep error (exit '

// The results a coding agent records for a call it did not run, written for the
// model to read. A person sees a verdict in their place.
const REJECTED_TOOL_USE =
  "The user doesn't want to proceed with this tool use. The tool use was rejected (eg. if it was a file edit, the new_string was NOT written to the file)."
const SUBAGENT_REJECTED_TOOL_USE =
  'Permission for this tool use was denied. The tool use was rejected (eg. if it was a file edit, the new_string was NOT written to the file).'
const REJECTED_FEEDBACK_PREFIXES = [
  `${REJECTED_TOOL_USE} To tell you how to proceed, the user said:\n`,
  `${SUBAGENT_REJECTED_TOOL_USE} The user said:\n`,
]
// Older sessions recorded a denial as an error naming what was denied.
const USER_DENIED_PREFIX = 'Error: user denied '
const UNATTENDED_TOOL_USE =
  'Permission for this tool use was denied. It requires approval, and this session has no approval surface'
const USER_INTERRUPTED_TOOL = 'The user interrupted '
const USER_INTERRUPTED_TOOL_END = ' before it finished.'
const LEGACY_USER_INTERRUPTED_TOOL = 'Tool execution was interrupted by the user.'

/** The feedback a person gave when they declined the call, or null for a call they didn't decline. */
export function parseRejection(result: string): { feedback: string } | null {
  const body = result.trim()
  for (const prefix of REJECTED_FEEDBACK_PREFIXES) {
    if (body.startsWith(prefix)) {
      return { feedback: body.slice(prefix.length) }
    }
  }
  if (body.startsWith(REJECTED_TOOL_USE) || body.startsWith(SUBAGENT_REJECTED_TOOL_USE)) {
    return { feedback: '' }
  }
  if (body.startsWith(USER_DENIED_PREFIX)) {
    const rest = body.slice(USER_DENIED_PREFIX.length)
    const colon = rest.indexOf(': ')
    return { feedback: colon === -1 ? '' : rest.slice(colon + 2) }
  }
  return null
}

/** A call that needed approval in a session nobody could answer it in. */
export function isUnattendedToolUse(result: string): boolean {
  return result.trim().startsWith(UNATTENDED_TOOL_USE)
}

/** A call the person's stop cut off before it finished. */
export function isUserInterruptedTool(result: string): boolean {
  const body = result.trim()
  return (
    body === LEGACY_USER_INTERRUPTED_TOOL ||
    (body.startsWith(USER_INTERRUPTED_TOOL) && body.endsWith(USER_INTERRUPTED_TOOL_END))
  )
}

/** A call that didn't run, as the person declined it, nobody could approve it, or a stop cut it off. */
export function resultNotRun(result: string): boolean {
  return !!parseRejection(result) || isUnattendedToolUse(result) || isUserInterruptedTool(result)
}

/** The result as a person reads it: a verdict in place of the text written for the model. */
export function shownResult(
  name: string,
  args: string,
  result: string,
  t: ToolStrings = defaultToolStrings,
): string {
  const rejection = parseRejection(result)
  if (rejection) {
    const path = editPath(name, args)
    if (path && name === 'EditFile') {
      return t.rejectedUpdate(path, rejection.feedback)
    }
    if (path && name === 'WriteFile') {
      return t.rejectedWrite(path, rejection.feedback)
    }
    return t.rejected(rejection.feedback)
  }
  if (isUnattendedToolUse(result)) {
    return t.unattended
  }
  if (isUserInterruptedTool(result)) {
    // By the tool's own name, as the agent recorded it.
    return t.userInterrupted(name)
  }
  return result
}

function editPath(name: string, args: string): string {
  if (name !== 'EditFile' && name !== 'WriteFile') {
    return ''
  }
  try {
    const a: unknown = JSON.parse(args)
    const path = a && typeof a === 'object' ? (a as Record<string, unknown>)['path'] : undefined
    return typeof path === 'string' ? path : ''
  } catch {
    return ''
  }
}

// Whether a recorded result is a failure, per tool-specific in-band formats.
export function resultFailed(name: string, result: string): boolean {
  const body = result.trim()
  // A person's no is their answer, not a failure; a call nobody could approve did fail.
  if (parseRejection(body)) {
    return false
  }
  if (isUnattendedToolUse(body)) {
    return true
  }
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

function readFileSummary(body: string, t: ToolStrings): string {
  if (body === '(empty file)') {
    return t.emptyFile
  }
  if (body.startsWith('Read image ')) {
    return t.readImage
  }
  const [lines, note] = contentLines(body)
  let more = 0
  const m = note.match(/^\.\.\. \(truncated, (\d+) more lines\)/)
  if (m) {
    more = Number(m[1])
  }
  return t.readLines(lines.length, more)
}

// Path off a `path:line:text` ripgrep match; context lines and separators
// report null.
const GREP_CONTENT_PATH = /^(.+?):\d+:/

function grepMatchPath(line: string, lineNums: boolean): string | null {
  if (!lineNums) {
    const i = line.indexOf(':')
    return i >= 0 ? line.slice(0, i) : null
  }
  return GREP_CONTENT_PATH.exec(line)?.[1] ?? null
}

function grepSearchSummary(argsJSON: string, body: string, t: ToolStrings): string {
  if (body === 'No matches found.' || body === 'No results after applying offset.') {
    return t.noMatches
  }
  if (body.startsWith(RIPGREP_ERROR_PREFIX)) {
    return summarizeToolResult(body, t)
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
    s = t.foundMatches(matches, files.size)
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
    s = t.foundMatches(total, lines.length)
  } else {
    s = t.foundFiles(lines.length)
  }
  return note === '' ? s : t.truncated(s)
}

function globSearchSummary(body: string, t: ToolStrings): string {
  if (body === 'No files matched the pattern.') {
    return t.noFilesMatched
  }
  const [lines, note] = contentLines(body)
  const s = t.foundFiles(lines.length)
  return note === '' ? s : t.truncated(s)
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

function bashSummary(body: string, t: ToolStrings): string {
  if (body === '(no output)') {
    return t.noOutput
  }
  const [out, code, ok] = bashExitCode(body)
  if (!ok) {
    return summarizeToolResult(body, t)
  }
  return t.exitCode(code, out === '' ? 0 : out.split('\n').length)
}

function webFetchSummary(body: string, t: ToolStrings): string {
  const m = body.match(/^HTTP (\d+)/)
  if (!m) {
    return summarizeToolResult(body, t)
  }
  const status = Number(m[1])
  const sep = body.indexOf('\n\n')
  if (sep < 0) {
    return clip(body.split('\n')[0] ?? '', 100)
  }
  const rest = body.slice(sep + 2)
  return t.httpStatus(status, rest.split('\n').length)
}

export interface ToolSummaryOptions {
  /** The edit tools' own summary; passed in to keep this module free of the diff one. */
  editSummary?: (toolName: string, argsJSON: string, strings: ToolStrings) => string
  strings?: ToolStrings
}

// Condenses a finished tool call to one line from only the recorded triple.
export function toolSummary(
  name: string,
  args: string,
  result: string,
  isError: boolean,
  { editSummary, strings: t = defaultToolStrings }: ToolSummaryOptions = {},
): string {
  if (resultNotRun(result)) {
    return summarizeToolResult(shownResult(name, args, result, t), t)
  }
  const [body, spilled] = trimToolOutputNotice(result.replace(/\n+$/, ''))
  if (isError || body.trim() === '' || isErrorResult(body)) {
    return summarizeToolResult(result, t)
  }
  let s: string
  switch (name) {
    case 'EditFile':
    case 'WriteFile': {
      const e = editSummary?.(name, args, t) ?? ''
      return e !== '' ? e : summarizeToolResult(result, t)
    }
    case 'ReadFile':
      s = readFileSummary(body, t)
      break
    case 'GrepSearch':
      s = grepSearchSummary(args, body, t)
      break
    case 'GlobSearch':
      s = globSearchSummary(body, t)
      break
    case 'Bash':
      s = bashSummary(body, t)
      break
    case 'WebFetch':
      s = webFetchSummary(body, t)
      break
    default:
      return summarizeToolResult(result, t)
  }
  return spilled ? t.outputTruncated(s) : s
}

type RollupClause = keyof Omit<ToolStrings['rollup'], 'sentence'>

const ROLLUP_CATEGORIES: [(name: string) => boolean, RollupClause][] = [
  [(n) => n === 'GrepSearch' || n === 'GlobSearch', 'searched'],
  [(n) => n === 'ReadFile', 'read'],
  [(n) => n === 'Bash', 'ranCommands'],
  [(n) => n === 'WebFetch', 'fetched'],
  [(n) => n === 'Skill', 'loadedSkills'],
  [(n) => n === 'SendMessage', 'sentMessages'],
  [(n) => n.startsWith('mcp__'), 'calledMcpTools'],
  [() => true, 'ranTools'],
]

// Tools whose calls carry standalone weight in a transcript; they end a
// rollup run instead of folding into it (mirrors fs_transcript.go).
const NON_GROUPABLE_TOOLS = new Set(['EditFile', 'WriteFile', 'TodoWrite', 'Task'])

export function isGroupableTool(name: string): boolean {
  return !NON_GROUPABLE_TOOLS.has(name)
}

// "Searched for 7 patterns, read 6 files"
export function rollupSentence(names: string[], t: ToolStrings = defaultToolStrings): string {
  const parts = rollupClauses(names, t)
  return parts.length === 0 ? '' : t.rollup.sentence(parts)
}

// ["searched for 7 patterns", "read 6 files"]: the clauses rollupSentence joins.
export function rollupClauses(names: string[], t: ToolStrings = defaultToolStrings): string[] {
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
        parts.push(t.rollup[cat[1]](n))
      }
    }
  }
  return parts
}

const ACTIVE_CLAUSES: Record<
  Exclude<RollupClause, 'calledMcpTools'>,
  keyof ToolStrings['rollupActive']
> = {
  searched: 'searching',
  read: 'reading',
  ranCommands: 'runningCommands',
  fetched: 'fetching',
  loadedSkills: 'loadingSkills',
  sentMessages: 'sendingMessages',
  ranTools: 'runningTools',
}

// Server names cannot contain "__", so the first one ends the server.
function toolServer(name: string): string {
  return name.startsWith('mcp__') ? (name.slice('mcp__'.length).split('__')[0] ?? '') : ''
}

// ["searching for 7 patterns", "calling linear 2 times"]: rollupClauses in the tense of a run
// that may still be working, with one clause per tool server.
export function runClauses(
  names: string[],
  running: boolean,
  t: ToolStrings = defaultToolStrings,
): string[] {
  const clauses = new Map<string, { category: number; server: string; count: number }>()
  for (const name of names) {
    const category = ROLLUP_CATEGORIES.findIndex(([matches]) => matches(name))
    const server = toolServer(name)
    const key = `${category}:${server}`
    const clause = clauses.get(key) ?? { category, server, count: 0 }
    clauses.set(key, { ...clause, count: clause.count + 1 })
  }
  return [...clauses.values()]
    .sort((a, b) => a.category - b.category)
    .map(({ category, server, count }) => {
      const clause = ROLLUP_CATEGORIES[category]?.[1] ?? 'ranTools'
      if (clause === 'calledMcpTools') {
        return t.rollupServer[running ? 'calling' : 'called'](server, count)
      }
      return running ? t.rollupActive[ACTIVE_CLAUSES[clause]](count) : t.rollup[clause](count)
    })
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

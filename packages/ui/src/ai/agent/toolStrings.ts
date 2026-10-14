// The words an agent transcript's one-line tool summaries are built from. The
// formatters stay pure functions of the recorded call, so a replayed
// transcript reads like a live one in the reader's language.

export interface ToolStrings {
  /** A call that printed nothing. */
  noOutput: string
  /** A result's first line, and how many lines follow it. */
  firstLine: (line: string, moreLines: number) => string
  emptyFile: string
  readImage: string
  /** `more` counts the lines the read left out; 0 when it read them all. */
  readLines: (lines: number, more: number) => string
  noMatches: string
  foundMatches: (matches: number, files: number) => string
  foundFiles: (files: number) => string
  noFilesMatched: string
  /** A search summary whose own output was capped. */
  truncated: (summary: string) => string
  /** `lines` is 0 when the command printed nothing. */
  exitCode: (code: number, lines: number) => string
  httpStatus: (status: number, lines: number) => string
  /** A summary whose result was cut down before it was recorded. */
  outputTruncated: (summary: string) => string
  edited: (added: number, removed: number) => string
  /** `path` is empty when the call named none. */
  wrote: (lines: number, path: string) => string
  /** One clause per kind of call in a run of quick calls, joined into a sentence. */
  rollup: {
    searched: (patterns: number) => string
    read: (files: number) => string
    ranCommands: (commands: number) => string
    fetched: (urls: number) => string
    loadedSkills: (skills: number) => string
    sentMessages: (messages: number) => string
    calledMcpTools: (tools: number) => string
    ranTools: (tools: number) => string
    sentence: (clauses: string[]) => string
  }
}

// English has two forms, chosen by the rules a translation would use, with
// the number in the reader's own digits.
const englishPlural = new Intl.PluralRules('en')

/** A count and its noun in English: "1 file", "1,024 files". */
export const countOf = (n: number, one: string, other: string) =>
  `${n.toLocaleString()} ${englishPlural.select(n) === 'one' ? one : other}`

export const defaultToolStrings: ToolStrings = {
  noOutput: '(no output)',
  firstLine: (line, moreLines) =>
    moreLines > 0 ? `${line}  (+${countOf(moreLines, 'line', 'lines')})` : line,
  emptyFile: 'Empty file',
  readImage: 'Read image',
  readLines: (lines, more) =>
    more > 0
      ? `Read ${countOf(lines, 'line', 'lines')} (${more.toLocaleString()} more)`
      : `Read ${countOf(lines, 'line', 'lines')}`,
  noMatches: 'No matches',
  foundMatches: (matches, files) =>
    `Found ${countOf(matches, 'match', 'matches')} in ${countOf(files, 'file', 'files')}`,
  foundFiles: (files) => `Found ${countOf(files, 'file', 'files')}`,
  noFilesMatched: 'No files matched',
  truncated: (summary) => `${summary} (truncated)`,
  exitCode: (code, lines) =>
    lines > 0 ? `Exit ${code} · ${countOf(lines, 'line', 'lines')}` : `Exit ${code}`,
  httpStatus: (status, lines) => `HTTP ${status} · ${countOf(lines, 'line', 'lines')}`,
  outputTruncated: (summary) => `${summary} (output truncated)`,
  edited: (added, removed) =>
    added > 0 && removed > 0
      ? `Added ${countOf(added, 'line', 'lines')}, removed ${countOf(removed, 'line', 'lines')}`
      : added > 0
        ? `Added ${countOf(added, 'line', 'lines')}`
        : removed > 0
          ? `Removed ${countOf(removed, 'line', 'lines')}`
          : '',
  wrote: (lines, path) =>
    path
      ? `Wrote ${countOf(lines, 'line', 'lines')} to ${path}`
      : `Wrote ${countOf(lines, 'line', 'lines')}`,
  rollup: {
    searched: (n) => `searched for ${countOf(n, 'pattern', 'patterns')}`,
    read: (n) => `read ${countOf(n, 'file', 'files')}`,
    ranCommands: (n) => `ran ${countOf(n, 'shell command', 'shell commands')}`,
    fetched: (n) => `fetched ${countOf(n, 'URL', 'URLs')}`,
    loadedSkills: (n) => `loaded ${countOf(n, 'skill', 'skills')}`,
    sentMessages: (n) => `sent ${countOf(n, 'message', 'messages')}`,
    calledMcpTools: (n) => `called ${countOf(n, 'MCP tool', 'MCP tools')}`,
    ranTools: (n) => `ran ${countOf(n, 'tool', 'tools')}`,
    sentence: (clauses) => {
      const s = clauses.join(', ')
      return s.charAt(0).toUpperCase() + s.slice(1)
    },
  },
}

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

const count = (n: number, one: string, many: string) =>
  `${n.toLocaleString()} ${n === 1 ? one : many}`

export const defaultToolStrings: ToolStrings = {
  noOutput: '(no output)',
  firstLine: (line, moreLines) =>
    moreLines > 0 ? `${line}  (+${count(moreLines, 'line', 'lines')})` : line,
  emptyFile: 'Empty file',
  readImage: 'Read image',
  readLines: (lines, more) =>
    more > 0
      ? `Read ${count(lines, 'line', 'lines')} (${more.toLocaleString()} more)`
      : `Read ${count(lines, 'line', 'lines')}`,
  noMatches: 'No matches',
  foundMatches: (matches, files) =>
    `Found ${count(matches, 'match', 'matches')} in ${count(files, 'file', 'files')}`,
  foundFiles: (files) => `Found ${count(files, 'file', 'files')}`,
  noFilesMatched: 'No files matched',
  truncated: (summary) => `${summary} (truncated)`,
  exitCode: (code, lines) =>
    lines > 0 ? `Exit ${code} · ${count(lines, 'line', 'lines')}` : `Exit ${code}`,
  httpStatus: (status, lines) => `HTTP ${status} · ${count(lines, 'line', 'lines')}`,
  outputTruncated: (summary) => `${summary} (output truncated)`,
  edited: (added, removed) =>
    added > 0 && removed > 0
      ? `Added ${count(added, 'line', 'lines')}, removed ${count(removed, 'line', 'lines')}`
      : added > 0
        ? `Added ${count(added, 'line', 'lines')}`
        : removed > 0
          ? `Removed ${count(removed, 'line', 'lines')}`
          : '',
  wrote: (lines, path) =>
    path
      ? `Wrote ${count(lines, 'line', 'lines')} to ${path}`
      : `Wrote ${count(lines, 'line', 'lines')}`,
  rollup: {
    searched: (n) => `searched for ${count(n, 'pattern', 'patterns')}`,
    read: (n) => `read ${count(n, 'file', 'files')}`,
    ranCommands: (n) => `ran ${count(n, 'shell command', 'shell commands')}`,
    fetched: (n) => `fetched ${count(n, 'URL', 'URLs')}`,
    loadedSkills: (n) => `loaded ${count(n, 'skill', 'skills')}`,
    sentMessages: (n) => `sent ${count(n, 'message', 'messages')}`,
    calledMcpTools: (n) => `called ${count(n, 'MCP tool', 'MCP tools')}`,
    ranTools: (n) => `ran ${count(n, 'tool', 'tools')}`,
    sentence: (clauses) => {
      const s = clauses.join(', ')
      return s.charAt(0).toUpperCase() + s.slice(1)
    },
  },
}

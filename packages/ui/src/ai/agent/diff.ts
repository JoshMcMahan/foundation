// The edit-diff rendering model of a terminal coding agent: unified diffs with 3 context lines for EditFile,
// numbered new content for WriteFile, and the one-line outcome summary. Pure
// data — the component renders the rows.

import { sanitizeLabel } from './toolfmt'

export const MAX_EDIT_DIFF_LINES = 100
export const MAX_WRITE_DIFF_LINES = 50
const DIFF_CONTEXT = 3

export interface EditToolArgs {
  path?: string
  old_string?: string
  new_string?: string
  content?: string
  replace_all?: boolean
}

export function isEditDiffTool(name: string): boolean {
  return name === 'EditFile' || name === 'WriteFile'
}

export function parseEditArgs(argsJSON: string): EditToolArgs | null {
  try {
    const a = JSON.parse(argsJSON)
    return a && typeof a === 'object' ? a : null
  } catch {
    return null
  }
}

// Mirrors Go's splitLines: one trailing newline is content boundary, not an
// extra empty line.
function splitLines(s: string): string[] {
  const trimmed = s.endsWith('\n') ? s.slice(0, -1) : s
  return trimmed === '' ? [] : trimmed.split('\n')
}

type OpTag = 'e' | 'r' | 'd' | 'i'

interface OpCode {
  tag: OpTag
  i1: number
  i2: number
  j1: number
  j2: number
}

// LCS-based opcodes over lines (difflib.GetOpCodes semantics). Inputs are
// capped by callers, so quadratic DP is fine.
function getOpCodes(a: string[], b: string[]): OpCode[] {
  const n = a.length
  const m = b.length
  // lcs[i][j] = LCS length of a[i:], b[j:]
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    const row = lcs[i]
    const next = lcs[i + 1]
    if (!row || !next) {
      continue
    }
    for (let j = m - 1; j >= 0; j--) {
      row[j] = a[i] === b[j] ? (next[j + 1] ?? 0) + 1 : Math.max(next[j] ?? 0, row[j + 1] ?? 0)
    }
  }
  const ops: OpCode[] = []
  let i = 0
  let j = 0
  const push = (tag: OpTag, i1: number, i2: number, j1: number, j2: number) => {
    const last = ops[ops.length - 1]
    if (last && last.tag === tag && last.i2 === i1 && last.j2 === j1) {
      last.i2 = i2
      last.j2 = j2
      return
    }
    ops.push({ tag, i1, i2, j1, j2 })
  }
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push('e', i, i + 1, j, j + 1)
      i++
      j++
    } else if ((lcs[i + 1]?.[j] ?? 0) >= (lcs[i]?.[j + 1] ?? 0)) {
      push('d', i, i + 1, j, j)
      i++
    } else {
      push('i', i, i, j, j + 1)
      j++
    }
  }
  if (i < n) {
    push('d', i, n, j, j)
  }
  if (j < m) {
    push('i', i, i, j, m)
  }
  // Merge adjacent delete+insert into replace, difflib-style.
  const merged: OpCode[] = []
  for (const op of ops) {
    const last = merged[merged.length - 1]
    if (last && ((last.tag === 'd' && op.tag === 'i') || (last.tag === 'i' && op.tag === 'd'))) {
      merged[merged.length - 1] = {
        tag: 'r',
        i1: Math.min(last.i1, op.i1),
        i2: Math.max(last.i2, op.i2),
        j1: Math.min(last.j1, op.j1),
        j2: Math.max(last.j2, op.j2),
      }
      continue
    }
    merged.push(op)
  }
  return merged
}

function tokenizeWords(line: string): string[] {
  return line.match(/\w+|\s+|[^\w\s]+/g) ?? []
}

// Changed-word ranges on the new line of a replaced pair, or null when the
// lines share no word — a full rewrite reads better without emphasis.
export function wordEmphasisRanges(
  oldLine: string,
  newLine: string,
): Array<[number, number]> | null {
  const a = tokenizeWords(oldLine)
  const b = tokenizeWords(newLine)
  if (a.length === 0 || b.length === 0) {
    return null
  }
  const ops = getOpCodes(a, b)
  const sharesWord = ops.some(
    (op) => op.tag === 'e' && a.slice(op.i1, op.i2).some((t) => /\w/.test(t)),
  )
  if (!sharesWord) {
    return null
  }
  const starts: number[] = []
  let pos = 0
  for (const t of b) {
    starts.push(pos)
    pos += t.length
  }
  starts.push(pos)
  const ranges: Array<[number, number]> = []
  for (const op of ops) {
    if (op.tag !== 'i' && op.tag !== 'r') {
      continue
    }
    if (op.j1 >= op.j2) {
      continue
    }
    const start = starts[op.j1] ?? 0
    const end = starts[op.j2] ?? pos
    const last = ranges[ranges.length - 1]
    if (last && last[1] === start) {
      last[1] = end
    } else {
      ranges.push([start, end])
    }
  }
  return ranges.length > 0 ? ranges : null
}

// Added/removed line counts for the whole edit (uncapped), for the outcome row.
export function lineDelta(oldLines: string[], newLines: string[]): [number, number] {
  let added = 0
  let removed = 0
  for (const op of getOpCodes(oldLines, newLines)) {
    if (op.tag === 'd' || op.tag === 'r') {
      removed += op.i2 - op.i1
    }
    if (op.tag === 'i' || op.tag === 'r') {
      added += op.j2 - op.j1
    }
  }
  return [added, removed]
}

export interface DiffRow {
  kind: 'add' | 'del' | 'ctx' | 'gap'
  // 1-based line numbers in the new file (adds/ctx) and old file (dels/ctx);
  // absent when startLine was unresolved.
  oldNo?: number
  newNo?: number
  text: string
  // Character ranges [start, end) of the changed words on an added line that
  // replaces a similar removed line; the removed side stays unhighlighted.
  emphasis?: Array<[number, number]>
}

export interface EditDiffModel {
  rows: DiffRow[]
  added: number
  removed: number
  truncated: boolean
}

// The unified diff for an EditFile call: hunks with DIFF_CONTEXT lines of
// context, numbered from startLine when resolved (>0), capped at
// MAX_EDIT_DIFF_LINES rows.
export function computeEditDiff(
  oldString: string,
  newString: string,
  startLine = 0,
): EditDiffModel {
  const oldLines = splitLines(oldString)
  const newLines = splitLines(newString)
  const [added, removed] = lineDelta(oldLines, newLines)
  const ops = getOpCodes(oldLines, newLines)

  const numbered = startLine > 0
  const rows: DiffRow[] = []
  let truncated = false
  const push = (row: DiffRow) => {
    if (rows.length >= MAX_EDIT_DIFF_LINES) {
      truncated = true
      return false
    }
    rows.push(row)
    return true
  }

  outer: for (let k = 0; k < ops.length; k++) {
    const op = ops[k]
    if (!op) {
      continue
    }
    if (op.tag === 'e') {
      const len = op.i2 - op.i1
      const leading = k > 0 ? Math.min(DIFF_CONTEXT, len) : 0
      const trailing = k < ops.length - 1 ? Math.min(DIFF_CONTEXT, len) : 0
      const showAll = len <= leading + trailing
      const emit = (offset: number) => {
        const oldNo = op.i1 + offset + 1
        const newNo = op.j1 + offset + 1
        return push({
          kind: 'ctx',
          text: oldLines[op.i1 + offset] ?? '',
          ...(numbered ? { oldNo: startLine + oldNo - 1, newNo: startLine + newNo - 1 } : {}),
        })
      }
      if (showAll) {
        for (let x = 0; x < len; x++) {
          if (!emit(x)) {
            break outer
          }
        }
      } else {
        for (let x = 0; x < leading; x++) {
          if (!emit(x)) {
            break outer
          }
        }
        if (!push({ kind: 'gap', text: '' })) {
          break
        }
        for (let x = len - trailing; x < len; x++) {
          if (!emit(x)) {
            break outer
          }
        }
      }
      continue
    }
    if (op.tag === 'd' || op.tag === 'r') {
      for (let x = op.i1; x < op.i2; x++) {
        const ok = push({
          kind: 'del',
          text: oldLines[x] ?? '',
          ...(numbered ? { oldNo: startLine + x } : {}),
        })
        if (!ok) {
          break outer
        }
      }
    }
    if (op.tag === 'i' || op.tag === 'r') {
      const paired = op.tag === 'r' ? Math.min(op.i2 - op.i1, op.j2 - op.j1) : 0
      for (let x = op.j1; x < op.j2; x++) {
        const k = x - op.j1
        const emphasis =
          k < paired ? wordEmphasisRanges(oldLines[op.i1 + k] ?? '', newLines[x] ?? '') : null
        const ok = push({
          kind: 'add',
          text: newLines[x] ?? '',
          ...(numbered ? { newNo: startLine + x } : {}),
          ...(emphasis ? { emphasis } : {}),
        })
        if (!ok) {
          break outer
        }
      }
    }
  }

  return { rows, added, removed, truncated }
}

export interface WriteModel {
  rows: DiffRow[]
  total: number
  truncated: boolean
}

// A WriteFile call renders as the new content numbered 1..N with no markers,
// capped at MAX_WRITE_DIFF_LINES.
export function computeWriteRows(content: string): WriteModel {
  const lines = splitLines(content)
  const shown = lines.slice(0, MAX_WRITE_DIFF_LINES)
  return {
    rows: shown.map((text, i) => ({ kind: 'ctx', newNo: i + 1, text })),
    total: lines.length,
    truncated: lines.length > MAX_WRITE_DIFF_LINES,
  }
}

// One-line outcome under an edit tool's header, counting the whole edit rather
// than the capped diff below it.
export function editSummary(toolName: string, argsJSON: string): string {
  const a = parseEditArgs(argsJSON)
  if (!a) {
    return ''
  }
  const count = (n: number) => `${n} ${n === 1 ? 'line' : 'lines'}`
  if (toolName === 'EditFile') {
    const [added, removed] = lineDelta(
      splitLines(a.old_string ?? ''),
      splitLines(a.new_string ?? ''),
    )
    if (added > 0 && removed > 0) {
      return `Added ${count(added)}, removed ${count(removed)}`
    }
    if (added > 0) {
      return `Added ${count(added)}`
    }
    if (removed > 0) {
      return `Removed ${count(removed)}`
    }
    return ''
  }
  if (toolName === 'WriteFile') {
    if (a.content === undefined) {
      return ''
    }
    let s = `Wrote ${count(splitLines(a.content).length)}`
    if (a.path) {
      s += ` to ${sanitizeLabel(a.path)}`
    }
    return s
  }
  return ''
}

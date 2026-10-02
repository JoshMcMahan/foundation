/** Parse CSV/TSV, honoring quoted fields (embedded delimiter/newline/escaped quote);
 * `maxRows` stops early so a big file isn't walked in full for a preview. */
export function parseDelimited(text: string, delimiter: string, maxRows?: number): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
    } else if (char === delimiter) {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') {
        i++
      }
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      if (maxRows !== undefined && rows.length >= maxRows) {
        break
      }
    } else {
      field += char
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  // Drop only trailing blank rows left by a final newline; interior blank lines
  // are legitimate empty values in a single-column file and must be kept.
  while (rows.length > 0) {
    const last = rows[rows.length - 1]
    if (last && last.length === 1 && last[0] === '') {
      rows.pop()
    } else {
      break
    }
  }

  return rows
}

export interface NotebookOutput {
  output_type: string
  text?: string | string[]
  data?: Record<string, unknown>
  ename?: string
  evalue?: string
  traceback?: string[]
}

export interface NotebookCell {
  cell_type: string
  source: string | string[]
  outputs?: NotebookOutput[]
  execution_count?: number | null
}

export interface ParsedNotebook {
  cells: NotebookCell[]
}

export function parseNotebook(text: string): ParsedNotebook | null {
  try {
    const parsed = JSON.parse(text) as ParsedNotebook
    if (!parsed || !Array.isArray(parsed.cells)) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

/** nbformat `source`/`text` is a string or an array of lines; normalize to one string. */
export function joinSource(source: unknown): string {
  if (Array.isArray(source)) {
    return source.map((s) => (typeof s === 'string' ? s : '')).join('')
  }
  return typeof source === 'string' ? source : ''
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: strips ANSI color codes from tracebacks
const ANSI_ESCAPE = /\x1b\[[0-9;]*m/g

export function stripAnsi(text: string): string {
  return text.replace(ANSI_ESCAPE, '')
}

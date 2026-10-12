import type { InputPath } from '../editing'

/** One input's row as drawn, with its place among its list's inputs. */
export interface DrawnRow {
  path: InputPath
  /** Which copy of the input this is, when a list draws it in each of its rows. */
  instance: string
  index: number
  rect: DOMRect
  el: HTMLElement
  hidden: boolean
  /** A hidden input a list with widths draws after the inputs the form shows. */
  trailing: boolean
}

/** Inputs drawn one under another: an input and those `anchor-below` it, top to bottom. */
export interface Column {
  rows: DrawnRow[]
  /** The cell a list with widths draws the column in. */
  cell: HTMLElement | null
}

/** The columns of one list drawn side by side on one line of the form, left to right. */
export interface Line {
  parent: InputPath
  columns: Column[]
}

/** Where dragged inputs land: before `index` of `parent`, as a column beside one, or in one. */
export interface Drop {
  parent: InputPath
  index: number
  beside?: { path: InputPath; side: 'left' | 'right' }
  stack?: { path: InputPath; side: 'above' | 'below' }
}

const key = (path: InputPath) => JSON.stringify(path)

const samePath = (a: InputPath, b: InputPath) =>
  a.length === b.length && a.every((name, i) => b[i] === name)

export const rowsOf = (line: Line) => line.columns.flatMap((column) => column.rows)

const topOf = (column: Column) => Math.min(...column.rows.map((row) => row.rect.top))
const leftOf = (column: Column) => Math.min(...column.rows.map((row) => row.rect.left))

export function inputCell(el: HTMLElement): HTMLElement | null {
  let child = el
  for (let parent = el.parentElement; parent; parent = parent.parentElement) {
    if (parent.hasAttribute('data-input-path')) return null
    if (parent.hasAttribute('data-input-cell')) return parent
    if (parent.parentElement?.hasAttribute('data-layout-grid')) return child
    if (parent.hasAttribute('data-layout-boundary')) return null
    child = parent
  }
  return null
}

/** The form's lines: a column is the rows one cell draws, and columns at one height share a line. */
export function linesIn(root: HTMLElement): Line[] {
  const columns = new Map<HTMLElement, { parent: InputPath; column: Column }>()
  for (const el of root.querySelectorAll<HTMLElement>('[data-input-path]')) {
    const path = JSON.parse(el.dataset['inputPath'] ?? '[]') as InputPath
    const cell = inputCell(el)
    const owner = cell ?? el
    const entry = columns.get(owner) ?? { parent: path.slice(0, -1), column: { rows: [], cell } }
    columns.set(owner, entry)
    entry.column.rows.push({
      path,
      instance: el.dataset['inputInstance'] ?? key(path),
      index: Number(el.dataset['inputIndex'] ?? 0),
      rect: el.getBoundingClientRect(),
      el,
      hidden: el.dataset['inputHidden'] !== undefined,
      trailing: false,
    })
  }
  const lines: Line[] = []
  for (const { parent, column } of columns.values()) {
    column.rows.sort((a, b) => a.rect.top - b.rect.top)
    if (column.cell && column.rows.every((row) => row.hidden)) {
      for (const row of column.rows) {
        row.trailing = true
      }
    }
    const top = topOf(column)
    const line = lines.find(
      (other) =>
        samePath(other.parent, parent) && Math.abs(topOf(other.columns[0] as Column) - top) < 1,
    )
    if (line) {
      line.columns.push(column)
    } else {
      lines.push({ parent, columns: [column] })
    }
  }
  for (const line of lines) {
    line.columns.sort((a, b) => leftOf(a) - leftOf(b))
  }
  return lines
}

/** Neighbours on one line, split at `pointer` (a percent of their list's width), in 5% steps. */
export function snapSplit(total: number, pointer: number): [left: number, right: number] {
  const floor = Math.min(10, total / 2)
  const left = Math.min(Math.max(Math.round(pointer / 5) * 5, floor), total - floor)
  return [left, total - left]
}

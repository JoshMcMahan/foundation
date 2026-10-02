import { describe, expect, it } from 'vitest'
import { fileRowHeight, ROW_HEIGHT_SHORT, ROW_HEIGHT_TALL } from './FileRow'
import { spacerHeights } from './FileRowsWindow'
import type { TreeNode } from './lib/types'

/** Virtual items as @tanstack/react-virtual reports them: start/end include
 *  scrollMargin, while getTotalSize() excludes it. */
function spans(count: number, rowHeight: number, scrollMargin: number) {
  return Array.from({ length: count }, (_, i) => ({
    start: scrollMargin + i * rowHeight,
    end: scrollMargin + (i + 1) * rowHeight,
  }))
}

const THEAD = 33
const TOTAL_ROWS = 100
const TOTAL_SIZE = TOTAL_ROWS * ROW_HEIGHT_SHORT

describe('spacerHeights', () => {
  it('returns no spacers when nothing is rendered', () => {
    expect(spacerHeights([], TOTAL_SIZE, THEAD)).toEqual({ top: 0, bottom: 0 })
  })

  it('has no top spacer at the top of the list', () => {
    const all = spans(TOTAL_ROWS, ROW_HEIGHT_SHORT, THEAD)
    const { top, bottom } = spacerHeights(all.slice(0, 10), TOTAL_SIZE, THEAD)
    expect(top).toBe(0)
    expect(bottom).toBe(TOTAL_SIZE - 10 * ROW_HEIGHT_SHORT)
  })

  it('has no bottom spacer at the end of the list', () => {
    const all = spans(TOTAL_ROWS, ROW_HEIGHT_SHORT, THEAD)
    const { top, bottom } = spacerHeights(all.slice(-10), TOTAL_SIZE, THEAD)
    expect(top).toBe(90 * ROW_HEIGHT_SHORT)
    expect(bottom).toBe(0)
  })

  it('keeps top + rendered + bottom equal to the total scroll extent', () => {
    const all = spans(TOTAL_ROWS, ROW_HEIGHT_SHORT, THEAD)
    for (const first of [0, 1, 37, 50, 89, 90]) {
      const window = all.slice(first, first + 10)
      const { top, bottom } = spacerHeights(window, TOTAL_SIZE, THEAD)
      const rendered = window.reduce((sum, s) => sum + (s.end - s.start), 0)
      expect(top + rendered + bottom).toBe(TOTAL_SIZE)
    }
  })

  it('holds the same invariant with mixed row heights', () => {
    // Alternating short/tall, as a directory of folders and typed files renders.
    const heights = Array.from({ length: TOTAL_ROWS }, (_, i) =>
      i % 2 === 0 ? ROW_HEIGHT_SHORT : ROW_HEIGHT_TALL,
    )
    const total = heights.reduce((a, b) => a + b, 0)
    let offset = THEAD
    const all = heights.map((h) => {
      const span = { start: offset, end: offset + h }
      offset += h
      return span
    })
    const window = all.slice(40, 52)
    const { top, bottom } = spacerHeights(window, total, THEAD)
    const rendered = window.reduce((sum, s) => sum + (s.end - s.start), 0)
    expect(top + rendered + bottom).toBe(total)
  })

  it('never returns a negative spacer', () => {
    const all = spans(3, ROW_HEIGHT_SHORT, THEAD)
    // A stale totalSize smaller than the rendered window must not produce a
    // negative height, which would be an invalid style value.
    const { top, bottom } = spacerHeights(all, 0, THEAD)
    expect(top).toBeGreaterThanOrEqual(0)
    expect(bottom).toBeGreaterThanOrEqual(0)
  })
})

describe('fileRowHeight', () => {
  const node = (over: Partial<TreeNode>): TreeNode =>
    ({ name: 'n', path: 'p', type: 'file', ...over }) as TreeNode

  it('is tall only for files that have a content type', () => {
    expect(fileRowHeight(node({ contentType: 'text/csv' }))).toBe(ROW_HEIGHT_TALL)
    expect(fileRowHeight(node({}))).toBe(ROW_HEIGHT_SHORT)
    expect(fileRowHeight(node({ type: 'directory', contentType: 'text/csv' }))).toBe(
      ROW_HEIGHT_SHORT,
    )
    expect(fileRowHeight(node({ type: 'directory' }))).toBe(ROW_HEIGHT_SHORT)
  })
})

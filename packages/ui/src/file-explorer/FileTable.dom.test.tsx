// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ROW_HEIGHT_SHORT } from './FileRow'
import { FileTable } from './FileTable'
import { LOAD_MORE_ROW_HEIGHT } from './LoadMoreRow'
import type { TreeNode } from './lib/types'

const VIEWPORT = 600
const THEAD = 33
const TOTAL = 10_000

// jsdom has no IntersectionObserver, and the sentinel builds one. Kept in a list
// so a test can decide when the sentinel becomes visible.
const liveObservers: { fire: () => void }[] = []

function triggerIntersection() {
  for (const observer of [...liveObservers]) {
    observer.fire()
  }
}

beforeEach(() => {
  liveObservers.length = 0
})

beforeAll(() => {
  // react-virtual measures with offsetHeight and watches with a ResizeObserver;
  // jsdom does no layout and provides neither.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      private targets: Element[] = []
      private entry: { fire: () => void }
      constructor(private callback: IntersectionObserverCallback) {
        this.entry = { fire: () => this.fire() }
        liveObservers.push(this.entry)
      }
      observe(el: Element) {
        this.targets.push(el)
      }
      unobserve() {}
      disconnect() {
        const at = liveObservers.indexOf(this.entry)
        if (at >= 0) {
          liveObservers.splice(at, 1)
        }
      }
      private fire() {
        this.callback(
          this.targets.map(
            (target) => ({ target, isIntersecting: true }) as IntersectionObserverEntry,
          ),
          this as unknown as IntersectionObserver,
        )
      }
    },
  )
  const isScroller = (el: HTMLElement) =>
    el.classList?.contains('overflow-auto') && el.classList?.contains('h-full')
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return isScroller(this) ? VIEWPORT : 0
    },
  })
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get(this: HTMLElement) {
      if (isScroller(this)) {
        return VIEWPORT
      }
      return this.tagName === 'THEAD' ? THEAD : 0
    },
  })
  // jsdom implements no scrolling API on elements.
  HTMLElement.prototype.scrollTo = vi.fn()
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return isScroller(this) ? TOTAL * ROW_HEIGHT_SHORT : 0
    },
  })
})

// virtual-core never clears its scroll-end debounce, so the timer outlives the test
// and fires into a dismantled jsdom. React's own scheduling stays on real timers.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
})

afterEach(() => {
  act(() => {
    vi.runOnlyPendingTimers()
  })
  vi.useRealTimers()
})

// No contentType, so every row is the short height and the arithmetic is exact.
const nodes: TreeNode[] = Array.from({ length: TOTAL }, (_, i) => ({
  name: `file-${i}.txt`,
  path: `bucket/file-${i}.txt`,
  type: 'file',
  size: 1,
})) as TreeNode[]

type LoadMore = {
  loading: boolean
  error: string | undefined
  auto: boolean
  onLoadMore: () => void
}

// The folder path is the `key`, which is how a folder change resets the cursor,
// the scroll offset and the virtualizer's measurements.
const tableElement = (
  checked: Set<string>,
  loadMore: LoadMore | undefined,
  folder: string,
  rows: TreeNode[] = nodes,
) => (
  <FileTable
    key={folder}
    nodes={rows}
    checkedItems={checked}
    allSelected={false}
    someSelected={checked.size > 0}
    onSelectAll={() => {}}
    getItems={() => []}
    openMenu={() => {}}
    onOpen={() => {}}
    onToggleCheck={() => {}}
    onPreview={() => {}}
    loadMore={loadMore}
  />
)

function renderTable(
  checked = new Set<string>(),
  loadMore?: LoadMore,
  folder = 'bucket/',
  rows?: TreeNode[],
) {
  const utils = render(tableElement(checked, loadMore, folder, rows))
  const scroller = utils.container.querySelector<HTMLElement>('.h-full.overflow-auto')
  if (!scroller) {
    throw new Error('scroll container not found')
  }
  const grid = utils.container.querySelector<HTMLElement>('table[role="grid"]')
  if (!grid) {
    throw new Error('grid not found')
  }
  // Focusing the grid seeds the cursor, so it has to be flushed like any other
  // state update.
  const focusGrid = () => act(() => grid.focus())
  return { ...utils, scroller, grid, focusGrid }
}

const dataRows = (scroller: HTMLElement) =>
  [...scroller.querySelectorAll('tbody tr')].filter((tr) => !tr.hasAttribute('aria-hidden'))

/** Spacers plus row heights must always span the whole scroll extent, or the
 *  scrollbar cannot reach the last row. */
function measuredExtent(scroller: HTMLElement): number {
  return [...scroller.querySelectorAll('tbody tr')].reduce((sum, tr) => {
    const spacer = tr.querySelector('td')?.style.height
    return sum + Number.parseFloat(spacer || (tr as HTMLElement).style.height || '0')
  }, 0)
}

describe('FileTable windowing', () => {
  it('renders a small window instead of all 10,000 rows', () => {
    const { scroller } = renderTable()
    const rows = dataRows(scroller)
    expect(rows.length).toBeLessThan(40)
    expect(rows.length).toBeGreaterThan(2)
  })

  it('spans the full scroll extent including spacers', () => {
    const { scroller } = renderTable()
    expect(measuredExtent(scroller)).toBe(TOTAL * ROW_HEIGHT_SHORT)
  })

  it('still spans the full extent after scrolling into the middle', () => {
    const { scroller } = renderTable()
    act(() => {
      scroller.scrollTop = 5_000 * ROW_HEIGHT_SHORT
      scroller.dispatchEvent(new Event('scroll'))
    })
    expect(measuredExtent(scroller)).toBe(TOTAL * ROW_HEIGHT_SHORT)
  })
})

describe('FileTable keyboard cursor', () => {
  // Focus on a control inside a row dies when scrolling unmounts that row, and
  // arrow keys stop reaching the grid.
  it('keeps focus on the grid, not on a row', () => {
    const { scroller, grid, focusGrid } = renderTable()
    focusGrid()
    expect(grid).toHaveFocus()

    for (let i = 0; i < 30; i++) {
      fireEvent.keyDown(grid, { key: 'ArrowDown' })
    }
    expect(grid).toHaveFocus()
    expect(scroller.contains(document.activeElement)).toBe(true)
  })

  // aria-activedescendant is only honoured on the element holding DOM focus, so the
  // grid, the cursor and the focus have to be one element.
  it('carries the cursor attribute on the element that holds focus', () => {
    const { grid, focusGrid } = renderTable()
    focusGrid()
    fireEvent.keyDown(grid, { key: 'ArrowDown' })

    expect(document.activeElement).toBe(grid)
    expect(grid).toHaveAttribute('role', 'grid')
    expect(grid.getAttribute('aria-activedescendant')).toBeTruthy()
  })

  it('advances aria-activedescendant one row per ArrowDown', () => {
    const { grid, focusGrid } = renderTable()
    focusGrid()

    fireEvent.keyDown(grid, { key: 'ArrowDown' })
    const first = grid.getAttribute('aria-activedescendant')
    expect(first).toBeTruthy()

    fireEvent.keyDown(grid, { key: 'ArrowDown' })
    const second = grid.getAttribute('aria-activedescendant')
    expect(second).toBeTruthy()
    expect(second).not.toBe(first)

    // Exactly one real element, so assistive tech can resolve the cursor.
    expect(grid.querySelectorAll(`[id="${second}"]`)).toHaveLength(1)
  })

  // The grid's own outline is suppressed and the cursor ring is the only focus
  // indicator, so arriving by Tab with no cursor left nothing visible at all.
  it('takes a cursor as soon as it is focused', () => {
    const { grid, focusGrid } = renderTable()
    expect(grid).not.toHaveAttribute('aria-activedescendant')

    focusGrid()
    expect(grid.getAttribute('aria-activedescendant')).toBeTruthy()
  })

  // Inside the virtualizer's count, so an empty-but-truncated page leaves it as the
  // only row — a status row, not a cursor stop.
  it('takes no cursor when the only row is the load-more sentinel', () => {
    const { grid, focusGrid } = renderTable(
      new Set(),
      { loading: false, error: undefined, auto: false, onLoadMore: () => {} },
      'bucket/',
      [],
    )

    focusGrid()

    expect(grid).not.toHaveAttribute('aria-activedescendant')
  })

  // The window is overscanned, so its first row sits above the viewport. Seeding
  // the cursor from there would put the only focus indicator off-screen.
  it('seeds the cursor from the first on-screen row, not the overscan', () => {
    const { scroller, grid, focusGrid } = renderTable()
    act(() => {
      scroller.scrollTop = 400 * ROW_HEIGHT_SHORT
      scroller.dispatchEvent(new Event('scroll'))
    })
    focusGrid()

    const id = grid.getAttribute('aria-activedescendant')
    const cursorIndex = Number(id?.slice(id.lastIndexOf('-') + 1))
    const firstRendered = Number(dataRows(scroller)[0]?.getAttribute('aria-rowindex')) - 2
    expect(firstRendered).toBeGreaterThan(0)
    expect(cursorIndex).toBeGreaterThan(firstRendered)
  })

  // The cursor already has aria-activedescendant; reporting it here too announced
  // every checked row as unselected.
  it('reports the checkbox state as aria-selected, not the cursor', () => {
    const checked = new Set(['bucket/file-3.txt'])
    const { scroller, grid, focusGrid } = renderTable(checked)
    focusGrid()
    fireEvent.keyDown(grid, { key: 'ArrowDown' })

    const selected = [...scroller.querySelectorAll('tr[aria-selected="true"]')]
    expect(selected).toHaveLength(1)
    expect(selected[0]?.getAttribute('aria-rowindex')).toBe('5')
    expect(grid).toHaveAttribute('aria-multiselectable', 'true')
  })

  it('does not run off either end', () => {
    const { scroller, grid, focusGrid } = renderTable()
    focusGrid()
    // Already at the top: ArrowUp must not produce a negative cursor.
    fireEvent.keyDown(grid, { key: 'ArrowUp' })
    fireEvent.keyDown(grid, { key: 'ArrowUp' })
    const first = dataRows(scroller)[0]
    expect(grid.getAttribute('aria-activedescendant')).toBe(first?.id)

    // End jumps to the last row and stays there.
    fireEvent.keyDown(grid, { key: 'End' })
    fireEvent.keyDown(grid, { key: 'ArrowDown' })
    expect(measuredExtent(scroller)).toBe(TOTAL * ROW_HEIGHT_SHORT)
  })

  // Arrows bubble out of row controls, which never set the cursor. Falling back to
  // index 0 yanks the view to the top of the folder and unmounts the focused control.
  it('continues from the row an arrow came from, not from the top', () => {
    const { scroller, grid } = renderTable()
    act(() => {
      scroller.scrollTop = 40 * ROW_HEIGHT_SHORT
      scroller.dispatchEvent(new Event('scroll'))
    })
    const rows = dataRows(scroller)
    const midRow = rows[Math.floor(rows.length / 2)]
    const box = midRow?.querySelector<HTMLElement>('input[type="checkbox"]')
    if (!box || !midRow) {
      throw new Error('no row checkbox to focus')
    }
    const originIndex = Number(midRow.getAttribute('aria-rowindex')) - 2

    box.focus()
    fireEvent.keyDown(box, { key: 'ArrowDown', bubbles: true })

    // Cursor advanced from the originating row, nowhere near index 0.
    const cursorId = grid.getAttribute('aria-activedescendant')
    expect(cursorId).toBeTruthy()
    const cursorIndex = Number(cursorId?.slice(cursorId.lastIndexOf('-') + 1))
    expect(cursorIndex).toBe(originIndex + 1)
    // Focus came back to the grid, so the next scroll cannot strand it.
    expect(grid).toHaveFocus()
  })

  // Must beat an existing cursor, not just a missing one: a stale one yanks the view
  // off the control the user is on and unmounts it.
  it('continues from the originating row even when a cursor already exists', () => {
    const { scroller, grid, focusGrid } = renderTable()
    focusGrid()
    fireEvent.keyDown(grid, { key: 'ArrowDown' })

    // Scrolling with the mouse never updates the cursor, so it is now stale.
    act(() => {
      scroller.scrollTop = 400 * ROW_HEIGHT_SHORT
      scroller.dispatchEvent(new Event('scroll'))
    })
    const rows = dataRows(scroller)
    const midRow = rows[Math.floor(rows.length / 2)]
    const box = midRow?.querySelector<HTMLElement>('input[type="checkbox"]')
    if (!box || !midRow) {
      throw new Error('no row checkbox to focus')
    }
    const originIndex = Number(midRow.getAttribute('aria-rowindex')) - 2
    expect(originIndex).toBeGreaterThan(50)

    box.focus()
    fireEvent.keyDown(box, { key: 'ArrowDown', bubbles: true })

    const cursorId = grid.getAttribute('aria-activedescendant')
    const cursorIndex = Number(cursorId?.slice(cursorId.lastIndexOf('-') + 1))
    expect(cursorIndex).toBe(originIndex + 1)
  })

  it('Home and End move the cursor to the ends', () => {
    const { grid, focusGrid } = renderTable()
    focusGrid()
    fireEvent.keyDown(grid, { key: 'End' })
    const atEnd = grid.getAttribute('aria-activedescendant')
    fireEvent.keyDown(grid, { key: 'Home' })
    const atStart = grid.getAttribute('aria-activedescendant')
    expect(atEnd).not.toBe(atStart)
  })

  // The folder path is the component's key, so opening another folder remounts
  // rather than carrying the previous folder's cursor and scroll offset over.
  it('drops the cursor and the scroll offset when the folder changes', () => {
    const { scroller, grid, rerender, container, focusGrid } = renderTable()
    focusGrid()
    fireEvent.keyDown(grid, { key: 'ArrowDown' })
    fireEvent.keyDown(grid, { key: 'ArrowDown' })
    expect(grid.getAttribute('aria-activedescendant')).toBeTruthy()

    act(() => {
      scroller.scrollTop = 5_000 * ROW_HEIGHT_SHORT
      scroller.dispatchEvent(new Event('scroll'))
    })
    expect(scroller.scrollTop).toBeGreaterThan(0)

    rerender(tableElement(new Set(), undefined, 'bucket/other/'))

    const next = container.querySelector<HTMLElement>('.h-full.overflow-auto')
    expect(next).not.toBe(scroller)
    expect(next?.scrollTop).toBe(0)
    // The remounted grid holds no focus, so it takes no cursor either.
    expect(container.querySelector('table[role="grid"]')).not.toHaveAttribute(
      'aria-activedescendant',
    )
  })
})

describe('FileTable load-more sentinel', () => {
  const loadMore = (over: Partial<LoadMore> = {}): LoadMore => ({
    loading: false,
    error: undefined,
    auto: true,
    onLoadMore: () => {},
    ...over,
  })

  const scrollToEnd = (scroller: HTMLElement) =>
    act(() => {
      scroller.scrollTop = TOTAL * ROW_HEIGHT_SHORT
      scroller.dispatchEvent(new Event('scroll'))
    })

  it('shows no sentinel for a folder that is fully listed', () => {
    const { scroller } = renderTable()
    scrollToEnd(scroller)
    expect(scroller.textContent).not.toContain('Load more')
    expect(scroller.textContent).not.toContain('Loading more')
  })

  it('offers the sentinel at the end of an incomplete folder', () => {
    const { scroller } = renderTable(new Set(), loadMore({ auto: false }))
    scrollToEnd(scroller)
    expect(scroller.textContent).toContain('Load more')
  })

  it('reports a failed page with a retry instead of failing silently', () => {
    const { scroller } = renderTable(new Set(), loadMore({ error: 'Access denied' }))
    scrollToEnd(scroller)
    expect(scroller.textContent).toContain('Access denied')
    expect(scroller.textContent).toContain('Retry')
  })

  // A sentinel with no declared height leaves the scrollbar unable to reach the
  // last row, the same failure the row-height constants guard against.
  it('keeps the scroll extent exact with the sentinel in place', () => {
    const { scroller } = renderTable(new Set(), loadMore())
    expect(measuredExtent(scroller)).toBe(TOTAL * ROW_HEIGHT_SHORT + LOAD_MORE_ROW_HEIGHT)
  })

  it('reports an unknown row count while pages are missing', () => {
    const { grid } = renderTable(new Set(), loadMore())
    expect(grid.getAttribute('aria-rowcount')).toBe('-1')
  })

  it('reports the exact row count once the folder is complete', () => {
    const { grid } = renderTable()
    expect(grid.getAttribute('aria-rowcount')).toBe(String(TOTAL + 1))
  })

  it('never lets the keyboard cursor land on the sentinel', () => {
    const { scroller, grid } = renderTable(new Set(), loadMore())
    scrollToEnd(scroller)
    grid.focus()
    fireEvent.keyDown(grid, { key: 'End' })
    fireEvent.keyDown(grid, { key: 'ArrowDown' })

    const cursorId = grid.getAttribute('aria-activedescendant')
    expect(cursorId).toBeTruthy()
    const cursorRow = grid.querySelector(`#${CSS.escape(cursorId as string)}`)
    // Data rows start at aria-rowindex 2, so the last one is TOTAL + 1 and the
    // sentinel sits after it.
    expect(cursorRow?.getAttribute('aria-rowindex')).toBe(String(TOTAL + 1))
    expect(cursorRow?.textContent).toContain(`file-${TOTAL - 1}.txt`)
  })

  it('asks for one more page when the sentinel comes into view', () => {
    const onLoadMore = vi.fn()
    const { scroller } = renderTable(new Set(), loadMore({ onLoadMore }))
    scrollToEnd(scroller)

    act(() => triggerIntersection())

    expect(onLoadMore).toHaveBeenCalledTimes(1)
  })

  it('does not ask again while a page is already in flight', () => {
    const onLoadMore = vi.fn()
    const { scroller } = renderTable(new Set(), loadMore({ onLoadMore, loading: true }))
    scrollToEnd(scroller)

    act(() => triggerIntersection())

    expect(onLoadMore).not.toHaveBeenCalled()
  })

  it('waits for a click past the auto-load cap', () => {
    const onLoadMore = vi.fn()
    const { scroller } = renderTable(new Set(), loadMore({ onLoadMore, auto: false }))
    scrollToEnd(scroller)

    act(() => triggerIntersection())
    expect(onLoadMore).not.toHaveBeenCalled()

    const button = [...scroller.querySelectorAll('button')].find(
      (el) => el.textContent === 'Load more',
    )
    if (!button) {
      throw new Error('no Load more button')
    }
    fireEvent.click(button)
    expect(onLoadMore).toHaveBeenCalledTimes(1)
  })

  it('stops asking after a failure until the user retries', () => {
    const onLoadMore = vi.fn()
    const { scroller } = renderTable(new Set(), loadMore({ onLoadMore, error: 'Access denied' }))
    scrollToEnd(scroller)

    act(() => triggerIntersection())
    expect(onLoadMore).not.toHaveBeenCalled()

    const retry = [...scroller.querySelectorAll('button')].find((el) => el.textContent === 'Retry')
    if (!retry) {
      throw new Error('no Retry button')
    }
    fireEvent.click(retry)
    expect(onLoadMore).toHaveBeenCalledTimes(1)
  })
})

// Rows are appended while paging and sorted once the last page lands, so the view
// has to be re-anchored to whatever the user was looking at.
describe('FileTable re-anchoring when paging completes', () => {
  const complete = [...nodes].reverse()

  it('anchors on the first visible row, not on the overscan above it', () => {
    const scrollToSpy = vi.spyOn(HTMLElement.prototype, 'scrollTo')
    const firstVisible = 400
    const { scroller, rerender } = renderTable(
      new Set(),
      { loading: false, error: undefined, auto: false, onLoadMore: () => {} },
      'bucket/',
    )
    act(() => {
      scroller.scrollTop = THEAD + firstVisible * ROW_HEIGHT_SHORT
      scroller.dispatchEvent(new Event('scroll'))
    })

    scrollToSpy.mockClear()
    // The last page lands: the sentinel goes away and the rows sort.
    rerender(tableElement(new Set(), undefined, 'bucket/', complete))

    const call = scrollToSpy.mock.calls.at(-1)?.[0] as { top?: number } | undefined
    if (typeof call?.top !== 'number') {
      throw new Error('no scrollTo({ top }) after completion')
    }
    const landedOn = Math.round((call.top - THEAD) / ROW_HEIGHT_SHORT)
    // reverse() sends old index i to TOTAL - 1 - i.
    expect(landedOn).toBe(TOTAL - 1 - firstVisible)
    scrollToSpy.mockRestore()
  })
})

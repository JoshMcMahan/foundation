import { useVirtualizer } from '@tanstack/react-virtual'
import cx from 'classnames'
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Table } from '../components/Table'
import { listTableFixedProps, type OpenMenu, type RowMenuItem } from '../list/index'
import { fileRowHeight, ROW_HEIGHT_SHORT } from './FileRow'
import { FileRowsWindow, spacerHeights } from './FileRowsWindow'
import { FileTableHeaders } from './FileTableHeaders'
import { LOAD_MORE_ROW_HEIGHT, type LoadMoreState } from './LoadMoreRow'
import type { TreeNode } from './lib/types'

interface FileTableProps {
  nodes: TreeNode[]
  checkedItems: Set<string>
  allSelected: boolean
  someSelected: boolean
  onSelectAll: () => void
  getItems: (node: TreeNode) => RowMenuItem[]
  openMenu: OpenMenu
  onOpen: (node: TreeNode) => void
  onToggleCheck: (node: TreeNode, checked: boolean) => void
  onPreview: (node: TreeNode) => void
  /** Set when the folder has pages left to fetch. */
  loadMore?: LoadMoreState | undefined
}

/** The file table. Give it a `key` of the folder path: a folder change must reset
 *  the cursor, the scroll offset and the virtualizer's measurements, and a remount
 *  does all three without a synchronising effect. */
export function FileTable({
  nodes,
  checkedItems,
  allSelected,
  someSelected,
  onSelectAll,
  getItems,
  openMenu,
  onOpen,
  onToggleCheck,
  onPreview,
  loadMore,
}: FileTableProps) {
  // Callback ref into state so the virtualizer re-reads once the element exists.
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null)
  // A plain index, never DOM focus: windowing unmounts rows, so focus parked on a
  // row dies mid-scroll and arrow keys stop arriving. The grid keeps focus and
  // marks this row with aria-activedescendant instead.
  const [activeIndex, setActiveIndex] = useState(-1)
  // Rows start below the <thead>, not at scrollTop 0.
  const [theadHeight, setTheadHeight] = useState(0)
  const rowIdPrefix = useId()

  useLayoutEffect(() => {
    const thead = scrollEl?.querySelector('thead')
    if (thead instanceof HTMLElement) {
      setTheadHeight(thead.offsetHeight)
    }
  }, [scrollEl])

  // Stable per `nodes`, never inline: virtual-core keys its measurement memo on
  // getItemKey's identity, so a fresh closure rebuilds every measurement per scroll
  // tick. Keyed by path, since an index key binds a row's menu state to a slot.
  const getRowKey = useCallback((index: number) => nodes[index]?.path ?? 'load-more', [nodes])
  // Exact, so getTotalSize() is right on the first render and the thumb never
  // resizes mid-scroll.
  const estimateSize = useCallback(
    (index: number) => {
      const node = nodes[index]
      return node ? fileRowHeight(node) : LOAD_MORE_ROW_HEIGHT
    },
    [nodes],
  )

  const virtualizer = useVirtualizer({
    count: nodes.length + (loadMore ? 1 : 0),
    getScrollElement: () => scrollEl,
    estimateSize,
    getItemKey: getRowKey,
    overscan: 8,
    scrollMargin: theadHeight,
  })

  const moveCursor = useCallback(
    (next: number) => {
      const clamped = Math.min(nodes.length - 1, Math.max(0, next))
      setActiveIndex(clamped)
      virtualizer.scrollToIndex(clamped)
    },
    [nodes.length, virtualizer],
  )

  // A click should leave the cursor where the user pointed, so a following
  // arrow key continues from there rather than from the top.
  const handleOpen = useCallback(
    (node: TreeNode) => {
      setActiveIndex(nodes.findIndex((n) => n.path === node.path))
      onOpen(node)
    },
    [nodes, onOpen],
  )

  // Rows carry `${rowIdPrefix}-${index}` as their id, so an event that bubbled
  // out of a row can be traced back to which row it came from.
  const rowIndexOf = useCallback(
    (target: EventTarget | null) => {
      const tr = target instanceof HTMLElement ? target.closest('tr') : null
      if (!tr?.id.startsWith(`${rowIdPrefix}-`)) {
        return -1
      }
      const index = Number(tr.id.slice(rowIdPrefix.length + 1))
      return Number.isInteger(index) ? index : -1
    },
    [rowIdPrefix],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTableElement>) => {
      if (nodes.length === 0) {
        return
      }
      // Sized by the shorter row, so a page always clears the visible rows.
      const page = Math.max(1, Math.floor((scrollEl?.clientHeight ?? 0) / ROW_HEIGHT_SHORT))
      // An arrow bubbling from a row's control wins over the cursor, which may be
      // anywhere by now. Focus returns to the grid, or the next scroll unmounts the
      // control and strands focus on <body>.
      const fromRow = e.target === e.currentTarget ? -1 : rowIndexOf(e.target)
      const from = fromRow >= 0 ? fromRow : activeIndex
      const step = (delta: number) => (from < 0 ? 0 : from + delta)
      const go = (next: number) => {
        e.preventDefault()
        if (e.target !== e.currentTarget) {
          e.currentTarget.focus({ preventScroll: true })
        }
        moveCursor(next)
      }

      switch (e.key) {
        case 'ArrowDown':
          go(step(1))
          return
        case 'ArrowUp':
          go(step(-1))
          return
        case 'PageDown':
          go(step(page))
          return
        case 'PageUp':
          go(step(-page))
          return
        case 'Home':
          go(0)
          return
        case 'End':
          go(nodes.length - 1)
          return
        default:
          break
      }

      // Enter and Space belong to a row's own checkbox or button when one has focus.
      if (e.target !== e.currentTarget || from < 0) {
        return
      }
      const node = nodes[from]
      if (!node) {
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        onOpen(node)
      } else if (e.key === ' ') {
        e.preventDefault()
        onToggleCheck(node, !checkedItems.has(node.path))
      }
    },
    [nodes, activeIndex, scrollEl, moveCursor, onOpen, onToggleCheck, checkedItems, rowIndexOf],
  )

  const items = virtualizer.getVirtualItems()
  const { top, bottom } = spacerHeights(items, virtualizer.getTotalSize(), theadHeight)

  // Paging appends, so only the re-sort at completion moves rows. The recording
  // effect runs a commit behind, so the path read here is the pre-sort one.
  const incomplete = !!loadMore
  const anchorRef = useRef<string | null>(null)
  const wasIncomplete = useRef(incomplete)
  // The first visible row, not items[0], which carries the overscan and would
  // re-anchor eight rows above where the user was. Read during render so it also
  // triggers the effect: the anchor has to track scrolling, not just each page.
  const visibleStart = virtualizer.range?.startIndex
  useEffect(() => {
    if (visibleStart !== undefined) {
      anchorRef.current = nodes[visibleStart]?.path ?? null
    }
  }, [visibleStart, nodes])
  useLayoutEffect(() => {
    if (wasIncomplete.current && !incomplete) {
      const index = anchorRef.current
        ? nodes.findIndex((node) => node.path === anchorRef.current)
        : -1
      if (index > 0) {
        virtualizer.scrollToIndex(index, { align: 'start' })
      }
    }
    wasIncomplete.current = incomplete
  }, [incomplete, nodes, virtualizer])
  // Dropped while the cursor row is outside the window, since the id must resolve
  // to a real element. Unlike the tree, that row is not kept mounted: focus is on
  // the grid, and a row could not sit outside the spacers anyway.
  const activeRowId = useMemo(
    () =>
      activeIndex >= 0 && items.some((i) => i.index === activeIndex)
        ? `${rowIdPrefix}-${activeIndex}`
        : undefined,
    [activeIndex, items, rowIdPrefix],
  )

  // The grid suppresses its own outline, so the cursor ring is the only focus cue.
  // Seeded from the first visible row, not row 0, so Tab does not scroll the view.
  const handleFocus = (e: React.FocusEvent<HTMLTableElement>) => {
    if (e.target !== e.currentTarget || activeIndex >= 0 || nodes.length === 0) {
      return
    }
    setActiveIndex(Math.min(virtualizer.range?.startIndex ?? 0, nodes.length - 1))
  }

  return (
    // Keep this a block container and keep h-full off Table's wrapperClassName:
    // either lets Table's own overflow divs become a nested scroller, leaving the
    // virtualizer at scrollTop 0 forever.
    <div ref={setScrollEl} className="h-full overflow-auto">
      {/* tabIndex and onKeyDown sit on the <table>, not on the scroll container:
          aria-activedescendant is only honoured on the element that actually holds
          focus, so the grid, the cursor attribute and the focus have to be one
          element or assistive tech never hears the cursor move.
          aria-rowcount pairs with each row's aria-rowindex to report the true
          position in the folder, not the position within the rendered window;
          -1 is ARIA's "total unknown", the honest answer while the folder still
          has pages left to fetch. */}
      <Table
        {...listTableFixedProps}
        className={cx(listTableFixedProps.className, 'group/grid focus:outline-none')}
        wrapperClassName="overflow-x-auto"
        tableProps={{
          role: 'grid',
          'aria-label': 'Files',
          'aria-rowcount': loadMore ? -1 : nodes.length + 1,
          'aria-multiselectable': true,
          tabIndex: 0,
          onKeyDown: handleKeyDown,
          onFocus: handleFocus,
          ...(activeRowId && { 'aria-activedescendant': activeRowId }),
        }}
      >
        <FileTableHeaders
          allSelected={allSelected}
          someSelected={someSelected}
          onSelectAll={onSelectAll}
        />
        <FileRowsWindow
          items={items}
          padTop={top}
          padBottom={bottom}
          nodes={nodes}
          checkedItems={checkedItems}
          activeIndex={activeIndex}
          rowIdPrefix={rowIdPrefix}
          scrollEl={scrollEl}
          loadMore={loadMore}
          getItems={getItems}
          openMenu={openMenu}
          onOpen={handleOpen}
          onToggleCheck={onToggleCheck}
          onPreview={onPreview}
        />
      </Table>
    </div>
  )
}

import { useVirtualizer } from '@tanstack/react-virtual'
import cx from 'classnames'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Skeleton from 'react-loading-skeleton'
import { positionKeys } from '../components/keys'
import { useStrings } from '../components/Provider'
import { AngleRightIcon, FolderIcon, FolderOpenIcon } from '../icons'
import { canPreview } from './FilePreview/previewType'
import { getNodeIcon } from './helpers'
import type { TreeNode } from './lib/types'
import { getParentPath } from './lib/utils'
import { findRowIndex, flattenTreeRows, nextFileLimit, stepRow, type TreeRow } from './treeRows'

/** 9px margin + 12px padding, per level. */
const INDENT_PER_LEVEL = 21
const GUIDE_OFFSET = 9
const ROW_PAD_DIRECTORY = 8
const ROW_PAD_FILE = 28

/** Row pitch, with `space-y-0.5` folded in: absolutely positioned rows cannot use
 *  sibling margins. useTreePitchAudit warns if this drifts from the DOM. */
export const TREE_ROW_HEIGHT = 30
const TREE_SKELETON_HEIGHT = 64

function rowHeight(row: TreeRow): number {
  return row.kind === 'skeleton' ? TREE_SKELETON_HEIGHT : TREE_ROW_HEIGHT
}

interface TreeViewProps {
  rootNodes: TreeNode[]
  parentToChildrenMap: Record<string, TreeNode[]>
  expandedPaths: ReadonlySet<string>
  selectedPath: string
  loadingPaths: ReadonlySet<string>
  onToggleExpand: (path: string) => void
  onSelect: (path: string, node: TreeNode) => void
  onDropToFolder: (folderPath: string, files: FileList | DataTransferItemList) => void
  onContextMenu: (e: React.MouseEvent, node: TreeNode) => void
  onPreviewFile: (node: TreeNode) => void
  /** Directories with pages left to fetch, and how to fetch them. */
  paging?:
    | {
        incompletePaths: ReadonlySet<string>
        isLoading: (path: string) => boolean
        hasFailed: (path: string) => boolean
        onLoadMore: (node: TreeNode) => void
      }
    | undefined
}

/** The sidebar tree, flattened and windowed. The flat array is the single source
 *  of truth for rendering, arrow keys and ARIA. */
export function TreeView({
  rootNodes,
  parentToChildrenMap,
  expandedPaths,
  selectedPath,
  loadingPaths,
  onToggleExpand,
  onSelect,
  onDropToFolder,
  onContextMenu,
  onPreviewFile,
  paging,
}: TreeViewProps) {
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null)
  // Purely how much of an already-loaded folder to show, so it lives here rather
  // than beside the listing state.
  const [fileLimits, setFileLimits] = useState<ReadonlyMap<string, number>>(() => new Map())

  const incompletePaths = paging?.incompletePaths
  const rows = useMemo(
    () =>
      flattenTreeRows(rootNodes, parentToChildrenMap, expandedPaths, {
        loadingPaths,
        ...(incompletePaths && { incompletePaths }),
        fileLimits,
      }),
    [rootNodes, parentToChildrenMap, expandedPaths, loadingPaths, incompletePaths, fileLimits],
  )

  // Only once every loaded file is shown does asking for more mean a request.
  const revealMore = useCallback(
    (row: TreeRow) => {
      const path = row.node.path
      if ((row.hiddenFiles ?? 0) > 0) {
        setFileLimits((prev) => new Map(prev).set(path, nextFileLimit(prev.get(path))))
        return
      }
      paging?.onLoadMore(row.node)
    },
    [paging],
  )

  // Places the cursor row by hand when it falls outside the window. A
  // rangeExtractor cannot: tracking the selection sends the virtualizer into a
  // recalculate loop, and a stable identity makes it cache the range forever.
  const offsets = useMemo(() => {
    const out = new Array<number>(rows.length)
    let running = 0
    rows.forEach((row, i) => {
      out[i] = running
      running += rowHeight(row)
    })
    return out
  }, [rows])

  // Advances synchronously, unlike selection, which round-trips through the
  // router. Deriving the cursor from the event's row instead stalls one row past
  // the window, where the target can no longer take focus.
  const cursorRef = useRef<string | null>(null)
  // Only keyboard navigation should pull focus; a click or a deep link must not.
  const wantsFocusRef = useRef(false)
  // Paths navigated to here that have not committed yet, so only a selection the
  // tree did not drive moves the cursor. A set, not one path: a key burst runs
  // ahead of the router and leaves several in flight.
  const pendingNavRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (pendingNavRef.current.delete(selectedPath)) {
      return
    }
    cursorRef.current = selectedPath
  }, [selectedPath])

  // Stable per `rows`, never inline: virtual-core keys its measurement memo on
  // getItemKey's identity, so a fresh closure rebuilds all `count` measurements
  // per scroll tick, while a constant one would reuse another tree's heights.
  const getRowKey = useCallback((index: number) => rows[index]?.key ?? index, [rows])

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollEl,
    estimateSize: (index) => {
      const row = rows[index]
      return row ? rowHeight(row) : TREE_ROW_HEIGHT
    },
    getItemKey: getRowKey,
    overscan: 10,
  })

  const move = useCallback(
    (from: TreeNode, direction: 1 | -1) => {
      // The cursor can name a row that is gone — Collapse All, a refresh, or the
      // '' multi-storage root — so fall back to the row that got the keypress.
      const cursorIndex = findRowIndex(rows, cursorRef.current ?? '')
      const index = cursorIndex >= 0 ? cursorIndex : findRowIndex(rows, from.path)
      if (index === -1) {
        return
      }
      const target = stepRow(rows, index, direction)
      if (!target) {
        return
      }
      cursorRef.current = target.node.path
      pendingNavRef.current.add(target.node.path)
      virtualizer.scrollToIndex(findRowIndex(rows, target.node.path))
      // Focus has to wait for the commit this triggers; see the effect below.
      wantsFocusRef.current = true
      onSelect(target.node.path, target.node)
    },
    [rows, virtualizer, onSelect],
  )

  // Focus only after the selection render commits; before that the target row may
  // not be mounted, and requestAnimationFrame fires too early.
  useEffect(() => {
    if (!wantsFocusRef.current) {
      return
    }
    const index = findRowIndex(rows, cursorRef.current ?? '')
    const row =
      index < 0 ? null : scrollEl?.querySelector(`[data-index="${index}"] [role="treeitem"]`)
    if (row instanceof HTMLElement) {
      wantsFocusRef.current = false
      row.focus()
      return
    }
    // `rows` changes fire this too and land first, since loadingPaths is set
    // synchronously while the router commits selectedPath later. Clearing the
    // request on that earlier run strands focus on <body>.
    if (selectedPath === cursorRef.current) {
      wantsFocusRef.current = false
    }
  }, [selectedPath, rows, scrollEl])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, node: TreeNode) => {
      if (e.key === ' ' && node.type === 'file' && canPreview(node)) {
        e.preventDefault()
        onPreviewFile(node)
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        move(node, 1)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        move(node, -1)
      }
    },
    [move, onPreviewFile],
  )

  const items = virtualizer.getVirtualItems()
  useTreePitchAudit(scrollEl, rows, items)

  const renderRow = (index: number, top: number, height: number) => {
    const row = rows[index]
    if (!row) {
      return null
    }
    return (
      <div key={row.key} data-index={index} className="absolute inset-x-0" style={{ top, height }}>
        {row.kind === 'skeleton' ? (
          <TreeSkeletonRow depth={row.depth} />
        ) : row.kind === 'more' ? (
          <TreeMoreRow
            depth={row.depth}
            hiddenFiles={row.hiddenFiles ?? 0}
            partial={incompletePaths?.has(row.node.path) ?? false}
            loading={paging?.isLoading(row.node.path) ?? false}
            failed={paging?.hasFailed(row.node.path) ?? false}
            onReveal={() => revealMore(row)}
          />
        ) : (
          <TreeRowItem
            row={row}
            isSelected={row.node.path === selectedPath}
            onToggleExpand={onToggleExpand}
            onSelect={onSelect}
            onDropToFolder={onDropToFolder}
            onContextMenu={onContextMenu}
            onKeyDown={handleKeyDown}
          />
        )}
      </div>
    )
  }

  // Keep the cursor row mounted when scrolled out of the window, so arrow keys
  // always have something to focus. Keyed on the cursor, not selectedPath: a burst
  // of keypresses runs ahead of the router, and the focus effect wants the cursor.
  const cursorIndex = findRowIndex(rows, cursorRef.current ?? selectedPath)
  const cursorOutsideWindow = cursorIndex >= 0 && !items.some((item) => item.index === cursorIndex)

  // One keyed array, not two sibling slots: React keys are scoped per slot, so a
  // row crossing the window edge would be destroyed and recreated, taking focus to
  // <body>. Index order keeps the cursor row from being moved either.
  const slots = items.map((item) => ({
    index: item.index,
    top: item.start,
    height: item.size,
  }))
  if (cursorOutsideWindow) {
    slots.push({
      index: cursorIndex,
      top: offsets[cursorIndex] ?? 0,
      height: rowHeight(rows[cursorIndex] as TreeRow),
    })
    slots.sort((a, b) => a.index - b.index)
  }

  return (
    <div
      ref={setScrollEl}
      className="overflow-auto flex-1 px-2 py-2"
      role="tree"
      // Nothing else in the sidebar cancels dragover, so a file dropped on the
      // padding falls through to the browser, which navigates and unloads the app.
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => e.preventDefault()}
    >
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {slots.map((slot) => renderRow(slot.index, slot.top, slot.height))}
      </div>
    </div>
  )
}

function indentStyle(depth: number, isDirectory: boolean) {
  return {
    paddingLeft: depth * INDENT_PER_LEVEL + (isDirectory ? ROW_PAD_DIRECTORY : ROW_PAD_FILE),
  }
}

function IndentGuides({ depth }: { depth: number }) {
  if (depth === 0) {
    return null
  }
  return (
    <>
      {positionKeys(depth, 'indent').map((key, level) => (
        <span
          key={key}
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 w-px bg-(--theme-border)/60"
          style={{ left: GUIDE_OFFSET + level * INDENT_PER_LEVEL }}
        />
      ))}
    </>
  )
}

function RowIcons({
  isDirectory,
  isExpanded,
  customIcon,
}: {
  isDirectory: boolean
  isExpanded: boolean
  customIcon: React.ReactNode
}) {
  if (!isDirectory) {
    return <div className="shrink-0">{customIcon}</div>
  }
  const folder = isExpanded ? (
    <FolderOpenIcon className="h-4 w-4 mr-1 text-sky-500" />
  ) : (
    <FolderIcon className="h-4 w-4 mr-1 text-sky-500/80" />
  )
  return (
    <>
      <AngleRightIcon
        className={cx(
          'h-3.5 w-3.5 shrink-0 theme-muted-text transition-transform duration-150',
          isExpanded && 'rotate-90',
        )}
      />
      {customIcon ?? folder}
    </>
  )
}

/** Click-only, unlike the table's sentinel: the tree is a navigation aid, and
 *  growing it automatically as the user scrolls is what the cap exists to prevent. */
function TreeMoreRow({
  depth,
  hiddenFiles,
  partial,
  loading,
  failed,
  onReveal,
}: {
  depth: number
  /** Files held back by the cap; 0 when only unfetched pages remain. */
  hiddenFiles: number
  /** The folder also has pages left, so `hiddenFiles` is a floor, not a total. */
  partial: boolean
  loading: boolean
  /** Too narrow for the message the table shows, but the label has to say retry. */
  failed: boolean
  onReveal: () => void
}) {
  const t = useStrings().fileExplorer

  const label = () => {
    if (failed) {
      return t.retry
    }
    if (hiddenFiles === 0) {
      return t.loadMore
    }
    return partial ? t.treeMoreCountPartial(hiddenFiles) : t.treeMoreCount(hiddenFiles)
  }

  return (
    <div className="relative h-full overflow-hidden">
      <IndentGuides depth={depth} />
      <div
        className="flex h-full items-center pr-2 text-xs theme-muted-text"
        style={{ paddingLeft: depth * INDENT_PER_LEVEL + ROW_PAD_FILE }}
      >
        {loading ? (
          <span>{t.loadingMore}</span>
        ) : (
          <button
            type="button"
            className={cx('cursor-pointer underline', failed ? 'text-red-500' : 'theme-link')}
            onClick={onReveal}
          >
            {label()}
          </button>
        )}
      </div>
    </div>
  )
}

/** Sized by the slot, not by its contents: react-loading-skeleton wraps each bar
 *  in an inline span, so a bar occupies a line box taller than its `height` and
 *  the overflow would sit on top of the absolutely positioned row below. */
function TreeSkeletonRow({ depth }: { depth: number }) {
  return (
    <div className="relative h-full overflow-hidden">
      <IndentGuides depth={depth} />
      <div
        className="flex h-full flex-col justify-center gap-1.5 py-1 pr-2"
        style={{ paddingLeft: depth * INDENT_PER_LEVEL + ROW_PAD_FILE }}
      >
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} height={12} containerClassName="block leading-none" />
        ))}
      </div>
    </div>
  )
}

/** Hovering a dragged file over a collapsed folder expands it after 400ms. */
function useSpringLoadedDrop({
  node,
  dropPath,
  isDirectory,
  isExpanded,
  onToggleExpand,
  onDropToFolder,
}: {
  node: TreeNode
  /** Where a drop uploads: the row itself for a directory, its parent for a file. */
  dropPath: string
  isDirectory: boolean
  isExpanded: boolean
  onToggleExpand: (path: string) => void
  onDropToFolder: (folderPath: string, files: FileList | DataTransferItemList) => void
}) {
  const hoverCount = useRef(0)
  const timer = useRef<NodeJS.Timeout | null>(null)
  const [dragActive, setDragActive] = useState(false)

  const clear = () => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
  }

  // Load-bearing: neither dragLeave nor drop runs if the row unmounts mid-hover,
  // and the callback would then expand a path this row no longer represents.
  // Inlined rather than reusing `clear`, so the effect owns no dependencies.
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current)
        timer.current = null
      }
    },
    [],
  )

  return {
    dragActive,
    dragHandlers: {
      onDragEnter: (e: React.DragEvent) => {
        e.preventDefault()
        // Don't bubble to ancestor folders, or they stay flagged as drop targets.
        e.stopPropagation()
        hoverCount.current += 1
        setDragActive(true)
        if (isDirectory && !isExpanded && !timer.current) {
          timer.current = setTimeout(() => {
            onToggleExpand(node.path)
            timer.current = null
          }, 400)
        }
      },
      onDragOver: (e: React.DragEvent) => e.preventDefault(),
      onDragLeave: (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        hoverCount.current -= 1
        if (hoverCount.current > 0) {
          return
        }
        setDragActive(false)
        clear()
      },
      onDrop: (e: React.DragEvent) => {
        e.stopPropagation()
        e.preventDefault()
        hoverCount.current = 0
        setDragActive(false)
        clear()
        onDropToFolder(
          dropPath,
          e.dataTransfer.items.length ? e.dataTransfer.items : e.dataTransfer.files,
        )
      },
    },
  }
}

/** Keys a row handles itself; the arrows that move between rows delegate upward,
 *  where the flat array is. The set is deliberately narrow:
 *  no Home/End, no typeahead, and ArrowLeft/Right only toggle a directory. */
function dispatchRowKey(
  e: React.KeyboardEvent,
  {
    node,
    isDirectory,
    isExpanded,
    onSelect,
    onToggleExpand,
    onDelegate,
  }: {
    node: TreeNode
    isDirectory: boolean
    isExpanded: boolean
    onSelect: (e: React.KeyboardEvent) => void
    onToggleExpand: (path: string) => void
    onDelegate: (e: React.KeyboardEvent, node: TreeNode) => void
  },
) {
  if (e.key === 'Enter') {
    e.preventDefault()
    onSelect(e)
    return
  }
  if (e.key === ' ') {
    e.preventDefault()
    // A previewable file delegates Space upward for Quick Look; everything else
    // falls back to select/toggle.
    if (!isDirectory && canPreview(node)) {
      onDelegate(e, node)
    } else {
      onSelect(e)
    }
    return
  }
  const toggles =
    (e.key === 'ArrowRight' && isDirectory && !isExpanded) ||
    (e.key === 'ArrowLeft' && isDirectory && isExpanded)
  if (toggles) {
    e.preventDefault()
    onToggleExpand(node.path)
    return
  }
  onDelegate(e, node)
}

interface TreeRowItemProps {
  row: TreeRow
  isSelected: boolean
  onToggleExpand: (path: string) => void
  onSelect: (path: string, node: TreeNode) => void
  onDropToFolder: (folderPath: string, files: FileList | DataTransferItemList) => void
  onContextMenu: (e: React.MouseEvent, node: TreeNode) => void
  onKeyDown: (e: React.KeyboardEvent, node: TreeNode) => void
}

const TreeRowItem = memo(function TreeRowItem({
  row,
  isSelected,
  onToggleExpand,
  onSelect,
  onDropToFolder,
  onContextMenu,
  onKeyDown,
}: TreeRowItemProps) {
  const { node, depth, isExpanded } = row
  const isDirectory = node.type === 'directory'

  const { dragActive, dragHandlers } = useSpringLoadedDrop({
    node,
    dropPath: isDirectory ? node.path : getParentPath(node.path),
    isDirectory,
    isExpanded,
    onToggleExpand,
    onDropToFolder,
  })

  const handleSelect = (e: React.MouseEvent | React.KeyboardEvent) => {
    // Prevent focus loss on click by keeping focus on the element
    if (e.type === 'click') {
      e.preventDefault()
    }
    onSelect(node.path, node)
    if (isDirectory) {
      onToggleExpand(node.path)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) =>
    dispatchRowKey(e, {
      node,
      isDirectory,
      isExpanded,
      onSelect: handleSelect,
      onToggleExpand,
      onDelegate: onKeyDown,
    })

  const customIcon = getNodeIcon(node)
  // A storage root shows its display name; a user node's display name is its name.
  const label = isDirectory && node.storageId && node.displayName ? node.displayName : node.name

  return (
    <div
      className={cx(
        'relative h-full rounded-md transition-[box-shadow,background-color] duration-150',
        dragActive && 'ring-1 ring-(--theme-link)/60',
      )}
      {...dragHandlers}
    >
      <IndentGuides depth={depth} />
      <div
        className={cx(
          'group relative flex items-center gap-1.5 pr-2 py-1 rounded-md cursor-pointer',
          'transition-colors duration-150',
          'focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-(--theme-link)',
          isSelected
            ? 'bg-(--theme-element)/15 font-medium'
            : dragActive
              ? 'theme-hover'
              : 'hover:theme-hover',
        )}
        style={indentStyle(depth, isDirectory)}
        onClick={handleSelect}
        onKeyDown={handleKeyDown}
        onContextMenu={(e) => onContextMenu(e, node)}
        role="treeitem"
        aria-level={depth + 1}
        aria-posinset={row.posInSet}
        aria-setsize={row.setSize}
        aria-selected={isSelected}
        {...(isDirectory && { 'aria-expanded': isExpanded })}
        tabIndex={isSelected ? 0 : -1}
      >
        <RowIcons isDirectory={isDirectory} isExpanded={isExpanded} customIcon={customIcon} />
        <span className="text-sm truncate">{label}</span>
      </div>
    </div>
  )
})

/** The height constants must equal the rendered pitch, or the scrollbar
 *  drifts from the content. Reports the measured value to use. */
function useTreePitchAudit(
  scrollEl: HTMLElement | null,
  rows: readonly TreeRow[],
  items: readonly { index: number }[],
) {
  useEffect(() => {
    if (!import.meta.env.DEV || !scrollEl || items.length < 2) {
      return
    }
    for (const item of items) {
      const row = rows[item.index]
      const el = scrollEl.querySelector(`[data-index="${item.index}"]`)
      if (row?.kind !== 'node' || !(el instanceof HTMLElement)) {
        continue
      }
      const inner = el.firstElementChild?.lastElementChild
      const measured = inner ? inner.getBoundingClientRect().height : 0
      // Content taller than the slot gets clipped, and every offset below is wrong.
      if (measured > TREE_ROW_HEIGHT + 0.5) {
        console.warn(
          `TreeView: TREE_ROW_HEIGHT is ${TREE_ROW_HEIGHT} but a row's content measures ${measured}. Set TREE_ROW_HEIGHT = ${Math.ceil(measured)} in TreeView.tsx.`,
        )
      }
      return
    }
  }, [scrollEl, rows, items])
}

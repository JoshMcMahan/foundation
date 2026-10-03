import { useEffect } from 'react'
import { useSlots, useStrings } from '../components/Provider'
import { FileIcon, FolderIcon } from '../icons'
import type { OpenMenu, RowMenuItem } from '../list/index'
import { canPreview } from './FilePreview/previewType'
import { FileRow, isTwoLineRow, ROW_HEIGHT_SHORT, ROW_HEIGHT_TALL } from './FileRow'
import { getNodeIcon } from './helpers'
import { LoadMoreRow, type LoadMoreState } from './LoadMoreRow'
import type { TreeNode } from './lib/types'

interface Span {
  start: number
  end: number
}

/** `start`/`end` include scrollMargin but getTotalSize() does not, so the margin
 *  has to come back out of both. */
export function spacerHeights(
  items: readonly Span[],
  totalSize: number,
  scrollMargin: number,
): { top: number; bottom: number } {
  const first = items[0]
  const last = items[items.length - 1]
  if (!first || !last) {
    return { top: 0, bottom: 0 }
  }
  return {
    top: Math.max(0, first.start - scrollMargin),
    bottom: Math.max(0, totalSize - (last.end - scrollMargin)),
  }
}

interface FileRowsWindowProps {
  items: readonly { index: number }[]
  padTop: number
  padBottom: number
  nodes: TreeNode[]
  checkedItems: Set<string>
  /** Keyboard cursor owned by FileTable; -1 when there is none. */
  activeIndex: number
  rowIdPrefix: string
  scrollEl: HTMLElement | null
  loadMore?: LoadMoreState | undefined
  getItems: (node: TreeNode) => RowMenuItem[]
  openMenu: OpenMenu
  onOpen: (node: TreeNode) => void
  onToggleCheck: (node: TreeNode, checked: boolean) => void
  onPreview: (node: TreeNode) => void
}

/** Must stay a single child of `<Table>`: Table re-keys children by traversal
 *  index, so a count that varied with scroll position would remount every row. */
export function FileRowsWindow({
  items,
  padTop,
  padBottom,
  nodes,
  checkedItems,
  activeIndex,
  rowIdPrefix,
  scrollEl,
  loadMore,
  getItems,
  openMenu,
  onOpen,
  onToggleCheck,
  onPreview,
}: FileRowsWindowProps) {
  const { storageIconUrl } = useSlots()
  const storageIconAlt = useStrings().fileExplorer.chrome.storageIconAlt
  useNestedScrollerWarning(scrollEl, nodes.length)
  useRowPitchAudit(scrollEl, nodes, items)

  return (
    <>
      {padTop > 0 && <Spacer key="pad-top" height={padTop} />}
      {items.map((item) => {
        const node = nodes[item.index]
        // The index past the last node is the sentinel, which has to live inside this
        // map to stay part of Table's single child.
        if (!node) {
          return loadMore ? (
            <LoadMoreRow
              key="load-more"
              rowId={`${rowIdPrefix}-${item.index}`}
              rowIndex={item.index + 2}
              loading={loadMore.loading}
              error={loadMore.error}
              auto={loadMore.auto}
              root={scrollEl}
              onLoadMore={loadMore.onLoadMore}
            />
          ) : null
        }
        const icon =
          getNodeIcon(node, storageIconUrl, storageIconAlt) ??
          (node.type === 'directory' ? (
            <FolderIcon className="h-4 w-4 text-sky-500/80" />
          ) : (
            <FileIcon className="h-4 w-4 theme-muted-text" />
          ))
        return (
          <FileRow
            key={node.path}
            rowId={`${rowIdPrefix}-${item.index}`}
            // 1-based, and the header row is 1, so data rows start at 2.
            rowIndex={item.index + 2}
            active={item.index === activeIndex}
            node={node}
            icon={icon}
            checked={checkedItems.has(node.path)}
            canPreview={canPreview(node)}
            getItems={() => getItems(node)}
            openMenu={openMenu}
            onOpen={onOpen}
            onToggleCheck={onToggleCheck}
            onPreview={onPreview}
          />
        )
      })}
      {padBottom > 0 && <Spacer key="pad-bottom" height={padBottom} />}
    </>
  )
}

// border-0 beats tbody's divide-y without `!`, since Tailwind v4 emits the
// divide utility at zero specificity.
function Spacer({ height }: { height: number }) {
  return (
    <>
      {/* biome-ignore lint/a11y/noAriaHiddenOnFocusable: a spacer row is never focusable, and useRowPitchAudit skips rows by this attribute */}
      <tr aria-hidden="true" className="border-0">
        <td colSpan={5} style={{ height, padding: 0 }} />
      </tr>
    </>
  )
}

/** A nested overflow container stealing the scroll leaves the virtualizer at
 *  scrollTop 0 forever, rendering only the first window. */
function useNestedScrollerWarning(scrollEl: HTMLElement | null, count: number) {
  useEffect(() => {
    if (!import.meta.env.DEV || !scrollEl || count <= 100) {
      return
    }
    if (scrollEl.scrollHeight <= scrollEl.clientHeight) {
      console.warn(
        'FileRowsWindow: scrollEl is not scrolling — a nested overflow container likely stole it, so only the first window will ever render.',
      )
    }
  }, [scrollEl, count])
}

type RowKind = 'short' | 'tall'

/** Pitch per kind, from the first adjacent same-kind pair: a mixed pair says
 *  nothing about either one. */
function measurePitches(rows: { kind: RowKind; top: number }[]): Map<RowKind, number> {
  const pitches = new Map<RowKind, number>()
  rows.forEach((row, i) => {
    const next = rows[i + 1]
    if (next && next.kind === row.kind && !pitches.has(row.kind)) {
      pitches.set(row.kind, next.top - row.top)
    }
  })
  return pitches
}

/** The constants must equal the row *pitch*, not the row's own height —
 *  under border-collapse the shared border sits between rows. A 1px error
 *  compounds to 10,000px across a 10k-row directory. */
function useRowPitchAudit(
  scrollEl: HTMLElement | null,
  nodes: TreeNode[],
  items: readonly { index: number }[],
) {
  useEffect(() => {
    if (!import.meta.env.DEV || !scrollEl || items.length < 3) {
      return
    }
    const rows = [...scrollEl.querySelectorAll('tbody tr')]
      .filter((row) => !row.hasAttribute('aria-hidden'))
      .map((row, i) => {
        const node = nodes[items[i]?.index ?? -1]
        return node
          ? {
              kind: (isTwoLineRow(node) ? 'tall' : 'short') as RowKind,
              top: row.getBoundingClientRect().top,
            }
          : null
      })
      .filter((row): row is { kind: RowKind; top: number } => row !== null)

    const expected: Record<RowKind, number> = {
      short: ROW_HEIGHT_SHORT,
      tall: ROW_HEIGHT_TALL,
    }
    for (const [kind, measured] of measurePitches(rows)) {
      // A zero pitch means nothing was laid out (jsdom), not a wrong constant.
      if (measured > 0 && Math.abs(measured - expected[kind]) > 0.5) {
        const name = `ROW_HEIGHT_${kind.toUpperCase()}`
        console.warn(
          `FileRowsWindow: ${name} is ${expected[kind]} but the rendered pitch is ${measured}. Set ${name} = ${measured} in FileRow.tsx, or the scrollbar will not reach the last row.`,
        )
      }
    }
  }, [scrollEl, nodes, items])
}

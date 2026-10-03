import cx from 'classnames'
import { DateTime } from 'luxon'
import type { ReactNode } from 'react'
import { useStrings } from '../components/Provider'
import { Table } from '../components/Table'
import { TOOLTIP_ID } from '../components/Tooltip'
import { EyeIcon } from '../icons'
import {
  MoreButton,
  type OpenMenu,
  type RowMenuItem,
  RowSelectCheckbox,
  useRowMenuActive,
} from '../list/index'
import type { TreeNode } from './lib/types'
import { formatFileSize } from './lib/utils'

// Measured row pitch, hairline included. `height` on a `<tr>` is only a minimum,
// so a value under the natural height is silently ignored and the virtualizer's
// estimate drifts; useRowPitchAudit warns with the real number.
export const ROW_HEIGHT_SHORT = 45
export const ROW_HEIGHT_TALL = 52.25

export function isTwoLineRow(node: TreeNode): boolean {
  return node.type !== 'directory' && !!node.contentType
}

/** Pure function of the node, so the virtualizer sizes rows without measuring. */
export function fileRowHeight(node: TreeNode): number {
  return isTwoLineRow(node) ? ROW_HEIGHT_TALL : ROW_HEIGHT_SHORT
}

// A click on an interactive control inside the row should not also open the row.
function isInteractiveTarget(e: React.MouseEvent) {
  return !!(e.target as HTMLElement).closest('a,button,input,label')
}

// Build the row menu only when it is opened, not on every render — a large
// directory would otherwise rebuild hundreds of menu structures per re-render.
function lazyContextMenuProps(openMenu: OpenMenu, getItems: () => RowMenuItem[]) {
  return {
    onContextMenu: (e: React.MouseEvent) => {
      const items = getItems()
      e.preventDefault()
      if (items.length > 0) {
        e.stopPropagation()
      }
      openMenu(e.clientX, e.clientY, items)
    },
  }
}

interface FileRowProps {
  node: TreeNode
  icon: ReactNode
  /** Target for the table's aria-activedescendant. */
  rowId: string
  /** True position in the folder, which a windowed table cannot convey from DOM order. */
  rowIndex: number
  /** The keyboard cursor row. Focus stays on the container, so nothing else marks it. */
  active: boolean
  checked: boolean
  canPreview: boolean
  getItems: () => RowMenuItem[]
  openMenu: OpenMenu
  onOpen: (node: TreeNode) => void
  onToggleCheck: (node: TreeNode, checked: boolean) => void
  onPreview: (node: TreeNode) => void
}

export function UserRow({
  node,
  icon,
  storageCount,
  getItems,
  openMenu,
  onOpen,
}: {
  node: TreeNode
  icon: ReactNode
  storageCount: number
  getItems: () => RowMenuItem[]
  openMenu: OpenMenu
  onOpen: (node: TreeNode) => void
}) {
  const t = useStrings().fileExplorer
  const { active: menuActive, openMenu: openRowMenu } = useRowMenuActive(openMenu)
  const handleRowClick = (e: React.MouseEvent) => {
    if (isInteractiveTarget(e)) {
      return
    }
    onOpen(node)
  }
  return (
    <tr
      className={cx('group cursor-pointer', menuActive ? 'theme-hover' : 'hover:theme-hover')}
      onClick={handleRowClick}
      {...lazyContextMenuProps(openRowMenu, getItems)}
    >
      <Table.Item className="py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full theme-muted-panel *:m-0">
            {icon}
          </span>
          <span className="truncate text-[13px] font-medium text-(--theme-app)">
            {node.displayName || node.name}
          </span>
        </div>
      </Table.Item>
      <Table.Item className="py-2.5 text-xs uppercase tracking-wider text-(--theme-muted-text-color)">
        {t.preview.userType}
      </Table.Item>
      <Table.Item className="py-2.5 tabular-nums text-(--theme-muted-text-color)">
        {storageCount}
      </Table.Item>
      <Table.Item className="relative py-2.5">
        <div className="absolute inset-y-0 right-0 flex items-center pr-4">
          <MoreButton active={menuActive} onOpen={(x, y) => openRowMenu(x, y, getItems())} />
        </div>
      </Table.Item>
    </tr>
  )
}

export function FileRow({
  node,
  icon,
  rowId,
  rowIndex,
  active,
  checked,
  canPreview,
  getItems,
  openMenu,
  onOpen,
  onToggleCheck,
  onPreview,
}: FileRowProps) {
  const t = useStrings().fileExplorer
  const { active: menuActive, openMenu: openRowMenu } = useRowMenuActive(openMenu)
  const isDir = node.type === 'directory'
  const modifiedDt = node.modified ? DateTime.fromISO(node.modified) : null
  const typeLabel = node.root ? (node.storageType ?? node.type) : node.type

  const handleRowClick = (e: React.MouseEvent) => {
    if (isInteractiveTarget(e)) {
      return
    }
    onOpen(node)
  }

  return (
    <tr
      id={rowId}
      aria-rowindex={rowIndex}
      // Selection, not the cursor: the grid reports the cursor through
      // aria-activedescendant, and this is the only row-level selection signal.
      aria-selected={checked}
      className={cx(
        'group',
        checked ? 'bg-blue-500/5' : menuActive ? 'theme-hover' : 'hover:theme-hover',
        // Only while the grid has keyboard focus: clicking a row sets the cursor
        // so a following arrow key continues from there, but a mouse click should
        // not draw a focus ring. :focus-visible is the browser's own distinction.
        active &&
          'group-focus-visible/grid:ring-1 group-focus-visible/grid:ring-inset group-focus-visible/grid:ring-(--theme-link)',
        'cursor-pointer',
      )}
      onClick={handleRowClick}
      style={{ height: fileRowHeight(node) }}
      {...lazyContextMenuProps(openRowMenu, getItems)}
    >
      <Table.Item className="py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <RowSelectCheckbox
            checked={checked}
            label={t.preview.select(node.name)}
            onToggle={() => onToggleCheck(node, !checked)}
          />
          <span className="flex h-5 w-5 shrink-0 items-center justify-center *:m-0">{icon}</span>
          <div className="min-w-0">
            <div className="truncate text-[13px] font-medium leading-tight text-(--theme-app)">
              {node.displayName || node.name}
            </div>
            {isTwoLineRow(node) && (
              <div className="truncate text-xs leading-tight text-(--theme-muted-text-color)">
                {node.contentType}
              </div>
            )}
          </div>
        </div>
      </Table.Item>
      <Table.Item className="truncate py-2.5 text-sm tabular-nums text-(--theme-muted-text-color)">
        {typeof node.size === 'number' ? formatFileSize(node.size) : '—'}
      </Table.Item>
      <Table.Item className="truncate py-2.5 text-xs uppercase tracking-wider text-(--theme-muted-text-color)">
        {typeLabel}
      </Table.Item>
      <Table.Item className="truncate py-2.5 text-sm text-(--theme-muted-text-color)">
        <span
          data-tooltip-id={TOOLTIP_ID}
          data-tooltip-content={node.modified ?? ''}
          data-tooltip-place="top"
        >
          {!isDir && modifiedDt?.isValid ? modifiedDt.toRelative() : '—'}
        </span>
      </Table.Item>
      <Table.Item className="relative py-2.5">
        <div className="absolute inset-y-0 right-0 flex items-center gap-0.5 pr-4">
          {!isDir && canPreview && (
            <button
              type="button"
              aria-label={t.preview.preview}
              data-tooltip-id={TOOLTIP_ID}
              data-tooltip-content={t.preview.preview}
              data-tooltip-place="bottom"
              onClick={(e) => {
                e.stopPropagation()
                onPreview(node)
              }}
              className={cx(
                'rounded p-1 text-(--theme-muted-text-color) transition-colors hover:bg-(--theme-muted-panel-bg) hover:text-(--theme-app) [&>svg]:h-4 [&>svg]:w-4',
                menuActive
                  ? 'opacity-100'
                  : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
              )}
            >
              <EyeIcon />
            </button>
          )}
          <MoreButton active={menuActive} onOpen={(x, y) => openRowMenu(x, y, getItems())} />
        </div>
      </Table.Item>
    </tr>
  )
}

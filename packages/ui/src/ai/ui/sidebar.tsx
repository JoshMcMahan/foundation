import { type CSSProperties, type ReactNode, useState } from 'react'
import { ConfirmModal } from '../../components/ConfirmModal'
import type { OpenMenu } from '../../components/ContextMenu'
import { fieldBox } from '../../components/fieldBox'
import { focusOnMount } from '../../components/focus'
import { IconButton } from '../../components/IconButton'
import type { MenuEntry } from '../../components/MenuEntries'
import { Tooltip } from '../../components/Tooltip'
import { cx } from '../../cx'
import { SidebarIcon } from '../../icons'
import { MoreButton, rowContextMenuProps, useRowMenuActive } from '../../list/index'

const SIDEBAR_RAIL_WIDTH_PX = 48
export const SIDEBAR_DEFAULT_WIDTH_PX = 256

// Tints rather than the theme's hover, which is a shade off this surface and
// would not read as a highlight on it: the accent for the open row, so the
// conversation on screen is marked in the chat's own colour, and the ink for
// a passing pointer.
const HIGHLIGHT_SELECTED = 'bg-[color-mix(in_oklab,var(--theme-accent)_12%,transparent)]'
const HIGHLIGHT_HOVER = 'hover:bg-[color-mix(in_oklab,var(--theme-app)_5%,transparent)]'

/** The column a conversation list lives in: it animates between its width
 *  and a rail, unless a drag is setting the width right now. */
export function SidebarPanel({
  collapsed,
  width = SIDEBAR_DEFAULT_WIDTH_PX,
  railWidth = SIDEBAR_RAIL_WIDTH_PX,
  resizing = false,
  label,
  className,
  style,
  children,
}: {
  collapsed: boolean
  width?: number
  railWidth?: number
  resizing?: boolean
  label?: string | undefined
  className?: string
  style?: CSSProperties
  children: ReactNode
}) {
  return (
    <aside
      aria-label={label}
      className={cx(
        'relative h-full flex shrink-0 flex-col bg-(--theme-muted-panel-bg) overflow-hidden',
        !resizing && 'transition-[width] duration-300 ease-in-out',
        className,
      )}
      style={{ width: collapsed ? railWidth : width, ...style }}
    >
      {children}
    </aside>
  )
}

export function SidebarToggle({
  collapsed,
  onToggle,
  openLabel,
  closeLabel,
  className,
}: {
  collapsed: boolean
  onToggle: () => void
  openLabel: string
  closeLabel: string
  className?: string
}) {
  const label = collapsed ? openLabel : closeLabel
  return (
    <IconButton
      label={label}
      icon={<SidebarIcon />}
      aria-expanded={!collapsed}
      onClick={onToggle}
      className={className}
    />
  )
}

export function SidebarGroupHeading({
  children,
  tone = 'default',
  testId,
}: {
  children: ReactNode
  /** 'attention' is for the group the reader is being asked to act on. */
  tone?: 'default' | 'attention'
  testId?: string | undefined
}) {
  return (
    <h4
      data-testid={testId}
      className={cx(
        'mt-5 mb-1 whitespace-nowrap px-2 text-xs font-medium',
        tone === 'attention' ? 'text-amber-700 dark:text-amber-300' : 'theme-muted-text',
      )}
    >
      {children}
    </h4>
  )
}

/** A row's first line, the same in every list: what it is, and when it last
 *  moved, abbreviated, on the right. */
export function SidebarRowTitle({
  children,
  time,
}: {
  children: ReactNode
  /** When it last changed, short: a compact `RelativeTime`. */
  time?: ReactNode
}) {
  return (
    <span className="flex min-w-0 flex-1 items-baseline gap-2">
      <span className="min-w-0 flex-1 truncate text-sm theme-text">{children}</span>
      {time && (
        <span className="min-w-8 shrink-0 text-[11px] tabular-nums theme-muted-text">{time}</span>
      )}
    </span>
  )
}

/** One entry in the list: the row highlights while it is the open one or
 *  while its menu is up, and the menu opens from its button or a right-click. */
export function SidebarRow({
  selected,
  menuItems,
  openMenu,
  className,
  children,
}: {
  selected: boolean
  menuItems: MenuEntry[]
  openMenu: OpenMenu
  className?: string
  children: ReactNode
}) {
  const { active, openMenu: openRowMenu } = useRowMenuActive(openMenu)
  return (
    <li
      className={cx(
        'group relative flex items-center justify-between rounded-lg px-2 py-[3px] transition-colors duration-150',
        selected || active ? HIGHLIGHT_SELECTED : HIGHLIGHT_HOVER,
        className,
      )}
      {...rowContextMenuProps(openRowMenu, menuItems)}
    >
      {children}
      <MoreButton open={active} onOpen={(button) => openRowMenu(button, menuItems)} />
    </li>
  )
}

/** One entry in the collapsed rail: a square the size of the toggle, with the
 *  same highlight as a row, holding whatever stands in for the item. */
export function SidebarRailItem({
  selected,
  label,
  onSelect,
  testId,
  children,
}: {
  selected: boolean
  /** Names the icon-only button, and shows beside it on hover. */
  label: string
  onSelect: () => void
  testId?: string
  children: ReactNode
}) {
  return (
    <li>
      <Tooltip content={label} side="right">
        <button
          type="button"
          data-testid={testId}
          aria-label={label}
          aria-current={selected ? 'page' : undefined}
          onClick={onSelect}
          className={cx(
            'flex h-7 w-7 items-center justify-center rounded-md transition-colors',
            HIGHLIGHT_HOVER,
            selected && HIGHLIGHT_SELECTED,
          )}
        >
          {children}
        </button>
      </Tooltip>
    </li>
  )
}

export function RenameDialog({
  open,
  title,
  label,
  placeholder,
  confirmLabel,
  value,
  onChange,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  label: string
  placeholder: string
  confirmLabel: string
  value: string
  onChange: (value: string) => void
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <ConfirmModal
      open={open}
      onClose={onClose}
      align="center"
      closeOnConfirm={false}
      title={title}
      confirmLabel={confirmLabel}
      confirmDisabled={!value.trim()}
      onConfirm={onConfirm}
    >
      <label className="block space-y-2">
        <span className="text-sm font-medium theme-text">{label}</span>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && value.trim()) {
              onConfirm()
            }
          }}
          placeholder={placeholder}
          ref={focusOnMount}
          className={fieldBox()}
        />
      </label>
    </ConfirmModal>
  )
}

export interface RowDialogStrings<T> {
  deleteTitle: string
  deleteBody: (item: T) => ReactNode
  deleteAction: string
  renameTitle: string
  renameLabel: string
  renamePlaceholder: string
  renameAction: string
}

/** The delete confirmation and rename dialog every list of rows needs, with
 *  the item they are about. A handler that returns false keeps its dialog
 *  open, for a refusal the reader should see before trying again. */
export function useRowDialogs<T>({
  strings,
  nameOf,
  onDelete,
  onRename,
}: {
  strings: RowDialogStrings<T>
  nameOf: (item: T) => string
  onDelete: (item: T) => Promise<boolean | undefined> | boolean | undefined
  onRename: (item: T, name: string) => Promise<boolean | undefined> | boolean | undefined
}): {
  requestDelete: (item: T) => void
  requestRename: (item: T) => void
  dialogs: ReactNode
} {
  const [toDelete, setToDelete] = useState<T | null>(null)
  const [toRename, setToRename] = useState<T | null>(null)
  const [name, setName] = useState('')

  const closeRename = () => {
    setToRename(null)
    setName('')
  }

  const confirmDelete = async () => {
    if (toDelete === null) {
      return
    }
    if ((await onDelete(toDelete)) !== false) {
      setToDelete(null)
    }
  }

  const confirmRename = async () => {
    const trimmed = name.trim()
    if (toRename === null || !trimmed) {
      return
    }
    if ((await onRename(toRename, trimmed)) !== false) {
      closeRename()
    }
  }

  const dialogs = (
    <>
      <ConfirmModal
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        align="center"
        destructive
        closeOnConfirm={false}
        title={strings.deleteTitle}
        description={toDelete === null ? null : strings.deleteBody(toDelete)}
        confirmLabel={strings.deleteAction}
        onConfirm={confirmDelete}
      />
      <RenameDialog
        open={toRename !== null}
        onClose={closeRename}
        title={strings.renameTitle}
        label={strings.renameLabel}
        placeholder={strings.renamePlaceholder}
        confirmLabel={strings.renameAction}
        value={name}
        onChange={setName}
        onConfirm={confirmRename}
      />
    </>
  )

  return {
    requestDelete: setToDelete,
    requestRename: (item) => {
      setName(nameOf(item))
      setToRename(item)
    },
    dialogs,
  }
}

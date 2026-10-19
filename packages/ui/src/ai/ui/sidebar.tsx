import { type CSSProperties, type ReactNode, useState } from 'react'
import { AppLink, isPlainClick } from '../../components/AppLink'
import { ConfirmModal } from '../../components/ConfirmModal'
import type { OpenMenu } from '../../components/ContextMenu'
import { EmptyState } from '../../components/EmptyState'
import { fieldBox } from '../../components/fieldBox'
import { focusOnMount } from '../../components/focus'
import { IconButton } from '../../components/IconButton'
import { type MenuEntry, menuDivider } from '../../components/MenuEntries'
import { useStrings } from '../../components/Provider'
import { Tooltip } from '../../components/Tooltip'
import { cx } from '../../cx'
import { DownloadIcon, RenameIcon, ShareIcon, SidebarIcon, TrashIcon } from '../../icons'
import { MoreButton, rowContextMenuProps, useRowMenuActive } from '../../list/index'

const SIDEBAR_RAIL_WIDTH_PX = 48
export const SIDEBAR_DEFAULT_WIDTH_PX = 256

// Tints rather than the theme's hover, which is a shade off this surface and
// would not read as a highlight on it: the accent for the open row, so the
// conversation on screen is marked in the chat's own color, and the ink for
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
        tone === 'attention' ? 'text-(--theme-warning-text)' : 'theme-muted-text',
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

/** A row's content: an optional mark before it (a status dot, a shared
 *  icon), the title with its time, and an optional line under it for what the
 *  mark cannot say, such as the machine or a state that needs the reader. */
export function SidebarRowBody({
  leading,
  title,
  time,
  detail,
}: {
  leading?: ReactNode
  title: ReactNode
  time?: ReactNode
  detail?: ReactNode
}) {
  return (
    <span className="flex min-w-0 flex-1 items-start gap-2">
      {leading && <span className="mt-1 flex h-3 shrink-0 items-center">{leading}</span>}
      <span className="min-w-0 flex-1">
        <SidebarRowTitle time={time}>{title}</SidebarRowTitle>
        {detail && (
          <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px]">{detail}</span>
        )}
      </span>
    </span>
  )
}

/** An action a row's menu offers, and why it is unavailable when it is. */
export interface SessionMenuAction {
  onClick: () => void
  disabledReason?: string | undefined
}

/** A row's menu in one order wherever a list of conversations or sessions
 *  shows: rename, share, download, then delete apart. Each is left out unless given. */
export function useSessionMenu(): (actions: {
  rename?: SessionMenuAction | undefined
  share?: SessionMenuAction | undefined
  download?: SessionMenuAction | undefined
  remove?: SessionMenuAction | undefined
}) => MenuEntry[] {
  const { common } = useStrings()
  return ({ rename, share, download, remove }) => {
    const entry = (label: string, icon: ReactNode, action: SessionMenuAction) => ({
      label,
      icon,
      onClick: action.onClick,
      ...(action.disabledReason ? { disabled: true, disabledReason: action.disabledReason } : {}),
    })
    const items: MenuEntry[] = [
      ...(rename ? [entry(common.rename, <RenameIcon />, rename)] : []),
      ...(share ? [entry(common.share, <ShareIcon />, share)] : []),
      ...(download ? [entry(common.download, <DownloadIcon />, download)] : []),
    ]
    if (remove) {
      if (items.length > 0) {
        items.push(menuDivider)
      }
      items.push({ ...entry(common.delete, <TrashIcon />, remove), destructive: true })
    }
    return items
  }
}

/** In place of a list with nothing to show: none yet, nothing matching, or
 *  why it could not load. */
export function SidebarEmpty({ title, error }: { title: string; error?: string | undefined }) {
  return (
    <EmptyState
      variant="bare"
      title={error ?? title}
      {...(error ? { testId: 'sidebar-list-error' } : {})}
    />
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
 *  same highlight as a row, holding whatever stands in for the item. With
 *  `href` it is a link to the item, and `onSelect` runs only for a plain click. */
export function SidebarRailItem({
  selected,
  label,
  href,
  onSelect,
  testId,
  children,
}: {
  selected: boolean
  /** Names the icon-only button, and shows beside it on hover. */
  label: string
  href?: string | undefined
  onSelect?: (() => void) | undefined
  testId?: string
  children: ReactNode
}) {
  const props = {
    'data-testid': testId,
    'aria-label': label,
    'aria-current': selected ? ('page' as const) : undefined,
    className: cx(
      'flex h-7 w-7 items-center justify-center rounded-md transition-colors',
      HIGHLIGHT_HOVER,
      selected && HIGHLIGHT_SELECTED,
    ),
  }
  return (
    <li>
      <Tooltip content={label} side="right">
        {href ? (
          <AppLink
            href={href}
            onClick={(e) => {
              if (isPlainClick(e)) {
                onSelect?.()
              }
            }}
            {...props}
          >
            {children}
          </AppLink>
        ) : (
          <button type="button" onClick={onSelect} {...props}>
            {children}
          </button>
        )}
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

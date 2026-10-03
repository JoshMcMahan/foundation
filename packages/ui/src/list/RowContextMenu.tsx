import cx from 'classnames'
import type { ComponentType, MouseEvent as ReactMouseEvent, ReactNode } from 'react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { keyedByContent } from '../components/keys'
import { useLink, useNotify, useStrings } from '../components/Provider'
import { TOOLTIP_ID } from '../components/Tooltip'
import {
  CheckIcon,
  ChevronRightIcon,
  ClipboardIcon,
  CopyIcon,
  IdCardIcon,
  KeyIcon,
  LinkIcon,
  MailIcon,
  MoreIcon,
  UserIcon,
} from '../icons'
import { safeUrl } from '../safeUrl'

export type RowMenuItem =
  | {
      kind: 'link'
      label: string
      to: string
      icon?: ReactNode
      destructive?: boolean | undefined
      /** Load the page instead of routing, for paths this app doesn't serve. */
      reloadDocument?: boolean | undefined
    }
  | {
      kind: 'action'
      label: string
      onSelect?: (() => void) | undefined
      icon?: ReactNode
      destructive?: boolean | undefined
      disabled?: boolean | undefined
      /** Shown on hover when the item is disabled, explaining why. */
      tooltip?: string | undefined
      /** Trailing checkmark, e.g. the active option in a radio-style submenu. */
      selected?: boolean
      /** Declarative clipboard copy: the menu performs it and notifies, so
       * builders like useCopySubmenu need no toast or clipboard access. */
      copy?: { text: string; label: string }
    }
  | { kind: 'submenu'; label: string; icon?: ReactNode; items: RowMenuItem[] }
  | { kind: 'divider' }

type RowMenuEntry = Exclude<RowMenuItem, { kind: 'divider' }>

type MenuState = { x: number; y: number; items: RowMenuItem[] }
export type OpenMenu = (x: number, y: number, items: RowMenuItem[], onClose?: () => void) => void

/** The shared shape every entity action hook's per-row actions boil down to.
 * Each hook's bespoke `*RowAction` type is structurally assignable to this. */
export interface RowAction {
  key: string
  label: string
  icon: ReactNode
  onSelect?: (() => void) | undefined
  to?: string | undefined
  disabled?: boolean | undefined
  destructive?: boolean | undefined
  /** Shown on hover when the action is disabled, explaining why. */
  tooltip?: string | undefined
}

/** Converts a single row action to a menu item: a `to` makes it a link, otherwise an action. */
export function toRowMenuItem(action: RowAction): RowMenuItem {
  if (action.to) {
    return {
      kind: 'link',
      label: action.label,
      icon: action.icon,
      to: action.to,
      destructive: action.destructive,
    }
  }
  return {
    kind: 'action',
    label: action.label,
    icon: action.icon,
    onSelect: action.onSelect ?? (() => {}),
    disabled: action.disabled,
    destructive: action.destructive,
    tooltip: action.tooltip,
  }
}

/** Bridges a toolbar action (icon component, `onClick`/`href`) onto the shared
 * `RowAction` shape. Typed structurally so any toolbar action shape matching
 * these fields is assignable. */
export function toolbarActionToRowAction(action: {
  key: string
  label: string
  icon: ComponentType<{ className?: string }>
  onClick?: (() => void) | undefined
  href?: string | undefined
  disabled?: boolean | undefined
  disabledTooltip?: string | undefined
}): RowAction {
  const Icon = action.icon
  return {
    key: action.key,
    label: action.label,
    icon: <Icon />,
    onSelect: action.onClick,
    to: action.href,
    disabled: action.disabled,
    destructive: action.key === 'delete' || action.key === 'destroy',
    tooltip: action.disabledTooltip,
  }
}

/** Assembles a row's context menu in the shared order: leading link(s) → middle
 * actions → extra items → Copy submenu → trailing (destructive) actions last. */
export function assembleRowMenu({
  lead = [],
  actions,
  exclude,
  order,
  trailing = ['delete'],
  extra = [],
  copy,
}: {
  /** Pre-built leading link(s), e.g. "View details". */
  lead?: RowMenuItem[]
  /** The row's full action list. */
  actions: RowAction[]
  /** Keys already rendered in `lead`/`extra`; dropped from the middle. */
  exclude?: string[]
  /** Explicit middle order; keys absent from `actions` are skipped, keys absent from `order` are dropped. */
  order?: string[]
  /** Keys rendered last, in this order (default `['delete']`). */
  trailing?: string[]
  /** Items inserted after the middle actions and before Copy, e.g. a marketplace link. */
  extra?: RowMenuItem[]
  /** The Copy submenu from `useCopySubmenu()`. */
  copy?: RowMenuItem | undefined
}): RowMenuItem[] {
  const trailingSet = new Set(trailing)
  const excludeSet = new Set(exclude)
  let middle = actions.filter((a) => !trailingSet.has(a.key) && !excludeSet.has(a.key))
  if (order) {
    const byKey = new Map(middle.map((a) => [a.key, a]))
    middle = order.map((key) => byKey.get(key)).filter((a): a is RowAction => a !== undefined)
  }
  const trailingItems = trailing
    .map((key) => actions.find((a) => a.key === key))
    .filter((a): a is RowAction => a !== undefined)
  return [
    ...lead,
    ...middle.map(toRowMenuItem),
    ...extra,
    ...(copy ? [copy] : []),
    ...trailingItems.map(toRowMenuItem),
  ]
}

export function useRowMenu(zClassName = 'z-50') {
  const [menu, setMenu] = useState<MenuState | null>(null)
  const onCloseRef = useRef<(() => void) | undefined>(undefined)
  const openMenu = useCallback<OpenMenu>((x, y, items, onClose) => {
    if (items.length > 0) {
      // A new menu supersedes any open one — let the previous row drop its
      // active highlight before this one takes over.
      onCloseRef.current?.()
      onCloseRef.current = onClose
      setMenu({ x, y, items })
    }
  }, [])
  const close = useCallback(() => {
    onCloseRef.current?.()
    onCloseRef.current = undefined
    setMenu(null)
  }, [])
  const contextMenu = <RowContextMenu state={menu} onClose={close} zClassName={zClassName} />
  return { openMenu, contextMenu }
}

/** The full-screen menu overlay drops CSS :hover on the triggering row; wrap openMenu here to substitute a JS-driven `active` highlight. */
export function useRowMenuActive(openMenu: OpenMenu): {
  active: boolean
  openMenu: OpenMenu
} {
  const [active, setActive] = useState(false)
  const wrapped = useCallback<OpenMenu>(
    (x, y, items) => {
      setActive(true)
      openMenu(x, y, items, () => setActive(false))
    },
    [openMenu],
  )
  return { active, openMenu: wrapped }
}

export function rowContextMenuProps(openMenu: OpenMenu, items: RowMenuItem[]) {
  return {
    onContextMenu: (e: ReactMouseEvent) => {
      e.preventDefault()
      // A row with its own menu claims the right-click so the event doesn't
      // also bubble to an ancestor's context menu (e.g. a dashboard module).
      if (items.length > 0) {
        e.stopPropagation()
      }
      openMenu(e.clientX, e.clientY, items)
    },
  }
}

function RowContextMenu({
  state,
  onClose,
  zClassName,
}: {
  state: MenuState | null
  onClose: () => void
  zClassName: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    if (!state || !ref.current) {
      setPos(null)
      return
    }
    const { width, height } = ref.current.getBoundingClientRect()
    const pad = 8
    // Open upward when the menu won't fit below the anchor but fits above, so a
    // row near the viewport bottom doesn't push the menu off-screen or onto it.
    const spaceBelow = window.innerHeight - pad - state.y
    const openUp = height > spaceBelow && state.y - height - pad >= 0
    const top = openUp ? state.y - height : Math.min(state.y, window.innerHeight - height - pad)
    setPos({
      left: Math.max(pad, Math.min(state.x, window.innerWidth - width - pad)),
      top: Math.max(pad, top),
    })
  }, [state])

  useEffect(() => {
    if (!state) {
      return
    }
    const close = () => onClose()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [state, onClose])

  if (!state) {
    return null
  }

  // Open submenus toward the screen interior so they don't run off the edge.
  const anchorX = pos?.left ?? state.x
  const side = anchorX > window.innerWidth * 0.6 ? 'left' : 'right'

  return createPortal(
    <div
      role="none"
      className={cx('fixed inset-0', zClassName)}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose()
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        // Right-clicking inside the menu just dismisses it.
        if (ref.current?.contains(e.target as Node)) {
          onClose()
          return
        }
        // Hand the right-click to the row under the cursor — no dismiss-then-click round trip.
        const { clientX, clientY } = e
        const overlay = e.currentTarget
        overlay.style.pointerEvents = 'none'
        const under = document.elementFromPoint(clientX, clientY)
        overlay.style.pointerEvents = ''
        onClose()
        under?.dispatchEvent(
          new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            clientX,
            clientY,
          }),
        )
      }}
    >
      <div
        ref={ref}
        role="menu"
        className="absolute min-w-44 rounded-lg border border-(--theme-border) bg-(--theme-panel-bg) py-1 shadow-lg backdrop-blur-xl"
        style={{
          left: pos?.left ?? state.x,
          top: pos?.top ?? state.y,
          visibility: pos ? 'visible' : 'hidden',
        }}
      >
        <MenuItemList items={state.items} onClose={onClose} side={side} />
      </div>
    </div>,
    // The --theme-* tokens live on the document root, so the body-level portal
    // resolves them everywhere.
    document.body,
  )
}

const MENU_ITEM_CLASSES =
  'flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] hover:bg-(--theme-muted-panel-bg) transition-colors cursor-pointer [&>svg]:h-4 [&>svg]:w-4 [&>svg]:shrink-0'

function MenuItemList({
  items,
  onClose,
  side,
}: {
  items: RowMenuItem[]
  onClose: () => void
  side: 'left' | 'right'
}) {
  return keyedByContent(items, (it) => (it.kind === 'divider' ? 'divider' : it.label)).map(
    ({ key, item }) =>
      item.kind === 'divider' ? (
        <div key={key} aria-hidden="true" className="my-1 h-px bg-(--theme-border)" />
      ) : (
        <MenuRow key={key} item={item} onClose={onClose} side={side} />
      ),
  )
}

function MenuRow({
  item,
  onClose,
  side,
}: {
  item: RowMenuEntry
  onClose: () => void
  side: 'left' | 'right'
}) {
  const Link = useLink()
  const notify = useNotify()
  const { list: t } = useStrings()
  const [openSub, setOpenSub] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  if (item.kind === 'submenu') {
    const open = () => {
      clearTimeout(closeTimer.current)
      setOpenSub(true)
    }
    // Delay close so crossing into the (flush) submenu doesn't dismiss it.
    const close = () => {
      closeTimer.current = setTimeout(() => setOpenSub(false), 160)
    }
    return (
      <div
        className="relative"
        role="none"
        onMouseEnter={open}
        onMouseLeave={close}
        onFocus={open}
        onBlur={close}
      >
        <button
          type="button"
          aria-expanded={openSub}
          aria-haspopup="menu"
          onClick={open}
          className={cx(MENU_ITEM_CLASSES, 'justify-between text-(--theme-app)')}
        >
          <span className="flex items-center gap-2.5">
            {item.icon}
            {item.label}
          </span>
          <ChevronRightIcon className="h-3 w-3 shrink-0 opacity-60" />
        </button>
        {openSub && (
          <div
            className={cx(
              'absolute -top-1 z-10 min-w-44 rounded-lg border border-(--theme-border) bg-(--theme-panel-bg) py-1 shadow-lg',
              side === 'left' ? 'right-full' : 'left-full',
            )}
          >
            <MenuItemList items={item.items} onClose={onClose} side={side} />
          </div>
        )}
      </div>
    )
  }

  if (item.kind === 'link') {
    const className = cx(
      MENU_ITEM_CLASSES,
      item.destructive ? 'text-red-500' : 'text-(--theme-app)',
    )
    if (item.reloadDocument) {
      return (
        <a href={safeUrl(item.to)} onClick={onClose} className={className}>
          {item.icon}
          {item.label}
        </a>
      )
    }
    return (
      <Link to={item.to} onClick={onClose} className={className}>
        {item.icon}
        {item.label}
      </Link>
    )
  }

  // A natively disabled button swallows hover events, so a disabled item with
  // a tooltip stays enabled and inert instead.
  return (
    <button
      type="button"
      disabled={item.disabled && !item.tooltip}
      aria-disabled={item.disabled}
      {...(item.disabled && item.tooltip
        ? {
            'data-tooltip-id': TOOLTIP_ID,
            'data-tooltip-content': item.tooltip,
          }
        : {})}
      onClick={() => {
        if (item.disabled) {
          return
        }
        if (item.copy) {
          const { text, label } = item.copy
          navigator.clipboard?.writeText(text).then(
            () => notify.success(t.copied(label)),
            () => notify.error(t.couldntCopy(label)),
          )
        }
        item.onSelect?.()
        onClose()
      }}
      className={cx(
        MENU_ITEM_CLASSES,
        item.destructive ? 'text-red-500' : 'text-(--theme-app)',
        item.disabled && 'opacity-40 cursor-not-allowed hover:bg-transparent',
      )}
    >
      {item.icon}
      {item.label}
      {item.selected && <CheckIcon className="ml-auto opacity-80" />}
    </button>
  )
}

export interface CopyFields {
  name?: string | null | undefined
  /** Overrides the "name" label (raw, pre-translated) for entities whose primary field isn't a name, e.g. "domain". */
  nameLabel?: string
  email?: string | null | undefined
  username?: string | null | undefined
  uid?: string | number | null | undefined
  id?: string | null | undefined
  url?: string | null | undefined
  extra?: { label: string; value?: string | null | undefined; icon?: ReactNode }[] | undefined
}

export type CopySubmenu = (fields: CopyFields) => RowMenuItem

/** Returns a builder for the Copy submenu, labeled from the provider's strings. */
export function useCopySubmenu(): CopySubmenu {
  const { list: t } = useStrings()
  return useCallback<CopySubmenu>(
    ({ name, nameLabel, email, username, uid, id, url, extra }) => {
      const fields: {
        label: string
        value?: string | null | undefined
        icon: ReactNode
      }[] = [
        { label: nameLabel ?? t.labelName, value: name, icon: <CopyIcon /> },
        { label: t.labelEmail, value: email, icon: <MailIcon /> },
        { label: t.labelUsername, value: username, icon: <UserIcon /> },
        {
          label: t.labelUid,
          value: uid === null || uid === undefined ? null : String(uid),
          icon: <KeyIcon />,
        },
        { label: t.labelId, value: id, icon: <IdCardIcon /> },
        { label: t.labelUrl, value: url, icon: <LinkIcon /> },
        ...(extra ?? []).map((e) => ({
          label: e.label,
          value: e.value,
          icon: e.icon ?? <CopyIcon />,
        })),
      ]
      const items: RowMenuItem[] = fields
        .filter((f) => f.value)
        .map((f) => ({
          kind: 'action',
          label: t.copy(f.label),
          icon: f.icon,
          copy: { text: f.value as string, label: f.label },
        }))
      return {
        kind: 'submenu',
        label: t.copyMenu,
        icon: <ClipboardIcon />,
        items,
      }
    },
    [t],
  )
}

/** Stays visible while active (menu open) so it doesn't vanish behind the overlay. */
export function MoreButton({
  onOpen,
  active,
  className,
}: {
  onOpen: (x: number, y: number) => void
  active?: boolean
  className?: string | undefined
}) {
  const { list: t } = useStrings()
  return (
    <button
      type="button"
      aria-label={t.moreActions}
      onClick={(e) => {
        e.stopPropagation()
        const r = e.currentTarget.getBoundingClientRect()
        onOpen(r.right, r.bottom)
      }}
      className={cx(
        'rounded p-1 cursor-pointer text-(--theme-muted-text-color) transition-colors hover:bg-(--theme-muted-panel-bg) hover:text-(--theme-app) focus-visible:opacity-100',
        active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
        className,
      )}
    >
      <MoreIcon className="h-4 w-4" />
    </button>
  )
}

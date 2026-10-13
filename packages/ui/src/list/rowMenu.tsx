import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react'
import { useCallback, useState } from 'react'
import type { OpenMenu } from '../components/ContextMenu'
import { IconButton } from '../components/IconButton'
import type { MenuAction, MenuEntry, MenuSubmenu } from '../components/MenuEntries'
import { useStrings } from '../components/Provider'
import { cx } from '../cx'
import {
  ClipboardIcon,
  CopyIcon,
  IdCardIcon,
  KeyIcon,
  LinkIcon,
  MailIcon,
  MoreIcon,
  UserIcon,
} from '../icons'

/** An action on a row, which its menu lists and its pinned buttons show, named by `key`. */
export interface RowAction extends MenuAction {
  key: string
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
  lead?: MenuEntry[]
  /** The row's full action list. */
  actions: RowAction[]
  /** Keys already rendered in `lead`/`extra`; dropped from the middle. */
  exclude?: string[]
  /** Explicit middle order; keys absent from `actions` are skipped, keys absent from `order` are dropped. */
  order?: string[]
  /** Keys rendered last, in this order (default `['delete']`). */
  trailing?: string[]
  /** Items inserted after the middle actions and before Copy, e.g. a marketplace link. */
  extra?: MenuEntry[]
  /** The Copy submenu from `useCopySubmenu()`. */
  copy?: MenuSubmenu | undefined
}): MenuEntry[] {
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
  return [...lead, ...middle, ...extra, ...(copy ? [copy] : []), ...trailingItems]
}

/** The pointer leaves a row for its menu, dropping CSS :hover; wrap openMenu here
 *  for an `active` flag that keeps the row lit while its menu is open. */
export function useRowMenuActive(openMenu: OpenMenu): {
  active: boolean
  openMenu: OpenMenu
} {
  const [active, setActive] = useState(false)
  const wrapped = useCallback<OpenMenu>(
    (at, items, options) => {
      setActive(true)
      openMenu(at, items, {
        ...options,
        onClose: () => {
          setActive(false)
          options?.onClose?.()
        },
      })
    },
    [openMenu],
  )
  return { active, openMenu: wrapped }
}

/** Opens the row's menu on a right-click. Pass a function to build a large
 *  list's menus only when one opens, not on every render. */
export function rowContextMenuProps(
  openMenu: OpenMenu,
  entries: MenuEntry[] | (() => MenuEntry[]),
) {
  return {
    onContextMenu: (e: ReactMouseEvent) => {
      const items = typeof entries === 'function' ? entries() : entries
      e.preventDefault()
      // A row with its own menu claims the right-click so the event doesn't
      // also bubble to an ancestor's context menu (e.g. a dashboard module).
      if (items.length > 0) {
        e.stopPropagation()
      }
      openMenu(e, items)
    },
  }
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

export type CopySubmenu = (fields: CopyFields) => MenuSubmenu

/** Returns a builder for the Copy submenu, labeled from the provider's strings. */
export function useCopySubmenu(): CopySubmenu {
  const { common, list: t } = useStrings()
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
      return {
        label: common.copy,
        icon: <ClipboardIcon />,
        items: fields.flatMap(({ label, value, icon }): MenuAction[] =>
          value ? [{ label: common.copyThing(label), icon, copy: { text: value, label } }] : [],
        ),
      }
    },
    [t, common],
  )
}

/** Opens a row's menu under itself. Shows on the row's hover or focus, and
 *  stays while its menu is `open`, though the pointer has left the row. A touch
 *  screen has no hover, so there it always shows: the row's menu is otherwise
 *  out of reach. */
export function MoreButton({
  onOpen,
  open = false,
  visible = open,
  label,
  className,
}: {
  onOpen: (button: HTMLElement) => void
  open?: boolean
  /** Shows at rest too. */
  visible?: boolean
  /** Names the row the menu acts on, as "More actions for Core", for a list
   *  of rows that would otherwise each read "More actions". */
  label?: string | undefined
  className?: string | undefined
}) {
  const { list: t } = useStrings()
  return (
    <IconButton
      label={label ?? t.moreActions}
      icon={<MoreIcon />}
      aria-haspopup="menu"
      aria-expanded={open}
      data-popup-open={open || undefined}
      onClick={(e) => {
        e.stopPropagation()
        onOpen(e.currentTarget)
      }}
      className={cx(
        'focus-visible:opacity-100',
        visible ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100',
        className,
      )}
    />
  )
}

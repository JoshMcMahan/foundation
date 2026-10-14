import { Menu } from '@base-ui/react/menu'
import { type ReactNode, useCallback, useState } from 'react'
import { cx } from '../cx'
import { safeUrl } from '../safeUrl'
import { EmptyState } from './EmptyState'
import { keyedByContent } from './keys'
import {
  MenuCheckboxItem,
  MenuItem,
  MenuLinkItem,
  MenuPopup,
  MenuSeparator,
  MenuSubmenuTrigger,
} from './Menu'
import { useLink } from './Provider'
import { useQueryMatch } from './search'
import { Tooltip } from './Tooltip'
import { useCopy } from './useCopy'

interface MenuActionBase {
  label: string
  icon?: ReactNode
  disabled?: boolean | undefined
  /** Why the action is disabled, shown on hover and read with its name. */
  disabledReason?: string | undefined
  destructive?: boolean | undefined
  /** More text a menu's search matches, beside the label. */
  keywords?: string | undefined
}

/** Runs `onClick`. */
interface MenuClickAction extends MenuActionBase {
  onClick: () => void
  /** Makes the row an on/off choice, checked while true. */
  checked?: boolean | undefined
  href?: never
  reloadDocument?: never
  copy?: never
}

/** Navigates to `href`. */
interface MenuLinkAction extends MenuActionBase {
  href: string
  /** Loads the page instead of routing, for paths the host's router doesn't serve. */
  reloadDocument?: boolean | undefined
  onClick?: never
  checked?: never
  copy?: never
}

/** Copies `copy.text` to the clipboard, confirmed with a toast naming `copy.label`. */
interface MenuCopyAction extends MenuActionBase {
  copy: { text: string; label: string }
  onClick?: never
  checked?: never
  href?: never
  reloadDocument?: never
}

/** Something a menu row does: runs `onClick`, navigates to `href`, or copies
 *  `copy`. Exactly one, so a row that does nothing when chosen doesn't compile.
 *  A disabled action keeps its behavior; one that has none belongs out of the menu. */
export type MenuAction = MenuClickAction | MenuLinkAction | MenuCopyAction

/** A row that opens a menu of its own. */
export interface MenuSubmenu {
  label: string
  icon?: ReactNode
  items: MenuEntry[]
  search?: MenuSearch | undefined
}

export interface MenuDivider {
  divider: true
}

export type MenuEntry = MenuAction | MenuSubmenu | MenuDivider

export const menuDivider: MenuDivider = { divider: true }

/** A field atop a menu that narrows it, submenus included, to the actions it matches. */
export interface MenuSearch {
  placeholder: string
  /** Shown when nothing matches. */
  empty: string
}

export const isMenuDivider = (entry: MenuEntry): entry is MenuDivider => 'divider' in entry
export const isMenuSubmenu = (entry: MenuEntry): entry is MenuSubmenu => 'items' in entry

/** Gives a menu root its search's filter; `children` renders the root with the query. */
export function MenuFilter({
  search,
  children,
}: {
  search: MenuSearch | undefined
  children: (query: string) => ReactNode
}) {
  const [query, setQuery] = useState('')
  if (!search) {
    return children('')
  }
  // The menu renders the matches itself, since a search reaches into its submenus.
  return (
    <Menu.FilterProvider filter={null} value={query} onValueChange={setQuery} autoHighlight>
      {children(query)}
    </Menu.FilterProvider>
  )
}

/** A menu's rows, with its search field when it has one. */
export function MenuEntries({
  entries,
  search,
  query = '',
}: {
  entries: MenuEntry[]
  search?: MenuSearch | undefined
  /** The search's text, from the MenuFilter around the menu's root. */
  query?: string
}) {
  const matches = useQueryMatch()
  if (!search) {
    return <EntryRows entries={entries} />
  }
  const needle = query.trim()
  const shown = needle
    ? searchMatches(entries, (a) => matches(needle, a.label, a.keywords))
    : entries
  return (
    <>
      <div className="sticky top-0 z-[1] bg-(--theme-app-bg) px-2 pt-0.5 pb-1">
        <Menu.Input
          aria-label={search.placeholder}
          placeholder={search.placeholder}
          className="w-full rounded-md border border-(--theme-border) bg-(--theme-muted-panel-bg) px-2 py-1 text-[13px] text-(--theme-app) outline-none placeholder:text-(--theme-placeholder) focus:border-(--theme-accent)"
        />
      </div>
      <Menu.List>
        <EntryRows entries={shown} />
      </Menu.List>
      {needle && shown.length === 0 && <EmptyState variant="bare" title={search.empty} />}
    </>
  )
}

// Every action a search can reach, once each, with submenus opened out.
function searchMatches(entries: MenuEntry[], match: (action: MenuAction) => boolean): MenuAction[] {
  const found = new Map<string, MenuAction>()
  const walk = (list: MenuEntry[]) => {
    for (const entry of list) {
      if (isMenuSubmenu(entry)) {
        walk(entry.items)
      } else if (!isMenuDivider(entry) && !found.has(entry.label) && match(entry)) {
        found.set(entry.label, entry)
      }
    }
  }
  walk(entries)
  return [...found.values()]
}

function EntryRows({ entries }: { entries: MenuEntry[] }) {
  return keyedByContent(entries, (entry) => (isMenuDivider(entry) ? 'divider' : entry.label)).map(
    ({ key, item }) =>
      isMenuDivider(item) ? (
        <MenuSeparator key={key} />
      ) : isMenuSubmenu(item) ? (
        <SubmenuRow key={key} submenu={item} />
      ) : (
        <ActionRow key={key} action={item} />
      ),
  )
}

function SubmenuRow({ submenu }: { submenu: MenuSubmenu }) {
  return (
    <MenuFilter search={submenu.search}>
      {(query) => (
        <Menu.SubmenuRoot>
          <MenuSubmenuTrigger>
            {submenu.icon}
            {submenu.label}
          </MenuSubmenuTrigger>
          <MenuPopup side="inline-end">
            <MenuEntries entries={submenu.items} search={submenu.search} query={query} />
          </MenuPopup>
        </Menu.SubmenuRoot>
      )}
    </MenuFilter>
  )
}

const destructiveClassName = 'text-(--theme-error-text) data-highlighted:text-(--theme-error-text)'

const warnedInert = new Set<string>()

/** Warns in development when an action has no behavior. The types rule that
 *  out, but a JavaScript caller or a cast still can, and its row renders fine
 *  and silently does nothing. */
export function warnIfInert(action: MenuAction, where: string) {
  // Checked first and on its own, so a production build drops the rest.
  if (process.env.NODE_ENV === 'production') {
    return
  }
  if (action.onClick || action.href || action.copy || warnedInert.has(action.label)) {
    return
  }
  warnedInert.add(action.label)
  console.warn(
    `${where}: the action "${action.label}" has no onClick, href or copy, so choosing it does nothing.`,
  )
}

/** Runs an action that isn't a link: copies its text or calls its onClick. */
export function useRunAction(): (action: MenuAction) => void {
  const { copy } = useCopy()
  return useCallback(
    (action: MenuAction) => {
      if (action.copy) {
        void copy(action.copy.text, { label: action.copy.label })
      } else {
        action.onClick?.()
      }
    },
    [copy],
  )
}

function ActionRow({ action }: { action: MenuAction }) {
  warnIfInert(action, 'MenuEntries')
  const Link = useLink()
  const runAction = useRunAction()
  const className = cx(action.destructive && destructiveClassName)
  const content = (
    <>
      {action.icon}
      {action.label}
    </>
  )
  if (action.href && !action.disabled) {
    return action.reloadDocument ? (
      <MenuLinkItem href={safeUrl(action.href)} className={className}>
        {content}
      </MenuLinkItem>
    ) : (
      <MenuLinkItem render={<Link href={action.href} />} className={className}>
        {content}
      </MenuLinkItem>
    )
  }
  const run = () => runAction(action)
  const reason = action.disabled ? action.disabledReason : undefined
  const label = (
    <>
      {content}
      {reason && <span className="sr-only">. {reason}</span>}
    </>
  )
  return (
    <Tooltip content={reason} side="right">
      {action.checked === undefined ? (
        <MenuItem disabled={action.disabled} onClick={run} className={className}>
          {label}
        </MenuItem>
      ) : (
        <MenuCheckboxItem
          checked={action.checked}
          onCheckedChange={run}
          disabled={action.disabled}
          className={className}
        >
          {label}
        </MenuCheckboxItem>
      )}
    </Tooltip>
  )
}

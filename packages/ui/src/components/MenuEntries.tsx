import { Menu } from '@base-ui/react/menu'
import { clsx as cx } from 'clsx'
import { type ReactNode, useState } from 'react'
import { safeUrl } from '../safeUrl'
import { keyedByContent } from './keys'
import {
  MenuCheckboxItem,
  MenuItem,
  MenuLinkItem,
  MenuPopup,
  MenuSeparator,
  MenuSubmenuTrigger,
} from './Menu'
import { useLink, useNotify, useStrings } from './Provider'
import { useQueryMatch } from './search'
import { Tooltip } from './Tooltip'

/** Something a menu row does: navigates with `href`, or runs `onClick`. */
export interface MenuAction {
  label: string
  icon?: ReactNode
  /** Navigates instead of calling onClick. */
  href?: string | undefined
  /** Loads the page instead of routing, for paths the host's router doesn't serve. */
  reloadDocument?: boolean | undefined
  onClick?: (() => void) | undefined
  disabled?: boolean | undefined
  /** Why the action is disabled, shown on hover and read with its name. */
  disabledReason?: string | undefined
  destructive?: boolean | undefined
  /** Makes the row an on/off choice, checked while true. */
  checked?: boolean | undefined
  /** Text the row copies to the clipboard, confirmed with a toast naming `label`. */
  copy?: { text: string; label: string } | undefined
  /** More text a menu's search matches, beside the label. */
  keywords?: string | undefined
}

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
          className="w-full rounded-md border border-(--theme-border) bg-(--theme-muted-panel-bg) px-2 py-1 text-[13px] text-(--theme-app) outline-none placeholder:text-(--theme-muted-text-color) focus:border-(--theme-element)"
        />
      </div>
      <Menu.List>
        <EntryRows entries={shown} />
      </Menu.List>
      {needle && shown.length === 0 && (
        <div className="px-3 py-1.5 text-[13px] text-(--theme-muted-text-color)">
          {search.empty}
        </div>
      )}
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

const destructiveClassName = 'text-(--theme-error) data-highlighted:text-(--theme-error)'

function ActionRow({ action }: { action: MenuAction }) {
  const Link = useLink()
  const copy = useCopy()
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
  const run = () => {
    if (action.copy) {
      copy(action.copy)
    }
    action.onClick?.()
  }
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

function useCopy() {
  const notify = useNotify()
  const { list: t } = useStrings()
  return ({ text, label }: { text: string; label: string }) => {
    navigator.clipboard?.writeText(text).then(
      () => notify.success(t.copied(label)),
      () => notify.error(t.couldntCopy(label)),
    )
  }
}

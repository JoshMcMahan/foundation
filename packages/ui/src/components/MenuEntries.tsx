import { Menu } from '@base-ui/react/menu'
import {
  createContext,
  type KeyboardEvent,
  type ReactNode,
  use,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { cx } from '../cx'
import { isDev } from '../dev'
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, ExternalLinkIcon } from '../icons'
import { AppLink } from './AppLink'
import { EmptyState } from './EmptyState'
import { keyedByContent } from './keys'
import {
  MenuCheckboxItem,
  MenuGroupLabel,
  MenuItem,
  MenuLinkItem,
  MenuPopup,
  MenuSeparator,
  MenuSubmenuTrigger,
} from './Menu'
import { useStrings } from './Provider'
import { useQueryMatch } from './search'
import { Tooltip } from './Tooltip'
import { useCopy } from './useCopy'
import { useNarrow } from './useNarrow'

interface MenuActionBase {
  label: string
  /** Before the label: an icon, or a mark such as a label's color dot. It stays when the
   *  row is checked, since the check sits at the row's end. */
  icon?: ReactNode
  /** A second, muted line under the label, such as what a product holds. A search matches it. */
  description?: string | undefined
  /** The key that does the same from the page, such as `S` or `⌘K`, in plain text at the
   *  row's end. The menu doesn't bind it; the host does. */
  shortcut?: string | undefined
  /** A small mark at the row's end, such as a dot for something unseen. It is hidden from
   *  screen readers, so say what it means in `label`. */
  badge?: ReactNode
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
  target?: never
  current?: never
  copy?: never
}

/** Navigates to `href`. */
interface MenuLinkAction extends MenuActionBase {
  href: string
  /** Loads the page instead of routing, for paths the host's router doesn't serve. */
  reloadDocument?: boolean | undefined
  /** `_blank` opens it in a new tab, such as a page outside the app: a small arrow at the
   *  row's end shows it, and screen readers hear it. */
  target?: '_blank' | undefined
  /** The page the reader is on, such as the current organization in a switcher: checked at
   *  the row's end and announced as the current page. */
  current?: boolean | undefined
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
  target?: never
  current?: never
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
  /** The key that opens it from the page, in plain text by the chevron. */
  shortcut?: string | undefined
  /** Can't be opened, such as Labels where there are none. */
  disabled?: boolean | undefined
  /** Why it can't be opened, shown on hover and read with its name. */
  disabledReason?: string | undefined
  /** More text a menu's search matches, beside the label; a match shows all its rows. */
  keywords?: string | undefined
}

/** Rows under a heading, which names them for screen readers too. */
export interface MenuGroup {
  group: string
  items: MenuEntry[]
}

export interface MenuDivider {
  divider: true
}

export type MenuEntry = MenuAction | MenuSubmenu | MenuGroup | MenuDivider

export const menuDivider: MenuDivider = { divider: true }

/** A field atop a menu that narrows it, submenus included, to the actions it matches. */
export interface MenuSearch {
  placeholder: string
  /** Shown when nothing matches. */
  empty: string
}

export const isMenuDivider = (entry: MenuEntry): entry is MenuDivider => 'divider' in entry
export const isMenuGroup = (entry: MenuEntry): entry is MenuGroup => 'group' in entry
export const isMenuSubmenu = (entry: MenuEntry): entry is MenuSubmenu =>
  'items' in entry && !('group' in entry)

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

// At phone width a submenu opens in its parent's place, since there's no room beside it.
const DrillContext = createContext<((submenu: MenuSubmenu, row: HTMLElement) => void) | null>(null)

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
  const narrow = useNarrow()
  const [drilled, setDrilled] = useState<{ submenu: MenuSubmenu; popup: HTMLElement | null }>()
  const [returnTo, setReturnTo] = useState<{ label: string; popup: HTMLElement | null }>()
  // Back on the row the submenu opened from, once it's rendered again.
  useLayoutEffect(() => {
    if (!returnTo) {
      return
    }
    const { label, popup } = returnTo
    const frame = requestAnimationFrame(() => {
      for (const row of popup?.querySelectorAll<HTMLElement>('[data-drill]') ?? []) {
        if (row.getAttribute('data-drill') === label) {
          row.focus()
        }
      }
      setReturnTo(undefined)
    })
    return () => cancelAnimationFrame(frame)
  }, [returnTo])
  if (narrow && drilled) {
    const back = () => {
      setReturnTo({ label: drilled.submenu.label, popup: drilled.popup })
      setDrilled(undefined)
    }
    return <DrilledSubmenu submenu={drilled.submenu} onBack={back} />
  }
  const drill = narrow
    ? (submenu: MenuSubmenu, row: HTMLElement) =>
        setDrilled({ submenu, popup: row.closest<HTMLElement>('[role="menu"]') })
    : null
  return (
    <DrillContext value={drill}>
      <SearchedEntries entries={entries} search={search} query={query} />
    </DrillContext>
  )
}

/** A submenu opened in its parent's place: a row back to the parent, then its rows. */
function DrilledSubmenu({ submenu, onBack }: { submenu: MenuSubmenu; onBack: () => void }) {
  const t = useStrings().common
  const backRef = useRef<HTMLDivElement>(null)
  // A frame on, once the menu has counted the new rows, so the arrow keys move on from it.
  useLayoutEffect(() => {
    const frame = requestAnimationFrame(() => backRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [])
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft' && !(e.target instanceof HTMLInputElement)) {
      e.preventDefault()
      onBack()
    }
  }
  return (
    <div role="none" className="contents" onKeyDown={onKeyDown}>
      <MenuItem ref={backRef} closeOnClick={false} onClick={onBack} className="font-medium">
        <RowContent
          icon={<ChevronLeftIcon aria-hidden="true" className="size-3 opacity-60" />}
          label={
            <>
              <span className="sr-only">{t.back}: </span>
              {submenu.label}
            </>
          }
        />
      </MenuItem>
      <MenuSeparator />
      <MenuFilter search={submenu.search}>
        {(query) => <MenuEntries entries={submenu.items} search={submenu.search} query={query} />}
      </MenuFilter>
    </div>
  )
}

function SearchedEntries({
  entries,
  search,
  query,
}: {
  entries: MenuEntry[]
  search: MenuSearch | undefined
  query: string
}) {
  const matches = useQueryMatch()
  if (!search) {
    return <EntryRows entries={entries} />
  }
  const needle = query.trim()
  const shown = needle
    ? searchMatches(
        entries,
        (a) => matches(needle, a.label, a.description, a.keywords),
        (submenu) => matches(needle, submenu.label, submenu.keywords),
      )
    : entries
  return (
    <>
      <div className="sticky top-0 z-[1] bg-(--theme-app-bg) px-1 pt-0.5 pb-1">
        <Menu.Input
          aria-label={search.placeholder}
          placeholder={search.placeholder}
          className="w-full rounded-md border border-(--theme-border) bg-(--theme-muted-panel-bg) px-2 py-1 text-[13px] text-(--theme-app) outline-none placeholder:text-(--theme-placeholder) focus:border-(--theme-focus)"
        />
      </div>
      <Menu.List>
        <EntryRows entries={shown} />
      </Menu.List>
      {needle && shown.length === 0 && <EmptyState variant="bare" title={search.empty} />}
    </>
  )
}

// Every action a search can reach, once each, with submenus and groups opened out. A submenu
// the query names shows every action in it; a disabled one shows none, as it can't be opened.
function searchMatches(
  entries: MenuEntry[],
  match: (action: MenuAction) => boolean,
  matchSubmenu: (submenu: MenuSubmenu) => boolean,
): MenuAction[] {
  const found = new Map<string, MenuAction>()
  const walk = (list: MenuEntry[], all: boolean) => {
    for (const entry of list) {
      if (isMenuDivider(entry)) {
        continue
      }
      if (isMenuGroup(entry)) {
        walk(entry.items, all)
      } else if (isMenuSubmenu(entry)) {
        if (!entry.disabled) {
          walk(entry.items, all || matchSubmenu(entry))
        }
      } else if (!found.has(entry.label) && (all || match(entry))) {
        found.set(entry.label, entry)
      }
    }
  }
  walk(entries, false)
  return [...found.values()]
}

const entryKey = (entry: MenuEntry) =>
  isMenuDivider(entry) ? 'divider' : isMenuGroup(entry) ? `group:${entry.group}` : entry.label

function EntryRows({ entries }: { entries: MenuEntry[] }) {
  return keyedByContent(entries, entryKey).map(({ key, item }) =>
    isMenuDivider(item) ? (
      <MenuSeparator key={key} />
    ) : isMenuGroup(item) ? (
      <Menu.Group key={key}>
        <MenuGroupLabel>{item.group}</MenuGroupLabel>
        <EntryRows entries={item.items} />
      </Menu.Group>
    ) : isMenuSubmenu(item) ? (
      <SubmenuRow key={key} submenu={item} />
    ) : (
      <ActionRow key={key} action={item} />
    ),
  )
}

/** A key as `aria-keyshortcuts` spells it: `⌘K` reads Meta+K, `⇧P` Shift+P. */
export function ariaKeyShortcut(shortcut: string | undefined): string | undefined {
  if (!shortcut) {
    return undefined
  }
  const names: Record<string, string> = {
    '⌘': 'Meta',
    '⌃': 'Control',
    '⌥': 'Alt',
    '⇧': 'Shift',
  }
  const parts: string[] = []
  let rest = shortcut.replace(/\s+/g, '')
  while (rest.length > 1 && names[rest[0] ?? '']) {
    parts.push(names[rest[0] ?? ''] ?? '')
    rest = rest.slice(1)
  }
  for (const part of rest.split('+').filter(Boolean)) {
    parts.push(part.length === 1 ? part.toUpperCase() : part)
  }
  return parts.join('+')
}

/** A detail at the row's end, held to the first line's height so it sits beside the label
 *  even when a description adds a second. */
function RowEnd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cx('flex h-5 shrink-0 items-center in-data-[size=sm]:h-4', className)}
    >
      {children}
    </span>
  )
}

const shortcutClassName =
  'ps-3 text-xs text-(--theme-muted-text-color) tabular-nums in-data-[size=sm]:text-[11px]'

/** A row's icon, label, second line and end details, laid out alike in every kind of row. */
function RowContent({
  icon,
  label,
  description,
  end,
}: {
  icon?: ReactNode
  label: ReactNode
  description?: string | undefined
  end?: ReactNode
}) {
  return (
    <>
      {icon !== undefined && icon !== null && (
        // On the first line's height, so it stays beside the label above a description.
        <span className="flex h-5 shrink-0 items-center in-data-[size=sm]:h-4">{icon}</span>
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="wrap-break-word">{label}</span>
        {description && (
          <span className="text-xs text-(--theme-muted-text-color) in-data-[size=sm]:text-[11px]">
            {description}
          </span>
        )}
      </span>
      {end}
    </>
  )
}

function SubmenuRow({ submenu }: { submenu: MenuSubmenu }) {
  const reason = submenu.disabled ? submenu.disabledReason : undefined
  const drill = use(DrillContext)
  if (drill) {
    return (
      <MenuItem
        closeOnClick={false}
        disabled={submenu.disabled}
        data-drill={submenu.label}
        aria-haspopup="menu"
        aria-keyshortcuts={ariaKeyShortcut(submenu.shortcut)}
        onClick={(e) => drill(submenu, e.currentTarget)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') {
            e.preventDefault()
            drill(submenu, e.currentTarget)
          }
        }}
      >
        <RowContent
          icon={submenu.icon}
          label={
            <>
              {submenu.label}
              {reason && <span className="sr-only">. {reason}</span>}
            </>
          }
          end={
            <>
              {submenu.shortcut && (
                <RowEnd className={shortcutClassName}>{submenu.shortcut}</RowEnd>
              )}
              <RowEnd>
                <ChevronRightIcon className="size-3 opacity-60" />
              </RowEnd>
            </>
          }
        />
      </MenuItem>
    )
  }
  return (
    <MenuFilter search={submenu.search}>
      {(query) => (
        <Menu.SubmenuRoot disabled={submenu.disabled}>
          <Tooltip content={reason} side="right">
            <MenuSubmenuTrigger
              disabled={submenu.disabled}
              aria-keyshortcuts={ariaKeyShortcut(submenu.shortcut)}
            >
              <RowContent
                icon={submenu.icon}
                label={
                  <>
                    {submenu.label}
                    {reason && <span className="sr-only">. {reason}</span>}
                  </>
                }
                end={
                  submenu.shortcut && (
                    <RowEnd className={shortcutClassName}>{submenu.shortcut}</RowEnd>
                  )
                }
              />
            </MenuSubmenuTrigger>
          </Tooltip>
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
  if (!isDev()) {
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

/** One action as a menu row: a link, an on/off choice, or a plain item. */
export function ActionRow({ action }: { action: MenuAction }) {
  warnIfInert(action, 'MenuEntries')
  const runAction = useRunAction()
  const className = cx(
    action.description && 'items-start',
    action.destructive && destructiveClassName,
    action.current && 'font-medium',
  )
  const keyshortcuts = ariaKeyShortcut(action.shortcut)
  const end = (trailing?: ReactNode) => (
    <>
      {action.badge !== undefined && action.badge !== null && action.badge !== false && (
        <RowEnd className="ps-2">{action.badge}</RowEnd>
      )}
      {action.shortcut && <RowEnd className={shortcutClassName}>{action.shortcut}</RowEnd>}
      {trailing}
    </>
  )
  if (action.href && !action.disabled) {
    const newTab = action.target === '_blank'
    return (
      <MenuLinkItem
        render={
          <AppLink
            href={action.href}
            reloadDocument={action.reloadDocument}
            target={action.target}
            aria-current={action.current ? 'page' : undefined}
          />
        }
        aria-keyshortcuts={keyshortcuts}
        className={className}
      >
        <RowContent
          icon={action.icon}
          label={action.label}
          description={action.description}
          end={end(
            action.current ? (
              <RowEnd className="ps-2">
                <CheckIcon className="size-3.5 opacity-80" />
              </RowEnd>
            ) : newTab ? (
              // The words for a screen reader come from the link itself.
              <RowEnd className="ps-2 text-(--theme-muted-text-color)">
                <ExternalLinkIcon className="size-3" />
              </RowEnd>
            ) : undefined,
          )}
        />
      </MenuLinkItem>
    )
  }
  const run = () => runAction(action)
  const reason = action.disabled ? action.disabledReason : undefined
  const content = (trailing?: ReactNode) => (
    <RowContent
      icon={action.icon}
      label={
        <>
          {action.label}
          {reason && <span className="sr-only">. {reason}</span>}
        </>
      }
      description={action.description}
      end={end(trailing)}
    />
  )
  return (
    <Tooltip content={reason} side="right">
      {action.checked === undefined ? (
        <MenuItem
          disabled={action.disabled}
          onClick={run}
          aria-keyshortcuts={keyshortcuts}
          className={className}
        >
          {content()}
        </MenuItem>
      ) : (
        <MenuCheckboxItem
          checked={action.checked}
          onCheckedChange={run}
          disabled={action.disabled}
          aria-keyshortcuts={keyshortcuts}
          className={className}
        >
          {content()}
        </MenuCheckboxItem>
      )}
    </Tooltip>
  )
}

import { Menu } from '@base-ui/react/menu'
import { createContext, type ReactNode, use, useCallback, useRef, useState } from 'react'
import { isDev } from '../dev'
import { type FloatingAnchor, type PositionerAnchor, toPositionerAnchor } from './floating'
import { MenuPopup, type MenuSize } from './Menu'
import { MenuEntries, type MenuEntry, MenuFilter, type MenuSearch } from './MenuEntries'

export interface OpenMenuOptions {
  search?: MenuSearch | undefined
  /** Called once the menu closes, or another menu replaces it. */
  onClose?: (() => void) | undefined
  /** As `MenuPopup`'s: `sm` rows for a compact surface. */
  size?: MenuSize | undefined
  /** As `MenuPopup`'s: classes on the menu and its submenus, such as a terminal's colors. */
  themeClassName?: string | undefined
}

/** Where a menu opens: an element, such as the button that opened it, or a pointer event,
 *  such as a right-click. An event with Shift held is left to the browser, whose own menu
 *  then shows; any other has its default prevented. */
export type MenuOpener = FloatingAnchor & {
  shiftKey?: boolean
  preventDefault?: () => void
}

/** Opens a menu of `items` at `at`. Returns false when it opened none: no items, Shift held,
 *  or `at` is the element whose menu is open, which it closes instead. */
export type OpenMenu = (
  at: MenuOpener,
  items: MenuEntry[],
  options?: OpenMenuOptions,
  // biome-ignore lint/suspicious/noConfusingVoidType: a host's own opener may return nothing
) => boolean | void

interface Opened extends OpenMenuOptions {
  anchor: PositionerAnchor
  /** The element it opened under, when it opened under one rather than at a point. */
  element: Element | null
  items: MenuEntry[]
}

/**
 * One menu that any number of rows, buttons or a canvas open with their own
 * items, so a long list holds a single menu rather than one per row. Render
 * `contextMenu` once. Most hosts want the one `UIProvider` mounts, through
 * `useOpenMenu`; this is for a menu scoped to one region.
 */
export function useContextMenu() {
  const [opened, setOpened] = useState<Opened | null>(null)
  const [open, setOpen] = useState(false)
  // The menu whose opener hasn't yet heard it close.
  const owner = useRef<Opened | null>(null)
  // What's open now, for an opener that runs before the next render.
  const current = useRef<Opened | null>(null)

  const release = useCallback(() => {
    const was = owner.current
    owner.current = null
    was?.onClose?.()
  }, [])

  const openMenu = useCallback<OpenMenu>(
    (at, items, options) => {
      const element = at instanceof Element ? at : null
      if ((!element && at.shiftKey) || items.length === 0) {
        return false
      }
      // A second press on the button that opened it closes it, as any menu button does.
      if (element && current.current?.element === element) {
        current.current = null
        setOpen(false)
        return false
      }
      if (!element) {
        at.preventDefault?.()
      }
      // A new menu supersedes an open one, whose opener lets go of it first.
      release()
      const next: Opened = { ...options, anchor: toPositionerAnchor(at), element, items }
      owner.current = next
      current.current = next
      setOpened(next)
      setOpen(true)
      return true
    },
    [release],
  )

  const onOpenChange = useCallback(
    (next: boolean, details: { reason: string; event: Event; cancel: () => void }) => {
      if (next) {
        return
      }
      // A press on the button that opened it is outside the menu, but that button's click
      // closes the menu; closing here as well would have the click open it again.
      const element = current.current?.element
      const target = details.event?.target
      if (
        details.reason === 'outside-press' &&
        element &&
        target instanceof Node &&
        element.contains(target)
      ) {
        details.cancel()
        return
      }
      current.current = null
      setOpen(false)
    },
    [],
  )

  // Once it has gone and handed focus back, so an opener can take focus from there.
  const onOpenChangeComplete = useCallback(
    (next: boolean) => {
      if (!next) {
        release()
      }
    },
    [release],
  )

  const contextMenu = opened && (
    // A search changes the menu's root, so a menu with one is a different menu.
    <MenuFilter key={opened.search ? 'search' : 'plain'} search={opened.search}>
      {(query) => (
        // Not modal, so a right-click on another row goes to that row.
        <Menu.Root
          open={open}
          onOpenChange={onOpenChange}
          onOpenChangeComplete={onOpenChangeComplete}
          modal={false}
        >
          <MenuPopup
            anchor={opened.anchor}
            size={opened.size}
            themeClassName={opened.themeClassName}
          >
            <MenuEntries entries={opened.items} search={opened.search} query={query} />
          </MenuPopup>
        </Menu.Root>
      )}
    </MenuFilter>
  )

  const openedBy = open ? (opened?.element ?? null) : null

  return { openMenu, contextMenu, openedBy }
}

// Apart, so the many rows that only open the menu don't re-render each time it opens.
const OpenMenuContext = createContext<OpenMenu | null>(null)
const OpenedByContext = createContext<Element | null>(null)

/** The one menu every row, button and canvas below it opens through `useOpenMenu`, so none
 *  renders a menu of its own. `UIProvider` mounts it; nothing else needs to. */
export function ContextMenuProvider({ children }: { children: ReactNode }) {
  const { openMenu, contextMenu, openedBy } = useContextMenu()
  return (
    <OpenMenuContext value={openMenu}>
      <OpenedByContext value={openedBy}>
        {children}
        {contextMenu}
      </OpenedByContext>
    </OpenMenuContext>
  )
}

const warnNoProvider: OpenMenu = () => {
  if (isDev()) {
    console.warn('useOpenMenu: no ContextMenuProvider or UIProvider above, so no menu opens.')
  }
  return false
}

/** Opens the app's one shared menu: `openMenu(e, items)` from a right-click, or
 *  `openMenu(button, items)` under a button, which a second press closes. */
export function useOpenMenu(): OpenMenu {
  return use(OpenMenuContext) ?? warnNoProvider
}

/** The element the shared menu is open under, so its button can say it's expanded. */
export function useMenuOpenedBy(): Element | null {
  return use(OpenedByContext)
}

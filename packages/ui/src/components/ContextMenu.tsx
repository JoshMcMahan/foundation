import { Menu } from '@base-ui/react/menu'
import { createContext, type ReactNode, use, useCallback, useEffect, useRef, useState } from 'react'
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
  /** What else closes it, for a menu over something that moves under it, such as a
   *  terminal's: a wheel outside the menu, the window losing focus, or the window resizing. */
  closeOn?: readonly MenuCloseTrigger[] | undefined
}

export type MenuCloseTrigger = 'wheel' | 'blur' | 'resize'

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

  /** Closes the menu, if one is open, as Escape would. */
  const closeMenu = useCallback(() => {
    if (current.current) {
      current.current = null
      setOpen(false)
    }
  }, [])

  const closeOn = open ? opened?.closeOn : undefined
  useEffect(() => {
    if (!closeOn?.length) {
      return
    }
    const onWheel = (event: WheelEvent) => {
      // Scrolling a long menu is using it.
      if (!(event.target instanceof Element && event.target.closest('[role="menu"]'))) {
        closeMenu()
      }
    }
    // Capture sees every element's blur too, such as the one focus leaves for the menu.
    const onBlur = (event: Event) => {
      if (!(event.target instanceof Node)) {
        closeMenu()
      }
    }
    const listeners: [keyof WindowEventMap, EventListener][] = []
    if (closeOn.includes('wheel')) {
      listeners.push(['wheel', onWheel as EventListener])
    }
    if (closeOn.includes('blur')) {
      listeners.push(['blur', onBlur])
    }
    if (closeOn.includes('resize')) {
      listeners.push(['resize', closeMenu])
    }
    for (const [type, listener] of listeners) {
      window.addEventListener(type, listener, { capture: true, passive: true })
    }
    return () => {
      for (const [type, listener] of listeners) {
        window.removeEventListener(type, listener, { capture: true })
      }
    }
  }, [closeOn, closeMenu])

  const onOpenChange = useCallback(
    (next: boolean, details: { reason: string; event: Event; cancel: () => void }) => {
      if (next) {
        return
      }
      // A press on the button that opened it is outside the menu, and focus leaves for it,
      // but that button's click closes the menu; closing here as well would have the click
      // open it again.
      const element = current.current?.element
      const event = details.event
      const target =
        details.reason === 'focus-out' && event instanceof FocusEvent
          ? event.relatedTarget
          : event?.target
      if (
        (details.reason === 'outside-press' || details.reason === 'focus-out') &&
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

  return { openMenu, closeMenu, contextMenu, openedBy }
}

// Apart, so the many rows that only open the menu don't re-render each time it opens.
const OpenMenuContext = createContext<OpenMenu | null>(null)
const OpenedByContext = createContext<Element | null>(null)
const CloseMenuContext = createContext<(() => void) | null>(null)

/** The one menu every row, button and canvas below it opens through `useOpenMenu`, so none
 *  renders a menu of its own. `UIProvider` mounts it; nothing else needs to. */
export function ContextMenuProvider({ children }: { children: ReactNode }) {
  const { openMenu, closeMenu, contextMenu, openedBy } = useContextMenu()
  return (
    <OpenMenuContext value={openMenu}>
      <CloseMenuContext value={closeMenu}>
        <OpenedByContext value={openedBy}>
          {children}
          {contextMenu}
        </OpenedByContext>
      </CloseMenuContext>
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

const noMenu = () => {}

/** Closes the app's shared menu, if it is open, for a host whose surface moves out from under
 *  it in a way `closeOn` doesn't cover, such as a pane that switches. */
export function useCloseMenu(): () => void {
  return use(CloseMenuContext) ?? noMenu
}

/** The element the shared menu is open under, so its button can say it's expanded. */
export function useMenuOpenedBy(): Element | null {
  return use(OpenedByContext)
}

import { Menu } from '@base-ui/react/menu'
import { useCallback, useRef, useState } from 'react'
import { MenuPopup } from './Menu'
import { MenuEntries, type MenuEntry, MenuFilter, type MenuSearch } from './MenuEntries'

/** Where a menu opens: under an element, such as the button that opened it, or
 *  at a pointer event's point, which then moves with the element it landed on. */
export type MenuAnchor =
  | Element
  | { clientX: number; clientY: number; currentTarget?: EventTarget | null }

export interface OpenMenuOptions {
  search?: MenuSearch | undefined
  /** Called once the menu closes, or another menu replaces it. */
  onClose?: (() => void) | undefined
}

export type OpenMenu = (at: MenuAnchor, items: MenuEntry[], options?: OpenMenuOptions) => void

type Anchor = NonNullable<Menu.Positioner.Props['anchor']>

function pointRect(x: number, y: number) {
  return { x, y, left: x, top: y, right: x, bottom: y, width: 0, height: 0 }
}

function toAnchor(at: MenuAnchor): Anchor {
  if (at instanceof Element) {
    return at
  }
  const { clientX, clientY } = at
  const on = at.currentTarget instanceof Element ? at.currentTarget : null
  if (!on) {
    return { getBoundingClientRect: () => pointRect(clientX, clientY) }
  }
  // The point keeps its place on the element, so the menu follows it as the page scrolls.
  const start = on.getBoundingClientRect()
  const dx = clientX - start.left
  const dy = clientY - start.top
  return {
    contextElement: on,
    getBoundingClientRect: () => {
      const now = on.getBoundingClientRect()
      return pointRect(now.left + dx, now.top + dy)
    },
  }
}

interface Opened extends OpenMenuOptions {
  anchor: Anchor
  items: MenuEntry[]
}

/**
 * One menu that any number of rows, buttons or a canvas open with their own
 * items, so a long list holds a single menu rather than one per row. Render
 * `contextMenu` once.
 */
export function useContextMenu() {
  const [opened, setOpened] = useState<Opened | null>(null)
  const [open, setOpen] = useState(false)
  // The menu whose opener hasn't yet heard it close.
  const owner = useRef<Opened | null>(null)

  const release = useCallback(() => {
    const was = owner.current
    owner.current = null
    was?.onClose?.()
  }, [])

  const openMenu = useCallback<OpenMenu>(
    (at, items, options) => {
      if (items.length === 0) {
        return
      }
      // A new menu supersedes an open one, whose opener lets go of it first.
      release()
      const next = { ...options, anchor: toAnchor(at), items }
      owner.current = next
      setOpened(next)
      setOpen(true)
    },
    [release],
  )

  const onOpenChange = useCallback((next: boolean) => {
    if (!next) {
      setOpen(false)
    }
  }, [])

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
          <MenuPopup anchor={opened.anchor}>
            <MenuEntries entries={opened.items} search={opened.search} query={query} />
          </MenuPopup>
        </Menu.Root>
      )}
    </MenuFilter>
  )

  return { openMenu, contextMenu }
}

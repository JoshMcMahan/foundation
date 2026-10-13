import { Menu } from '@base-ui/react/menu'
import { useCallback, useRef, useState } from 'react'
import { type FloatingAnchor, type PositionerAnchor, toPositionerAnchor } from './floating'
import { MenuPopup } from './Menu'
import { MenuEntries, type MenuEntry, MenuFilter, type MenuSearch } from './MenuEntries'

export interface OpenMenuOptions {
  search?: MenuSearch | undefined
  /** Called once the menu closes, or another menu replaces it. */
  onClose?: (() => void) | undefined
}

export type OpenMenu = (at: FloatingAnchor, items: MenuEntry[], options?: OpenMenuOptions) => void

interface Opened extends OpenMenuOptions {
  anchor: PositionerAnchor
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
      const next = { ...options, anchor: toPositionerAnchor(at), items }
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

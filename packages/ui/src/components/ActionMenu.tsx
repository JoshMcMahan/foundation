import { Menu } from '@base-ui/react/menu'
import type { ReactNode } from 'react'
import { buttonClasses } from './buttonClasses'
import { MenuPopup } from './Menu'
import { MenuEntries, type MenuEntry, MenuFilter, type MenuSearch } from './MenuEntries'
import { Tooltip } from './Tooltip'

/** A trigger that opens a menu, such as a header's "New" or "…" button. */
export function ActionMenu({
  items,
  label,
  search,
  align,
  triggerClassName,
  children,
}: {
  items: MenuEntry[]
  /** Names the trigger, which usually shows only an icon, and labels its tooltip. */
  label: string
  search?: MenuSearch | undefined
  align?: 'start' | 'center' | 'end'
  /** Styles the trigger; without it the trigger is a ghost icon button. */
  triggerClassName?: string | undefined
  /** The trigger's content. */
  children: ReactNode
}) {
  return (
    <MenuFilter search={search}>
      {(query) => (
        <Menu.Root>
          <Tooltip content={label}>
            <Menu.Trigger
              aria-label={label}
              className={
                triggerClassName ?? buttonClasses({ variant: 'ghost', size: 'sm', iconOnly: true })
              }
            >
              {children}
            </Menu.Trigger>
          </Tooltip>
          <MenuPopup align={align} className="min-w-52">
            <MenuEntries entries={items} search={search} query={query} />
          </MenuPopup>
        </Menu.Root>
      )}
    </MenuFilter>
  )
}

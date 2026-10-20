import { Menu } from '@base-ui/react/menu'
import { type ReactElement, type ReactNode, useState } from 'react'
import { cx } from '../cx'
import { buttonClasses } from './buttonClasses'
import { EmptyState } from './EmptyState'
import { MenuPopup, type MenuPopupProps, type MenuSize } from './Menu'
import {
  ActionRow,
  type MenuAction,
  MenuEntries,
  type MenuEntry,
  MenuFilter,
  type MenuSearch,
} from './MenuEntries'
import { Tooltip } from './Tooltip'

export interface ActionMenuProps {
  items: MenuEntry[]
  /** Names the trigger, which usually shows only an icon, and labels its tooltip. With
   *  `trigger`, it names the menu instead. */
  label: string
  search?: MenuSearch | undefined
  align?: 'start' | 'center' | 'end'
  /** Where the menu opens from the trigger, such as `top` for one near the window's bottom. */
  side?: MenuPopupProps['side']
  /** Styles the built-in trigger; without it the trigger is a ghost icon button. */
  triggerClassName?: string | undefined
  /** The built-in trigger's content. */
  children?: ReactNode
  /** The whole trigger in place of the built-in one, such as a button with visible text and
   *  a chevron, or an avatar and name. It receives the trigger's props and ref, so it must
   *  pass them to its element. */
  trigger?: ReactElement | undefined
  /** Shows `label` on hover. On by default for the built-in trigger, which shows only an
   *  icon, and off with `trigger`, whose text would repeat it. Hidden while the menu is open. */
  tooltip?: boolean | undefined
  /** The trigger can't open the menu, such as while there is nothing to act on. */
  disabled?: boolean | undefined
  /** On the popup, such as a wider floor: `min-w-64`. */
  popupClassName?: string | undefined
  /** At least as wide as the trigger, as a switcher under a wide button is. */
  matchTriggerWidth?: boolean | undefined
  /** Lines above the rows that aren't choices, such as who is signed in. */
  header?: ReactNode
  /** One action pinned under the rows, ruled off and always in view, such as "See all". */
  footer?: MenuAction | undefined
  /** Shown in place of the rows when there are none, such as "No connected resources". */
  empty?: string | undefined
  /** `sm` rows for a compact toolbar whose own text is 12px. */
  size?: MenuSize | undefined
  /** As `MenuPopup`'s: classes on the menu and its submenus, such as token overrides. */
  themeClassName?: string | undefined
  onOpenChange?: ((open: boolean) => void) | undefined
}

/** A trigger that opens a menu, such as a header's "New" or "…" button. */
export function ActionMenu({
  items,
  label,
  search,
  align,
  side,
  triggerClassName,
  children,
  trigger,
  tooltip = trigger === undefined,
  disabled = false,
  popupClassName,
  matchTriggerWidth = false,
  header,
  footer,
  empty,
  size,
  themeClassName,
  onOpenChange,
}: ActionMenuProps) {
  const [open, setOpen] = useState(false)
  const button = trigger ? (
    <Menu.Trigger render={trigger} disabled={disabled} />
  ) : (
    <Menu.Trigger
      aria-label={label}
      disabled={disabled}
      className={
        triggerClassName ?? buttonClasses({ variant: 'ghost', size: 'sm', iconOnly: true })
      }
    >
      {children}
    </Menu.Trigger>
  )
  return (
    <MenuFilter search={search}>
      {(query) => (
        <Menu.Root
          onOpenChange={(next) => {
            setOpen(next)
            onOpenChange?.(next)
          }}
        >
          {tooltip ? (
            // A tip over the open menu would cover its first rows.
            <Tooltip content={label} disabled={open}>
              {button}
            </Tooltip>
          ) : (
            button
          )}
          <MenuPopup
            align={align}
            side={side}
            size={size}
            themeClassName={themeClassName}
            matchAnchorWidth={matchTriggerWidth}
            label={trigger ? label : undefined}
            header={header}
            footer={footer && <ActionRow action={footer} />}
            className={cx('min-w-52', popupClassName)}
          >
            {items.length === 0 && empty ? (
              <EmptyState variant="bare" title={empty} />
            ) : (
              <MenuEntries entries={items} search={search} query={query} />
            )}
          </MenuPopup>
        </Menu.Root>
      )}
    </MenuFilter>
  )
}

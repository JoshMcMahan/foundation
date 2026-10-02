import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react'
import cx from 'classnames'
import type { ReactNode } from 'react'
import { Fragment } from 'react'
import { useLink } from './Provider'
import { TOOLTIP_ID } from './Tooltip'

const addMenuItemClasses =
  'flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-(--theme-app) data-[focus]:bg-(--theme-muted-panel-bg) cursor-pointer'

export interface HeaderAddMenuItem {
  label: string
  icon?: ReactNode
  to?: string
  onSelect?: () => void
  disabled?: boolean
  hint?: string | undefined
  separatorAbove?: boolean
}

function itemButtonProps(item: HeaderAddMenuItem) {
  if (!item.disabled) {
    return { onClick: item.onSelect }
  }
  return {
    'aria-disabled': true,
    ...(item.hint
      ? {
          'aria-label': `${item.label}. ${item.hint}`,
          'data-tooltip-id': TOOLTIP_ID,
          'data-tooltip-content': item.hint,
        }
      : {}),
  }
}

export function AddMenu({
  items,
  label,
  buttonClassName,
  zClassName = 'z-50',
  children,
}: {
  items: HeaderAddMenuItem[]
  label: string
  buttonClassName?: string
  /** Raise above modals when needed (e.g. z-[9999]). */
  zClassName?: string
  children: ReactNode
}) {
  const Link = useLink()
  return (
    <Menu>
      <MenuButton aria-label={label} title={label} className={buttonClassName}>
        {children}
      </MenuButton>
      <MenuItems
        anchor="bottom start"
        className={cx(
          'mt-1 min-w-52 rounded-lg border border-(--theme-border) bg-(--theme-app-bg) py-1 shadow-lg focus:outline-none',
          zClassName,
        )}
      >
        {items.map((item) => (
          <Fragment key={item.label}>
            {item.separatorAbove && <div className="my-1 border-t border-(--theme-border)" />}
            <MenuItem disabled={item.disabled ?? false}>
              {item.to && !item.disabled ? (
                <Link to={item.to} className={addMenuItemClasses}>
                  {item.icon}
                  {item.label}
                </Link>
              ) : (
                <button
                  type="button"
                  {...itemButtonProps(item)}
                  className={cx(
                    addMenuItemClasses,
                    item.disabled && 'opacity-50 cursor-not-allowed',
                  )}
                >
                  {item.icon}
                  {item.label}
                </button>
              )}
            </MenuItem>
          </Fragment>
        ))}
      </MenuItems>
    </Menu>
  )
}

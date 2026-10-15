import { Menu as BaseMenu } from '@base-ui/react/menu'
import type { ReactNode } from 'react'
import { cx } from '../cx'
import { CheckIcon, ChevronRightIcon } from '../icons'
import {
  panelClassName,
  panelItemClassName,
  panelListClassName,
  positionerClassName,
} from './floating'

// Root, Trigger, Group, RadioGroup and FilterProvider carry no styles, so callers
// use Base UI's directly; the parts below give every menu one look.

const itemClassName = panelItemClassName

type Styled<Props> = Omit<Props, 'className'> & { className?: string | undefined }

export interface MenuPopupProps {
  children: ReactNode
  className?: string | undefined
  side?: BaseMenu.Positioner.Props['side']
  align?: BaseMenu.Positioner.Props['align']
  /** What it opens against in place of its trigger, such as the point a right-click landed. */
  anchor?: BaseMenu.Positioner.Props['anchor']
  /** Keeps the popup's children mounted while closed, so state they own survives. */
  keepMounted?: boolean
}

/** The portal, positioner and popup every menu needs. */
export function MenuPopup({
  children,
  className,
  side = 'bottom',
  align = 'start',
  anchor,
  keepMounted = false,
}: MenuPopupProps) {
  return (
    <BaseMenu.Portal keepMounted={keepMounted}>
      <BaseMenu.Positioner
        side={side}
        align={align}
        anchor={anchor}
        sideOffset={4}
        className={positionerClassName}
      >
        <BaseMenu.Popup
          className={cx(
            'min-w-44 max-h-(--available-height) overflow-y-auto',
            panelListClassName,
            panelClassName,
            className,
          )}
        >
          {children}
        </BaseMenu.Popup>
      </BaseMenu.Positioner>
    </BaseMenu.Portal>
  )
}

export function MenuItem({ className, ...props }: Styled<BaseMenu.Item.Props>) {
  return <BaseMenu.Item {...props} className={cx(itemClassName, className)} />
}

/** A navigation row; give it `render` for a router link. Closes the menu like any item. */
export function MenuLinkItem({ className, ...props }: Styled<BaseMenu.LinkItem.Props>) {
  return <BaseMenu.LinkItem closeOnClick {...props} className={cx(itemClassName, className)} />
}

/** A choice within a Menu.RadioGroup, checked while it holds the group's value. */
export function MenuRadioItem({ className, children, ...props }: Styled<BaseMenu.RadioItem.Props>) {
  return (
    <BaseMenu.RadioItem closeOnClick {...props} className={cx(itemClassName, 'pl-1', className)}>
      <span className="flex w-3.5 shrink-0 justify-center">
        <BaseMenu.RadioItemIndicator>
          <CheckIcon className="size-3" />
        </BaseMenu.RadioItemIndicator>
      </span>
      {children}
    </BaseMenu.RadioItem>
  )
}

/** An on/off choice, checked while `checked` holds; it closes the menu like any item. */
export function MenuCheckboxItem({
  className,
  children,
  ...props
}: Styled<BaseMenu.CheckboxItem.Props>) {
  return (
    <BaseMenu.CheckboxItem closeOnClick {...props} className={cx(itemClassName, className)}>
      {children}
      <BaseMenu.CheckboxItemIndicator className="ml-auto">
        <CheckIcon className="size-3.5 opacity-80" />
      </BaseMenu.CheckboxItemIndicator>
    </BaseMenu.CheckboxItem>
  )
}

/** The row that opens a submenu, inside a Menu.SubmenuRoot. */
export function MenuSubmenuTrigger({
  className,
  children,
  ...props
}: Styled<BaseMenu.SubmenuTrigger.Props>) {
  return (
    <BaseMenu.SubmenuTrigger
      {...props}
      className={cx(itemClassName, 'data-popup-open:bg-(--theme-hover)', className)}
    >
      {/* Takes the row's room, so a detail at its end sits by the chevron. */}
      <span className="flex min-w-0 flex-1 items-center gap-2">{children}</span>
      <ChevronRightIcon className="size-3 shrink-0 opacity-60" />
    </BaseMenu.SubmenuTrigger>
  )
}

export function MenuSeparator({ className }: { className?: string | undefined }) {
  return <BaseMenu.Separator className={cx('-mx-1 my-1 h-px bg-(--theme-border)', className)} />
}

export function MenuGroupLabel({ children }: { children: ReactNode }) {
  return (
    <BaseMenu.GroupLabel className="px-2 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-(--theme-muted-text-color)">
      {children}
    </BaseMenu.GroupLabel>
  )
}

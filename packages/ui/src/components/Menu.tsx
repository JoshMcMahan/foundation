import { Menu as BaseMenu } from '@base-ui/react/menu'
import { createContext, type ReactNode, use } from 'react'
import { cx } from '../cx'
import { CheckIcon, ChevronRightIcon } from '../icons'
import {
  panelClassName,
  panelItemClassName,
  panelListClassName,
  positionerClassName,
} from './floating'
import { usePopupContainer } from './popupContainer'

// Root, Trigger, Group, RadioGroup and FilterProvider carry no styles, so callers
// use Base UI's directly; the parts below give every menu one look.

// A small menu's rows are 12px with less padding, for a compact toolbar whose own text is 12px.
// The rows find it by the popup's data-size, so each part keeps one class list.
const itemClassName = cx(
  panelItemClassName,
  'in-data-[size=sm]:gap-1.5 in-data-[size=sm]:px-1.5 in-data-[size=sm]:py-1',
)

type Styled<Props> = Omit<Props, 'className'> & { className?: string | undefined }

/** A menu's rows: `md` is the standard 14px row, `sm` a 12px one for a compact toolbar. */
export type MenuSize = 'md' | 'sm'

interface MenuLook {
  size: MenuSize
  themeClassName: string | undefined
}

// A submenu portals apart from its parent, so it inherits the parent's look through context.
const MenuLookContext = createContext<MenuLook>({ size: 'md', themeClassName: undefined })

export interface MenuPopupProps {
  children: ReactNode
  /** An embedded editor uses dialog semantics instead of a list of menu choices. */
  role?: 'menu' | 'dialog' | undefined
  /** On this popup alone, such as a wider floor: `min-w-64`. */
  className?: string | undefined
  side?: BaseMenu.Positioner.Props['side']
  align?: BaseMenu.Positioner.Props['align']
  /** What it opens against in place of its trigger, such as the point a right-click landed. */
  anchor?: BaseMenu.Positioner.Props['anchor']
  /** Keeps the popup's children mounted while closed, so state they own survives. */
  keepMounted?: boolean
  /** The rows' size; a submenu takes its parent's. */
  size?: MenuSize | undefined
  /** Classes on this popup and every submenu it opens, such as token overrides that give a
   *  terminal's menus its own colors: `[--theme-app-bg:#111827] [--theme-app:#f9fafb]`. */
  themeClassName?: string | undefined
  /** At least as wide as the element it opens from. */
  matchAnchorWidth?: boolean | undefined
  /** Names the menu, where its trigger's text doesn't. */
  label?: string | undefined
  /** Lines above the rows that aren't choices, such as who is signed in. They stay in view
   *  as the rows scroll, ruled off from them. */
  header?: ReactNode
  /** Rows under the scrolling ones, ruled off from them and always in view, such as "See all".
   *  The arrow keys reach them last. */
  footer?: ReactNode
}

/** The portal, positioner and popup every menu needs. */
export function MenuPopup({
  children,
  role = 'menu',
  className,
  side = 'bottom',
  align = 'start',
  anchor,
  keepMounted = false,
  size,
  themeClassName,
  matchAnchorWidth = false,
  label,
  header,
  footer,
}: MenuPopupProps) {
  const portal = usePopupContainer()
  const inherited = use(MenuLookContext)
  const look: MenuLook = {
    size: size ?? inherited.size,
    themeClassName: themeClassName ?? inherited.themeClassName,
  }
  const pinned = header !== undefined || footer !== undefined
  return (
    <MenuLookContext value={look}>
      <BaseMenu.Portal {...portal} keepMounted={keepMounted}>
        <BaseMenu.Positioner
          side={side}
          align={align}
          anchor={anchor}
          sideOffset={4}
          className={positionerClassName}
        >
          <BaseMenu.Popup
            role={role}
            data-size={look.size}
            aria-label={label}
            className={cx(
              'min-w-44 max-h-(--available-height)',
              pinned ? 'flex flex-col' : ['overflow-y-auto', panelListClassName],
              panelClassName,
              look.size === 'sm' && 'text-xs',
              look.themeClassName,
              className,
              // Last, so a floor in className doesn't undo it.
              matchAnchorWidth && 'min-w-[max(11rem,var(--anchor-width))]',
            )}
          >
            {pinned ? (
              <>
                {header !== undefined && (
                  <div className="shrink-0 border-b border-(--theme-border) px-3 py-2">
                    {header}
                  </div>
                )}
                <div className={cx('min-h-0 flex-1 overflow-y-auto', panelListClassName)}>
                  {children}
                </div>
                {footer !== undefined && (
                  <div
                    className={cx('shrink-0 border-t border-(--theme-border)', panelListClassName)}
                  >
                    {footer}
                  </div>
                )}
              </>
            ) : (
              children
            )}
          </BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </MenuLookContext>
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
      {/* On the first line's height, so it stays beside the label above a description. */}
      <BaseMenu.CheckboxItemIndicator className="ms-auto flex h-5 shrink-0 items-center ps-2 in-data-[size=sm]:h-4">
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
    <BaseMenu.GroupLabel className="px-2 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-(--theme-muted-text-color) in-data-[size=sm]:px-1.5">
      {children}
    </BaseMenu.GroupLabel>
  )
}

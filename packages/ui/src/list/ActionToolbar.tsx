import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react'
import cx from 'classnames'
import { createContext, Fragment, useContext, useLayoutEffect, useRef, useState } from 'react'
import { useLink, useStrings } from '../components/Provider'
import { TOOLTIP_ID } from '../components/Tooltip'
import { MenuIcon } from '../icons'

// True inside the `…` menu, so pre-rendered element items whose buttons
// normally render as chips restyle themselves as menu rows.
const OverflowMenuContext = createContext(false)

/** Omits data-tooltip-content when absent — react-tooltip treats an explicit undefined as an empty tooltip anchor. */
function tipProps(content: string | undefined, place: 'bottom' | 'left') {
  return {
    'data-tooltip-id': TOOLTIP_ID,
    'data-tooltip-place': place,
    ...(content !== undefined && { 'data-tooltip-content': content }),
  }
}

export interface ToolbarAction {
  key: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  iconClassName?: string
  onClick?: (() => void) | undefined
  href?: string | undefined
  disabled?: boolean | undefined
  enabledTooltip?: string
  disabledTooltip?: string | undefined
  hidden?: boolean
}

/** A pre-rendered element (e.g. a button component that owns its modal). */
interface ToolbarElement {
  key: string
  element: React.ReactNode
  hidden?: boolean
}

export type ToolbarItem = ToolbarAction | ToolbarElement

function ToolbarItemView({ item }: { item: ToolbarItem }) {
  if ('element' in item) {
    return <>{item.element}</>
  }
  return <ToolbarButton action={item} />
}

export function ToolbarButton({ action }: { action: ToolbarAction }) {
  const inOverflowMenu = useContext(OverflowMenuContext)
  const Link = useLink()
  if (inOverflowMenu) {
    return <OverflowRow item={action} />
  }
  const className = cx(
    'inline-flex items-center gap-x-0.5 h-9 px-2 rounded-md text-[13.5px] uppercase font-semibold transition-colors whitespace-nowrap',
    'bg-(--theme-element) text-(--theme-element-text)',
    action.disabled
      ? 'opacity-50 cursor-not-allowed'
      : 'cursor-pointer hover:bg-(--theme-element-hover)',
  )
  const tooltipProps = tipProps(
    action.disabled ? action.disabledTooltip : action.enabledTooltip,
    'bottom',
  )
  const Icon = action.icon
  const content = (
    <>
      <div className="h-6 flex items-center">
        <Icon className={cx('w-auto', action.iconClassName)} />
      </div>
      {action.label}
    </>
  )
  if (action.href && !action.disabled) {
    return (
      <Link to={action.href} className={className} {...tooltipProps}>
        {content}
      </Link>
    )
  }
  if (action.disabled) {
    // A disabled <button> fires no hover events, so react-tooltip never shows
    // the "why is this disabled" copy; anchor it on a wrapping span instead.
    return (
      <span className="inline-flex" {...tooltipProps}>
        <button type="button" disabled className={className}>
          {content}
        </button>
      </span>
    )
  }
  return (
    <button type="button" onClick={action.onClick} className={className} {...tooltipProps}>
      {content}
    </button>
  )
}

/** A single overflowed item rendered as a full-width row inside the `…` menu. */
function OverflowRow({ item }: { item: ToolbarAction }) {
  const Link = useLink()
  const Icon = item.icon
  const className = cx(
    'flex w-full items-center gap-x-1 px-4 py-2 text-[13px] uppercase font-semibold link hover:theme-hover',
    item.disabled && 'opacity-50 cursor-not-allowed',
  )
  // Opens left, away from the menu panel, so the tooltip never covers other rows.
  const tooltipProps = tipProps(item.disabled ? item.disabledTooltip : item.enabledTooltip, 'left')
  const content = (
    <>
      <div className="w-5 h-6 flex items-center">
        <Icon className={cx(item.iconClassName)} />
      </div>
      {item.label}
    </>
  )
  // MenuItem must render the interactive element itself (not a Fragment
  // around it) so headlessui's injected props — close-on-select, keyboard
  // activation, menuitem role — land on the DOM node.
  if (item.href && !item.disabled) {
    return (
      <MenuItem as={Link} to={item.href} className={className} {...tooltipProps}>
        {content}
      </MenuItem>
    )
  }
  return (
    <MenuItem
      as="button"
      type="button"
      onClick={item.onClick}
      disabled={item.disabled ?? false}
      className={className}
      {...tooltipProps}
    >
      {content}
    </MenuItem>
  )
}

function OverflowMenu({ items }: { items: ToolbarItem[] }) {
  const { list: t } = useStrings()
  return (
    <Menu as="div" className="relative inline-block text-left">
      <MenuButton
        aria-label={t.moreActions}
        className="inline-flex items-center justify-center h-9 w-9 rounded-md border theme-border link hover:theme-hover transition-colors"
        data-tooltip-id={TOOLTIP_ID}
        data-tooltip-content={t.moreActions}
        data-testid="action-toolbar-menu-button"
      >
        <MenuIcon />
      </MenuButton>
      {/* unmount={false}: element items own their modal state (e.g. delete
          confirmations); unmounting on close would destroy an open modal,
          since opening it already closes the menu via the outside-click. */}
      <MenuItems
        unmount={false}
        anchor={{ to: 'bottom end', gap: 4 }}
        className="z-50 min-w-56 rounded-md border theme-border bg-(--theme-app-bg) shadow-lg py-1 focus:outline-none"
      >
        <OverflowMenuContext.Provider value={true}>
          {items.map((item) =>
            'element' in item ? (
              <Fragment key={item.key}>{item.element}</Fragment>
            ) : (
              <OverflowRow key={item.key} item={item} />
            ),
          )}
        </OverflowMenuContext.Provider>
      </MenuItems>
    </Menu>
  )
}

// Width reserved for the `…` overflow button (h-9 w-9 chip) plus its leading gap.
const MENU_BUTTON_WIDTH = 44
// gap-1 between toolbar chips.
const ITEM_GAP = 4

function fitCount(widths: number[], available: number, gap: number, menuWidth: number) {
  if (widths.length === 0) {
    return 0
  }
  const totalAll = widths.reduce((sum, w) => sum + w, 0) + gap * (widths.length - 1)
  if (totalAll <= available) {
    return widths.length
  }
  // Something overflows, so reserve room for the menu button up front.
  let used = menuWidth
  let count = 0
  for (const w of widths) {
    if (used + gap + w > available) {
      break
    }
    used += gap + w
    count++
  }
  return count
}

/** Measures in a layout effect (before paint) so the inline/overflow split never flashes. */
function CollapsibleRight({ items }: { items: ToolbarItem[] }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Record<string, HTMLSpanElement | null>>({})
  const widthCache = useRef<Record<string, number>>({})
  const [available, setAvailable] = useState(Number.POSITIVE_INFINITY)
  const [count, setCount] = useState(items.length)

  // Track the width flexbox allocates to this cluster.
  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) {
      return
    }
    const update = () => setAvailable(el.clientWidth)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Measure the inline items, cache their widths, and recompute the split.
  // Runs every render (cheap) but only re-renders when the split changes, so
  // it converges within a paint instead of flashing.
  useLayoutEffect(() => {
    for (const key in itemRefs.current) {
      const el = itemRefs.current[key]
      if (el) {
        widthCache.current[key] = el.offsetWidth
      }
    }
    const widths = items.map((item) => widthCache.current[item.key] ?? 0)
    const next = fitCount(widths, available, ITEM_GAP, MENU_BUTTON_WIDTH)
    setCount((prev) => (prev === next ? prev : next))
  })

  const visible = items.slice(0, count)
  const overflow = items.slice(count)

  return (
    <div ref={wrapRef} className="flex-1 min-w-0 flex items-center justify-end gap-1">
      {visible.map((item) => (
        <span
          key={item.key}
          ref={(el) => {
            itemRefs.current[item.key] = el
          }}
          className="inline-flex shrink-0"
        >
          <ToolbarItemView item={item} />
        </span>
      ))}
      {overflow.length > 0 && <OverflowMenu items={overflow} />}
    </div>
  )
}

/** Pins a detail-page toolbar just below the sticky breadcrumb strip (top-10 matches the strip's 40px height). */
export const stickyToolbarClasses = 'sticky top-10 z-10 bg-(--theme-app-bg)'

/** Pins a detail-page tabs row under the pinned toolbar (top-22 = 40px strip + 48px toolbar block). */
export const stickyTabsClasses = 'sticky top-22 z-10 bg-(--theme-app-bg)'

/** Pins a detail-page tabs row directly under the breadcrumb strip when the page has no pinned toolbar (top-10 = the strip's height). */
export const stickyTabsUnderHeaderClasses = 'sticky top-10 z-10 bg-(--theme-app-bg)'

/** Action groups left, secondary actions right (collapsing into a `…` menu). */
export function ActionToolbar({
  groups,
  right = [],
  sticky = false,
}: {
  groups: ToolbarItem[][]
  right?: ToolbarItem[]
  /** Pin below the breadcrumb strip while the page scrolls. Requires the toolbar's parent to span the page content. */
  sticky?: boolean
}) {
  const visibleGroups = groups
    .map((group) => group.filter((a) => !a.hidden))
    .filter((group) => group.length > 0)
  const visibleRight = right.filter((a) => !a.hidden)
  return (
    <div className={cx('flex items-center gap-2.5', sticky && cx(stickyToolbarClasses, 'py-1.5'))}>
      {visibleGroups.length > 0 && (
        <div className="flex items-center gap-2.5 shrink-0">
          {visibleGroups.map((group, i) => (
            <Fragment key={group[0]?.key ?? i}>
              {i > 0 && <div className="w-px h-5 bg-(--theme-border)" />}
              <div className="flex items-center gap-1">
                {group.map((item) => (
                  <ToolbarItemView key={item.key} item={item} />
                ))}
              </div>
            </Fragment>
          ))}
        </div>
      )}
      {visibleRight.length > 0 && <CollapsibleRight items={visibleRight} />}
    </div>
  )
}

import { Collapsible } from '@base-ui/react/collapsible'
import { Dialog } from '@base-ui/react/dialog'
import {
  createContext,
  type HTMLAttributes,
  type MouseEvent,
  type ReactNode,
  use,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { AppLink, isPlainClick, type LinkTarget } from '../components/AppLink'
import { collapsePanelClassName } from '../components/Disclosure'
import { Popover, useClosePopover } from '../components/Popover'
import { Tooltip } from '../components/Tooltip'
import { cx } from '../cx'
import { ChevronRightIcon, CloseIcon, SidebarCloseIcon, SidebarOpenIcon } from '../icons'

export interface AppFrameLabels {
  navigation: string
  skipToContent: string
  openNavigation: string
  closeNavigation: string
  expandSidebar: string
  collapseSidebar: string
  resizeSidebar: string
}
const defaultLabels: AppFrameLabels = {
  navigation: 'Main navigation',
  skipToContent: 'Skip to content',
  openNavigation: 'Open navigation',
  closeNavigation: 'Close navigation',
  expandSidebar: 'Expand sidebar',
  collapseSidebar: 'Collapse sidebar',
  resizeSidebar: 'Resize sidebar',
}
export interface AppFrameState {
  /** Labels stay visible in the mobile drawer even when the desktop rail is collapsed. */
  expanded: boolean
  isMobile: boolean
  mobileOpen: boolean
  toggle: () => void
  closeNavigation: () => void
}
interface FrameContext extends AppFrameState {
  labels: AppFrameLabels
  navigationId: string
}
const Context = createContext<FrameContext | null>(null)
export function useAppFrame(): AppFrameState {
  const context = useContext(Context)
  if (!context) throw new Error('useAppFrame requires AppFrame')
  return context
}
function useFrameContext(): FrameContext {
  const context = useContext(Context)
  if (!context) throw new Error('App frame controls require AppFrame')
  return context
}
type Slot = ReactNode | ((state: AppFrameState) => ReactNode)
export interface AppFrameProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  children: ReactNode
  /** Identity at the top of navigation. Render a compact mark when expanded is false. */
  brand?: Slot
  navigation: Slot
  footer?: Slot
  /** Page tools above the independently scrolling main content. */
  header?: ReactNode
  /** Optional notice above both navigation and content. */
  banner?: ReactNode
  expanded?: boolean
  defaultExpanded?: boolean
  onExpandedChange?: (expanded: boolean) => void
  width?: number
  defaultWidth?: number
  /** Commits once when a drag ends, and on each keyboard or reset action. */
  onWidthChange?: (width: number) => void
  minWidth?: number
  maxWidth?: number
  railWidth?: number
  resizable?: boolean
  /** Viewport width below which navigation becomes a modal drawer. */
  mobileBreakpoint?: number
  /** A changed route key closes mobile navigation. */
  navigationKey?: string
  /** Reset navigation scroll only when this section changes; defaults to navigationKey. */
  navigationResetKey?: string
  /** Attributes shared by desktop navigation and the mobile dialog. */
  sidebarProps?: HTMLAttributes<HTMLElement>
  /** Removes the inset and border around content. */
  fullBleed?: boolean
  labels?: Partial<AppFrameLabels>
  mainId?: string
  mainClassName?: string
}
function useMobile(breakpoint: number) {
  const media = useMemo(
    () =>
      typeof window === 'undefined' ? null : window.matchMedia(`(max-width: ${breakpoint - 1}px)`),
    [breakpoint],
  )
  return useSyncExternalStore(
    useMemo(
      () => (changed: () => void) => {
        media?.addEventListener('change', changed)
        return () => media?.removeEventListener('change', changed)
      },
      [media],
    ),
    () => media?.matches ?? false,
    () => false,
  )
}
function slot(value: Slot, state: AppFrameState) {
  return typeof value === 'function' ? value(state) : value
}

/** An inset application surface beside a resizable icon rail or navigation column.
 * Router, identity, persistence and permissions belong to the host. Import app-frame.css. */
export function AppFrame({
  children,
  brand,
  navigation,
  footer,
  header,
  banner,
  expanded: controlledExpanded,
  defaultExpanded = true,
  onExpandedChange,
  width: controlledWidth,
  defaultWidth = 240,
  onWidthChange,
  minWidth = 200,
  maxWidth = 400,
  railWidth = 64,
  resizable = true,
  mobileBreakpoint = 768,
  navigationKey,
  navigationResetKey = navigationKey,
  sidebarProps,
  fullBleed = false,
  labels: labelOverrides,
  mainId: suppliedMainId,
  mainClassName,
  className,
  style,
  ...props
}: AppFrameProps) {
  const id = useId()
  const mainId = suppliedMainId ?? `${id}-main`
  const navigationId = `${id}-navigation`
  const [ownExpanded, setOwnExpanded] = useState(defaultExpanded)
  const [ownWidth, setOwnWidth] = useState(defaultWidth)
  const [dragWidth, setDragWidth] = useState<number | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [resizing, setResizing] = useState(false)
  const desktopExpanded = controlledExpanded ?? ownExpanded
  const minimum = Math.max(railWidth, minWidth)
  const maximum = Math.max(minimum, maxWidth)
  const clamp = (n: number) =>
    Math.min(maximum, Math.max(minimum, Number.isFinite(n) ? n : defaultWidth))
  const width = clamp(dragWidth ?? controlledWidth ?? ownWidth)
  const isMobile = useMobile(mobileBreakpoint)
  const labels = { ...defaultLabels, ...labelOverrides }
  const navRef = useRef<HTMLElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const savedScrollTop = useRef(0)
  const restoreScroll = useCallback((node: HTMLDivElement | null) => {
    scrollRef.current = node
    if (node) node.scrollTop = savedScrollTop.current
  }, [])
  const portalRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{
    origin: number
    direction: number
    pointerId: number
    startWidth: number
    width: number
  } | null>(null)
  useEffect(() => {
    if (!isMobile && resizable) return
    // Removing a captured handle can prevent its lost-capture event from reaching React.
    drag.current = null
    setDragWidth(null)
    setResizing(false)
  }, [isMobile, resizable])
  const setExpanded = (next: boolean) => {
    setOwnExpanded(next)
    onExpandedChange?.(next)
  }
  const setWidth = (next: number) => {
    const value = clamp(next)
    setOwnWidth(value)
    onWidthChange?.(value)
  }
  const closeNavigation = () => setMobileOpen(false)
  const state: FrameContext = {
    expanded: isMobile || desktopExpanded,
    isMobile,
    mobileOpen,
    toggle: () => (isMobile ? setMobileOpen(!mobileOpen) : setExpanded(!desktopExpanded)),
    closeNavigation,
    labels,
    navigationId,
  }
  const previousLocation = useRef({ navigationKey, navigationResetKey, isMobile })
  useEffect(() => {
    if (
      previousLocation.current.navigationKey === navigationKey &&
      previousLocation.current.navigationResetKey === navigationResetKey &&
      previousLocation.current.isMobile === isMobile
    )
      return
    if (
      previousLocation.current.navigationKey !== navigationKey ||
      previousLocation.current.isMobile !== isMobile
    )
      setMobileOpen(false)
    if (
      previousLocation.current.navigationResetKey !== navigationResetKey ||
      previousLocation.current.isMobile !== isMobile
    ) {
      savedScrollTop.current = 0
      scrollRef.current?.scrollTo({ top: 0 })
    }
    previousLocation.current = { navigationKey, navigationResetKey, isMobile }
  }, [navigationKey, navigationResetKey, isMobile])
  const navContent = (
    <>
      {brand && <div className="pw-frame-brand">{slot(brand, state)}</div>}
      <div
        className="pw-frame-links"
        ref={restoreScroll}
        onScroll={(event) => {
          savedScrollTop.current = event.currentTarget.scrollTop
        }}
      >
        {slot(navigation, state)}
      </div>
      {footer && <div className="pw-frame-footer">{slot(footer, state)}</div>}
    </>
  )
  const resize = (clientX: number, pointerId: number) => {
    const current = drag.current
    if (!current || current.pointerId !== pointerId) return
    const next = (clientX - current.origin) * current.direction
    // Hysteresis keeps a slow drag near the rail boundary from flickering.
    if (desktopExpanded && next < minimum - 80) setExpanded(false)
    else if (!desktopExpanded && next >= minimum - 50) {
      setExpanded(true)
      current.width = clamp(next)
      setDragWidth(current.width)
    } else if (desktopExpanded) {
      current.width = clamp(next)
      setDragWidth(current.width)
    }
  }
  const endResize = (event: { pointerId: number }) => {
    const ended = drag.current
    if (!ended || ended.pointerId !== event.pointerId) return
    drag.current = null
    setResizing(false)
    setDragWidth(null)
    if (desktopExpanded && ended.width !== ended.startWidth) setWidth(ended.width)
  }
  return (
    <Context value={state}>
      <div
        {...props}
        className={cx('pw-app-frame', className)}
        data-mobile={isMobile || undefined}
        data-full-bleed={fullBleed || undefined}
        style={style}
      >
        <a
          className="pw-frame-skip"
          href={`#${mainId}`}
          onClick={(event) => {
            event.preventDefault()
            document.getElementById(mainId)?.focus()
          }}
        >
          {labels.skipToContent}
        </a>
        {banner && <div className="pw-frame-banner">{banner}</div>}
        <div className="pw-frame-body">
          {!isMobile && (
            <aside
              {...sidebarProps}
              ref={navRef}
              id={navigationId}
              className={cx('pw-frame-sidebar', sidebarProps?.className)}
              data-sidebar-mode={desktopExpanded ? 'expanded' : 'rail'}
              data-resizing={resizing || undefined}
              style={{ ...sidebarProps?.style, width: desktopExpanded ? width : railWidth }}
            >
              {navContent}
              {resizable && (
                // biome-ignore lint/a11y/useSemanticElements: an interactive window splitter requires pointer capture and a full-height drag surface.
                <div
                  role="separator"
                  tabIndex={0}
                  aria-orientation="vertical"
                  aria-label={labels.resizeSidebar}
                  aria-controls={navigationId}
                  aria-valuemin={railWidth}
                  aria-valuemax={maximum}
                  aria-valuenow={Math.round(desktopExpanded ? width : railWidth)}
                  className="pw-frame-resize"
                  onPointerDown={(event) => {
                    if (event.button !== 0 || event.isPrimary === false || drag.current) return
                    event.preventDefault()
                    const rect = navRef.current?.getBoundingClientRect()
                    if (!rect) return
                    const rtl = getComputedStyle(event.currentTarget).direction === 'rtl'
                    drag.current = {
                      origin: rtl ? rect.right : rect.left,
                      direction: rtl ? -1 : 1,
                      pointerId: event.pointerId,
                      startWidth: width,
                      width,
                    }
                    event.currentTarget.setPointerCapture(event.pointerId)
                    setResizing(true)
                  }}
                  onPointerMove={(event) => resize(event.clientX, event.pointerId)}
                  onPointerUp={endResize}
                  onPointerCancel={endResize}
                  onLostPointerCapture={endResize}
                  onDoubleClick={() => {
                    setExpanded(true)
                    setWidth(defaultWidth)
                  }}
                  onKeyDown={(event) => {
                    const rtl = getComputedStyle(event.currentTarget).direction === 'rtl'
                    const smaller = rtl ? 'ArrowRight' : 'ArrowLeft'
                    const larger = rtl ? 'ArrowLeft' : 'ArrowRight'
                    if (![smaller, larger, 'Home', 'End'].includes(event.key)) return
                    event.preventDefault()
                    if (event.key === 'Home') {
                      setExpanded(true)
                      setWidth(minimum)
                    } else if (event.key === 'End') {
                      setExpanded(true)
                      setWidth(maximum)
                    } else if (event.key === smaller) {
                      if (width <= minimum) setExpanded(false)
                      else if (desktopExpanded) setWidth(width - 16)
                    } else if (!desktopExpanded) setExpanded(true)
                    else setWidth(width + 16)
                  }}
                />
              )}
            </aside>
          )}
          <div className="pw-frame-surface-wrap">
            <div className="pw-frame-surface">
              {header && <div className="pw-frame-header">{header}</div>}
              <main id={mainId} tabIndex={-1} className={cx('pw-frame-main', mainClassName)}>
                {children}
              </main>
            </div>
          </div>
          <div ref={portalRef} />
        </div>
        {isMobile && (
          <Dialog.Root open={mobileOpen} onOpenChange={setMobileOpen}>
            <Dialog.Portal container={portalRef}>
              <Dialog.Backdrop className="pw-frame-backdrop" />
              <Dialog.Popup
                {...sidebarProps}
                id={navigationId}
                className={cx('pw-frame-drawer', sidebarProps?.className)}
                aria-label={labels.navigation}
                aria-modal="true"
                data-sidebar-mode="drawer"
                style={{ ...sidebarProps?.style, width }}
              >
                <div className="pw-frame-mobile-close">
                  <Dialog.Close className="pw-frame-toggle" aria-label={labels.closeNavigation}>
                    <CloseIcon />
                  </Dialog.Close>
                </div>
                {navContent}
              </Dialog.Popup>
            </Dialog.Portal>
          </Dialog.Root>
        )}
      </div>
    </Context>
  )
}

/** Put in the page header on mobile, and the sidebar footer on desktop. */
export function AppFrameToggle({
  className,
  ...props
}: Omit<HTMLAttributes<HTMLButtonElement>, 'children'>) {
  const { expanded, isMobile, mobileOpen, toggle, labels, navigationId } = useFrameContext()
  const label = isMobile
    ? mobileOpen
      ? labels.closeNavigation
      : labels.openNavigation
    : expanded
      ? labels.collapseSidebar
      : labels.expandSidebar
  return (
    <Tooltip content={label} side={isMobile ? 'bottom' : 'right'}>
      <button
        {...props}
        type="button"
        className={cx('pw-frame-toggle', className)}
        aria-label={label}
        aria-expanded={isMobile ? mobileOpen : expanded}
        aria-controls={navigationId}
        onClick={(event) => {
          props.onClick?.(event)
          if (!event.defaultPrevented) toggle()
        }}
      >
        {expanded && !isMobile ? <SidebarCloseIcon /> : <SidebarOpenIcon />}
      </button>
    </Tooltip>
  )
}
// Items render with labels inside a rail group's flyout, whatever the frame's state.
const NavExpanded = createContext<boolean | null>(null)

export interface AppFrameNavItemProps
  extends Omit<HTMLAttributes<HTMLElement>, 'children' | 'onClick'>,
    LinkTarget {
  label: string
  /** Optional, such as a status mark; the rail shows the label's first letter without one. */
  icon?: ReactNode
  /** A second line under the label, such as a session's state. Not shown in the rail. */
  detail?: ReactNode
  selected?: boolean
  /** Such as a count, read after the label, so give it its words (`CountBadge`'s `label`).
   *  Not shown in the rail. */
  badge?: ReactNode
  disabled?: boolean
  /** A control at the item's end, beside the link rather than in it, such as an unpin button.
   *  It shows while the item is hovered or focused, and not in the rail. */
  action?: ReactNode
  onClick?: (event: MouseEvent<HTMLElement>) => void
}
/** Router-aware navigation that keeps icon-only rail items named and discoverable.
 *  Other attributes, such as `onContextMenu` or `draggable`, go on the link or button. */
export function AppFrameNavItem({
  label,
  icon,
  detail,
  selected,
  badge,
  disabled,
  action,
  onClick,
  className,
  href,
  reloadDocument,
  target,
  ...rest
}: AppFrameNavItemProps) {
  const frame = useFrameContext()
  const expanded = use(NavExpanded) ?? frame.expanded
  const closePopover = useClosePopover()
  const id = useId()
  const [labelId, detailId, badgeId] = [`${id}-label`, `${id}-detail`, `${id}-badge`]
  const described = expanded && detail != null
  const props = {
    ...rest,
    // The label and badge name it; the second line describes it.
    ...(described || badge != null
      ? { 'aria-labelledby': badge == null ? labelId : `${labelId} ${badgeId}` }
      : {}),
    ...(described ? { 'aria-describedby': detailId } : {}),
    className: cx('pw-frame-nav-item', className),
    'aria-current': selected ? ('page' as const) : undefined,
    onClick: (event: MouseEvent<HTMLElement>) => {
      if (disabled) {
        event.preventDefault()
        return
      }
      onClick?.(event)
      if (!event.defaultPrevented && isPlainClick(event)) {
        closePopover()
        frame.closeNavigation()
      }
    },
    children: (
      <>
        {(icon != null || !expanded) && (
          <span className="pw-frame-nav-icon" aria-hidden="true">
            {icon ?? label.charAt(0).toUpperCase()}
          </span>
        )}
        {described ? (
          <span className="pw-frame-nav-text">
            <span id={labelId} className="pw-frame-nav-label">
              {label}
            </span>
            <span id={detailId} className="pw-frame-nav-detail">
              {detail}
            </span>
          </span>
        ) : (
          <span id={labelId} className={expanded ? 'pw-frame-nav-label' : 'sr-only'}>
            {label}
          </span>
        )}
        {/* The rail reads it without showing it. */}
        {badge != null && (
          <span id={badgeId} className={expanded ? 'pw-frame-nav-badge' : 'sr-only'}>
            {badge}
          </span>
        )}
      </>
    ),
  }
  const item = href ? (
    <AppLink
      {...props}
      href={href}
      reloadDocument={reloadDocument}
      target={target}
      disabled={disabled}
    />
  ) : (
    <button {...props} type="button" disabled={disabled} />
  )
  if (!expanded) {
    return (
      <Tooltip content={label} side="right" delay={0}>
        {item}
      </Tooltip>
    )
  }
  return action == null ? (
    item
  ) : (
    <div className="pw-frame-nav-row">
      {item}
      <span className="pw-frame-nav-action">{action}</span>
    </div>
  )
}

export interface AppFrameNavGroupProps
  extends Omit<HTMLAttributes<HTMLElement>, 'children' | 'onClick'>,
    LinkTarget {
  label: string
  /** Stands for the group in the rail, where its items open beside it, and leads its row when
   *  nested. Defaults to the label's first letter in the rail. */
  icon?: ReactNode
  /** One of its items is the current page, which the rail's icon shows while they're out of sight. */
  selected?: boolean
  /** The group's own page, at `href`, is the current one. */
  current?: boolean
  /** False shows the items under a plain heading with no toggle. */
  collapsible?: boolean
  open?: boolean
  defaultOpen?: boolean
  /** Keep `open` in `usePersistedState` to remember it. */
  onOpenChange?: (open: boolean) => void
  /** A control at the heading's end, such as a menu or an add button. It shows while the
   *  heading is hovered or focused, and not in the rail. */
  action?: ReactNode
  onClick?: (event: MouseEvent<HTMLElement>) => void
  children: ReactNode
}
// How many groups enclose this one; a nested group's heading is a row like its items.
const NavDepth = createContext(0)

/** Named navigation items that fold under their heading, and open beside the rail from one icon.
 *  A group inside another, or one with its own page at `href`, shows its heading as a row, and
 *  nests its items under it. Other attributes, such as `onContextMenu`, go on the heading. */
export function AppFrameNavGroup({
  label,
  icon,
  selected,
  current,
  collapsible = true,
  open,
  defaultOpen = true,
  onOpenChange,
  action,
  onClick,
  href,
  reloadDocument,
  target,
  className,
  children,
  ...rest
}: AppFrameNavGroupProps) {
  const frame = useFrameContext()
  const depth = use(NavDepth)
  const expanded = use(NavExpanded) ?? frame.expanded
  const nested = depth > 0 || href != null
  const items = (
    <NavDepth value={depth + 1}>
      <div className={cx('pw-frame-nav-group-items', nested && 'pw-frame-nav-group-nested')}>
        {children}
      </div>
    </NavDepth>
  )
  if (!expanded) {
    return (
      <Popover
        openOnHover
        hoverDelay={0}
        hoverCloseDelay={100}
        side="right"
        align="start"
        sheet={false}
        title={label}
        className="pw-frame-nav-flyout"
        trigger={
          <button
            {...rest}
            type="button"
            className={cx('pw-frame-nav-item', className)}
            aria-label={label}
            data-selected={selected || current || undefined}
          >
            <span className="pw-frame-nav-icon" aria-hidden="true">
              {icon ?? label.charAt(0).toUpperCase()}
            </span>
          </button>
        }
      >
        <NavExpanded value={true}>
          {/* The flyout stands for this group, so groups in it are nested ones. */}
          <NavDepth value={depth + 1}>
            <div className="pw-frame-nav-group-items">
              {href != null && (
                <AppFrameNavItem
                  label={label}
                  icon={icon}
                  href={href}
                  reloadDocument={reloadDocument}
                  target={target}
                  selected={current === true}
                  {...(onClick ? { onClick } : {})}
                />
              )}
              {children}
            </div>
          </NavDepth>
        </NavExpanded>
      </Popover>
    )
  }
  const withAction = (heading: ReactNode) =>
    action == null ? (
      heading
    ) : (
      <div className="pw-frame-nav-row">
        {heading}
        <span className="pw-frame-nav-action">{action}</span>
      </div>
    )
  const headingClass = cx(
    nested ? 'pw-frame-nav-item pw-frame-nav-group-row' : 'pw-frame-nav-group-heading',
    className,
  )
  const headingContent = (
    <>
      {nested && icon != null && (
        <span className="pw-frame-nav-icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <span className="pw-frame-nav-label">{label}</span>
    </>
  )
  const chevron = <ChevronRightIcon aria-hidden="true" className="pw-frame-nav-group-chevron" />
  const page =
    href != null ? (
      <AppLink
        {...rest}
        href={href}
        reloadDocument={reloadDocument}
        target={target}
        className={headingClass}
        aria-current={current ? 'page' : undefined}
        onClick={(event: MouseEvent<HTMLElement>) => {
          onClick?.(event)
          if (!event.defaultPrevented && isPlainClick(event)) frame.closeNavigation()
        }}
      >
        {headingContent}
      </AppLink>
    ) : null
  const groupClass = cx('pw-frame-nav-group', nested && 'pw-frame-nav-subgroup')
  if (!collapsible) {
    return (
      <div className={groupClass}>
        {withAction(
          page ?? (
            <div {...rest} className={headingClass}>
              {headingContent}
            </div>
          ),
        )}
        {items}
      </div>
    )
  }
  return (
    <Collapsible.Root
      className={groupClass}
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={(next) => onOpenChange?.(next)}
    >
      {withAction(
        page ? (
          <div className="pw-frame-nav-page">
            {page}
            <Collapsible.Trigger className="pw-frame-nav-group-toggle" aria-label={label}>
              {chevron}
            </Collapsible.Trigger>
          </div>
        ) : (
          <Collapsible.Trigger {...rest} className={headingClass} onClick={onClick}>
            {headingContent}
            {chevron}
          </Collapsible.Trigger>
        ),
      )}
      <Collapsible.Panel className={collapsePanelClassName}>{items}</Collapsible.Panel>
    </Collapsible.Root>
  )
}

export {
  AppFrameListTakeover,
  AppFrameTakeover,
  AppFrameTakeoverBack,
  type AppFrameTakeoverGroup,
  type AppFrameTakeoverRow,
  type AppFrameTakeoverState,
  useAppFrameTakeover,
} from './takeover'

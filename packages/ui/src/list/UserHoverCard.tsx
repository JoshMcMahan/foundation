import cx from 'classnames'
import type { ReactNode } from 'react'
import { Avatar } from '../components/Avatar'
import { type UILinkComponent, useLink, useStrings } from '../components/Provider'
import { HoverCardSurface, useHoverCard } from './HoverCard'

/** Where an open hover card sits, and the handlers that keep it open. */
export interface HoverCardPlacement {
  x: number
  y: number
  onKeepOpen: () => void
  onLeave: () => void
}

/** Opens `card` after a short hover or on focus of `children`. */
export function HoverCardTrigger({
  className,
  children,
  card,
}: {
  className?: string | undefined
  children: ReactNode
  card: (placement: HoverCardPlacement) => ReactNode
}) {
  const { triggerRef, coords, scheduleOpen, scheduleClose, keepOpen } =
    useHoverCard<HTMLSpanElement>()

  return (
    <span
      ref={triggerRef}
      role="none"
      className={className}
      onMouseEnter={scheduleOpen}
      onMouseLeave={scheduleClose}
      onFocus={scheduleOpen}
      onBlur={scheduleClose}
    >
      {children}
      {coords &&
        card({
          x: coords.x,
          y: coords.y,
          onKeepOpen: keepOpen,
          onLeave: scheduleClose,
        })}
    </span>
  )
}

export interface UserHoverCardProps extends HoverCardPlacement {
  username: string
  /** Display name; falls back to the username. */
  name?: string | null | undefined
  avatarSrc?: string | null | undefined
  /** Short badge beside the name, such as the user's role. */
  badge?: ReactNode
  /** Profile link for the card's header; absent renders the header unlinked. */
  href?: string | undefined
  /** Overrides the provider's link slot for the header link. */
  linkComponent?: UILinkComponent | undefined
  /** Shows placeholder detail lines while the profile loads. */
  loading?: boolean | undefined
  /** Re-measures the card's position when this changes. */
  relayoutKey?: unknown
  /** Detail lines, usually `HoverCardRow`s, below the header. */
  children?: ReactNode
}

export function UserHoverCard({
  x,
  y,
  onKeepOpen,
  onLeave,
  username,
  name,
  avatarSrc,
  badge,
  href,
  linkComponent,
  loading = false,
  relayoutKey,
  children,
}: UserHoverCardProps) {
  const strings = useStrings()
  const SlotLink = useLink()
  const Link = linkComponent ?? SlotLink
  const displayName = name || username
  const header = (
    <>
      <Avatar src={avatarSrc} name={displayName} size="lg" className="shrink-0" />
      {/* The card is narrow, so the name wraps (even mid-word) rather than truncating:
          a person's name stays readable in their own card. The badge sits beside the
          name when it fits and wraps below it when it doesn't. */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <span className="min-w-0 text-sm font-semibold leading-5 wrap-anywhere text-(--theme-app)">
            {displayName}
          </span>
          {badge && (
            <span className="shrink-0 rounded-full bg-(--theme-muted-panel-bg) px-1.5 py-0.5 text-[10px] font-medium leading-none text-(--theme-muted-text-color)">
              {badge}
            </span>
          )}
        </div>
        <div className="truncate text-xs text-(--theme-muted-text-color)">{username}</div>
      </div>
    </>
  )

  return (
    <HoverCardSurface
      x={x}
      y={y}
      widthClassName="w-64"
      relayoutKey={relayoutKey}
      onKeepOpen={onKeepOpen}
      onLeave={onLeave}
    >
      {href ? (
        <Link to={href} className="flex items-start gap-3 transition-opacity hover:opacity-80">
          {header}
        </Link>
      ) : (
        <div className="flex items-start gap-3">{header}</div>
      )}
      {loading ? (
        <div
          role="status"
          aria-label={strings.loading}
          className="mt-3 space-y-2 border-t border-(--theme-border) pt-3"
        >
          <div aria-hidden="true" className="h-3 w-24 animate-pulse rounded theme-muted-panel" />
          <div aria-hidden="true" className="h-3 w-36 animate-pulse rounded theme-muted-panel" />
          <span className="sr-only">{strings.loading}</span>
        </div>
      ) : children ? (
        <div className="mt-3 space-y-2 border-t border-(--theme-border) pt-3 text-[13px]">
          {children}
        </div>
      ) : null}
    </HoverCardSurface>
  )
}

const rowClasses = 'flex gap-2 text-(--theme-muted-text-color)'

/** One detail line of a hover card: a leading icon and its content. With
 * `onClick` the line is a button. */
export function HoverCardRow({
  icon,
  children,
  title,
  align = 'center',
  truncate = false,
  onClick,
}: {
  icon: ReactNode
  children: ReactNode
  title?: string | undefined
  /** `start` pins the icon to the first line of wrapping content. */
  align?: 'center' | 'start' | undefined
  truncate?: boolean | undefined
  onClick?: (() => void) | undefined
}) {
  const content = (
    <>
      <span
        aria-hidden="true"
        className={cx(
          'flex shrink-0 items-center [&>svg]:h-3.5 [&>svg]:w-3.5',
          align === 'start' && 'mt-0.5',
        )}
      >
        {icon}
      </span>
      <span className={cx('min-w-0', truncate && 'truncate')}>{children}</span>
    </>
  )
  const alignClass = align === 'start' ? 'items-start' : 'items-center'

  if (onClick) {
    return (
      <button
        type="button"
        title={title}
        onClick={onClick}
        className={cx(
          rowClasses,
          alignClass,
          '-mx-1 max-w-full rounded px-1 py-0.5 text-left transition-colors hover:bg-(--theme-muted-panel-bg) hover:text-(--theme-app)',
        )}
      >
        {content}
      </button>
    )
  }
  return (
    <div title={title} className={cx(rowClasses, alignClass)}>
      {content}
    </div>
  )
}

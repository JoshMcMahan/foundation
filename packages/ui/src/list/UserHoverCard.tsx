import type { ReactNode } from 'react'
import { Avatar } from '../components/Avatar'
import { CopyButton } from '../components/CopyButton'
import { type UILinkComponent, useLink, useStrings } from '../components/Provider'
import { LoadingRegion, Skeleton } from '../components/Skeleton'
import { cx } from '../cx'

/** A person's card, for `HoverCard`'s `card`. */
export interface UserHoverCardProps {
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
  /** Detail lines, usually `HoverCardRow`s, below the header. */
  children?: ReactNode
}

export function UserHoverCard({
  username,
  name,
  avatarSrc,
  badge,
  href,
  linkComponent,
  loading = false,
  children,
}: UserHoverCardProps) {
  const { list: t } = useStrings()
  const SlotLink = useLink()
  const Link = linkComponent ?? SlotLink
  const displayName = name || username
  const header = (
    <>
      <Avatar src={avatarSrc} name={displayName} size="lg" className="shrink-0" />
      {/* The card is narrow, so the name wraps (even mid-word) rather than truncating:
          a person's name stays readable in their own card. The badge sits beside the
          name when it fits and wraps below it when it doesn't. */}
      {/* The username sits at the bottom of a column at least as tall as the avatar, so
          the copy button beside the header lines up with it. */}
      <div className="flex min-h-10 min-w-0 flex-1 flex-col justify-between">
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
        <div data-copy-value className="truncate text-xs text-(--theme-muted-text-color)">
          {username}
        </div>
      </div>
    </>
  )

  // Hosts pass a handle or an email address as the username; name what is copied.
  const copyLabel = EMAIL.test(username) ? t.labelEmail : t.labelUsername

  return (
    <div className="w-64 p-3">
      {/* The copy button sits beside the header, not in it: a linked header can't
          hold a button. Its slot is always there, so showing it on hover moves nothing. */}
      <div className="group/copy flex items-end gap-1">
        {href ? (
          <Link
            href={href}
            className="flex min-w-0 flex-1 items-start gap-3 transition-opacity hover:opacity-80"
          >
            {header}
          </Link>
        ) : (
          <div className="flex min-w-0 flex-1 items-start gap-3">{header}</div>
        )}
        {username && (
          <CopyButton
            text={username}
            label={copyLabel}
            size="xs"
            className={cx(
              // The negative margin gives its padding back to the name beside it.
              '-mr-1 opacity-0',
              // Shown while the value or the button is under the pointer, on keyboard
              // focus, and always where there is no hover to reveal it.
              'hover:opacity-100 group-has-[[data-copy-value]:hover]/copy:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100',
            )}
          />
        )}
      </div>
      {loading ? (
        <LoadingRegion className="mt-3 space-y-2 border-t border-(--theme-border) pt-3">
          <Skeleton width={96} height={12} />
          <Skeleton width={144} height={12} />
        </LoadingRegion>
      ) : children ? (
        <div className="mt-3 space-y-2 border-t border-(--theme-border) pt-3 text-[13px]">
          {children}
        </div>
      ) : null}
    </div>
  )
}

const EMAIL = /^[^\s@]+@[^\s@]+$/

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

import { useState } from 'react'
import { cx } from '../cx'
import type { TimeValue } from '../format'
import { RefreshIcon } from '../icons'
import { type ButtonSize, type ButtonVariant, buttonClasses } from './buttonClasses'
import { useStrings } from './Provider'
import { useRelativeTime } from './relativeTime'
import { Tooltip } from './Tooltip'

export interface RefreshButtonProps {
  /** May return a promise; the button spins until it settles. A rejection only
   *  stops the spinning, so report a failure from the handler. */
  onRefresh: () => unknown
  /** Spins for a refresh the host tracks itself, such as a revalidation. */
  refreshing?: boolean | undefined
  /** When the data was last fetched: a Date, epoch milliseconds, an ISO string or a luxon
   *  DateTime. The button then reads "Updated 5 seconds ago" instead of "Refresh", and
   *  keeps that current. */
  updatedAt?: TimeValue
  size?: ButtonSize | undefined
  /** A button's look, `ghost` by default; `inline` is text-sized muted text with no box, for
   *  a line of details such as a header's "Updated 2 minutes ago". */
  variant?: ButtonVariant | 'inline' | undefined
  /** Only the icon shows, with "Refresh" as its name and tooltip. */
  iconOnly?: boolean | undefined
  className?: string | undefined
}

// Takes the size of the text around it, so it sits in a line of details.
const inlineClasses =
  'inline-flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 text-(--theme-muted-text-color) transition-colors hover:bg-(--theme-muted-panel-bg) hover:text-(--theme-app) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--theme-focus) [&_svg]:size-3'

/** Fetches again on demand, and says so while it does, out loud too. */
export function RefreshButton({
  onRefresh,
  refreshing = false,
  updatedAt,
  size = 'md',
  variant = 'ghost',
  iconOnly = false,
  className,
}: RefreshButtonProps) {
  const { common: t } = useStrings()
  const [pending, setPending] = useState(false)
  const busy = refreshing || pending
  const ago = useRelativeTime(updatedAt)

  const refresh = () => {
    if (busy) {
      return
    }
    const result = onRefresh()
    if (result instanceof Promise) {
      setPending(true)
      // The host reports its own failure; `finally` would hand the rejection on
      // to a promise nobody holds, as an unhandled rejection.
      const done = () => setPending(false)
      result.then(done, done)
    }
  }

  const button = (
    <button
      type="button"
      onClick={refresh}
      aria-busy={busy}
      aria-label={iconOnly ? t.refresh : undefined}
      className={cx(
        variant === 'inline' ? inlineClasses : buttonClasses({ variant, size, iconOnly }),
        'group aria-busy:cursor-progress',
        className,
      )}
    >
      <RefreshIcon
        aria-hidden="true"
        className={cx(
          'shrink-0 motion-reduce:animate-none motion-reduce:transition-none',
          busy ? 'animate-spin' : 'transition-transform duration-300 group-hover:rotate-180',
        )}
      />
      {!iconOnly &&
        (ago ? (
          <>
            {/* Its name says what it does as well as what it shows. */}
            <span className="sr-only">{t.refresh}. </span>
            {t.updated(ago)}
          </>
        ) : busy ? (
          // Its name stays "Refresh"; aria-busy and the status say it is under way.
          <>
            <span className="sr-only">{t.refresh}</span>
            <span aria-hidden="true">{t.refreshing}</span>
          </>
        ) : (
          t.refresh
        ))}
    </button>
  )
  return (
    <>
      {iconOnly ? <Tooltip content={t.refresh}>{button}</Tooltip> : button}
      <span role="status" className="sr-only">
        {busy ? t.refreshing : ''}
      </span>
    </>
  )
}

import { useState } from 'react'
import { cx } from '../cx'
import { RefreshIcon } from '../icons'
import { type ButtonSize, buttonClasses } from './buttonClasses'
import { useStrings } from './Provider'
import { useRelativeTime } from './relativeTime'
import { Tooltip } from './Tooltip'

export interface RefreshButtonProps {
  /** May return a promise; the button spins until it settles. A rejection only
   *  stops the spinning, so report a failure from the handler. */
  onRefresh: () => unknown
  /** Spins for a refresh the host tracks itself, such as a revalidation. */
  refreshing?: boolean | undefined
  /** When the data was last fetched. The button then reads "Updated 5
   *  seconds ago" instead of "Refresh", and keeps that current. */
  updatedAt?: Date | number | null | undefined
  size?: ButtonSize | undefined
  /** Only the icon shows, with "Refresh" as its name and tooltip. */
  iconOnly?: boolean | undefined
}

/** Fetches again on demand, and says so while it does, out loud too. */
export function RefreshButton({
  onRefresh,
  refreshing = false,
  updatedAt,
  size = 'md',
  iconOnly = false,
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
        buttonClasses({ variant: 'ghost', size, iconOnly }),
        'group aria-busy:cursor-progress',
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

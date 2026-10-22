import type { ComponentPropsWithRef, ReactNode } from 'react'
import { cx } from '../cx'
import { useStrings } from './Provider'
import { RunStatusIcon, type RunStatusIconStatus } from './RunStatusIcon'
import { type BadgeVariant, StatusDot } from './StatusBadge'

/** Any other span attribute and the ref reach its element, so it can be a Tooltip's or a popover's
 *  direct child. */
export interface StatusLabelProps
  extends Omit<ComponentPropsWithRef<'span'>, 'children' | 'className'> {
  /** The state's name, such as "Running". */
  children: ReactNode
  /** The lamp's tone, lit; `off` shows it unlit. Ignored with `icon`. */
  variant?: BadgeVariant | undefined
  /** An unlit lamp, a hollow ring, for something off or not known, such as an offline agent. */
  off?: boolean | undefined
  /** A ping from the lamp, for something under way. */
  pulse?: boolean | undefined
  /** An icon in place of the lamp, such as a `RunStatusIcon`. */
  icon?: ReactNode | undefined
  className?: string | undefined
}

/** A status: what state something is in, as a lamp or icon and the state's name, in muted text
 *  with no fill. It sits in a status column or under a title, and looks the same for a run, a
 *  resource or an agent. The name says the status, so the lamp or icon is hidden from assistive
 *  technology and the status is not read twice. A long name truncates.
 *
 *  Not for a fixed fact worth noticing, such as "Preview" (a flag: `StatusBadge`), or a label
 *  someone gave it (a `Tag`). See "UI/Badges/Which one". */
export function StatusLabel({
  children,
  variant = 'default',
  off = false,
  pulse = false,
  icon,
  className,
  ...rest
}: StatusLabelProps) {
  return (
    <span
      {...rest}
      className={cx(
        'inline-flex min-w-0 items-center gap-1.5 text-(--theme-muted-text-color)',
        className,
      )}
    >
      {icon != null ? (
        <span aria-hidden="true" className="inline-flex shrink-0 items-center">
          {icon}
        </span>
      ) : (
        <StatusDot variant={variant} off={off} pulse={pulse} className="shrink-0" />
      )}
      <span className="min-w-0 truncate">{children}</span>
    </span>
  )
}

// The statuses a run reports that the run status icon has a look for.
const RUN_LOOKS = new Set<string>([
  'pending',
  'started',
  'running',
  'completed',
  'warning',
  'failed',
  'error',
  'skipped',
  'skipped-failed',
  'canceled',
  'faulted',
  'canceling',
])

/** A run's status in the run status icon's look: a status the server sent, or none for one it
 *  has no look for. */
export function runStatusLook(status: string | null | undefined): RunStatusIconStatus {
  return status && RUN_LOOKS.has(status) ? (status as NonNullable<RunStatusIconStatus>) : ''
}

/** Names a run's status in words, from `strings.runStatus`: every status the run status icon
 *  draws has a name, an error, a fault or a failure reads as failed, and no status reads as not
 *  run. Only a status the icon doesn't know reads as `fallback` says, or as the server sent it. */
export function useRunStatusName(): (
  status: string | null | undefined,
  fallback?: (status: string | null | undefined) => string,
) => string {
  const { runStatus: t } = useStrings()
  return (status, fallback) => {
    switch (status) {
      case undefined:
      case null:
      case '':
        return t.notRun
      case 'pending':
        return t.queued
      case 'started':
      case 'running':
        return t.running
      case 'canceling':
        return t.canceling
      case 'completed':
        return t.completed
      case 'error':
      case 'faulted':
      case 'failed':
        return t.failed
      case 'canceled':
        return t.canceled
      case 'warning':
        return t.warning
      case 'skipped':
      case 'skipped-failed':
        return t.skipped
      default:
        return fallback ? fallback(status) : status
    }
  }
}

/** Any other span attribute and the ref reach its element, so it can be a Tooltip's or a popover's
 *  direct child. */
export interface RunStatusLabelProps
  extends Omit<StatusLabelProps, 'children' | 'variant' | 'off' | 'pulse' | 'icon'> {
  /** The run's status as the server sent it; one with no look shows no icon's shape. */
  status: string | null | undefined
  /** The name for a status the run status icon doesn't know; the status as sent by default. */
  fallback?: ((status: string | null | undefined) => string) | undefined
}

/** A run's status: the run status icon and its name, as a status (`StatusLabel`). A running or
 *  canceling run's icon moves. See "UI/Badges/Which one". */
export function RunStatusLabel({ status, fallback, ...rest }: RunStatusLabelProps) {
  const name = useRunStatusName()
  return (
    <StatusLabel {...rest} icon={<RunStatusIcon status={runStatusLook(status)} label="" />}>
      {name(status, fallback)}
    </StatusLabel>
  )
}

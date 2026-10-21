import type { ComponentPropsWithRef } from 'react'
import { cx } from '../cx'
import type { RunStatus } from '../engine'
import {
  CancelIcon,
  FailIcon,
  type IconType,
  NotRunningIcon,
  PendingIcon,
  RunningIcon,
  SkipIcon,
  SuccessIcon,
  WarningIcon,
} from '../icons'
import { useStrings } from './Provider'
import { Tooltip } from './Tooltip'
import { type Tone, toneIcon } from './tone'

interface Look {
  tone: Tone
  icon: IconType
  /** Still under way, so it turns. */
  spin?: boolean
}

/** A status the icon shows: a run's, or one a host maps onto it, such as
 *  `pending` for something queued and `warning` for something done with problems. */
export type RunStatusIconStatus = RunStatus | 'pending' | 'warning'

// Under way reads in info blue, keeping amber for warnings alone.
const looks: Record<NonNullable<RunStatusIconStatus>, Look> = {
  pending: { tone: 'muted', icon: PendingIcon },
  started: { tone: 'info', icon: RunningIcon, spin: true },
  running: { tone: 'info', icon: RunningIcon, spin: true },
  completed: { tone: 'success', icon: SuccessIcon },
  warning: { tone: 'warning', icon: WarningIcon },
  failed: { tone: 'error', icon: FailIcon },
  error: { tone: 'error', icon: FailIcon },
  skipped: { tone: 'muted', icon: SkipIcon },
  'skipped-failed': { tone: 'muted', icon: SkipIcon },
  canceled: { tone: 'info', icon: CancelIcon },
  faulted: { tone: 'error', icon: RunningIcon, spin: true },
  canceling: { tone: 'info', icon: RunningIcon, spin: true },
  '': { tone: 'muted', icon: NotRunningIcon },
}

/** The tone a run status reads in, so a badge that says the status in words matches the
 *  icon: `<StatusBadge variant={runStatusTone(status)}>`. */
export function runStatusTone(status: RunStatusIconStatus): Tone {
  return looks[status ?? ''].tone
}

/** Any other span attribute and the ref reach the icon's element, so it can be a Tooltip's or a
 *  popover's direct child. */
export interface RunStatusIconProps
  extends Omit<ComponentPropsWithRef<'span'>, 'children' | 'className'> {
  status: RunStatusIconStatus
  /** Names the icon in place of `strings.dag.statusLabel`, for a host's own status
   *  shown in a run's look, such as "Provisioning" as running. */
  label?: string | undefined
  /** Shows the name on hover and focus too, for an icon that stands without words. */
  tooltip?: boolean | undefined
  className?: string | undefined
}

/** A run's, job's or step's status as an icon in its tone, beside the name of what ran. It
 *  is named by `label`, or else `strings.dag.statusLabel`. To say the status in words, use
 *  `StatusBadge` with `runStatusTone`. */
export function RunStatusIcon({
  status,
  label: ownLabel,
  tooltip = false,
  className,
  ...rest
}: RunStatusIconProps) {
  const { dag } = useStrings()
  const look = looks[status ?? '']
  const Icon = look.icon
  const label = ownLabel ?? dag.statusLabel(status ?? '')
  const icon = (
    <span
      {...rest}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
      data-status={status || 'not-run'}
      className={cx('flex h-2 items-center', toneIcon[look.tone], className)}
    >
      <Icon aria-hidden="true" className={cx(look.spin && 'animate-spin rounded-full')} />
    </span>
  )
  return tooltip && label ? <Tooltip content={label}>{icon}</Tooltip> : icon
}

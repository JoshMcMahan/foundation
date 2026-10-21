import type { ComponentPropsWithRef } from 'react'
import { cx } from '../cx'
import type { RunStatus } from '../engine'
import {
  CancelFilledIcon,
  FailFilledIcon,
  type IconType,
  NotRunningIcon,
  PendingRingIcon,
  RunningRingIcon,
  SkipIcon,
  SuccessFilledIcon,
  WarningFilledIcon,
} from '../icons'
import { useStrings } from './Provider'
import { Tooltip } from './Tooltip'
import { type Tone, toneIcon } from './tone'

interface Look {
  tone: Tone
  icon: IconType
  /** Fainter, for what has not begun. */
  faint?: boolean
}

/** A status the icon shows: a run's, or one a host maps onto it, such as
 *  `pending` for something queued and `warning` for something done with problems. */
export type RunStatusIconStatus = RunStatus | 'pending' | 'warning'

// A status that has ended is a solid shape with its mark cut out; one still open is a ring,
// whose arc turns while it runs. Under way reads in info blue, keeping amber for warnings alone.
const looks: Record<NonNullable<RunStatusIconStatus>, Look> = {
  pending: { tone: 'muted', icon: PendingRingIcon },
  started: { tone: 'info', icon: RunningRingIcon },
  running: { tone: 'info', icon: RunningRingIcon },
  completed: { tone: 'success', icon: SuccessFilledIcon },
  warning: { tone: 'warning', icon: WarningFilledIcon },
  failed: { tone: 'error', icon: FailFilledIcon },
  error: { tone: 'error', icon: FailFilledIcon },
  skipped: { tone: 'muted', icon: SkipIcon },
  'skipped-failed': { tone: 'muted', icon: SkipIcon },
  canceled: { tone: 'info', icon: CancelFilledIcon },
  faulted: { tone: 'error', icon: RunningRingIcon },
  canceling: { tone: 'info', icon: RunningRingIcon },
  '': { tone: 'muted', icon: NotRunningIcon, faint: true },
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
      <Icon aria-hidden="true" className={cx(look.faint && 'opacity-55')} />
    </span>
  )
  return tooltip && label ? <Tooltip content={label}>{icon}</Tooltip> : icon
}

import { cx } from '../cx'
import type { RunStatus } from '../engine'
import {
  CancelIcon,
  FailIcon,
  type IconType,
  NotRunningIcon,
  RunningIcon,
  SkipIcon,
  SuccessIcon,
} from '../icons'
import { useStrings } from './Provider'
import { type Tone, toneIcon } from './tone'

interface Look {
  tone: Tone
  icon: IconType
  /** Still under way, so it turns. */
  spin?: boolean
}

const looks: Record<NonNullable<RunStatus>, Look> = {
  started: { tone: 'warning', icon: RunningIcon, spin: true },
  running: { tone: 'warning', icon: RunningIcon, spin: true },
  completed: { tone: 'success', icon: SuccessIcon },
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
export function runStatusTone(status: RunStatus): Tone {
  return looks[status ?? ''].tone
}

/** A run's, job's or step's status as an icon in its tone, beside the name of what ran. It
 *  is named by `strings.dag.statusLabel`. To say the status in words, use `StatusBadge` with
 *  `runStatusTone`. */
export function RunStatusIcon({
  status,
  className,
}: {
  status: RunStatus
  className?: string | undefined
}) {
  const { dag } = useStrings()
  const look = looks[status ?? '']
  const Icon = look.icon
  const label = dag.statusLabel(status ?? '')
  return (
    <span
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
      data-status={status || 'not-run'}
      className={cx('flex h-2 items-center', toneIcon[look.tone], className)}
    >
      <Icon aria-hidden="true" className={cx(look.spin && 'animate-spin rounded-full')} />
    </span>
  )
}

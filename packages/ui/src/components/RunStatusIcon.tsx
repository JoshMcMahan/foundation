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
import { type Tone, toneText } from './tone'

interface Look {
  tone: Tone
  icon: IconType
  /** Still under way, so it turns. */
  spin?: boolean
  /** The glyph is drawn small within its box; this brings it up to its neighbours' size. */
  scale?: number
}

const looks: Record<NonNullable<RunStatus>, Look> = {
  started: { tone: 'warning', icon: RunningIcon, spin: true },
  running: { tone: 'warning', icon: RunningIcon, spin: true },
  completed: { tone: 'success', icon: SuccessIcon, scale: 1.25 },
  failed: { tone: 'error', icon: FailIcon, scale: 1.25 },
  error: { tone: 'error', icon: FailIcon, scale: 1.25 },
  skipped: { tone: 'muted', icon: SkipIcon, scale: 1.25 },
  'skipped-failed': { tone: 'muted', icon: SkipIcon, scale: 1.25 },
  canceled: { tone: 'info', icon: CancelIcon, scale: 1.5 },
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
      className={cx('flex h-2 items-center', toneText[look.tone], className)}
    >
      <Icon
        aria-hidden="true"
        className={cx(look.spin && 'animate-spin rounded-full')}
        style={look.scale ? { transform: `scale(${look.scale})` } : undefined}
      />
    </span>
  )
}

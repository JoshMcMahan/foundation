import { Meter as BaseMeter } from '@base-ui/react/meter'
import { Progress } from '@base-ui/react/progress'
import type { ReactNode } from 'react'
import { cx } from '../cx'
import { Tooltip } from './Tooltip'

/** A bar's color: the theme's accent, a status, or muted for something stopped. */
export type BarTone = 'accent' | 'success' | 'warning' | 'error' | 'muted'

// Status hues are fixed, as StatusBadge's are: a host theme may set the accent
// to a color that would read as a warning, or not contrast with the track.
const fillClassName: Record<BarTone, string> = {
  accent: 'bg-(--theme-accent)',
  success: 'bg-green-600',
  warning: 'bg-amber-500',
  error: 'bg-red-600',
  muted: 'bg-(--theme-muted-text-color)',
}

const trackClassName = {
  sm: 'h-1',
  md: 'h-1.5',
  lg: 'h-2',
} as const

export type BarSize = keyof typeof trackClassName

interface BarProps {
  /** Shown above the bar, which it names. */
  label?: ReactNode
  /** Names the bar when nothing visible does. */
  'aria-label'?: string
  /** Shown under the bar, such as the amounts behind it. */
  detail?: ReactNode
  size?: BarSize
  className?: string
}

const labelRowClassName = 'mb-1 flex items-baseline justify-between gap-2 text-[13px]'
const detailClassName = 'mt-1 text-[11px] tabular-nums text-(--theme-muted-text-color)'

/** The tone for `value` against a warning and an error level, for a measure
 *  that's worse the higher it reads. */
export function levelTone(value: number, warnAt: number, errorAt: number): BarTone {
  return value >= errorAt ? 'error' : value >= warnAt ? 'warning' : 'accent'
}

/** How full something is, such as storage used or a quota spent: a reading,
 *  not a task under way (that's `ProgressBar`). The bar turns amber, then red,
 *  as it passes `warnAt` and `errorAt`; `tone` overrides that. */
export function Meter({
  value,
  min = 0,
  max = 100,
  warnAt = 80,
  errorAt = 90,
  tone,
  format,
  showValue = 'beside',
  label,
  'aria-label': ariaLabel,
  detail,
  size = 'md',
  className,
}: BarProps & {
  value: number
  min?: number
  max?: number
  /** Levels in the same units as `value`. */
  warnAt?: number
  errorAt?: number
  tone?: BarTone
  /** How the value itself reads; without it, as a percentage of the range. */
  format?: Intl.NumberFormatOptions
  /** Beside the label, or over the bar on hover when room is short. */
  showValue?: 'beside' | 'tooltip'
}) {
  const clamped = Math.min(Math.max(value, min), max)
  const fill = fillClassName[tone ?? levelTone(clamped, warnAt, errorAt)]
  const shownValue = <BaseMeter.Value className="shrink-0 font-medium tabular-nums theme-text" />
  const track = (
    <BaseMeter.Track
      className={cx(
        'w-full overflow-hidden rounded-full bg-(--theme-border)',
        trackClassName[size],
      )}
    >
      <BaseMeter.Indicator
        className={cx(
          'h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none',
          fill,
        )}
      />
    </BaseMeter.Track>
  )
  return (
    <BaseMeter.Root
      value={clamped}
      min={min}
      max={max}
      format={format}
      aria-label={ariaLabel}
      className={cx('min-w-0', className)}
    >
      {label !== undefined && (
        <div className={labelRowClassName}>
          <BaseMeter.Label className="min-w-0 truncate theme-text">{label}</BaseMeter.Label>
          {showValue === 'beside' && shownValue}
        </div>
      )}
      {showValue === 'tooltip' ? (
        <Tooltip content={formatShare(clamped, min, max, format)}>{track}</Tooltip>
      ) : (
        track
      )}
      {detail !== undefined && <div className={detailClassName}>{detail}</div>}
    </BaseMeter.Root>
  )
}

// What Meter.Value shows, for the tooltip outside the meter's own text.
function formatShare(
  value: number,
  min: number,
  max: number,
  format: Intl.NumberFormatOptions | undefined,
) {
  return format
    ? new Intl.NumberFormat(undefined, format).format(value)
    : new Intl.NumberFormat(undefined, { style: 'percent' }).format(
        (value - min) / (max - min || 1),
      )
}

/** How far a task has come, such as an upload, out of `max`; `null` while
 *  that's not known. Name it with `label` or `aria-label`. */
export function ProgressBar({
  value,
  max = 100,
  tone = 'accent',
  status,
  label,
  'aria-label': ariaLabel,
  detail,
  size = 'md',
  className,
}: BarProps & {
  value: number | null
  max?: number
  tone?: BarTone
  /** Beside the label in place of the percentage, such as "Completed". */
  status?: ReactNode
}) {
  return (
    <Progress.Root
      value={value}
      max={max}
      aria-label={ariaLabel}
      className={cx('min-w-0', className)}
    >
      {(label !== undefined || status !== undefined) && (
        <div className={labelRowClassName}>
          <Progress.Label className="min-w-0 truncate theme-muted-text">{label}</Progress.Label>
          {status ?? <Progress.Value className="shrink-0 tabular-nums theme-muted-text" />}
        </div>
      )}
      <Progress.Track
        className={cx(
          'w-full overflow-hidden rounded-full bg-(--theme-border)',
          trackClassName[size],
        )}
      >
        <Progress.Indicator
          className={cx(
            'h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none',
            'data-indeterminate:w-1/3 data-indeterminate:animate-pulse',
            fillClassName[tone],
          )}
        />
      </Progress.Track>
      {detail !== undefined && <div className={detailClassName}>{detail}</div>}
    </Progress.Root>
  )
}

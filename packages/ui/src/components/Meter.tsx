import { Meter as BaseMeter } from '@base-ui/react/meter'
import { Progress } from '@base-ui/react/progress'
import type { ReactNode } from 'react'
import { cx } from '../cx'
import { Tooltip } from './Tooltip'
import { toneFill } from './tone'

/** A bar's color: the theme's accent, a status, or muted for something stopped. */
export type BarTone = 'accent' | 'info' | 'success' | 'warning' | 'error' | 'muted'

// A bar is a graphic, so it takes a status's vivid shade, whose hue is fixed in
// every theme: a host may set the accent to a color that reads as a warning.
const fillClassName: Record<BarTone, string> = {
  accent: 'bg-(--theme-accent)',
  info: toneFill.info,
  success: toneFill.success,
  warning: toneFill.warning,
  error: toneFill.error,
  muted: toneFill.muted,
}

const trackHeight = {
  sm: 'h-1',
  md: 'h-1.5',
  lg: 'h-2',
} as const

export type BarSize = keyof typeof trackHeight

/** Where a bar's value shows: `beside` its label, over the bar on `tooltip` when
 *  room is short, at the bar's `end` on the same row (so a column of bars lines up),
 *  or `none`. */
export type BarValuePlacement = 'beside' | 'tooltip' | 'end' | 'none'

interface BarProps {
  /** Shown above the bar, which it names. */
  label?: ReactNode
  /** Names the bar when nothing visible does. */
  'aria-label'?: string
  /** Shown under the bar, such as the amounts behind it. */
  detail?: ReactNode
  size?: BarSize
  /** On the track, such as a fixed `w-24` so bars in a column line up whatever
   *  the value beside them reads. */
  trackClassName?: string | undefined
  /** The locale the value is written in; the browser's own without it. */
  locale?: string | undefined
  className?: string
}

const labelRowClassName = 'mb-1 flex items-baseline justify-between gap-2 text-[13px]'
const detailClassName = 'mt-1 text-[11px] tabular-nums text-(--theme-muted-text-color)'
const endRowClassName = 'flex items-center gap-2'
const endValueClassName = 'shrink-0 text-xs tabular-nums text-(--theme-muted-text-color)'
const trackBaseClassName = 'w-full overflow-hidden rounded-full bg-(--theme-border)'

// In a row with its value, the track takes the room left, or holds the width the
// host gives it.
function trackClasses(size: BarSize, end: boolean, own: string | undefined) {
  return cx(
    trackBaseClassName,
    trackHeight[size],
    end && (own ? 'shrink-0' : 'min-w-0 flex-1'),
    own,
  )
}

/** The tone for `value` against a warning and an error level, for a measure
 *  that's worse the higher it reads; `okTone` below the warning. */
export function levelTone(
  value: number,
  warnAt: number,
  errorAt: number,
  okTone: BarTone = 'info',
): BarTone {
  return value >= errorAt ? 'error' : value >= warnAt ? 'warning' : okTone
}

/** How full something is, such as storage used or a quota spent: a reading,
 *  not a task under way (that's `ProgressBar`). The bar is blue, then turns
 *  amber, then red, as it passes `warnAt` and `errorAt`; `tone` overrides that. */
export function Meter({
  value,
  min = 0,
  max = 100,
  warnAt = 80,
  errorAt = 90,
  tone,
  okTone = 'info',
  format,
  showValue = 'beside',
  valueText,
  getAriaValueText,
  minFill = 0,
  locale,
  label,
  'aria-label': ariaLabel,
  detail,
  size = 'md',
  trackClassName,
  className,
}: BarProps & {
  value: number
  min?: number
  max?: number
  /** Levels in the same units as `value`. */
  warnAt?: number
  errorAt?: number
  tone?: BarTone
  /** The tone below `warnAt`. Info by default, so the bar reads the same in every
   *  host whatever its accent. */
  okTone?: BarTone | undefined
  /** How the value itself reads; without it, as a percentage of the range. */
  format?: Intl.NumberFormatOptions
  showValue?: BarValuePlacement
  /** The value as shown, from its formatted text, such as "45% used". */
  valueText?: ((formatted: string, value: number) => ReactNode) | undefined
  /** The value as read by assistive technology, such as "82%, near limit", for a
   *  level the bar's color alone shows. */
  getAriaValueText?: ((formatted: string, value: number) => string) | undefined
  /** The narrowest the fill draws for a value above `min`, as a percent of the
   *  track, so a small reading still shows. */
  minFill?: number | undefined
}) {
  const clamped = Math.min(Math.max(value, min), max)
  const fill = fillClassName[tone ?? levelTone(clamped, warnAt, errorAt, okTone)]
  const end = showValue === 'end'
  const shownValue = (
    <BaseMeter.Value
      className={end ? endValueClassName : 'shrink-0 font-medium tabular-nums theme-text'}
    >
      {valueText}
    </BaseMeter.Value>
  )
  const track = (
    <BaseMeter.Track className={trackClasses(size, end, trackClassName)}>
      <BaseMeter.Indicator
        className={cx(
          'h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none',
          fill,
        )}
        style={minFill > 0 && clamped > min ? { minWidth: `${minFill}%` } : undefined}
      />
    </BaseMeter.Track>
  )
  const share = formatShare(clamped, min, max, format, locale)
  return (
    <BaseMeter.Root
      value={clamped}
      min={min}
      max={max}
      format={format}
      locale={locale}
      getAriaValueText={getAriaValueText}
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
        <Tooltip content={valueText ? valueText(share, clamped) : share}>{track}</Tooltip>
      ) : end ? (
        <div className={endRowClassName}>
          {track}
          {shownValue}
        </div>
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
  locale: string | undefined,
) {
  return format
    ? new Intl.NumberFormat(locale, format).format(value)
    : new Intl.NumberFormat(locale, { style: 'percent' }).format((value - min) / (max - min || 1))
}

/** A further stretch of a progress bar, drawn after its value, such as work
 *  started but not yet done. */
export interface ProgressSegment {
  /** In the same units as the bar's `max`. */
  value: number
  tone?: BarTone | undefined
  /** At 60% strength, for a stretch that's less settled than the one before it. */
  subtle?: boolean | undefined
}

/** How far a task has come, such as an upload, out of `max`; `null` while
 *  that's not known. Name it with `label` or `aria-label`. */
export function ProgressBar({
  value,
  max = 100,
  tone = 'accent',
  segments,
  status,
  format,
  showValue = 'beside',
  valueText,
  getAriaValueText,
  locale,
  label,
  'aria-label': ariaLabel,
  detail,
  size = 'md',
  trackClassName,
  className,
}: BarProps & {
  value: number | null
  max?: number
  tone?: BarTone
  /** Further stretches after `value`, in one bar, such as started work after done
   *  work. `value` alone is what the bar reads as to assistive technology. */
  segments?: ReadonlyArray<ProgressSegment> | undefined
  /** Beside the label in place of the percentage, such as "Completed". */
  status?: ReactNode
  /** How the value itself reads; without it, as a percentage of `max`. */
  format?: Intl.NumberFormatOptions | undefined
  /** `beside` the label, at the bar's `end` on the same row, or `none`. */
  showValue?: Exclude<BarValuePlacement, 'tooltip'> | undefined
  /** The value as shown, from its formatted text, such as "3 of 8 done, 38%". */
  valueText?: ((formatted: string | null, value: number | null) => ReactNode) | undefined
  /** The value as read by assistive technology. */
  getAriaValueText?: ((formatted: string | null, value: number | null) => string) | undefined
}) {
  const end = showValue === 'end'
  const shownValue =
    status ??
    (showValue === 'none' ? null : (
      <Progress.Value
        className={end ? endValueClassName : 'shrink-0 tabular-nums theme-muted-text'}
      >
        {valueText}
      </Progress.Value>
    ))
  const stacked = value !== null && segments !== undefined && segments.length > 0
  const track = (
    <Progress.Track className={cx(trackClasses(size, end, trackClassName), stacked && 'flex')}>
      <Progress.Indicator
        className={cx(
          'h-full transition-[width] duration-300 motion-reduce:transition-none',
          'data-indeterminate:w-1/3 data-indeterminate:animate-pulse',
          // Stacked stretches meet square, inside the track's own rounded ends.
          stacked ? 'shrink-0' : 'rounded-full',
          fillClassName[tone],
        )}
      />
      {stacked && <Segments segments={segments} from={value} max={max} />}
    </Progress.Track>
  )
  return (
    <Progress.Root
      value={value}
      max={max}
      format={format}
      locale={locale}
      getAriaValueText={getAriaValueText}
      aria-label={ariaLabel}
      className={cx('min-w-0', className)}
    >
      {(label !== undefined || (!end && status !== undefined)) && (
        <div className={labelRowClassName}>
          <Progress.Label className="min-w-0 truncate theme-muted-text">{label}</Progress.Label>
          {!end && shownValue}
        </div>
      )}
      {end ? (
        <div className={endRowClassName}>
          {track}
          {shownValue}
        </div>
      ) : (
        track
      )}
      {detail !== undefined && <div className={detailClassName}>{detail}</div>}
    </Progress.Root>
  )
}

function Segments({
  segments,
  from,
  max,
}: {
  segments: ReadonlyArray<ProgressSegment>
  from: number
  max: number
}) {
  // Each stretch is cut to the room left in the track, so the bar never overflows.
  let used = Math.min(Math.max(from, 0), max)
  return segments.map((segment, index) => {
    const width = Math.min(Math.max(segment.value, 0), max - used)
    used += width
    return (
      <div
        // Stretches have no identity beyond their place in the bar.
        // biome-ignore lint/suspicious/noArrayIndexKey: see above
        key={index}
        aria-hidden="true"
        data-segment=""
        className={cx(
          'h-full shrink-0 transition-[width] duration-300 motion-reduce:transition-none',
          fillClassName[segment.tone ?? 'accent'],
          segment.subtle && 'opacity-60',
        )}
        style={{ width: `${(width / (max || 1)) * 100}%` }}
      />
    )
  })
}

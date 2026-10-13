import { DateTime, Duration, type DurationObjectUnits } from 'luxon'

// Numbers read in the reader's own locale; the units stay the symbols everyone reads.
const sizeNumber = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 })
const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'] as const

/** A size in bytes the way a file list shows it: 512 B, 1.5 KB, 2.25 GB,
 *  counting in 1024s. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 1) {
    return `${sizeNumber.format(0)} B`
  }
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), BYTE_UNITS.length - 1)
  return `${sizeNumber.format(bytes / 1024 ** unit)} ${BYTE_UNITS[unit]}`
}

const countNumber = new Intl.NumberFormat(undefined, {
  notation: 'compact',
  maximumFractionDigits: 1,
})

/** A count short enough for a status line: 512, 1.2K, 3.4M. */
export function formatCount(n: number): string {
  return countNumber.format(n)
}

// Japanese has no narrow units and would fall back to English.
const UNIT_DISPLAY: Record<string, 'narrow' | 'short'> = { ja: 'short' }

/** A length of time to whole seconds, in the host's locale: 45s, 2m 13s,
 *  1d 2h. Takes milliseconds or a luxon Duration; the sign is dropped. */
export function formatDuration(value: number | Duration): string {
  const duration = typeof value === 'number' ? Duration.fromMillis(value) : value
  // shiftTo keeps the largest units whole; luxon's toHuman alone would print
  // "0 days, 0 hours, 3,723 seconds" (https://github.com/moment/luxon/issues/1134).
  const parts = duration.shiftTo('days', 'hours', 'minutes', 'seconds').toObject()
  if (parts.seconds !== undefined) {
    parts.seconds = Math.round(parts.seconds)
  }
  const shown = Object.fromEntries(
    Object.entries(parts)
      .filter(([, n]) => n !== 0)
      .map(([unit, n]) => [unit, Math.abs(n)]),
  ) as DurationObjectUnits
  const human = Duration.fromObject(
    Object.keys(shown).length > 0 ? shown : { seconds: 0 },
    duration.locale ? { locale: duration.locale } : {},
  )
  return human
    .toHuman({ unitDisplay: UNIT_DISPLAY[human.locale?.split('-')[0] ?? ''] ?? 'narrow' })
    .replaceAll(/[,、]/g, '')
}

/** A moment as an ISO string, milliseconds, a Date or a luxon DateTime. */
export type TimeValue = string | number | Date | DateTime | null | undefined

/** The moment `value` names, or null when it is missing or invalid. */
export function toDateTime(value: TimeValue): DateTime | null {
  if (value === null || value === undefined || value === '') {
    return null
  }
  const time =
    typeof value === 'string'
      ? DateTime.fromISO(value)
      : typeof value === 'number'
        ? DateTime.fromMillis(value)
        : value instanceof Date
          ? DateTime.fromJSDate(value)
          : value
  return time.isValid ? time : null
}

const DATE_TIME_STYLES = {
  date: DateTime.DATE_MED,
  short: DateTime.DATETIME_SHORT,
  medium: DateTime.DATETIME_MED,
  seconds: DateTime.DATETIME_MED_WITH_SECONDS,
} as const

/** A moment in the reader's locale: `date` reads "Mar 14, 2026", `short`
 *  "3/14/2026, 9:30 AM", `medium` "Mar 14, 2026, 9:30 AM", and `seconds` adds
 *  the seconds. Empty for a missing or invalid time. */
export function formatDateTime(
  value: TimeValue,
  style: keyof typeof DATE_TIME_STYLES = 'medium',
): string {
  return toDateTime(value)?.toLocaleString(DATE_TIME_STYLES[style]) ?? ''
}

/** Time left, rounded the way a countdown reads: whole seconds under a minute,
 *  minutes and seconds under an hour, then hours and minutes. Null once only a
 *  few seconds remain, for the caller's "almost done". */
export function formatTimeLeft(seconds: number): string | null {
  if (seconds < 5) {
    return null
  }
  const whole = seconds < 3600 ? Math.round(seconds) : Math.ceil(seconds / 60) * 60
  return formatDuration(whole * 1000)
}

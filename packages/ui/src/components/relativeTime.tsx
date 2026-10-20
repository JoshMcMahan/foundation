import { DateTime, Duration } from 'luxon'
import { type ReactNode, useRef, useState, useSyncExternalStore } from 'react'
import {
  type DateTimeStyle,
  formatDateTime,
  formatDuration,
  type TimeValue,
  toDateTime,
} from '../format'

export type { TimeValue }

import { type UIStrings, useLocale, useStrings } from './Provider'
import { Tooltip } from './Tooltip'

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY

// One clock for every live time on screen, rather than a timer per component.
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | undefined
let now = Date.now()

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (!timer) {
    // A render reads `now` before subscribing, so the first one may use a stale
    // time; React reads it again once subscribed and re-renders if it moved.
    now = Date.now()
    timer = setInterval(() => {
      now = Date.now()
      for (const notify of listeners) {
        notify()
      }
    }, SECOND)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      clearInterval(timer)
      timer = undefined
    }
  }
}

const stopped = () => () => {}

/** Something worked out from the time, kept current by one clock that ticks
 *  each second for every component reading it. A component re-renders only
 *  when what `select` returns changes, so a label reading "3h" sits still
 *  while the clock runs. `select` runs every tick, so keep it cheap; while
 *  `running` is false the component leaves the clock and `select` sees the
 *  last tick's time. */
export function useClock<T>(select: (now: number) => T, running = true): T {
  const snapshot = () => select(now)
  return useSyncExternalStore(running ? subscribe : stopped, snapshot, snapshot)
}

/** `long` reads "5 minutes ago" or "yesterday" in the host's locale (UIProvider's `locale`);
 *  `compact` reads "5m", "in 3h", then a date such as "Sep 4" once a week away, for a row with
 *  little room. */
export type RelativeTimeFormat = 'long' | 'compact'

function compactLabel(at: number, age: number, t: UIStrings['time'], locale?: string): string {
  const size = Math.abs(age)
  if (size >= WEEK) {
    return t.date(new Date(at), locale)
  }
  const minutes = Math.floor(size / MINUTE)
  if (minutes < 1) {
    return t.now
  }
  const hours = Math.floor(minutes / 60)
  const label =
    minutes < 60 ? t.minutes(minutes) : hours < 24 ? t.hours(hours) : t.days(Math.floor(hours / 24))
  return age < 0 ? t.inFuture(label) : label
}

// The largest unit that fits counts the label, as luxon's relative times do, though words such
// as "yesterday" and "next week" read in place of a count of one.
const LONG_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * DAY],
  ['month', 30 * DAY],
  ['week', WEEK],
  ['day', DAY],
  ['hour', HOUR],
  ['minute', MINUTE],
  ['second', SECOND],
]

// Built once per locale.
const relativeFormats = new Map<string, Intl.RelativeTimeFormat>()
function longLabel(age: number, locale: string | undefined): string {
  // Without the host's locale, luxon's default, which a host may have set, else the browser's.
  const tag = locale ?? DateTime.now().locale ?? 'en-US'
  let format = relativeFormats.get(tag)
  if (!format) {
    format = new Intl.RelativeTimeFormat(tag, { numeric: 'auto' })
    relativeFormats.set(tag, format)
  }
  const size = Math.abs(age)
  const [unit, length] = LONG_UNITS.find(([, length]) => size >= length) ?? ['second', SECOND]
  return format.format(-Math.trunc(age / length), unit)
}

// Both formats count whole units of the largest one that fits, so a label can
// change only when the age crosses one of these.
function unitOf(age: number) {
  const size = Math.abs(age)
  return size < MINUTE ? SECOND : size < HOUR ? MINUTE : size < DAY ? HOUR : DAY
}

/** How long ago, or until, `value` is, kept current as time passes. Empty for
 *  a missing or invalid time. */
export function useRelativeTime(value: TimeValue, format: RelativeTimeFormat = 'long'): string {
  const t = useStrings().time
  const locale = useLocale()
  const time = toDateTime(value)
  const at = time?.toMillis() ?? null
  const last = useRef<{ key: string; label: string } | null>(null)
  return useClock((current) => {
    if (at === null) {
      return ''
    }
    const age = current - at
    const unit = unitOf(age)
    const key = `${format}:${locale}:${at}:${unit}:${Math.trunc(age / unit)}`
    if (last.current?.key !== key) {
      // The shared clock ticks once a second, so a time just recorded can sit a moment ahead of it.
      const label =
        format === 'compact'
          ? compactLabel(at, age, t, locale)
          : Math.abs(age) < SECOND
            ? t.now
            : longLabel(age, locale)
      last.current = { key, label }
    }
    return last.current.label
  }, at !== null)
}

export interface RelativeTimeProps {
  value: TimeValue
  format?: RelativeTimeFormat | undefined
  /** Shown in place of a missing or invalid time, such as "Never" or "—". Default nothing. */
  fallback?: ReactNode
  /** How the exact time reads: in the tooltip, or in the text with `show="absolute"`. Default
   *  `seconds`; `full` adds the time zone. False leaves out the tooltip. */
  exact?: DateTimeStyle | false | undefined
  /** `absolute` shows the exact time, with the relative one on hover, for a record read for
   *  its moment rather than its age. Default `relative`. */
  show?: 'relative' | 'absolute' | undefined
  className?: string | undefined
}

/** A time shown relative to now ("5 minutes ago", or "5m" compact), counting
 *  on while it stays on screen, with the exact time on hover. Renders the
 *  `fallback`, or nothing, for a missing time. */
export function RelativeTime({
  value,
  format = 'long',
  fallback = null,
  exact = 'seconds',
  show = 'relative',
  className,
}: RelativeTimeProps) {
  const label = useRelativeTime(value, format)
  const locale = useLocale()
  const time = toDateTime(value)
  if (!label || !time) {
    return fallback
  }
  const absolute = formatDateTime(time, exact || 'seconds', locale)
  const [text, tip] = show === 'absolute' ? [absolute, label] : [label, exact ? absolute : null]
  const element = (
    <time dateTime={time.toISO() ?? undefined} className={className}>
      {text}
    </time>
  )
  return tip ? <Tooltip content={tip}>{element}</Tooltip> : element
}

/** Milliseconds from `start` to `end`, or to now while `running`, in whole
 *  seconds so it changes at most once a second. Running defaults to having no
 *  end; pass false for something that stopped without recording when. Null
 *  without a start. */
export function useElapsed(
  start: TimeValue,
  end?: TimeValue,
  running: boolean = toDateTime(end) === null,
): number | null {
  const from = toDateTime(start)?.toMillis() ?? null
  const to = toDateTime(end)?.toMillis() ?? null
  // A stopped clock holds its last tick, which predates this component when it
  // never ran here, so something that stopped without an end reads at least to
  // when it was first shown.
  const [shownAt] = useState(Date.now)
  return useClock(
    (current) =>
      from === null
        ? null
        : Math.max(0, Math.floor(((to ?? Math.max(current, shownAt)) - from) / SECOND) * SECOND),
    from !== null && to === null && running,
  )
}

/** How long something took, or has taken so far while it runs: 45s, 2m 13s.
 *  Renders nothing without a start. */
export function Elapsed({
  start,
  end,
  running,
  className,
}: {
  start: TimeValue
  end?: TimeValue
  running?: boolean
  className?: string
}) {
  const elapsed = useElapsed(start, end, running)
  const locale = useLocale()
  if (elapsed === null) {
    return null
  }
  return (
    <time dateTime={Duration.fromMillis(elapsed).toISO() ?? undefined} className={className}>
      {formatDuration(elapsed, locale)}
    </time>
  )
}

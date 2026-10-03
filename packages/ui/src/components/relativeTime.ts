import { DateTime } from 'luxon'
import { useEffect, useState } from 'react'
import { useStrings } from './Provider'

const TICK_MS = 30000

function compactRelativeMinutes(
  minutes: number,
  t: {
    now: string
    minutes: (n: number) => string
    hours: (n: number) => string
    days: (n: number) => string
    years: (n: number) => string
  },
): string {
  if (!Number.isFinite(minutes) || minutes < 1) {
    return t.now
  }
  if (minutes < 60) {
    return t.minutes(minutes)
  }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return t.hours(hours)
  }
  const days = Math.floor(hours / 24)
  if (days < 365) {
    return t.days(days)
  }
  return t.years(Math.floor(days / 365))
}

/** A clock that re-reads itself, so "5m" ages while the page sits open, with
 *  the abbreviated form a row has room for. */
export function useRelativeTime(): {
  now: DateTime
  compact: (iso: string | undefined) => string
  compactMinutes: (minutes: number) => string
} {
  const t = useStrings().time
  const [now, setNow] = useState(() => DateTime.now())
  useEffect(() => {
    const id = setInterval(() => setNow(DateTime.now()), TICK_MS)
    return () => clearInterval(id)
  }, [])
  const compactMinutes = (minutes: number) => compactRelativeMinutes(minutes, t)
  return {
    now,
    compactMinutes,
    compact: (iso) =>
      iso ? compactMinutes(Math.floor(now.diff(DateTime.fromISO(iso)).as('minutes'))) : '',
  }
}

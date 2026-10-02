import { Duration } from 'luxon'

// D-HH, D-HH:MM, D-HH:MM:SS (HH capped at 23 when days are present)
const WITH_DAYS = /^(\d+)-(\d{1,2})(?::(\d{1,2})(?::(\d{1,2}))?)?$/
// HH:MM:SS only — bare numbers and MM:SS are rejected: "5:00" reads as 5 hours
// to most users, and the MM:SS reading would silently make it 5 minutes.
const WITHOUT_DAYS = /^(\d+):(\d{1,2}):(\d{1,2})$/

export function parseDuration(text: string): number | null {
  const trimmed = text.trim()
  let days = 0
  let hours: number
  let minutes: number
  let seconds: number

  const withDays = trimmed.match(WITH_DAYS)
  if (withDays) {
    days = Number(withDays[1])
    hours = Number(withDays[2])
    minutes = Number(withDays[3] ?? 0)
    seconds = Number(withDays[4] ?? 0)
    if (hours > 23) {
      return null
    }
  } else {
    const withoutDays = trimmed.match(WITHOUT_DAYS)
    if (!withoutDays) {
      return null
    }
    hours = Number(withoutDays[1])
    minutes = Number(withoutDays[2])
    seconds = Number(withoutDays[3])
  }

  if (minutes > 59 || seconds > 59) {
    return null
  }
  return days * 86400 + hours * 3600 + minutes * 60 + seconds
}

export function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return ''
  }
  const parts = Duration.fromObject({
    seconds: Math.floor(totalSeconds),
  }).shiftTo('days', 'hours', 'minutes', 'seconds')
  const pad = (n: number) => String(n).padStart(2, '0')
  const time = `${pad(parts.hours)}:${pad(parts.minutes)}:${pad(parts.seconds)}`
  return parts.days > 0 ? `${parts.days}-${time}` : time
}

export const FLEX_MAX_DURATION_RANGE = { min: 600, max: 604800 }
export const FLEX_WAIT_TIME_RANGE = { min: 30, max: 604800 }
export const STANDARD_MAX_DURATION_RANGE = { min: 30, max: 10368000 }

const DURATION_PATH = /^partitions\[\d+\]\.(maxDuration|flexStartWaitTime|suspendTime)$/

interface PartitionDurations {
  provisioningMode?: unknown
  maxDuration?: unknown
  flexStartWaitTime?: unknown
}

export function collectPartitionDurationIssues(
  partitions: unknown[] | undefined,
  invalidDurationPaths: string[],
): string[] {
  const issues = new Set(invalidDurationPaths.filter((path) => DURATION_PATH.test(path)))
  ;(partitions ?? []).forEach((partition, i) => {
    const p = partition as PartitionDurations | undefined
    const check = (
      fieldName: 'maxDuration' | 'flexStartWaitTime',
      range: { min: number; max: number },
      required: boolean,
    ) => {
      const raw = p?.[fieldName]
      if (raw === undefined || raw === null || raw === '') {
        if (required) {
          issues.add(`partitions[${i}].${fieldName}`)
        }
        return
      }
      const value = Number(raw)
      if (!Number.isFinite(value) || value < range.min || value > range.max) {
        issues.add(`partitions[${i}].${fieldName}`)
      }
    }
    if (p?.provisioningMode === 'flex') {
      check('maxDuration', FLEX_MAX_DURATION_RANGE, true)
      check('flexStartWaitTime', FLEX_WAIT_TIME_RANGE, true)
    } else {
      check('maxDuration', STANDARD_MAX_DURATION_RANGE, false)
    }
  })
  return [...issues]
}

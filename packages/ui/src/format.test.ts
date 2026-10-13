import { DateTime, Duration } from 'luxon'
import { formatBytes, formatCount, formatDateTime, formatDuration, formatTimeLeft } from './format'

describe('formatBytes', () => {
  it('counts in 1024s with the largest unit that fits', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(5 * 1024 ** 3)).toBe('5 GB')
    expect(formatBytes(1.234567 * 1024 ** 2)).toBe('1.23 MB')
  })

  it('stops at its largest unit, and reads nonsense as nothing', () => {
    expect(formatBytes(2 * 1024 ** 6)).toBe('2,048 PB')
    expect(formatBytes(Number.NaN)).toBe('0 B')
    expect(formatBytes(-5)).toBe('0 B')
  })
})

describe('formatCount', () => {
  it('abbreviates thousands and millions', () => {
    expect(formatCount(512)).toBe('512')
    expect(formatCount(1234)).toBe('1.2K')
    expect(formatCount(3_400_000)).toBe('3.4M')
  })
})

describe('formatDuration', () => {
  it('reads milliseconds in whole units, largest first', () => {
    expect(formatDuration(0)).toBe('0s')
    expect(formatDuration(45_400)).toBe('45s')
    expect(formatDuration(133_000)).toBe('2m 13s')
    expect(formatDuration(3_723_000)).toBe('1h 2m 3s')
    expect(formatDuration(3_600_000)).toBe('1h')
    expect(formatDuration(90_061_000)).toBe('1d 1h 1m 1s')
  })

  it('takes a luxon Duration, and drops the sign', () => {
    const start = DateTime.fromISO('2026-01-01T10:00:00Z')
    expect(formatDuration(start.plus({ minutes: 5 }).diff(start))).toBe('5m')
    expect(formatDuration(Duration.fromObject({ seconds: -30 }))).toBe('30s')
  })
})

describe('formatDateTime', () => {
  it('reads a time in the named style, and nothing for no time', () => {
    const at = DateTime.fromISO('2026-03-04T05:06:07Z')
    expect(formatDateTime(at)).toBe(at.toLocaleString(DateTime.DATETIME_MED))
    expect(formatDateTime(at.toISO(), 'date')).toBe(at.toLocaleString(DateTime.DATE_MED))
    expect(formatDateTime(at.toMillis(), 'seconds')).toBe(
      at.toLocaleString(DateTime.DATETIME_MED_WITH_SECONDS),
    )
    expect(formatDateTime(null)).toBe('')
    expect(formatDateTime('not a date')).toBe('')
  })
})

describe('formatTimeLeft', () => {
  it('counts down in whole seconds, then whole minutes past an hour', () => {
    expect(formatTimeLeft(4.9)).toBeNull()
    expect(formatTimeLeft(42.4)).toBe('42s')
    expect(formatTimeLeft(125)).toBe('2m 5s')
    expect(formatTimeLeft(3_601)).toBe('1h 1m')
  })
})

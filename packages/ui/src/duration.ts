import { type DateTime, Duration, type DurationObjectUnits } from 'luxon'

const UnitDisplay: Record<string, 'narrow' | 'short' | 'long'> = {
  // Japanese needs "short", narrow is not implemented and falls back to english
  ja: 'short',
}

export function durationToAbsHumanDuration(d: Duration): string {
  // Better Duration.toHuman support https://github.com/moment/luxon/issues/1134
  const duration = d.shiftTo('days', 'hours', 'minutes', 'seconds').toObject()

  if (duration.seconds !== undefined) {
    duration.seconds = Math.round(duration.seconds)
  }

  const cleanedDuration = Object.fromEntries(
    Object.entries(duration)
      .filter(([, value]) => value !== 0)
      .map(([key, value]) => [key, Math.abs(value)]),
  ) as DurationObjectUnits

  if (Object.keys(cleanedDuration).length === 0) {
    cleanedDuration.seconds = 0
  }

  const human = Duration.fromObject(cleanedDuration)
  const unitDisplay = UnitDisplay[human.locale] || 'narrow'

  const output = human.toHuman({
    unitDisplay: unitDisplay,
  })

  return output.replaceAll(/[,、]/g, '') // 、produced when using Chinese
}

export function toAbsHumanDuration(start: DateTime, end: DateTime): string {
  return durationToAbsHumanDuration(end.diff(start))
}

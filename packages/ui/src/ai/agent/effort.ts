// Faster to smarter. An empty effort leaves it to the model.
export const EFFORT_LEVELS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const

export type EffortLevel = (typeof EFFORT_LEVELS)[number]

export function isEffortLevel(value: string | null | undefined): value is EffortLevel {
  return EFFORT_LEVELS.some((level) => level === value)
}

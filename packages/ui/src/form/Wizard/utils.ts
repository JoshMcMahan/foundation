import type { ParsedWizardConfig, StepFieldConfig, WizardConfig } from './types'

function isWizardMeta(value: unknown): value is { wizard: WizardConfig } {
  return typeof value === 'object' && value !== null && 'wizard' in value
}

function isStepField(field: unknown): field is StepFieldConfig {
  return typeof field === 'object' && field !== null && 'type' in field && field.type === 'step'
}

export function parseWizardConfig(options: Record<string, unknown>): ParsedWizardConfig | null {
  const meta = options['$meta']
  const wizardConfig = isWizardMeta(meta) ? meta.wizard : undefined

  // Not a wizard form if no wizard config
  if (wizardConfig?.mode !== 'wizard') {
    return null
  }

  const steps: Record<string, StepFieldConfig> = {}
  const stepOrder: string[] = []

  for (const [key, field] of Object.entries(options)) {
    if (key !== '$meta' && isStepField(field)) {
      steps[key] = field
      stepOrder.push(key)
    }
  }

  // Must have at least one step
  if (stepOrder.length === 0) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Wizard mode enabled but no steps found')
    }
    return null
  }

  return {
    config: wizardConfig,
    steps,
    stepOrder,
  }
}

/** A step's title or description as one text: a list's first entry, as one copy shows it. */
export function stepText(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '')
}

/** A repeated page's bounds on its copies, read as a list's `min`/`max`; without a `min` it starts empty. */
export function copyBounds(min: unknown, max: unknown): { lo: number; hi: number | undefined } {
  const count = (value: unknown) => {
    const n = value === undefined || value === null || value === '' ? Number.NaN : Number(value)
    return Number.isInteger(n) && n >= 0 ? n : undefined
  }
  const lo = count(min) ?? 0
  const hi = count(max)
  return { lo, hi: hi === undefined ? undefined : Math.max(hi, lo) }
}

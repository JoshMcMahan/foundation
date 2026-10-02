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
  if (!wizardConfig || wizardConfig.mode !== 'wizard') {
    return null
  }

  const steps: Record<string, StepFieldConfig> = {}
  const stepOrder: string[] = []
  const otherFields: Record<string, unknown> = {}

  // Extract steps and other fields
  Object.entries(options).forEach(([key, field]) => {
    if (key === '$meta') {
      return
    }

    if (isStepField(field)) {
      steps[key] = field
      stepOrder.push(key)
    } else {
      otherFields[key] = field
    }
  })

  // Must have at least one step
  if (stepOrder.length === 0) {
    console.warn('Wizard mode enabled but no steps found')
    return null
  }

  return {
    config: wizardConfig,
    steps,
    stepOrder,
    otherFields,
  }
}

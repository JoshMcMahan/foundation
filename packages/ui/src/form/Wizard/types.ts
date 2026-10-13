import type { DynamicFormSchema, LabelPosition } from '../types/fieldTypes'

interface WizardNavigation {
  /** Show step indicator (dots with connecting lines) */
  showSteps?: boolean
  /** Allow clicking on completed steps to jump to them */
  allowJump?: boolean
  /** Hide step numbers in step dots, show only titles */
  hideStepNumbers?: boolean
}

/**
 * Wizard-specific configuration in $meta
 */
export interface WizardConfig {
  /** Must be 'wizard' to activate wizard mode */
  mode: 'wizard'
  /** Navigation UI options */
  navigation?: WizardNavigation
  /** Label for the final submit button */
  submitLabel?: string
  /** Flatten step fields into top-level inputs (default: true). Set false to preserve step keys as nested objects. */
  flatten?: boolean
}

export interface StepFieldConfig {
  /** Must be 'step' */
  type: 'step'
  /** Title shown in step indicator; a repeated page's can be one per copy */
  title: string | string[]
  /** Optional description/subtitle shown below title; a repeated page's can be one per copy */
  description?: string | string[]
  /** Schema for fields within this step */
  options: DynamicFormSchema
  /** Validate current step before proceeding to next (default: true) */
  validateOnNext?: boolean
  /** Custom label for next button on this step */
  nextLabel?: string
  /** Custom label for previous button on this step */
  prevLabel?: string
  /** The person running it can add copies of this page; its values are a list, one row per copy */
  multi?: boolean
  /** The fewest and most copies of a repeated page, as a list's rows: numbers or expressions */
  min?: number | string
  max?: number | string
}

/**
 * Extracted wizard configuration and step information
 */
export interface ParsedWizardConfig {
  /** Wizard configuration from $meta */
  config: WizardConfig
  /** Steps keyed by their field name */
  steps: Record<string, StepFieldConfig>
  /** Ordered list of step keys */
  stepOrder: string[]
}

/**
 * Props for WizardContainer component
 */
export interface WizardContainerProps {
  /** Parsed wizard configuration and steps */
  wizardConfig: ParsedWizardConfig
  /** Callback when wizard is submitted */
  onSubmit?: ((values: Record<string, unknown>) => void) | undefined
  /** Additional CSS classes */
  className?: string
  /** Label position for fields */
  labelPosition?: 'left' | 'top' | undefined
  /** Space compact mode */
  spaceCompact?: boolean
  /** A wizard inside a group submits with the form around it, so its last step has no submit. */
  nested?: boolean
  /** Where the fields' values sit when the wizard is inside a group that keeps its own values. */
  fieldNamePrefix?: string | undefined
}

/**
 * Props for WizardStepIndicator component
 */
export interface WizardStepIndicatorProps {
  /** Ordered list of step keys */
  stepOrder: string[]
  /** Current step key */
  currentStep: string
  /** Steps configuration */
  steps: Record<string, StepFieldConfig>
  /** Set of visited step keys */
  visitedSteps: Set<string>
  /** Set of invalid step keys */
  invalidSteps: Set<string>
  /** Callback when a step the user may jump to is clicked */
  onStepClick: (stepKey: string) => boolean
  /** Whether clicking completed steps is allowed */
  allowJump?: boolean | undefined
  /** Hide step numbers */
  hideStepNumbers?: boolean | undefined
}

/**
 * Props for WizardNavigation component
 */
export interface WizardNavigationProps {
  /** Whether the wizard is on its last step, which submits instead of going next */
  isLastStep: boolean
  /** Whether user can go back */
  canGoBack: boolean
  /** Whether current step is valid */
  isCurrentStepValid: boolean
  /** Custom label for next button */
  nextLabel?: string | undefined
  /** Custom label for previous button */
  prevLabel?: string | undefined
  /** Custom label for submit button (on last step) */
  submitLabel?: string
  /** Callback to go to next step */
  onNext: () => Promise<boolean>
  /** Callback to go to previous step */
  onPrevious: () => void
  /** Callback to submit wizard; without one the last step has no button of its own */
  onSubmit?: (() => Promise<void>) | undefined
}

/**
 * Props for WizardStepContent component
 */
export interface WizardStepContentProps {
  /** Current step key */
  currentStep: string
  /** Current step configuration */
  stepConfig: StepFieldConfig
  /** Label position for fields */
  labelPosition?: LabelPosition | undefined
  /** Space compact mode */
  spaceCompact?: boolean
  /** Where the fields' values sit when the wizard is inside a group that keeps its own values. */
  fieldNamePrefix?: string | undefined
  /** Which copy of a repeated page this is; its fields' values sit in that row of the page's list. */
  copy?: number | undefined
}

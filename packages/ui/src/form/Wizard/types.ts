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
  /** Use URL-based routing instead of component state */
  urlBased?: boolean
  /** Flatten step fields into top-level inputs (default: true). Set false to preserve step keys as nested objects. */
  flatten?: boolean
}

export interface StepFieldConfig {
  /** Must be 'step' */
  type: 'step'
  /** Title shown in step indicator */
  title: string
  /** Optional description/subtitle shown below title */
  description?: string
  /** Schema for fields within this step */
  options: DynamicFormSchema
  /** Validate current step before proceeding to next (default: true) */
  validateOnNext?: boolean
  /** Allow skipping this step without validation */
  canSkip?: boolean
  /** Custom label for next button on this step */
  nextLabel?: string
  /** Custom label for previous button on this step */
  prevLabel?: string
  /** Optional tooltip text */
  tooltip?: string | string[]
  /** Hidden field support */
  hidden?: boolean
  /** Disable this step */
  disabled?: boolean
}

/**
 * Internal wizard state managed by useWizardState hook
 */
export interface WizardState {
  /** Current step ID/key */
  currentStep: string
  /** Set of step IDs that have been visited */
  visitedSteps: Set<string>
  /** Set of step IDs that have validation errors */
  invalidSteps: Set<string>
  /** List of all step keys in order */
  stepOrder: string[]
  /** Total number of steps */
  totalSteps: number
  /** Whether the wizard is on the last step */
  isLastStep: boolean
  /** Whether the wizard can proceed to next step */
  canProceedToNext: boolean
  /** Whether user can go back */
  canGoBack: boolean
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
  /** Schema for non-step fields (should be none in pure wizard) */
  otherFields: Record<string, unknown>
}

/**
 * Wizard navigation parameters
 */
/**
 * Props for WizardContainer component
 */
export interface WizardContainerProps {
  /** Parsed wizard configuration and steps */
  wizardConfig: ParsedWizardConfig
  /** Current form values */
  values: Record<string, unknown>
  /** Callback when values change */
  onChange?: (values: Record<string, unknown>) => void
  /** Callback when wizard is submitted */
  onSubmit?: ((values: Record<string, unknown>) => void) | undefined
  /** Additional CSS classes */
  className?: string
  /** Label position for fields */
  labelPosition?: 'left' | 'top' | undefined
  /** Missing fields list */
  missingFields?: string[]
  /** Space compact mode */
  spaceCompact?: boolean
  /** Workflow form mode */
  workflowForm?: boolean
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
  /** Callback when step is clicked */
  onStepClick?: (stepKey: string) => boolean
  /** Whether clicking completed steps is allowed */
  allowJump?: boolean | undefined
  /** Hide step numbers */
  hideStepNumbers?: boolean | undefined
}

/**
 * Props for WizardNavigation component
 */
export interface WizardNavigationProps {
  /** Current step key */
  currentStep: string
  /** List of step keys in order */
  stepOrder: string[]
  /** Whether user can go to next step */
  canGoToNext: boolean
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
  /** Callback to submit wizard */
  onSubmit: () => Promise<void>
}

/**
 * Props for WizardStepContent component
 */
export interface WizardStepContentProps {
  /** Current step key */
  currentStep: string
  /** Current step configuration */
  stepConfig: StepFieldConfig
  /** Form values */
  values: Record<string, unknown>
  /** Update form values */
  onValuesChange?: ((values: Record<string, unknown>) => void) | undefined
  /** Label position for fields */
  labelPosition?: LabelPosition | undefined
  /** Missing fields list */
  missingFields?: string[]
  /** Space compact mode */
  spaceCompact?: boolean
  /** Workflow form mode */
  workflowForm?: boolean
}

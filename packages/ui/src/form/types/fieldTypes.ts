export type LabelPosition = 'left' | 'top'

/** A flag a field may set literally or as an expression the engine resolves. */
export type FieldFlag = string | boolean

/** NOT part of the workflow JSON schema — added by the form system at runtime. */
export interface RuntimeFieldExtensions {
  name?: string // Added at runtime
  description?: string
  showInUI?: boolean
  noCollapse?: boolean
  enable_if?: string | boolean
  show_if?: string
  show_if_not?: string
  depends_on?: string
  secondaryField?: string | string[]
  one_must_be_true?: boolean
  computeOn?: boolean
  labelPosition?: LabelPosition
  resetOnChange?: boolean
  options?: unknown // Runtime-provided options override
}

export interface BaseField extends RuntimeFieldExtensions {
  type: string
  label?: string
  tooltip?: string | string[]
  hidden?: FieldFlag
  optional?: FieldFlag
  ignore?: FieldFlag
  collapsed?: boolean
  disabled?: boolean
  default?: unknown
}

type AnyField = BaseField

interface WizardConfig {
  /** Must be 'wizard' to activate wizard mode */
  mode: 'wizard'
  /** Navigation UI options */
  navigation?: {
    showSteps?: boolean
    allowJump?: boolean
    hideStepNumbers?: boolean
  }
  /** Label for the final submit button */
  submitLabel?: string
  /** Flatten step fields into top-level inputs (default: true). Set false to keep each step's fields under its key. */
  flatten?: boolean
}

interface StepField extends BaseField {
  type: 'step'
  title: string
  description?: string
  options: Record<string, AnyField>
  validateOnNext?: boolean
  nextLabel?: string
  prevLabel?: string
}

export interface DynamicFormSchema {
  $meta?: {
    labelPosition?: LabelPosition
    spaceCompact?: boolean
    wizard?: WizardConfig
  }
  [fieldName: string]: AnyField | StepField | DynamicFormSchema['$meta'] | undefined
}

import type { TSetFormDirty } from '../Form'
import type { BaseField, LabelPosition, RuntimeFieldExtensions } from './fieldTypes'

/** Intentionally loose to allow both manual types and schema-generated types. */
interface FieldBase {
  type?: string
  label?: string
  hidden?: boolean | string
  disabled?: boolean | string
  optional?: boolean | string
  ignore?: boolean | string
  tooltip?: string | string[]
  default?: unknown
}

export interface FieldComponentProps<TField extends FieldBase = FieldBase, TValue = unknown> {
  field: TField
  label: string
  labelPosition: LabelPosition
  missing: boolean
  missingFields: string[]
  values: Record<string, unknown>
  setFormDirty: TSetFormDirty
  onChange?: ((val: unknown) => void) | undefined
  disabled: boolean
  computeOn?: boolean | undefined
  spaceCompact?: boolean
  tooltipComponent?: React.ReactNode
  workflowForm?: boolean
  /*-- Formik Context fields --*/
  currentValue: TValue
  setFieldValue?: (field: string, value: unknown, shouldValidate?: boolean) => void
  setFieldTouched?: (field: string, isTouched?: boolean, shouldValidate?: boolean) => void
}

/** Props for a field component, given the field definition it renders. */
export type FieldProps<
  TField extends FieldBase = BaseField,
  TValue = unknown,
> = FieldComponentProps<TField & RuntimeFieldExtensions, TValue>

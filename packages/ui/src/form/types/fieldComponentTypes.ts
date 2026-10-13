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

/**
 * What the form hands a field component. The field binds to its own value by `field.name`, with
 * `useFieldValue` or react-hook-form's `useController`, and reads any other with `useWatch`, so it
 * renders again only when what it reads changes.
 */
export interface FieldComponentProps<TField extends FieldBase = FieldBase> {
  field: TField
  label: string
  labelPosition: LabelPosition
  /** The form marks the field as missing a value. */
  missing: boolean
  onChange?: ((val: unknown) => void) | undefined
  disabled: boolean
  computeOn?: boolean | undefined
  spaceCompact?: boolean
  tooltipComponent?: React.ReactNode
}

/** Props for a field component, given the field definition it renders. */
export type FieldProps<TField extends FieldBase = BaseField> = FieldComponentProps<
  TField & RuntimeFieldExtensions
>

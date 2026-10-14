import type { BaseField, LabelPosition, RuntimeFieldExtensions } from './fieldTypes'

/** Intentionally loose to allow both manual types and schema-generated types. */
interface FieldBase {
  type?: string
  label?: string
  description?: string
  hidden?: boolean | string
  disabled?: boolean | string
  optional?: boolean | string
  ignore?: boolean | string
  tooltip?: string | string[]
  default?: unknown
}

/**
 * What the form hands a field component. The field binds to its own value by `field.name`, with
 * `useFieldValue`, which also gives the form its rules, and reads any other with `useWatch`, so it
 * renders again only when what it reads changes.
 */
export interface FieldComponentProps<TField extends FieldBase = FieldBase> {
  field: TField
  label: string
  labelPosition: LabelPosition
  /** What the form found wrong with the field's value, such as a value it needs or one the server
   *  rejected, shown under it; undefined while it has nothing to say. */
  error?: string | undefined
  onChange?: ((val: unknown) => void) | undefined
  disabled: boolean
  computeOn?: boolean | undefined
  spaceCompact?: boolean
  /** The field's help text, from its `tooltip`: `fieldFrame` puts it behind a ? beside the label. */
  help?: string | undefined
}

/** Props for a field component, given the field definition it renders. */
export type FieldProps<TField extends FieldBase = BaseField> = FieldComponentProps<
  TField & RuntimeFieldExtensions
>

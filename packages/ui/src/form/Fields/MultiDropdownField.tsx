import { Field } from 'formik'
import { FieldWrapper } from '../FieldWrapper'
import { MultiSelectionDropdown } from '../Form'
import type { FieldComponentProps } from '../types/fieldComponentTypes'
import type { BaseField } from '../types/fieldTypes'

export interface IMultiDropdownField extends BaseField {
  type: 'multi-dropdown'
  options:
    | Array<
        | string
        | {
            label: string
            value: string | boolean | number
            secondaryLabel?: string
            selected?: boolean
          }
      >
    | Record<
        string,
        Array<
          | string
          | {
              label: string
              value: string | boolean | number
              secondaryLabel?: string
              selected?: boolean
            }
        >
      >
  parentValue?: string | boolean | number
}

export default function MultiDropdownField({
  field,
  label,
  tooltipComponent,
  labelPosition,
  spaceCompact,
  disabled,
  missing,
  setFormDirty,
  onChange,
}: FieldComponentProps<IMultiDropdownField>) {
  // The form names every field before it renders one.
  const fieldName = field.name ?? ''
  // Handle depends_on logic
  let parentValue = field.parentValue
  let options = field.options

  if (field.depends_on) {
    parentValue = field.depends_on

    if (!Array.isArray(field.options)) {
      options = field.options[parentValue as string] || []
    }
  }

  return (
    <FieldWrapper
      optional={field.optional}
      label={label}
      tooltipComponent={tooltipComponent}
      labelPosition={labelPosition}
      spaceCompact={spaceCompact}
    >
      {({ id }) =>
        disabled ? (
          <Field
            className="theme-input h-7 w-full rounded border placeholder:text-xs"
            id={id}
            type="search"
            name={field.name}
            key={field.name}
            disabled={true}
            onChange={onChange}
          />
        ) : (
          <MultiSelectionDropdown
            key={field.name}
            name={fieldName}
            label={field.label || label}
            options={Array.isArray(options) ? options : []}
            setFormDirty={setFormDirty}
            parentValue={parentValue}
            onChange={onChange}
            invalid={missing}
          />
        )
      }
    </FieldWrapper>
  )
}

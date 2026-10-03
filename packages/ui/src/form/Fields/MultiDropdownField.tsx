import { Field } from 'formik'
import { FieldWrapper } from '../FieldWrapper'
import { MultiSelectionDropdown } from '../Form'
import type { FieldComponentProps } from '../types/fieldComponentTypes'
import type { BaseField } from '../types/fieldTypes'
import { dependentOptions } from '../utils/dependentOptions'

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
  values,
}: FieldComponentProps<IMultiDropdownField>) {
  // The form names every field before it renders one.
  const fieldName = field.name ?? ''
  const dependent = dependentOptions(field.options, field.depends_on, values)
  const { options } = dependent
  // A change of the value the options depend on clears the selection.
  const parentValue = field.depends_on ? dependent.parentValue : field.parentValue

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
            options={options}
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

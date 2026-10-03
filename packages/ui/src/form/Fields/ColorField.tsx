import { Field, useField, useFormikContext } from 'formik'
import type React from 'react'
import { FieldWrapper } from '../FieldWrapper'
import type { FieldComponentProps } from '../types/fieldComponentTypes'
import type { BaseField } from '../types/fieldTypes'

export interface IColorField extends BaseField {
  type: 'color'
  default?: string
}

export default function ColorField(props: FieldComponentProps<IColorField>) {
  const { field, label, labelPosition, onChange, tooltipComponent, spaceCompact } = props
  // The form names every field before it renders one.
  const fieldName = field.name ?? ''

  const [fieldState] = useField<string>(fieldName)
  const { setFieldValue, setFieldTouched } = useFormikContext()

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value

    onChange?.(val)
    setFieldTouched(fieldName, true)
    setFieldValue(fieldName, val)
  }

  return (
    <FieldWrapper
      optional={field.optional}
      label={label}
      tooltipComponent={tooltipComponent}
      labelPosition={labelPosition}
      spaceCompact={spaceCompact}
    >
      {({ id }) => (
        <Field
          className="theme-input h-8 w-18 rounded border border-neutral-400 placeholder:text-xs"
          id={id}
          name={field.name}
          value={fieldState.value || '#fbbf24'}
          type="color"
          aria-required={field.optional ? undefined : true}
          onChange={handleChange}
        />
      )}
    </FieldWrapper>
  )
}

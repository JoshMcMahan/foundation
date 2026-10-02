import { useField, useFormikContext } from 'formik'
import { useEffect } from 'react'
import { FieldWrapper } from '../FieldWrapper'
import { FormikCustomInput, FormikNumericInput } from '../SpecialTypes'
import type { FieldComponentProps } from '../types/fieldComponentTypes'
import type { BaseField } from '../types/fieldTypes'
import { getPlaceholder } from '../utils/getPlaceholder'

export interface INumberField extends BaseField {
  type: 'number'
  default?: number
  prefillDefault?: boolean
  min?: number
  max?: number
  step?: number
  placeholder?: string
  thousandsSeparator?: boolean
}

export default function NumberField(props: FieldComponentProps<INumberField>) {
  const {
    field,
    label,
    labelPosition,
    missing,
    disabled,
    onChange,
    tooltipComponent,
    spaceCompact,
  } = props

  const [fieldState] = useField<number | string | undefined>(field.name!)
  const { setFieldValue } = useFormikContext()
  // With prefillDefault, seed the form value with the default (not just the placeholder) when it's
  // unset — e.g. gpuCount needs to actually hold 1, since the cost estimate prices the attached GPU
  // off the form value and would otherwise show the bare-VM price until the field is touched.
  useEffect(() => {
    if (
      field.prefillDefault &&
      field.default !== undefined &&
      (fieldState.value === undefined || fieldState.value === null || fieldState.value === '')
    ) {
      setFieldValue(field.name!, field.default)
    }
  }, [field.prefillDefault, field.default, field.name, fieldState.value, setFieldValue])

  return (
    <FieldWrapper
      optional={field.optional}
      label={label}
      tooltipComponent={tooltipComponent}
      labelPosition={labelPosition}
      spaceCompact={spaceCompact}
    >
      {field.thousandsSeparator ? (
        <FormikNumericInput
          invalid={missing}
          key={field.name}
          name={field.name!}
          placeholder={getPlaceholder(field.placeholder, field.default)}
          disabled={disabled}
          min={field.min}
          max={field.max}
          {...(onChange && { onChange })}
        />
      ) : (
        <FormikCustomInput
          invalid={missing}
          key={field.name}
          name={field.name!}
          type="number"
          placeholder={getPlaceholder(field.placeholder, field.default)}
          disabled={disabled}
          step={field.step}
          min={field.min}
          max={field.max}
          defaultValue={field.default}
          {...(onChange && { onChange })}
        />
      )}
    </FieldWrapper>
  )
}

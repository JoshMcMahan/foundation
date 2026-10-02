import cx from 'classnames'
import { Field, useField, useFormikContext } from 'formik'
import type React from 'react'
import { FieldWrapper } from '../FieldWrapper'
import type { FieldComponentProps } from '../types/fieldComponentTypes'
import type { BaseField } from '../types/fieldTypes'

export interface IRangeField extends BaseField {
  type: 'range'
  default?: number
  min: number
  max: number
  step?: number
}

export default function RangeField(props: FieldComponentProps<IRangeField>) {
  const {
    field,
    label,
    labelPosition,
    disabled,
    onChange,
    tooltipComponent,
    spaceCompact,
    setFormDirty,
  } = props

  const [fieldState] = useField<string | number>(field.name!)
  const { setFieldValue, setFieldTouched } = useFormikContext()

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.valueAsNumber
    if (!isNaN(val)) {
      val = Math.max(field.min, Math.min(field.max, val))
      setFieldValue(field.name!, val)
      if (onChange) {
        onChange(val)
      }
      setFieldTouched(field.name!, true)
      setFormDirty(true)
    }
  }

  // Seed an unset field with its configured default, not the minimum — e.g. flexStartWaitTime defaults
  // to 300s, and seeding the 30s min would silently give flex jobs a far-too-short capacity budget.
  const seedValue = field.default ?? field.min
  if ((fieldState.value === undefined || fieldState.value === null) && seedValue !== undefined) {
    setFieldValue(field.name!, seedValue)
  }

  const currentValue = fieldState.value !== undefined ? fieldState.value : seedValue

  return (
    <FieldWrapper
      optional={field.optional}
      label={label}
      tooltipComponent={tooltipComponent}
      labelPosition={labelPosition}
      spaceCompact={spaceCompact}
    >
      {({ id, labelId }) => (
        <div className="flex items-center">
          <Field
            className={cx(
              'theme-input h-7 w-1/3 mr-5 text-center rounded border',
              disabled && 'disabled',
            )}
            id={id}
            type="number"
            value={currentValue}
            min={field.min}
            max={field.max}
            step={field.step || 1}
            disabled={disabled}
            onChange={handleChange}
          />
          <Field
            className={cx('rounded w-full', disabled && 'disabled')}
            name={field.name}
            value={currentValue}
            type="range"
            aria-labelledby={labelId}
            aria-required={field.optional ? undefined : true}
            min={field.min}
            max={field.max}
            step={field.step || 1}
            disabled={disabled}
            onChange={handleChange}
          />
        </div>
      )}
    </FieldWrapper>
  )
}

import cx from 'classnames'
import { Field, useFormikContext } from 'formik'
import type React from 'react'
import { useId } from 'react'
import { FieldWrapper } from '../FieldWrapper'
import type { FieldComponentProps } from '../types/fieldComponentTypes'
import type { BaseField } from '../types/fieldTypes'

export interface IRadioField extends BaseField {
  type: 'radio'
  options?: string[]
  optionLabelPosition?: 'left' | 'top'
}

export default function RadioField(props: FieldComponentProps<IRadioField>) {
  const {
    field,
    label,
    labelPosition,
    missing,
    disabled,
    onChange,
    tooltipComponent,
    spaceCompact,
    setFormDirty,
  } = props

  const uid = useId()
  const { setFieldValue, setFieldTouched } = useFormikContext()

  const handleChange = (val: string) => {
    if (disabled) {
      return
    }
    if (onChange) {
      onChange(val)
    }
    setFieldTouched(field.name!, true)
    setFieldValue(field.name!, val)
    setFormDirty(true)
  }

  return (
    <FieldWrapper
      optional={field.optional}
      label={label}
      tooltipComponent={tooltipComponent}
      labelPosition={labelPosition}
      spaceCompact={spaceCompact}
    >
      {({ labelId, describedBy }) => (
        <div
          role="radiogroup"
          aria-labelledby={labelId}
          aria-describedby={describedBy}
          aria-required={field.optional ? undefined : true}
          className={cx('flex', field.optionLabelPosition === 'top' ? 'flex-col' : 'flex-row')}
        >
          {field.options?.map((option) => (
            <label key={field.name + option} htmlFor={`${uid}-${option}`} className="capitalize">
              <Field
                id={`${uid}-${option}`}
                className={cx('theme-input mr-1', disabled && 'disabled', missing && 'invalid')}
                name={field.name}
                type="radio"
                value={option}
                disabled={disabled}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  handleChange(e.target.value)
                }}
              />
              {option}
            </label>
          ))}
        </div>
      )}
    </FieldWrapper>
  )
}

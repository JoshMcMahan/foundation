import { clsx as cx } from 'clsx'
import { Radio, RadioGroup } from '../../components/Radio'
import { FieldWrapper } from '../FieldWrapper'
import type { FieldComponentProps } from '../types/fieldComponentTypes'
import type { BaseField } from '../types/fieldTypes'
import { useFieldValue } from '../useFieldValue'
import { fieldOption } from './fieldOption'

export interface IRadioField extends BaseField {
  type: 'radio'
  options?: Array<string | number | { label?: string; value: string | number }>
  optionLabelPosition?: 'left' | 'top'
}

export default function RadioField({
  field,
  label,
  labelPosition,
  missing,
  disabled,
  onChange,
  tooltipComponent,
  spaceCompact,
}: FieldComponentProps<IRadioField>) {
  // The form names every field before it renders one.
  const [value, change] = useFieldValue<unknown>(field.name ?? '')
  const options = (field.options ?? []).map((raw) => ({
    ...fieldOption(raw),
    // An option without a label of its own shows capitalized, as radio options always have.
    unlabelled: typeof raw !== 'object' || raw.label === undefined,
  }))

  return (
    <FieldWrapper
      optional={field.optional}
      label={label}
      tooltipComponent={tooltipComponent}
      labelPosition={labelPosition}
      spaceCompact={spaceCompact}
    >
      {({ labelId, describedBy }) => (
        <RadioGroup
          aria-labelledby={labelId}
          aria-describedby={describedBy}
          name={field.name}
          required={!field.optional}
          disabled={disabled}
          // Options match as text, so a numeric option still matches a value held as text.
          value={value === undefined || value === null ? null : String(value)}
          onValueChange={(next) => {
            const picked = options.find((option) => option.value === next)?.raw
            onChange?.(picked)
            change(picked)
          }}
          className={cx(
            // py-1.5 centres the first row on the 34px field label beside it.
            'flex py-1.5',
            field.optionLabelPosition === 'top'
              ? 'flex-col gap-2'
              : 'flex-row flex-wrap gap-x-5 gap-y-2',
          )}
        >
          {options.map((option) => (
            <label
              key={option.value}
              className={cx(
                'flex items-center gap-2',
                disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
              )}
            >
              <Radio value={option.value} aria-invalid={missing || undefined} />
              <span className={cx('theme-text', option.unlabelled && 'capitalize')}>
                {option.label}
              </span>
            </label>
          ))}
        </RadioGroup>
      )}
    </FieldWrapper>
  )
}

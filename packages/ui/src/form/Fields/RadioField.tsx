import { Field, FieldOption } from '../../components/Field'
import { Radio, RadioGroup } from '../../components/Radio'
import { cx } from '../../cx'
import { fieldFrame } from '../fieldFrame'
import type { FieldComponentProps } from '../types/fieldComponentTypes'
import type { BaseField } from '../types/fieldTypes'
import { useFieldValue } from '../useFieldValue'
import { fieldOption } from './fieldOption'

export interface IRadioField extends BaseField {
  type: 'radio'
  options?: Array<string | number | { label?: string; value: string | number }>
  optionLabelPosition?: 'left' | 'top'
}

export default function RadioField(props: FieldComponentProps<IRadioField>) {
  const { field, error, disabled, onChange } = props
  // The form names every field before it renders one.
  const [value, change] = useFieldValue<unknown>(field.name ?? '')
  const options = (field.options ?? []).map((raw) => ({
    ...fieldOption(raw),
    // An option without a label of its own shows capitalized, as radio options always have.
    unlabelled: typeof raw !== 'object' || raw.label === undefined,
  }))

  return (
    <Field {...fieldFrame(props, { group: true })}>
      {(control) => (
        <RadioGroup
          {...control}
          name={field.name}
          disabled={disabled}
          // Options match as text, so a numeric option still matches a value held as text.
          value={value === undefined || value === null ? null : String(value)}
          onValueChange={(next) => {
            const picked = options.find((option) => option.value === next)?.raw
            onChange?.(picked)
            change(picked)
          }}
          className={cx(
            // py-1.5 centers the first row on the 34px field label beside it.
            'flex py-1.5',
            field.optionLabelPosition === 'top'
              ? 'flex-col gap-2'
              : 'flex-row flex-wrap gap-x-5 gap-y-2',
          )}
        >
          {options.map((option) => (
            <FieldOption key={option.value} disabled={disabled} className="flex items-center gap-2">
              <Radio value={option.value} aria-invalid={error !== undefined || undefined} />
              <span className={cx('theme-text', option.unlabelled && 'capitalize')}>
                {option.label}
              </span>
            </FieldOption>
          ))}
        </RadioGroup>
      )}
    </Field>
  )
}

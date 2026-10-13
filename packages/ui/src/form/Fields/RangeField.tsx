import { clsx as cx } from 'clsx'
import { useEffect } from 'react'
import { useFormContext } from 'react-hook-form'
import { FieldWrapper } from '../FieldWrapper'
import type { FieldComponentProps } from '../types/fieldComponentTypes'
import type { BaseField } from '../types/fieldTypes'
import { useFieldValue } from '../useFieldValue'

export interface IRangeField extends BaseField {
  type: 'range'
  default?: number
  min: number
  max: number
  step?: number
}

export default function RangeField(props: FieldComponentProps<IRangeField>) {
  const { field, label, labelPosition, disabled, onChange, tooltipComponent, spaceCompact } = props
  // The form names every field before it renders one.
  const name = field.name ?? ''
  const [value, change] = useFieldValue<string | number | undefined | null>(name)
  const { setValue } = useFormContext()

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.valueAsNumber
    if (!Number.isNaN(val)) {
      val = Math.max(field.min, Math.min(field.max, val))
      change(val)
      onChange?.(val)
    }
  }

  // Seed an unset field with its configured default, not the minimum — e.g. flexStartWaitTime defaults
  // to 300s, and seeding the 30s min would silently give flex jobs a far-too-short capacity budget.
  const seedValue = field.default ?? field.min
  const seed = (value === undefined || value === null) && seedValue !== undefined
  useEffect(() => {
    if (seed) {
      setValue(name, seedValue)
    }
  }, [seed, seedValue, name, setValue])

  const currentValue = value ?? seedValue ?? ''

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
          <input
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
          <input
            className={cx('rounded w-full', disabled && 'disabled')}
            name={field.name}
            value={currentValue}
            type="range"
            aria-labelledby={labelId}
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

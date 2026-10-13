import { useEffect } from 'react'
import { useFormContext } from 'react-hook-form'
import { Field } from '../../components/Field'
import { NumberInput } from '../../components/NumberInput'
import { Slider } from '../../components/Slider'
import { fieldFrame } from '../fieldFrame'
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

/** A value held as text, as one read from a workflow's inputs may be, still places the slider. */
function toNumber(value: unknown): number | null {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  return typeof number === 'number' && Number.isFinite(number) ? number : null
}

export default function RangeField(props: FieldComponentProps<IRangeField>) {
  const { field, label, disabled, onChange } = props
  // The form names every field before it renders one.
  const name = field.name ?? ''
  const [value, change] = useFieldValue<string | number | undefined | null>(name)
  const { setValue } = useFormContext()

  const set = (next: number | null) => {
    if (next === null) {
      return
    }
    const clamped = Math.max(field.min, Math.min(field.max, next))
    change(clamped)
    onChange?.(clamped)
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

  const current = toNumber(value) ?? seedValue
  const step = field.step || 1

  return (
    <Field {...fieldFrame(props)}>
      {(control) => (
        <div className="flex items-center gap-4">
          <NumberInput
            {...control}
            name={field.name}
            value={current}
            onValueChange={set}
            min={field.min}
            max={field.max}
            step={step}
            disabled={disabled}
            className="w-28 shrink-0"
          />
          <Slider
            aria-label={label}
            value={current}
            onValueChange={set}
            min={field.min}
            max={field.max}
            step={step}
            disabled={disabled}
          />
        </div>
      )}
    </Field>
  )
}

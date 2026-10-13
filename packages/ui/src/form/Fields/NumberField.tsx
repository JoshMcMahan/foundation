import { useEffect } from 'react'
import { Field } from '../../components/Field'
import { NumberInput } from '../../components/NumberInput'
import { fieldFrame } from '../fieldFrame'
import type { FieldComponentProps } from '../types/fieldComponentTypes'
import type { BaseField } from '../types/fieldTypes'
import { useFieldValue } from '../useFieldValue'
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

/** A value held as text, as one read from a workflow's inputs may be, still shows as its number. */
function toNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return value
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

export default function NumberField(props: FieldComponentProps<INumberField>) {
  const { field, disabled, onChange } = props
  // The form names every field before it renders one.
  const [value, change] = useFieldValue<unknown>(field.name ?? '')

  // With prefillDefault, seed the form value with the default (not just the placeholder) when it's
  // unset — e.g. gpuCount needs to actually hold 1, since the cost estimate prices the attached GPU
  // off the form value and would otherwise show the bare-VM price until the field is touched.
  const unset = value === undefined || value === null || value === ''
  const seed = field.prefillDefault && unset ? field.default : undefined
  useEffect(() => {
    if (seed !== undefined) {
      change(seed)
    }
  }, [seed, change])

  return (
    <Field {...fieldFrame(props)}>
      {(control) => (
        <NumberInput
          {...control}
          name={field.name}
          value={toNumber(value)}
          onValueChange={(next) => {
            const number = next ?? undefined
            onChange?.(number)
            change(number)
          }}
          min={field.min}
          max={field.max}
          step={field.step}
          disabled={disabled}
          format={{ useGrouping: field.thousandsSeparator ?? false }}
          placeholder={getPlaceholder(field.placeholder, field.default)}
        />
      )}
    </Field>
  )
}

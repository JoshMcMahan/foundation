import { useEffect, useRef, useState } from 'react'
import { useFormContext } from 'react-hook-form'
import { Checkbox } from '../../components/Checkbox'
import { Field, FieldOption } from '../../components/Field'
import { fieldBox } from '../../components/fieldBox'
import { useStrings } from '../../components/Provider'
import { fieldFrame } from '../fieldFrame'
import type { FieldComponentProps } from '../types/fieldComponentTypes'
import type { BaseField } from '../types/fieldTypes'
import { useFieldValue } from '../useFieldValue'
import { formatDurationText, parseDurationText } from '../utils/duration'
import { setDurationValidity } from './durationValidity'

export interface IDurationField extends BaseField {
  type: 'duration'
  default?: number
  min?: number | string
  max?: number | string
  placeholder?: string
  disableValue?: number
  disableLabel?: string
}

const isNumericString = (value: unknown): boolean =>
  typeof value === 'string' && /^\d+$/.test(value.trim())

const toDisplay = (value: unknown): string => {
  if (typeof value === 'number') {
    return formatDurationText(value)
  }
  if (isNumericString(value)) {
    return formatDurationText(Number(value))
  }
  return ''
}

export default function DurationField(props: FieldComponentProps<IDurationField>) {
  const { field, disabled, onChange } = props
  const { form: t } = useStrings()
  // The form names every field before it renders one.
  const name = field.name ?? ''
  const [currentValue, change] = useFieldValue<number | string | undefined>(name)
  const { setValue } = useFormContext()
  const min = field.min !== undefined ? Number(field.min) : Number.NEGATIVE_INFINITY
  const max = field.max !== undefined ? Number(field.max) : Number.POSITIVE_INFINITY

  const disableValue = field.disableValue
  const hasDisableCheckbox = disableValue !== undefined && field.disableLabel !== undefined
  // Number() so a legacy string sentinel like "-1" also reads as checked; the
  // numeric-string normalizer below only matches unsigned digits.
  const isSentinel =
    hasDisableCheckbox && currentValue !== '' && Number(currentValue) === disableValue

  const [text, setText] = useState(() => toDisplay(currentValue))
  const focusedRef = useRef(false)

  // Legacy configs store numeric strings like "300"; normalize so the saved JSON
  // is a number. Unset fields seed the default, not the min — flexStartWaitTime
  // seeded with the 30s min would give flex jobs a far-too-short capacity budget.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only normalization/seeding
  useEffect(() => {
    if (isSentinel) {
      if (typeof currentValue !== 'number') {
        setValue(name, disableValue)
      }
    } else if (isNumericString(currentValue)) {
      setValue(name, Number(currentValue))
    } else if (
      (currentValue === undefined || currentValue === null || currentValue === '') &&
      typeof field.default === 'number'
    ) {
      setValue(name, field.default)
    }
  }, [])

  // Syncing while focused would clobber in-progress typing.
  useEffect(() => {
    if (!focusedRef.current) {
      setText(toDisplay(currentValue))
    }
  }, [currentValue])

  const trimmed = text.trim()
  const parsed = trimmed === '' ? null : parseDurationText(trimmed)
  let error: string | null = null
  if (!isSentinel && trimmed !== '') {
    if (parsed === null) {
      error = t.invalidDuration
    } else if (parsed < min || parsed > max) {
      error = Number.isFinite(max)
        ? t.durationOutOfRange(formatDurationText(Math.max(min, 0)), formatDurationText(max))
        : t.durationBelowMin(formatDurationText(Math.max(min, 0)))
    }
  }

  useEffect(() => {
    setDurationValidity(name, error === null)
  }, [name, error])

  useEffect(() => () => setDurationValidity(name, true), [name])

  const set = (val: number | '') => {
    change(val)
    onChange?.(val)
  }

  const handleDisableToggle = (checked: boolean) => {
    if (checked) {
      setText('')
      // The checkbox that calls this only renders when a disable value is set.
      if (disableValue !== undefined) {
        set(disableValue)
      }
    } else {
      set(typeof field.default === 'number' ? field.default : '')
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    setText(raw)
    const rawTrimmed = raw.trim()
    const value = rawTrimmed === '' ? '' : parseDurationText(rawTrimmed)
    // Invalid or out-of-range input never reaches the form; the registry blocks save.
    if (value === '' || (typeof value === 'number' && value >= min && value <= max)) {
      set(value)
    }
  }

  const handleFocus = () => {
    focusedRef.current = true
  }

  const handleBlur = () => {
    focusedRef.current = false
    if (trimmed === '') {
      setText('')
      set('')
    } else if (parsed !== null && parsed >= min && parsed <= max) {
      setText(formatDurationText(parsed))
      set(parsed)
    }
  }

  return (
    <Field {...fieldFrame(props)} error={error ?? props.error}>
      {(control) => (
        <>
          {!isSentinel && (
            <input
              {...control}
              data-1p-ignore
              className={fieldBox()}
              name={name}
              value={text}
              type="text"
              disabled={disabled}
              placeholder={field.placeholder ?? 'DD-HH:MM:SS'}
              onChange={handleChange}
              onFocus={handleFocus}
              onBlur={handleBlur}
            />
          )}
          {hasDisableCheckbox && (
            <FieldOption disabled={disabled} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={isSentinel}
                disabled={disabled}
                onCheckedChange={handleDisableToggle}
              />
              {field.disableLabel}
            </FieldOption>
          )}
        </>
      )}
    </Field>
  )
}

import cx from 'classnames'
import { memo, useEffect, useRef, useState } from 'react'
import { useStrings } from '../../components/Provider'
import { FieldWrapper } from '../FieldWrapper'
import type { FieldComponentProps } from '../types/fieldComponentTypes'
import type { BaseField } from '../types/fieldTypes'
import { formatDuration, parseDuration } from '../utils/duration'
import { setDurationValidity } from './durationValidity'

const DEBOUNCE_MS = 500

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
    return formatDuration(value)
  }
  if (isNumericString(value)) {
    return formatDuration(Number(value))
  }
  return ''
}

export default memo(function DurationField({
  field,
  label,
  labelPosition,
  missing,
  disabled,
  onChange,
  tooltipComponent,
  spaceCompact,
  setFormDirty,
  currentValue,
  setFieldValue,
  setFieldTouched,
}: FieldComponentProps<IDurationField, number | string | undefined>) {
  const { form: t } = useStrings()
  // The form names every field before it renders one.
  const name = field.name ?? ''
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
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)

  // Legacy configs store numeric strings like "300"; normalize so the saved JSON
  // is a number. Unset fields seed the default, not the min — flexStartWaitTime
  // seeded with the 30s min would give flex jobs a far-too-short capacity budget.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only normalization/seeding
  useEffect(() => {
    if (isSentinel) {
      if (typeof currentValue !== 'number') {
        setFieldValue?.(name, disableValue)
      }
    } else if (isNumericString(currentValue)) {
      setFieldValue?.(name, Number(currentValue))
    } else if (
      (currentValue === undefined || currentValue === null || currentValue === '') &&
      typeof field.default === 'number'
    ) {
      setFieldValue?.(name, field.default)
    }
  }, [])

  // Syncing while focused would clobber in-progress typing.
  useEffect(() => {
    if (!focusedRef.current) {
      setText(toDisplay(currentValue))
    }
  }, [currentValue])

  const trimmed = text.trim()
  const parsed = trimmed === '' ? null : parseDuration(trimmed)
  let error: string | null = null
  if (!isSentinel && trimmed !== '') {
    if (parsed === null) {
      error = t.invalidDuration
    } else if (parsed < min || parsed > max) {
      error = Number.isFinite(max)
        ? t.durationOutOfRange(formatDuration(Math.max(min, 0)), formatDuration(max))
        : t.durationBelowMin(formatDuration(Math.max(min, 0)))
    }
  }

  useEffect(() => {
    setDurationValidity(name, error === null)
  }, [name, error])

  useEffect(
    () => () => {
      setDurationValidity(name, true)
      clearTimeout(debounceRef.current ?? undefined)
    },
    [name],
  )

  const flushToFormik = (val: number | '') => {
    setFieldValue?.(name, val)
    onChange?.(val)
    setFieldTouched?.(name, true)
  }

  const handleDisableToggle = (checked: boolean) => {
    clearTimeout(debounceRef.current ?? undefined)
    setFormDirty(true)
    if (checked) {
      setText('')
      // The checkbox that calls this only renders when a disable value is set.
      if (disableValue !== undefined) {
        flushToFormik(disableValue)
      }
    } else {
      flushToFormik(typeof field.default === 'number' ? field.default : '')
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    setText(raw)
    setFormDirty(true)
    clearTimeout(debounceRef.current ?? undefined)
    const rawTrimmed = raw.trim()
    const value = rawTrimmed === '' ? '' : parseDuration(rawTrimmed)
    // Invalid or out-of-range input never reaches Formik; the registry blocks save.
    if (value === '' || (typeof value === 'number' && value >= min && value <= max)) {
      debounceRef.current = setTimeout(() => flushToFormik(value), DEBOUNCE_MS)
    }
  }

  const handleFocus = () => {
    focusedRef.current = true
  }

  const handleBlur = () => {
    focusedRef.current = false
    clearTimeout(debounceRef.current ?? undefined)
    if (trimmed === '') {
      setText('')
      flushToFormik('')
    } else if (parsed !== null && parsed >= min && parsed <= max) {
      setText(formatDuration(parsed))
      flushToFormik(parsed)
    }
  }

  return (
    <FieldWrapper
      optional={field.optional ?? false}
      label={label}
      tooltipComponent={tooltipComponent}
      labelPosition={labelPosition}
      spaceCompact={spaceCompact ?? false}
      {...(field.description !== undefined && {
        description: field.description,
      })}
    >
      {({ id, describedBy }) => (
        <>
          {!isSentinel && (
            <input
              data-1p-ignore
              className={cx(
                'w-full',
                disabled && 'disabled',
                (missing || error !== null) && 'invalid',
              )}
              id={id}
              aria-describedby={describedBy}
              name={name}
              value={text}
              type="text"
              aria-required={field.optional ? undefined : true}
              disabled={disabled}
              placeholder={field.placeholder ?? 'DD-HH:MM:SS'}
              onChange={handleChange}
              onFocus={handleFocus}
              onBlur={handleBlur}
            />
          )}
          {error && <div className="text-xs text-red-500 mt-1">{error}</div>}
          {hasDisableCheckbox && (
            <label
              className={cx(
                'flex items-center gap-2 mt-1',
                disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
              )}
            >
              <input
                type="checkbox"
                checked={isSentinel}
                disabled={disabled}
                onChange={(e) => handleDisableToggle(e.target.checked)}
                className={cx(
                  'h-4 w-4 accent-(--theme-link)',
                  disabled ? 'cursor-not-allowed' : 'cursor-pointer',
                )}
              />
              <span className="theme-text">{field.disableLabel}</span>
            </label>
          )}
        </>
      )}
    </FieldWrapper>
  )
})

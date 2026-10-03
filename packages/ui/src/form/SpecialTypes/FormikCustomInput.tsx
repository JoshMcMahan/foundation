import cx from 'classnames'
import { useField, useFormikContext } from 'formik'
import { useCallback, useEffect, useRef, useState } from 'react'
import { EyeIcon, EyeOffIcon } from '../../icons'
import { useFieldControlProps, useFieldRequired } from '../fieldContext'

const DEBOUNCE_MS = 500

type InputValue = string | number | undefined

export default function FormikCustomInput({
  name,
  type,
  step,
  placeholder,
  onChange,
  disabled,
  min,
  max,
  sanitize,
  invalid = false,
  lowercase = false,
  minLength,
  maxLength,
  defaultValue = '',
  value,
}: {
  name: string
  type: 'string' | 'number' | 'password'
  placeholder?: string
  onChange?: (val: InputValue) => void
  disabled?: boolean
  step?: number | undefined
  min?: number | undefined
  max?: number | undefined
  sanitize?: string | undefined
  invalid?: boolean
  lowercase?: boolean | undefined
  minLength?: number | undefined
  maxLength?: number | undefined
  defaultValue?: InputValue
  value?: InputValue
}) {
  const [field] = useField<string | number>(name)
  const required = useFieldRequired()
  const controlProps = useFieldControlProps()
  const { setFieldValue, setFieldTouched } = useFormikContext()
  const [showPassword, setShowPassword] = useState(false)
  const isPassword = type === 'password'

  // Local state for responsive typing — Formik updates are debounced
  const [localValue, setLocalValue] = useState<string | number | undefined>(value ?? field.value)
  const isFocused = useRef(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)

  // Sync from external sources when not focused (Formik updates, parent-computed
  // `value` from expressions/defaults, show_if transitions).
  useEffect(() => {
    if (!isFocused.current) {
      setLocalValue(value ?? field.value)
    }
  }, [field.value, value])

  const sanitizeName = useCallback(
    (val: string) => {
      if (sanitize === undefined) {
        return lowercase ? val.toLowerCase() : val
      }
      try {
        const regexp = new RegExp(sanitize)
        if (lowercase) {
          val = val.toLowerCase()
        }
        return val.replace(regexp, '')
      } catch {
        console.error('Invalid regex for sanitization:', sanitize)
      }
      return val
    },
    [sanitize, lowercase],
  )

  const flushToFormik = useCallback(
    (val: InputValue) => {
      onChange?.(val)
      setFieldTouched(name, true)
      setFieldValue(name, val)
    },
    [name, onChange, setFieldTouched, setFieldValue],
  )

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = sanitizeName(e.target.value)
    let val: InputValue = text

    if (type === 'number') {
      const parsed = parseFloat(text)
      val = Number.isNaN(parsed) ? undefined : parsed
    }

    if (type === 'password' && val === '') {
      val = defaultValue
    }

    // Update local state immediately (no lag)
    setLocalValue(val)

    // Debounce the Formik update
    clearTimeout(debounceRef.current ?? undefined)
    debounceRef.current = setTimeout(() => flushToFormik(val), DEBOUNCE_MS)
  }

  const handleFocus = () => {
    isFocused.current = true
  }

  const handleBlur = () => {
    isFocused.current = false
    // Flush any pending debounce immediately on blur
    clearTimeout(debounceRef.current ?? undefined)

    const current = localValue
    if (current === undefined || current === null) {
      return
    }
    const text = current.toString()
    let val: InputValue = text
    if (type === 'number') {
      const parsed = parseFloat(text)
      if (Number.isNaN(parsed)) {
        val = undefined
      } else if (min !== undefined && parsed < min) {
        val = min
      } else if (max !== undefined && parsed > max) {
        val = max
      } else {
        val = parsed
      }
    }

    setLocalValue(val)
    flushToFormik(val)
  }

  const displayValue = isPassword && localValue === defaultValue ? '' : (localValue ?? '')

  const resolvedType = isPassword
    ? showPassword
      ? 'text'
      : 'password'
    : type === 'string'
      ? 'text'
      : type

  const input = (
    <input
      {...controlProps}
      data-1p-ignore
      className={cx('w-full', disabled && 'disabled', invalid && 'invalid', isPassword && 'pr-8')}
      name={name}
      value={displayValue}
      type={resolvedType}
      aria-required={required || undefined}
      disabled={disabled}
      placeholder={placeholder}
      minLength={minLength}
      maxLength={maxLength}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      min={min}
      max={max}
      step={step}
    />
  )

  if (!isPassword) {
    return input
  }

  return (
    <div className="relative w-full">
      {input}
      <button
        type="button"
        className="absolute right-2 top-1/2 -translate-y-1/2 theme-muted-text"
        onClick={() => setShowPassword((prev) => !prev)}
        disabled={disabled}
        tabIndex={-1}
        aria-label={showPassword ? 'Hide value' : 'Show value'}
      >
        {showPassword ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
      </button>
    </div>
  )
}

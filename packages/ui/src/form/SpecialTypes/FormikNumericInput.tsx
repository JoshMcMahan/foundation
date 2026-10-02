import cx from 'classnames'
import { useField, useFormikContext } from 'formik'
import { useEffect, useRef, useState } from 'react'
import { NumericFormat } from 'react-number-format'
import { useFieldControlProps, useFieldRequired } from '../fieldContext'

const DEBOUNCE_MS = 500

// Number input that displays thousands separators while storing a plain
// numeric value in Formik. Kept separate from FormikCustomInput so opt-in
// number fields don't risk regressing any other input type.
export default function FormikNumericInput({
  name,
  placeholder,
  onChange,
  disabled,
  min,
  max,
  invalid = false,
}: {
  name: string
  placeholder?: string
  onChange?: (val: number | undefined) => void
  disabled?: boolean
  min?: number | undefined
  max?: number | undefined
  invalid?: boolean
}) {
  const [field] = useField<number | undefined>(name)
  const required = useFieldRequired()
  const controlProps = useFieldControlProps()
  const { setFieldValue, setFieldTouched } = useFormikContext()

  const [localValue, setLocalValue] = useState<number | undefined>(field.value)
  const isFocused = useRef(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)

  useEffect(() => {
    if (!isFocused.current) {
      setLocalValue(field.value)
    }
  }, [field.value])

  const flush = (val: number | undefined) => {
    onChange?.(val)
    setFieldTouched(name, true)
    setFieldValue(name, val)
  }

  const handleBlur = () => {
    isFocused.current = false
    clearTimeout(debounceRef.current ?? undefined)
    let val = localValue
    if (val !== undefined) {
      if (min !== undefined && val < min) {
        val = min
      }
      if (max !== undefined && val > max) {
        val = max
      }
    }
    setLocalValue(val)
    flush(val)
  }

  return (
    <NumericFormat
      {...controlProps}
      data-1p-ignore
      className={cx('w-full', disabled && 'disabled', invalid && 'invalid')}
      name={name}
      {...(localValue === undefined ? {} : { value: localValue })}
      aria-required={required || undefined}
      thousandSeparator=","
      decimalScale={20}
      allowNegative
      disabled={disabled}
      placeholder={placeholder}
      onValueChange={(v) => {
        setLocalValue(v.floatValue)
        clearTimeout(debounceRef.current ?? undefined)
        debounceRef.current = setTimeout(() => flush(v.floatValue), DEBOUNCE_MS)
      }}
      onFocus={() => {
        isFocused.current = true
      }}
      onBlur={handleBlur}
    />
  )
}

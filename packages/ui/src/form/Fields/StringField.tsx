import { clsx as cx } from 'clsx'
import { useMemo, useState } from 'react'
import { EyeIcon, EyeOffIcon } from '../../icons'
import { FieldWrapper } from '../FieldWrapper'
import type { FieldComponentProps } from '../types/fieldComponentTypes'
import type { BaseField } from '../types/fieldTypes'
import { useFieldValue } from '../useFieldValue'
import { getPlaceholder } from '../utils/getPlaceholder'

export interface IStringField extends BaseField {
  type: 'string' | 'password'
  default?: string
  placeholder?: string
  lowercase?: boolean
  minLength?: number
  maxLength?: number
  min?: number
  max?: number
  step?: number
  sanitize?: string // regex pattern for sanitization
  prefillDefault?: boolean // if true, the form starts with the default as the value
}

export default function StringField({
  field,
  label,
  labelPosition,
  missing,
  disabled,
  onChange,
  tooltipComponent,
  spaceCompact,
}: FieldComponentProps<IStringField>) {
  // The form names every field before it renders one.
  const [value, change] = useFieldValue<string | undefined>(field.name ?? '')
  const [revealed, setRevealed] = useState(false)
  const password = field.type === 'password'
  const fallback = field.default ?? ''

  // Global, so a pasted value loses every disallowed character, not just the
  // first; typing hid this because each keystroke adds at most one.
  const disallowed = useMemo(() => {
    if (field.sanitize === undefined) {
      return undefined
    }
    try {
      return new RegExp(field.sanitize, 'g')
    } catch {
      console.error('Invalid regex for sanitization:', field.sanitize)
      return undefined
    }
  }, [field.sanitize])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const cased = field.lowercase ? e.target.value.toLowerCase() : e.target.value
    const text = disallowed ? cased.replace(disallowed, '') : cased
    // A password left empty keeps the one it has, which shows only as the placeholder's dots.
    const next = password && text === '' ? fallback : text
    onChange?.(next)
    change(next)
  }

  return (
    <FieldWrapper
      optional={field.optional}
      label={label}
      tooltipComponent={tooltipComponent}
      description={field.description}
      labelPosition={labelPosition}
      spaceCompact={spaceCompact}
    >
      {({ id, describedBy }) => {
        const input = (
          <input
            id={id}
            aria-describedby={describedBy}
            data-1p-ignore
            className={cx(
              'w-full',
              disabled && 'disabled',
              missing && 'invalid',
              password && 'pr-8',
            )}
            name={field.name}
            value={password && value === fallback ? '' : (value ?? '')}
            type={password && !revealed ? 'password' : 'text'}
            aria-required={field.optional ? undefined : true}
            disabled={disabled}
            placeholder={
              password && field.placeholder === undefined
                ? '•'.repeat(fallback.toString().length > 0 ? 16 : 0)
                : getPlaceholder(field.placeholder, field.default)
            }
            minLength={field.minLength}
            maxLength={field.maxLength}
            onChange={handleChange}
          />
        )
        return password ? (
          <div className="relative w-full">
            {input}
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 theme-muted-text"
              onClick={() => setRevealed((shown) => !shown)}
              disabled={disabled}
              tabIndex={-1}
              aria-label={revealed ? 'Hide value' : 'Show value'}
            >
              {revealed ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
            </button>
          </div>
        ) : (
          input
        )
      }}
    </FieldWrapper>
  )
}

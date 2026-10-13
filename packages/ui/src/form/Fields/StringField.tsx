import { useMemo, useState } from 'react'
import { Field, RevealToggle } from '../../components/Field'
import { fieldBox } from '../../components/fieldBox'
import { cx } from '../../cx'
import { fieldFrame } from '../fieldFrame'
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

export default function StringField(props: FieldComponentProps<IStringField>) {
  const { field, disabled, onChange } = props
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
    <Field {...fieldFrame(props)}>
      {(control) => {
        const input = (
          <input
            {...control}
            data-1p-ignore
            className={cx(fieldBox(), password && 'pr-9')}
            name={field.name}
            value={password && value === fallback ? '' : (value ?? '')}
            type={password && !revealed ? 'password' : 'text'}
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
            <RevealToggle revealed={revealed} onRevealedChange={setRevealed} disabled={disabled} />
          </div>
        ) : (
          input
        )
      }}
    </Field>
  )
}

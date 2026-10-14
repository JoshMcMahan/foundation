import { Input as BaseInput } from '@base-ui/react/input'
import { type ReactNode, useId, useState } from 'react'
import { cx } from '../cx'
import { parseColor, toHex } from '../theme/index'
import { ErrorText } from './Field'
import { type FieldBoxSize, fieldBox } from './fieldBox'
import { framed } from './Input'
import { useStrings } from './Provider'

export interface ColorInputProps {
  /** A CSS color the theme reads: a hex, `oklch()` or `color(display-p3 …)`. */
  value: string
  /** Called with each color that parses, as typed or as picked: a picked one is a hex. */
  onValueChange: (color: string) => void
  /** Without a label the row stands alone; name it with `aria-label`. */
  label?: ReactNode
  /** Beside the label and outside it, so it stays out of the field's name. */
  hint?: ReactNode
  /** Help under the field. */
  description?: ReactNode
  error?: ReactNode
  /** `sm` for dense places such as toolbars and table cells. */
  size?: FieldBoxSize | undefined
  /** The hex field's id, which a label names. */
  id?: string | undefined
  /** Submits the color under this name with a form. */
  name?: string | undefined
  disabled?: boolean | undefined
  required?: boolean | undefined
  'aria-label'?: string | undefined
  'aria-labelledby'?: string | undefined
  'aria-describedby'?: string | undefined
  'aria-invalid'?: boolean | undefined
  'aria-required'?: boolean | undefined
  /** On the row that holds the swatch and the hex field: its width or margin. */
  className?: string | undefined
}

const swatchClassName = cx(
  'shrink-0 cursor-pointer p-0.5',
  // The browser's swatch fills the box, inside the box's own frame.
  '[&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded [&::-webkit-color-swatch]:border-0',
  '[&::-moz-color-swatch]:rounded [&::-moz-color-swatch]:border-0',
)

/**
 * A color as a swatch that opens the system picker, beside a field its hex can be typed or pasted
 * in. A half-typed color stays in the field, marked invalid, until it parses; leaving the field
 * puts back the last color that did.
 */
export function ColorInput({
  value,
  onValueChange,
  label,
  hint,
  description,
  error,
  size = 'md',
  id,
  name,
  disabled,
  required,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-required': ariaRequired,
  className,
}: ColorInputProps) {
  const t = useStrings().colorInput
  const [draft, setDraft] = useState<string | null>(null)
  const errorId = useId()
  const parsed = parseColor(value)
  const unparsed = draft !== null && parseColor(draft) === null
  const named = typeof label === 'string' ? label : ariaLabel
  // Framed, the message is the Field's error; alone, it sits under the row.
  const ownError = unparsed && label === undefined
  return framed(
    { label, hint, description, error: error ?? (unparsed ? t.invalid : undefined), size },
    { id, required, disabled },
    (control) => (
      <div className={cx('flex w-full flex-col gap-1', className)}>
        <div className={cx('flex items-center', size === 'sm' ? 'gap-1.5' : 'gap-2')}>
          <input
            type="color"
            aria-label={t.pick(named)}
            value={parsed ? toHex(parsed) : '#000000'}
            disabled={disabled}
            onChange={(e) => {
              setDraft(null)
              onValueChange(e.target.value)
            }}
            className={cx(fieldBox({ size }), swatchClassName, size === 'sm' ? 'w-8' : 'w-10')}
          />
          <BaseInput
            id={id}
            name={name}
            aria-label={ariaLabel}
            aria-labelledby={ariaLabelledBy}
            {...control}
            aria-describedby={
              [ariaDescribedBy, control['aria-describedby'], ownError && errorId]
                .filter(Boolean)
                .join(' ') || undefined
            }
            aria-invalid={control['aria-invalid'] ?? (ariaInvalid || unparsed || undefined)}
            aria-required={control['aria-required'] ?? (ariaRequired || undefined)}
            required={required}
            disabled={disabled}
            spellCheck={false}
            autoComplete="off"
            value={draft ?? value}
            onChange={(e) => {
              const text = e.target.value
              if (parseColor(text)) {
                setDraft(null)
                onValueChange(text.trim().toLowerCase())
              } else {
                setDraft(text)
              }
            }}
            onBlur={() => setDraft(null)}
            className={cx(fieldBox({ size }), 'font-mono')}
          />
        </div>
        {ownError && <ErrorText id={errorId}>{t.invalid}</ErrorText>}
      </div>
    ),
  )
}

import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'
import { forwardRef, useState } from 'react'
import { cx } from '../cx'
import { Field, type FieldControlProps, RevealToggle } from './Field'
import { fieldBox } from './fieldBox'

interface FramedProps {
  /** Without a label the box stands alone; name it with `aria-label`. */
  label?: ReactNode
  /** Beside the label and outside it, so it stays out of the field's name. */
  hint?: ReactNode
  /** Help under the field. */
  description?: ReactNode
  error?: ReactNode
  mono?: boolean
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement>, FramedProps {}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement>, FramedProps {}

/** The Field around a control when it has a label; the control alone when it doesn't. */
function framed(
  { label, hint, description, error }: FramedProps,
  {
    id,
    required,
    disabled,
  }: { id?: string | undefined; required?: boolean | undefined; disabled?: boolean | undefined },
  control: (props: Partial<FieldControlProps>) => ReactNode,
) {
  if (label === undefined) {
    return control(error ? { 'aria-invalid': true } : {})
  }
  return (
    <Field
      label={label}
      hint={hint}
      description={description}
      error={error}
      required={required}
      disabled={disabled}
      id={id}
    >
      {control}
    </Field>
  )
}

/** A single-line text field. `type="password"` adds a button that shows what was typed. */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, hint, description, error, className, mono, type, ...props }, ref) => {
    const [revealed, setRevealed] = useState(false)
    const secret = type === 'password'
    return framed({ label, hint, description, error }, props, (control) => {
      const input = (
        <input
          ref={ref}
          {...props}
          {...control}
          aria-invalid={control['aria-invalid'] ?? props['aria-invalid']}
          aria-describedby={
            [props['aria-describedby'], control['aria-describedby']].filter(Boolean).join(' ') ||
            undefined
          }
          type={secret && revealed ? 'text' : type}
          className={cx(fieldBox(), mono && 'font-mono', secret && 'pr-9', className)}
        />
      )
      return secret ? (
        <div className="relative w-full">
          {input}
          <RevealToggle
            revealed={revealed}
            onRevealedChange={setRevealed}
            disabled={props.disabled}
          />
        </div>
      ) : (
        input
      )
    })
  },
)

Input.displayName = 'Input'

/** A multi-line text field that grows by hand. */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, hint, description, error, className, mono, ...props }, ref) =>
    framed({ label, hint, description, error }, props, (control) => (
      <textarea
        ref={ref}
        {...props}
        {...control}
        aria-invalid={control['aria-invalid'] ?? props['aria-invalid']}
        aria-describedby={
          [props['aria-describedby'], control['aria-describedby']].filter(Boolean).join(' ') ||
          undefined
        }
        className={cx(
          fieldBox({ multiline: true }),
          'min-h-24 resize-y',
          mono && 'font-mono',
          className,
        )}
      />
    )),
)

Textarea.displayName = 'Textarea'

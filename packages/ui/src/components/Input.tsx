import { Input as BaseInput } from '@base-ui/react/input'
import type { InputHTMLAttributes, ReactNode, Ref, TextareaHTMLAttributes } from 'react'
import { useState } from 'react'
import { cx } from '../cx'
import { Field, type FieldControlProps, RevealToggle } from './Field'
import { type FieldBoxSize, fieldBox } from './fieldBox'

interface FramedProps {
  /** Without a label the box stands alone: name it with `aria-label`, or place it in a Field. */
  label?: ReactNode
  /** Beside the label and outside it, so it stays out of the field's name. */
  hint?: ReactNode
  /** More about the field, behind a ? beside the label; see Field's `help`. */
  help?: string | undefined
  /** Help under the field. */
  description?: ReactNode
  error?: ReactNode
  mono?: boolean
  /** `sm` for dense places such as toolbars and table cells. With a label, the label matches. */
  size?: FieldBoxSize | undefined
}

// `size` is the box's, not the native character count, which CSS sets better.
export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'>,
    FramedProps {
  ref?: Ref<HTMLInputElement> | undefined
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement>, FramedProps {
  ref?: Ref<HTMLTextAreaElement> | undefined
}

/** The Field around a control when it has a label; the control alone when it doesn't. */
export function framed(
  {
    label,
    hint,
    help,
    actions,
    description,
    error,
    size,
  }: Omit<FramedProps, 'mono'> & { actions?: ReactNode },
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
      help={help}
      actions={actions}
      description={description}
      error={error}
      required={required}
      disabled={disabled}
      size={size}
      id={id}
    >
      {control}
    </Field>
  )
}

/** The control props joined with the element's own: its own `aria-describedby` stays beside the
 *  field's, and its own invalid mark holds when the field sets none. */
function joined(
  control: Partial<FieldControlProps>,
  own: { 'aria-describedby'?: string | undefined; 'aria-invalid'?: unknown },
): Partial<FieldControlProps> {
  return {
    ...control,
    'aria-invalid': control['aria-invalid'] ?? (own['aria-invalid'] as true | undefined),
    'aria-describedby':
      [own['aria-describedby'], control['aria-describedby']].filter(Boolean).join(' ') || undefined,
  }
}

/** A single-line text field. `type="password"` adds a button that shows what was typed. Placed in
 *  a Field, it takes the Field's label, description and invalid state. */
export function Input({
  label,
  hint,
  help,
  description,
  error,
  className,
  mono,
  size,
  type,
  ref,
  ...props
}: InputProps) {
  const [revealed, setRevealed] = useState(false)
  const secret = type === 'password'
  return framed({ label, hint, help, description, error, size }, props, (control) => {
    // Base UI's input, which a Field around it names, describes and marks as it does Base UI's
    // own controls.
    const input = (
      <BaseInput
        ref={ref}
        {...props}
        {...joined(control, props)}
        type={secret && revealed ? 'text' : type}
        className={cx(fieldBox({ size }), mono && 'font-mono', secret && 'pr-9', className)}
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
}

/** A multi-line text field that grows by hand. Placed in a Field, it takes the Field's label,
 *  description and invalid state. */
export function Textarea({
  label,
  hint,
  help,
  description,
  error,
  className,
  mono,
  size,
  ref,
  ...props
}: TextareaProps) {
  return framed({ label, hint, help, description, error, size }, props, (control) => (
    <BaseInput
      // Base UI's input drawn as a textarea; its props are an input's, which a textarea's match
      // but for the few only a textarea has.
      {...(props as InputHTMLAttributes<HTMLInputElement>)}
      {...joined(control, props)}
      ref={ref as Ref<HTMLInputElement>}
      render={<textarea />}
      className={cx(
        fieldBox({ size, multiline: true }),
        size === 'sm' ? 'min-h-16' : 'min-h-24',
        'resize-y',
        mono && 'font-mono',
        className,
      )}
    />
  ))
}

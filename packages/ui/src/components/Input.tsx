import cx from 'classnames'
import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'
import { forwardRef, useId, useState } from 'react'
import { AlertIcon, EyeIcon, EyeOffIcon } from '../icons'
import { RequiredMark } from './RequiredMark'

interface FieldProps {
  label?: ReactNode
  /** Shown beside the label, outside it, so it stays out of the field's name. */
  labelHint?: ReactNode
  /** Help text shown under the label. */
  description?: ReactNode
  error?: string | undefined
  mono?: boolean
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement>, FieldProps {}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement>, FieldProps {}

/** The box a text field draws, for other controls that should look like one. */
export const fieldBoxClasses = cx(
  'w-full py-3 px-4 bg-[var(--theme-muted-panel-bg)] border border-[var(--theme-border)] rounded-lg text-[var(--theme-app)] text-sm transition-all duration-200 box-border',
  'focus:outline-none focus:border-[var(--theme-element)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--theme-element)_25%,transparent)]',
  'placeholder:text-[var(--theme-muted-text-color)]',
)

function LabelRow({
  id,
  label,
  hint,
  required,
}: {
  id: string
  label: ReactNode
  hint: ReactNode
  required: boolean | undefined
}) {
  const element = (
    <label className="text-[0.8125rem] font-medium text-[var(--theme-app)]" htmlFor={id}>
      {label}
      {required && <RequiredMark />}
    </label>
  )
  return hint ? (
    <div className="flex flex-wrap items-baseline gap-x-1.5">
      {element}
      {hint}
    </div>
  ) : (
    element
  )
}

// The label, help and error around a control, and the ids that tie them to it.
function useFieldFrame(
  { label, labelHint, description, error }: FieldProps,
  ownId: string | undefined,
  describedBy: string | undefined,
  required: boolean | undefined,
) {
  const generatedId = useId()
  const id = ownId ?? generatedId
  const errorId = `${id}-error`
  const descriptionId = `${id}-description`
  return {
    id,
    describedBy:
      [describedBy, description ? descriptionId : undefined, error ? errorId : undefined]
        .filter(Boolean)
        .join(' ') || undefined,
    frame: (control: ReactNode) => (
      <div className="flex flex-col gap-1.5">
        {label && <LabelRow id={id} label={label} hint={labelHint} required={required} />}
        {description && (
          <span id={descriptionId} className="-mt-1 text-xs text-(--theme-muted-text-color)">
            {description}
          </span>
        )}
        {control}
        {error && (
          <span
            id={errorId}
            role="alert"
            className="text-[0.8125rem] text-[#ef4444] flex items-center gap-1.5"
          >
            <AlertIcon className="w-4 h-4" />
            {error}
          </span>
        )}
      </div>
    ),
  }
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    { label, labelHint, description, error, className = '', mono, type, required, ...props },
    ref,
  ) => {
    const [showPassword, setShowPassword] = useState(false)
    const isPassword = type === 'password'
    const field = useFieldFrame(
      { label, labelHint, description, error },
      props.id,
      props['aria-describedby'],
      required,
    )
    return field.frame(
      <div className={isPassword ? 'relative w-full' : ''}>
        <input
          ref={ref}
          type={isPassword && showPassword ? 'text' : type}
          className={cx(
            fieldBoxClasses,
            'disabled:bg-[var(--theme-muted-panel-bg)] disabled:text-[var(--theme-muted-text-color)] disabled:cursor-not-allowed disabled:opacity-70',
            mono && 'font-mono text-[0.8125rem]',
            // Important: the box's own border color comes later in the stylesheet.
            error && '!border-[#ef4444]',
            isPassword && 'pr-11',
            className,
          )}
          {...props}
          id={field.id}
          required={required}
          aria-invalid={error ? true : props['aria-invalid']}
          aria-describedby={field.describedBy}
        />
        {isPassword && (
          <button
            type="button"
            className="absolute right-3 top-1/2 -translate-y-1/2 bg-transparent border-none text-[var(--theme-muted-text-color)] cursor-pointer p-1 transition-colors duration-200 flex items-center justify-center hover:text-[var(--theme-app)]"
            onClick={() => setShowPassword(!showPassword)}
            tabIndex={-1}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOffIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
          </button>
        )}
      </div>,
    )
  },
)

Input.displayName = 'Input'

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, labelHint, description, error, className = '', mono, required, ...props }, ref) => {
    const field = useFieldFrame(
      { label, labelHint, description, error },
      props.id,
      props['aria-describedby'],
      required,
    )
    return field.frame(
      <textarea
        ref={ref}
        className={cx(
          fieldBoxClasses,
          'min-h-[140px] resize-y',
          mono && 'font-mono text-[0.8125rem]',
          error && '!border-[#ef4444]',
          className,
        )}
        {...props}
        id={field.id}
        required={required}
        aria-invalid={error ? true : props['aria-invalid']}
        aria-describedby={field.describedBy}
      />,
    )
  },
)

Textarea.displayName = 'Textarea'

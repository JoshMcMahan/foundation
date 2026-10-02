import cx from 'classnames'
import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'
import { forwardRef, useId, useState } from 'react'
import { AlertIcon, EyeIcon, EyeOffIcon } from '../icons'
import { RequiredMark } from './RequiredMark'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode
  error?: string | undefined
  mono?: boolean
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = '', mono, type, required, ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false)
    const isPassword = type === 'password'
    const inputType = isPassword && showPassword ? 'text' : type
    const generatedId = useId()
    const id = props.id ?? generatedId
    const errorId = `${id}-error`
    const describedBy =
      [props['aria-describedby'], error ? errorId : undefined].filter(Boolean).join(' ') ||
      undefined

    const inputClasses = cx(
      'w-full py-3 px-4 bg-[var(--theme-muted-panel-bg)] border border-[var(--theme-border)] rounded-lg text-[var(--theme-app)] text-sm transition-all duration-200 box-border',
      'focus:outline-none focus:border-[var(--theme-element)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--theme-element)_25%,transparent)]',
      'placeholder:text-[var(--theme-muted-text-color)]',
      'disabled:bg-[var(--theme-muted-panel-bg)] disabled:text-[var(--theme-muted-text-color)] disabled:cursor-not-allowed disabled:opacity-70',
      mono && 'font-mono text-[0.8125rem]',
      error && 'border-[#ef4444]',
      isPassword && 'pr-11',
      className,
    )

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label className="text-[0.8125rem] font-medium text-[var(--theme-app)]" htmlFor={id}>
            {label}
            {required && <RequiredMark />}
          </label>
        )}
        <div className={isPassword ? 'relative w-full' : ''}>
          <input
            ref={ref}
            type={inputType}
            className={inputClasses}
            {...props}
            id={id}
            required={required}
            aria-invalid={error ? true : props['aria-invalid']}
            aria-describedby={describedBy}
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
        </div>
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
    )
  },
)

Input.displayName = 'Input'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  mono?: boolean
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className = '', mono, required, ...props }, ref) => {
    const generatedId = useId()
    const id = props.id ?? generatedId
    const errorId = `${id}-error`
    const describedBy =
      [props['aria-describedby'], error ? errorId : undefined].filter(Boolean).join(' ') ||
      undefined

    const textareaClasses = cx(
      'w-full py-3 px-4 bg-[var(--theme-muted-panel-bg)] border border-[var(--theme-border)] rounded-lg text-[var(--theme-app)] text-sm transition-all duration-200 box-border min-h-[140px] resize-y',
      'focus:outline-none focus:border-[var(--theme-element)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--theme-element)_25%,transparent)]',
      'placeholder:text-[var(--theme-muted-text-color)]',
      mono && 'font-mono text-[0.8125rem]',
      error && 'border-[#ef4444]',
      className,
    )

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label className="text-[0.8125rem] font-medium text-[var(--theme-app)]" htmlFor={id}>
            {label}
            {required && <RequiredMark />}
          </label>
        )}
        <textarea
          ref={ref}
          className={textareaClasses}
          {...props}
          id={id}
          required={required}
          aria-invalid={error ? true : props['aria-invalid']}
          aria-describedby={describedBy}
        />
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
    )
  },
)

Textarea.displayName = 'Textarea'

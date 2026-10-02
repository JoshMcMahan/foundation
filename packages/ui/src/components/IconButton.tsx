import cx from 'classnames'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { forwardRef } from 'react'
import { TOOLTIP_ID } from './Tooltip'

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Icon to display */
  icon: ReactNode
  /** Accessible label (used for aria-label and tooltip) */
  label: string
  /** Button variant */
  variant?: 'default' | 'ghost' | 'primary' | 'success'
  /** Size of the button */
  size?: 'sm' | 'md' | 'lg'
  /** Whether button is in active/selected state */
  active?: boolean
  /** Whether to show tooltip on hover */
  showTooltip?: boolean
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      icon,
      label,
      variant = 'default',
      size = 'md',
      active = false,
      showTooltip = true,
      className,
      disabled,
      ...props
    },
    ref,
  ) => {
    const sizeClasses = {
      sm: 'w-7 h-7 [&_svg]:w-3.5 [&_svg]:h-3.5',
      md: 'w-9 h-9 [&_svg]:w-4 [&_svg]:h-4',
      lg: 'w-11 h-11 [&_svg]:w-5 [&_svg]:h-5',
    }

    const variantClasses = {
      default: cx(
        'bg-[var(--theme-muted-panel-bg)] text-[var(--theme-muted-text-color)]',
        'hover:bg-[var(--theme-border)] hover:text-[var(--theme-app)]',
        active && 'bg-[var(--theme-element)]/10 text-[var(--theme-element)]',
      ),
      ghost: cx(
        'bg-transparent text-[var(--theme-muted-text-color)]',
        'hover:bg-[var(--theme-muted-panel-bg)] hover:text-[var(--theme-app)]',
        active && 'text-[var(--theme-element)]',
      ),
      primary: cx(
        'bg-[var(--theme-element)] text-white',
        'hover:bg-[var(--theme-element)]/90',
        active && 'ring-2 ring-[var(--theme-element)]/50',
      ),
      success: cx(
        'bg-[#22c55e] text-white',
        'hover:bg-[#22c55e]/90',
        active && 'ring-2 ring-[#22c55e]/50',
      ),
    }

    return (
      <button
        ref={ref}
        type="button"
        aria-label={label}
        disabled={disabled}
        {...(showTooltip ? { 'data-tooltip-id': TOOLTIP_ID } : {})}
        data-tooltip-content={label}
        data-tooltip-delay-show={300}
        data-tooltip-class-name="!bg-[var(--theme-app)] !text-[var(--theme-app-bg)] !text-xs !py-1 !px-2 !rounded-md"
        className={cx(
          'inline-flex items-center justify-center rounded-lg',
          'transition-all duration-200 cursor-pointer',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          sizeClasses[size],
          variantClasses[variant],
          className,
        )}
        {...props}
      >
        {icon}
      </button>
    )
  },
)

IconButton.displayName = 'IconButton'

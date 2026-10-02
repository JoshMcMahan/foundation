import cx from 'classnames'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { forwardRef } from 'react'
import { AngleRightIcon, LoaderIcon } from '../icons'
import { useLink } from './Provider'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost'
  size?: 'default' | 'sm' | 'lg'
  loading?: boolean
  icon?: ReactNode
  iconPosition?: 'left' | 'right'
  fullWidth?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = 'primary',
      size = 'default',
      loading,
      icon,
      iconPosition = 'right',
      fullWidth = true,
      className = '',
      disabled,
      ...props
    },
    ref,
  ) => {
    const baseClasses =
      'inline-flex items-center justify-center gap-2 font-semibold rounded-lg transition-all duration-200 cursor-pointer border-none mt-2 disabled:opacity-50 disabled:cursor-not-allowed'

    const variantClasses = {
      primary:
        'bg-gradient-to-br from-[var(--gradient-start,var(--theme-element))] to-[var(--gradient-mid,var(--theme-link))] text-white shadow-[0_4px_14px_0_rgba(59,130,246,0.3)] hover:enabled:-translate-y-0.5 hover:enabled:shadow-[0_6px_20px_0_rgba(59,130,246,0.4)] active:enabled:translate-y-0',
      secondary:
        'bg-[var(--theme-muted-panel-bg)] text-[var(--theme-app)] border border-[var(--theme-border)] hover:enabled:bg-[var(--theme-border)]',
      outline:
        'bg-transparent text-[var(--theme-app)] border border-[var(--theme-border)] hover:enabled:bg-[var(--theme-muted-panel-bg)] hover:enabled:border-[var(--theme-muted-text-color)]',
      ghost:
        'bg-transparent text-[var(--theme-muted-text-color)] hover:enabled:text-[var(--theme-app)] hover:enabled:bg-[var(--theme-muted-panel-bg)]',
    }

    const sizeClasses = {
      sm: 'py-2 px-4 text-[0.8125rem]',
      default: 'py-3 px-5 text-sm',
      lg: 'py-4 px-6 text-base',
    }

    const widthClass = fullWidth ? 'w-full' : 'w-auto'

    return (
      <button
        ref={ref}
        type="button"
        disabled={disabled || loading}
        className={cx(
          baseClasses,
          variantClasses[variant],
          sizeClasses[size],
          widthClass,
          className,
        )}
        {...props}
      >
        {loading ? (
          <>
            <LoaderIcon className="size-[18px]" />
            {children}
          </>
        ) : (
          <>
            {icon && iconPosition === 'left' && <span className="flex items-center">{icon}</span>}
            {children}
            {icon && iconPosition === 'right' && <span className="flex items-center">{icon}</span>}
          </>
        )}
      </button>
    )
  },
)

Button.displayName = 'Button'

interface MethodButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: ReactNode
  label: string
  description?: string
  href?: string
  loading?: boolean
}

export function MethodButton({
  icon,
  label,
  description,
  href,
  loading,
  disabled,
  className = '',
  ...props
}: MethodButtonProps) {
  const Link = useLink()
  const baseClasses =
    'flex items-center w-full p-4 bg-[var(--theme-muted-panel-bg)] border border-[var(--theme-border)] rounded-xl text-[var(--theme-app)] text-[0.9375rem] font-medium cursor-pointer transition-all duration-200 no-underline mb-3 last:mb-0 hover:bg-[var(--theme-border)] hover:border-[var(--theme-muted-text-color)] hover:-translate-y-0.5 active:translate-y-0'

  const disabledClasses =
    'disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-[var(--ds-muted)] disabled:hover:border-[var(--ds-border)] disabled:hover:translate-y-0'

  const content = (
    <>
      {icon && (
        <span className="size-10 rounded-lg bg-gradient-to-br from-[var(--gradient-start,var(--theme-element))] to-[var(--gradient-mid,var(--theme-link))] flex items-center justify-center shrink-0 mr-4 [&_svg]:size-5 [&_svg]:text-white">
          {icon}
        </span>
      )}
      <span className="flex-1 text-left">
        <span className="block font-semibold text-[var(--theme-app)]">{label}</span>
        {description && (
          <span className="block text-[0.8125rem] text-[var(--theme-muted-text-color)] font-normal mt-0.5">
            {description}
          </span>
        )}
      </span>
      {loading ? (
        <LoaderIcon className="size-5 text-[var(--theme-muted-text-color)] shrink-0 ml-2" />
      ) : (
        <AngleRightIcon className="size-5 text-[var(--theme-muted-text-color)] shrink-0 ml-2 transition-all duration-200 group-hover:translate-x-[3px] group-hover:text-[var(--theme-app)]" />
      )}
    </>
  )

  if (href) {
    // Use a plain anchor for API/external URLs that aren't client-side routes
    if (href.startsWith('/api/') || href.startsWith('http')) {
      return (
        <a href={href} className={cx('group', baseClasses, className)}>
          {content}
        </a>
      )
    }
    return (
      <Link to={href} className={cx('group', baseClasses, className)}>
        {content}
      </Link>
    )
  }

  return (
    <button
      type="button"
      className={cx('group', baseClasses, disabledClasses, className)}
      disabled={disabled || loading}
      {...props}
    >
      {content}
    </button>
  )
}

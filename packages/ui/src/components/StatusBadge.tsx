import cx from 'classnames'
import type { ReactNode } from 'react'

export type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info' | 'muted'

interface StatusBadgeProps {
  /** Badge content */
  children: ReactNode
  /** Visual variant */
  variant?: BadgeVariant
  /** Show animated pulse indicator */
  pulse?: boolean
  /** Show a still indicator in the variant's colour */
  dot?: boolean
  /** Size */
  size?: 'sm' | 'md'
  /** Additional class */
  className?: string
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-(--theme-muted-panel-bg) text-(--theme-app) border-(--theme-border)',
  success: 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-400 border-emerald-500/20',
  warning: 'bg-amber-500/10 text-amber-800 dark:text-amber-400 border-amber-500/20',
  error: 'bg-red-500/10 text-red-800 dark:text-red-400 border-red-500/20',
  info: 'bg-blue-500/10 text-blue-800 dark:text-blue-400 border-blue-500/20',
  muted: 'bg-(--theme-muted-panel-bg)/50 text-(--theme-muted-text-color) border-(--theme-border)',
}

const pulseColors: Record<BadgeVariant, string> = {
  default: 'bg-(--theme-app)',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  error: 'bg-red-500',
  info: 'bg-blue-500',
  muted: 'bg-(--theme-muted-text-color)',
}

const textColors: Record<BadgeVariant, string> = {
  default: 'text-(--theme-app)',
  success: 'text-emerald-600 dark:text-emerald-400',
  warning: 'text-amber-600 dark:text-amber-400',
  error: 'text-red-600 dark:text-red-400',
  info: 'text-blue-600 dark:text-blue-400',
  muted: 'text-(--theme-muted-text-color)',
}

/** A line of text in a variant's colour, for a status that stands beside a
 *  dot rather than inside a badge. */
export function statusTextClass(variant: BadgeVariant): string {
  return textColors[variant]
}

export function StatusBadge({
  children,
  variant = 'default',
  pulse = false,
  dot = false,
  size = 'sm',
  className,
}: StatusBadgeProps) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full border font-medium',
        size === 'sm' && 'px-2 py-0.5 text-[10px]',
        size === 'md' && 'px-2.5 py-1 text-xs',
        variantStyles[variant],
        className,
      )}
    >
      {pulse && (
        <span className="relative flex h-2 w-2">
          <span
            className={cx(
              'absolute inline-flex h-full w-full animate-ping rounded-full opacity-75',
              pulseColors[variant],
            )}
          />
          <span className={cx('relative inline-flex h-2 w-2 rounded-full', pulseColors[variant])} />
        </span>
      )}
      {dot && !pulse && (
        <span className={cx('inline-flex h-1.5 w-1.5 rounded-full', pulseColors[variant])} />
      )}
      {children}
    </span>
  )
}

interface StatusDotProps {
  variant?: BadgeVariant
  pulse?: boolean
  size?: number
  className?: string
}

export function StatusDot({
  variant = 'default',
  pulse = false,
  size = 8,
  className,
}: StatusDotProps) {
  return (
    <span className={cx('relative inline-flex', className)} style={{ width: size, height: size }}>
      {pulse && (
        <span
          className={cx(
            'absolute inline-flex h-full w-full animate-ping rounded-full opacity-75',
            pulseColors[variant],
          )}
        />
      )}
      <span
        className={cx('relative inline-flex rounded-full', pulseColors[variant])}
        style={{ width: size, height: size }}
      />
    </span>
  )
}

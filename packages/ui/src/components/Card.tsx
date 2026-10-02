import cx from 'classnames'
import type { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
  wide?: boolean
  compact?: boolean
  interactive?: boolean
  authShadow?: boolean
}

export function Card({
  children,
  className = '',
  wide,
  compact,
  interactive,
  authShadow,
}: CardProps) {
  return (
    <div
      className={cx(
        'w-full bg-[var(--theme-card-bg)] backdrop-blur-xl border border-[var(--theme-border)] rounded-2xl',
        authShadow ? 'shadow-[var(--theme-auth-shadow)]' : 'shadow-[var(--theme-shadow)]',
        wide && 'max-w-[560px] p-8',
        compact && 'max-w-[400px] p-6',
        !wide && !compact && 'max-w-[520px] p-10',
        interactive && 'ds-card-interactive cursor-pointer',
        className,
      )}
    >
      {children}
    </div>
  )
}

interface CardHeaderProps {
  badge?: ReactNode
  title: string
  description?: ReactNode
  className?: string
  align?: 'center' | 'left'
}

export function CardHeader({
  badge,
  title,
  description,
  className = '',
  align = 'center',
}: CardHeaderProps) {
  return (
    <div className={cx(align === 'center' ? 'text-center' : 'text-left', 'mb-6', className)}>
      {badge && (
        <div className="inline-flex items-center gap-1.5 py-1.5 px-3 text-xs font-medium bg-[var(--theme-muted-panel-bg)] border border-[var(--theme-border)] rounded-full text-[var(--theme-muted-text-color)] mb-4 transition-colors duration-200">
          {badge}
        </div>
      )}
      <h1
        className="text-2xl font-bold tracking-tight text-[var(--theme-app)]"
        style={{ letterSpacing: '-0.025em' }}
      >
        {title}
      </h1>
      {description && (
        <p className="text-[var(--theme-muted-text-color)] text-sm leading-relaxed mt-2">
          {description}
        </p>
      )}
    </div>
  )
}

import { useRender } from '@base-ui/react/use-render'
import type { ReactElement, ReactNode } from 'react'
import { cx } from '../cx'

const sizeClasses = {
  sm: 'max-w-[400px] p-6',
  md: 'max-w-[520px] p-10',
  lg: 'max-w-[560px] p-8',
}

export interface CardProps {
  children: ReactNode
  /** Its width and padding: `sm` for a short form, `lg` for a wide one. */
  size?: keyof typeof sizeClasses | undefined
  /** A stronger shadow, for a card standing alone on a page, such as sign-in. */
  elevated?: boolean | undefined
  /** Renders the card as this element, such as a link or a button, which makes
   *  the whole card pressable: it lifts on hover and shows focus. */
  render?: ReactElement | undefined
  className?: string | undefined
}

/** A raised surface holding one task, such as a sign-in form or a choice among
 *  a few options. */
export function Card({ children, size = 'md', elevated = false, render, className }: CardProps) {
  return useRender({
    render: render ?? <div />,
    props: {
      className: cx(
        'block w-full rounded-2xl border border-(--theme-border) bg-(--theme-panel-bg) backdrop-blur-xl',
        elevated ? 'shadow-(--theme-shadow-xl)' : 'shadow-(--theme-shadow)',
        sizeClasses[size],
        render &&
          'cursor-pointer text-left transition-[background-color,box-shadow] duration-150 hover:bg-(--theme-panel-hover) hover:shadow-(--theme-shadow-lg) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--theme-link) motion-reduce:transition-none',
        className,
      ),
      children,
    },
  })
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

import type { ReactNode } from 'react'
import { cx } from '../cx'

export interface EmptyStateProps {
  title: ReactNode
  description?: ReactNode
  /** What to do about it, such as a create button. */
  action?: ReactNode
  icon?: ReactNode
  /** `panel` stands in for a whole page or list; `bare` sits inside something
   *  that already frames it, such as a sidebar, a menu or a dialog. */
  variant?: 'panel' | 'bare' | undefined
  className?: string | undefined
  testId?: string | undefined
}

/** What shows where there is nothing yet, or nothing matches: what's missing,
 *  and what to do about it. */
export function EmptyState({
  title,
  description,
  action,
  icon,
  variant = 'panel',
  className,
  testId,
}: EmptyStateProps) {
  const panel = variant === 'panel'
  return (
    <div
      data-testid={testId}
      className={cx(
        'flex flex-col items-center justify-center text-center',
        panel ? 'panel px-6 py-12' : 'px-3 py-6',
        className,
      )}
    >
      {icon && (
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-(--theme-muted-panel-bg) theme-muted-text [&_svg]:h-5 [&_svg]:w-5">
          {icon}
        </div>
      )}
      <p className={cx('text-sm', panel ? 'mb-1 font-medium' : 'theme-muted-text')}>{title}</p>
      {description && <p className="max-w-xs text-xs theme-muted-text">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

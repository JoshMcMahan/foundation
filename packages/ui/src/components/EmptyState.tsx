import type { ReactNode } from 'react'
import { cx } from '../cx'

/** `panel` frames it in a card, standing in for a whole page or list; `plain`
 *  gives it the same room with no frame, for a list or page body that holds
 *  nothing; `dashed` draws a dashed frame, for a place to add or drop the
 *  first item; `bare` is small, inside something that already frames it, such
 *  as a sidebar, a menu or a dialog. */
export type EmptyStateVariant = 'panel' | 'plain' | 'dashed' | 'bare'

export interface EmptyStateProps {
  title: ReactNode
  description?: ReactNode
  /** What to do about it, such as a create button. */
  action?: ReactNode
  /** A glyph for what is missing, drawn bare and faded above the title. */
  icon?: ReactNode
  variant?: EmptyStateVariant | undefined
  /** Makes the title a heading at this level, for an empty state that stands
   *  in for a section's content; a paragraph otherwise. */
  headingLevel?: 2 | 3 | 4 | undefined
  className?: string | undefined
  testId?: string | undefined
}

// Full literal strings, so Tailwind's scanner emits them.
const frames: Record<EmptyStateVariant, string> = {
  panel: 'panel px-6 py-12',
  plain: 'px-6 py-16',
  dashed: 'rounded-xl border border-dashed border-(--theme-border) px-6 py-12',
  bare: 'px-3 py-6',
}

/** What shows where there is nothing yet, or nothing matches: what's missing,
 *  and what to do about it. */
export function EmptyState({
  title,
  description,
  action,
  icon,
  variant = 'panel',
  headingLevel,
  className,
  testId,
}: EmptyStateProps) {
  const bare = variant === 'bare'
  const Title = headingLevel ? (`h${headingLevel}` as const) : 'p'
  return (
    <div
      data-testid={testId}
      className={cx(
        'flex flex-col items-center justify-center text-center',
        frames[variant],
        className,
      )}
    >
      {!!icon && (
        // A faded glyph rather than a tile, so the words lead and the icon only hints.
        <div
          aria-hidden="true"
          className={cx(
            'flex items-center justify-center text-(--theme-muted-text-color) opacity-40',
            bare ? 'mb-2 [&_svg]:size-6' : 'mb-3 [&_svg]:size-8',
          )}
        >
          {icon}
        </div>
      )}
      <Title
        className={cx(
          'm-0 text-sm',
          bare ? 'text-(--theme-muted-text-color)' : 'mb-1 font-medium text-(--theme-app)',
        )}
      >
        {title}
      </Title>
      {!!description && (
        <p className="m-0 max-w-sm text-xs text-(--theme-muted-text-color)">{description}</p>
      )}
      {!!action && <div className="mt-4">{action}</div>}
    </div>
  )
}

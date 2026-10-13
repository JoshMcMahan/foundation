import { clsx as cx } from 'clsx'
import type { ReactNode } from 'react'
import { ChevronRightIcon } from '../../icons'

/** The line a turn's reasoning folds under. It opens the reasoning in place,
 *  above the answer it led to, rather than in a panel the eye has to cross
 *  the page to read. */
export function ReasoningToggle({
  open,
  onToggle,
  shimmer = false,
  children,
}: {
  open: boolean
  onToggle: () => void
  /** While the model is still thinking the label shimmers. */
  shimmer?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="group/reasoning -ml-1 flex items-center gap-x-1 rounded-md px-1 py-0.5 text-sm theme-muted-text transition-colors hover:theme-text"
    >
      <span className={cx(shimmer && 'animate-shimmer text-shimmer')}>{children}</span>
      <ChevronRightIcon
        className={cx(
          'h-3.5 w-3.5 transition-transform duration-200 motion-reduce:transition-none',
          open && 'rotate-90',
        )}
      />
    </button>
  )
}

/** The reasoning itself: smaller and quieter than the answer, hung off a
 *  hairline of the accent so it reads as the assistant's aside. */
export function ReasoningBody({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={cx(
        'chat-reasoning-body ml-1 mt-1.5 mb-3 pl-4 text-sm leading-relaxed theme-muted-text',
        className,
      )}
    >
      {children}
    </div>
  )
}

import type { ReactNode } from 'react'
import { Disclosure } from '../../components/Disclosure'
import { cx } from '../../cx'
import { ChevronRightIcon } from '../../icons'

const toggleClasses =
  '-ml-1 rounded-md px-1 py-0.5 text-sm theme-muted-text transition-colors hover:theme-text'

/** A turn's reasoning, folded under a line such as "Thought for 5s". It opens
 *  in place, above the answer it led to, rather than in a panel the eye has to
 *  cross the page to read; with `onOpenPanel` the host shows it elsewhere
 *  instead. */
export function Reasoning({
  label,
  shimmer = false,
  open,
  onOpenChange,
  onOpenPanel,
  preview,
  children,
}: {
  label: ReactNode
  /** While the model is still thinking the label shimmers. */
  shimmer?: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Shows the reasoning in the host's own panel in place of opening it here. */
  onOpenPanel?: (() => void) | undefined
  /** Shown under the folded line, such as the latest lines while it streams. */
  preview?: ReactNode
  children: ReactNode
}) {
  const shown = <span className={cx(shimmer && 'animate-shimmer text-shimmer')}>{label}</span>
  if (onOpenPanel) {
    return (
      <>
        <button
          type="button"
          onClick={onOpenPanel}
          className={cx('flex items-center gap-1', toggleClasses)}
        >
          {shown}
          <ChevronRightIcon aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
        {preview}
      </>
    )
  }
  return (
    <>
      <Disclosure
        summary={shown}
        open={open}
        onOpenChange={onOpenChange}
        summaryClassName={toggleClasses}
      >
        <ReasoningBody>{children}</ReasoningBody>
      </Disclosure>
      {!open && preview}
    </>
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

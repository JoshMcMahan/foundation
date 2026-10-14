import type { ReactNode } from 'react'
import { Button } from '../../components/Button'
import { Callout, type CalloutTone } from '../../components/Callout'
import { cx } from '../../cx'
import { CloseIcon } from '../../icons'

export type NoticeTone = 'neutral' | 'info' | 'warning' | 'danger'

const calloutTone: Record<NoticeTone, CalloutTone> = {
  neutral: 'default',
  info: 'info',
  warning: 'warning',
  danger: 'error',
}

/** A standing condition on the surface: a full-width bar under the header
 *  with a title, an explanation, and the one thing the reader can do about it. */
export function NoticeBar({
  tone,
  title,
  children,
  action,
  onAction,
  testId,
}: {
  tone: NoticeTone
  title: string
  children?: ReactNode
  action?: string
  onAction?: () => void
  testId?: string
}) {
  return (
    <Callout
      tone={calloutTone[tone]}
      variant="bar"
      title={title}
      testId={testId}
      className="shrink-0 px-6"
      {...(action && onAction
        ? {
            action: (
              <Button size="sm" variant="outline" onClick={onAction}>
                {action}
              </Button>
            ),
          }
        : {})}
    >
      {children}
    </Callout>
  )
}

/** What a command printed, kept verbatim under the command that printed it. */
export function OutputCard({
  title,
  text,
  onDismiss,
  dismissLabel,
  testId,
}: {
  title: string
  text: string
  onDismiss?: () => void
  dismissLabel?: string
  testId?: string
}) {
  return (
    <section
      data-testid={testId}
      aria-label={title}
      className="relative my-3 rounded-lg border theme-border theme-muted-panel px-3 py-2"
    >
      <p className={cx('font-mono text-[11px] theme-muted-text', onDismiss && 'pr-6')}>{title}</p>
      <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-xs theme-text">
        {text}
      </pre>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={dismissLabel}
          title={dismissLabel}
          className="absolute top-1.5 right-1.5 rounded p-1 theme-muted-text hover:theme-hover"
        >
          <CloseIcon className="h-3.5 w-3.5" />
        </button>
      )}
    </section>
  )
}

/** An inline notice next to the composer. One with no dismiss states a fact
 *  that is still true; one with a dismiss is a message the reader can put away. */
export function NoticeCard({
  tone = 'neutral',
  children,
  onDismiss,
  testId,
}: {
  tone?: NoticeTone
  children: ReactNode
  /** Adds a close button, named by the provider's `dismiss` string. */
  onDismiss?: () => void
  testId?: string
}) {
  return (
    <Callout tone={calloutTone[tone]} size="sm" icon={false} onDismiss={onDismiss} testId={testId}>
      {children}
    </Callout>
  )
}

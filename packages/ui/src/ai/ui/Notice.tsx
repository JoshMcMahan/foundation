import type { ReactNode } from 'react'
import { cx } from '../../cx'
import { CloseIcon, ErrorIcon, InfoIcon } from '../../icons'

export type NoticeTone = 'neutral' | 'info' | 'warning' | 'danger'

const barTone: Record<NoticeTone, string> = {
  neutral: 'theme-border theme-muted-panel',
  info: 'border-blue-500/30 bg-blue-500/10',
  warning: 'border-amber-500/40 bg-amber-500/10',
  danger: 'border-red-500/30 bg-red-500/10',
}

const iconTone: Record<NoticeTone, string> = {
  neutral: 'theme-muted-text',
  info: 'text-blue-600 dark:text-blue-400',
  warning: 'text-amber-600 dark:text-amber-400',
  danger: 'text-red-600 dark:text-red-400',
}

const titleTone: Record<NoticeTone, string> = {
  neutral: 'theme-text',
  info: 'text-blue-700 dark:text-blue-300',
  warning: 'text-amber-700 dark:text-amber-300',
  danger: 'text-red-700 dark:text-red-300',
}

const cardTone: Record<NoticeTone, string> = {
  neutral: 'theme-border theme-muted-panel theme-muted-text',
  info: 'border-blue-500/40 bg-blue-500/10 text-blue-800 dark:text-blue-200',
  warning: 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200',
  danger: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300',
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
  const Icon = tone === 'danger' || tone === 'warning' ? ErrorIcon : InfoIcon
  return (
    <div
      data-testid={testId}
      className={cx('flex shrink-0 items-start gap-3 border-b px-6 py-3', barTone[tone])}
    >
      <Icon className={cx('mt-0.5 h-4 w-4 shrink-0', iconTone[tone])} />
      <div className="min-w-0 flex-1">
        <p className={cx('text-sm font-medium', titleTone[tone])}>{title}</p>
        {children && <p className="mt-0.5 text-xs theme-muted-text">{children}</p>}
      </div>
      {action && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="shrink-0 rounded-lg border theme-border bg-(--theme-panel-bg) px-3 py-1.5 text-xs theme-text hover:theme-hover"
        >
          {action}
        </button>
      )}
    </div>
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
  dismissLabel,
  testId,
}: {
  tone?: NoticeTone
  children: ReactNode
  onDismiss?: () => void
  dismissLabel?: string
  testId?: string
}) {
  return (
    <div
      data-testid={testId}
      className={cx('flex items-start gap-2 rounded-lg border px-3 py-2 text-xs', cardTone[tone])}
    >
      <span className="flex-1">{children}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={dismissLabel}
          title={dismissLabel}
          className="shrink-0 rounded p-0.5 hover:theme-hover"
        >
          <CloseIcon className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}

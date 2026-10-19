import type { ReactNode } from 'react'
import { cx } from '../../cx'

/** Where a new conversation starts: the heading and the composer together, a
 *  little above center, with what the surface offers next under the box. The
 *  composer keeps its place however much is under it, so surfaces that share
 *  the stage put it in the same spot; a long list scrolls instead. */
export default function ChatStage({
  heading,
  subheading,
  children,
}: {
  heading?: ReactNode
  subheading?: ReactNode
  /** The composer, then whatever goes under it. */
  children: ReactNode
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto [container-type:size] [scrollbar-gutter:stable_both-edges]">
      <div className="w-full pt-[max(2rem,24cqh)] pb-[12vh]">
        {heading && (
          <div className="mx-auto mb-6 max-w-[var(--chat-column,50rem)] px-8 text-center">
            <h1 className="text-[1.75rem] leading-tight font-medium tracking-[-0.02em] text-balance text-(--theme-app)">
              {heading}
            </h1>
            {subheading && <p className="mt-2 text-sm theme-muted-text">{subheading}</p>}
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

/** A row under the composer, such as a suggested prompt or a recent session.
 *  Give it to the host's own button or link. */
export const stageListRowClassName =
  '-mx-3 my-1 flex w-[calc(100%+1.5rem)] items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-pretty theme-muted-text transition-colors hover:chat-tint hover:theme-text disabled:cursor-not-allowed disabled:opacity-50'

/** The rows under the composer, ruled between, at the column's width, or
 *  `flush` inside a column the host already lays out. */
export function StageList({
  children,
  testId,
  flush = false,
}: {
  children: ReactNode
  testId?: string | undefined
  flush?: boolean
}) {
  return (
    <ul
      className={cx(
        '[&>li]:border-b [&>li]:theme-border [&>li:last-child]:border-b-0',
        !flush && 'mx-auto max-w-[var(--chat-column,50rem)] px-8',
      )}
      {...(testId ? { 'data-testid': testId } : {})}
    >
      {children}
    </ul>
  )
}

/** A row's content: an optional mark, the label, and what goes at its end,
 *  such as a machine and a time. */
export function StageListRowContent({
  leading,
  label,
  meta,
}: {
  leading?: ReactNode
  label: ReactNode
  meta?: ReactNode
}) {
  return (
    <>
      {leading && <span className="flex shrink-0">{leading}</span>}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {meta && (
        <span className="flex shrink-0 items-center gap-2 text-xs tabular-nums">{meta}</span>
      )}
    </>
  )
}

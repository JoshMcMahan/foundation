import type { ReactNode } from 'react'

/** Where a new conversation starts: the heading and the composer together, a
 *  little above centre, with what the surface offers next under the box. The
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

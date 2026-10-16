import { type ReactNode, useState } from 'react'
import { cx } from '../cx'
import { stickyClasses, useStickyTop } from './stickyTop'

export interface StickyBarProps {
  /** Padding, borders and layout; the bar sets its own position, `top`,
   *  layer and background. */
  className?: string | undefined
  testId?: string | undefined
  children?: ReactNode
}

/** A strip of a page's own controls, such as a row of filters or a page's
 *  actions, pinned as the page scrolls. It stops just below whatever its
 *  scroller already pins at the top, such as the page header, and moves with
 *  it as that wraps or changes height. For an `ActionToolbar` or `Tabs` alone,
 *  give them `sticky` instead. */
export function StickyBar({ className, testId, children }: StickyBarProps) {
  const [el, setEl] = useState<HTMLDivElement | null>(null)
  useStickyTop(el, true)
  return (
    <div ref={setEl} data-testid={testId} className={cx(stickyClasses, className)}>
      {children}
    </div>
  )
}

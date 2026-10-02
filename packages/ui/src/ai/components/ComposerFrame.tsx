import cx from 'classnames'
import type { ReactNode } from 'react'
import { ComposerContext, ComposerControls, ComposerSettings } from './ComposerChrome'

/** The column a composer sits in: notices above it, what the agent is doing
 *  right now, a row of chips saying where the message goes, the box itself,
 *  and a row of settings under it with the model and allocation on the right. */
export default function ComposerFrame({
  notices,
  activity,
  above,
  belowLeft,
  belowRight,
  hint,
  className,
  children,
}: {
  notices?: ReactNode
  /** Sits where a terminal's spinner line would, just above the box. */
  activity?: ReactNode
  above?: ReactNode
  belowLeft?: ReactNode
  /** Defaults to the model and allocation pickers. */
  belowRight?: ReactNode
  hint?: string | undefined
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cx('shrink-0 px-6 pb-6 pt-2', className)}>
      <div className="mx-auto w-full max-w-[50rem] space-y-2">
        {notices}
        <div>
          {activity && <div className="mb-2">{activity}</div>}
          {above && <ComposerContext>{above}</ComposerContext>}
          {children}
          <ComposerSettings left={belowLeft}>{belowRight ?? <ComposerControls />}</ComposerSettings>
          {hint && <p className="mt-1 text-center text-[11px] theme-muted-text">{hint}</p>}
        </div>
      </div>
    </div>
  )
}

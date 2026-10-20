import type { ReactNode } from 'react'
import { cx } from '../cx'
import {
  CloseIcon,
  ErrorIcon,
  type IconType,
  InfoIcon,
  LockIcon,
  SuccessIcon,
  WarningIcon,
} from '../icons'
import { IconButton } from './IconButton'
import { useStrings } from './Provider'
import { type Tone, toneIcon, toneSurface } from './tone'

/** A callout's tone: `default` for a plain note, a status, or `muted` for a quiet
 *  note that something is read-only, such as a page only admins can change. */
export type CalloutTone = Extract<
  Tone,
  'default' | 'info' | 'success' | 'warning' | 'error' | 'muted'
>

export interface CalloutProps {
  tone?: CalloutTone | undefined
  /** A bold first line that says what happened; the children explain it. */
  title?: ReactNode
  children?: ReactNode
  /** The one thing the reader can do about it, such as a retry button. */
  action?: ReactNode
  /** Adds a close button, for a message the reader can put away. */
  onDismiss?: (() => void) | undefined
  /** Replaces the tone's icon; false shows none. */
  icon?: ReactNode
  /** `card` is a framed box among the content; `bar` runs the full width under
   *  a header, ruled off below, for a condition that holds across the surface. */
  variant?: 'card' | 'bar' | undefined
  /** `sm` sits beside a compact control, such as a composer. */
  size?: 'sm' | 'md' | undefined
  /** Announces it as it appears, for a message that arrives after the surface
   *  has loaded, such as a failed save. A callout that's there from the start
   *  is read in its place, with the content around it. */
  live?: boolean | undefined
  className?: string | undefined
  testId?: string | undefined
}

const toneIcons: Record<CalloutTone, IconType> = {
  default: InfoIcon,
  info: InfoIcon,
  success: SuccessIcon,
  warning: WarningIcon,
  error: ErrorIcon,
  muted: LockIcon,
}

/** A message set into the page in a status's tone: guidance, a warning, an error
 *  or a success, and what to do about it. For a passing notice that floats over
 *  the page, use `toast`. */
export function Callout({
  tone = 'info',
  title,
  children,
  action,
  onDismiss,
  icon,
  variant = 'card',
  size = 'md',
  live = false,
  className,
  testId,
}: CalloutProps) {
  const { common } = useStrings()
  const small = size === 'sm'
  const Icon = toneIcons[tone]
  return (
    <div
      data-testid={testId}
      // An error interrupts; anything else waits for the reader to finish.
      {...(live ? { role: tone === 'error' ? 'alert' : 'status' } : {})}
      className={cx(
        'flex items-start',
        toneSurface[tone],
        small ? 'gap-2 px-3 py-2 text-xs leading-4' : 'gap-3 px-4 py-3 text-sm leading-5',
        variant === 'card' ? 'rounded-xl border' : 'border-0 border-b',
        className,
      )}
    >
      {icon !== false && (
        // As tall as a line of text, so the icon centers on the first one.
        <span
          aria-hidden="true"
          className={cx(
            'flex shrink-0 items-center',
            small ? 'h-4 [&_svg]:size-4' : 'h-5 [&_svg]:size-5',
            toneIcon[tone],
          )}
        >
          {icon ?? <Icon />}
        </span>
      )}
      <div className="min-w-0 flex-1">
        {title !== undefined && <p className="m-0 font-medium">{title}</p>}
        {children !== undefined && (
          <div className={cx(title !== undefined && 'mt-0.5')}>{children}</div>
        )}
      </div>
      {action !== undefined && (
        // One line tall like the icon, so a button taller than the text centers on
        // the first line and spills into the padding instead of sitting below it.
        <div className={cx('flex shrink-0 items-center gap-2', small ? 'h-4' : 'h-5')}>
          {action}
        </div>
      )}
      {onDismiss && (
        <IconButton
          size="xs"
          icon={<CloseIcon />}
          label={common.dismiss}
          onClick={onDismiss}
          className={small ? '-my-1 -me-1' : '-my-0.5 -me-1'}
        />
      )}
    </div>
  )
}

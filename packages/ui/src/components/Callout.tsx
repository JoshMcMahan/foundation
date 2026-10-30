import { type ReactNode, useEffect, useRef, useState } from 'react'
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
import { SAID_FOR_MS } from './liveText'
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
  /** Announces it as it appears, and again when its words change, for a message
   *  that arrives after the surface has loaded, such as a failed save: an error at
   *  once, anything else when the reader pauses. A callout that's there from the
   *  start is read in its place, with the content around it. */
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
  // An alert is read as it's added. A status region is read only when its words change, so a
  // live callout that isn't an error carries an empty one and fills it a moment after it
  // appears or its words change, then clears it once heard.
  const polite = live && tone !== 'error'
  const box = useRef<HTMLDivElement>(null)
  const region = useRef<HTMLSpanElement>(null)
  const [words, setWords] = useState('')
  const [said, setSaid] = useState('')
  // After every render, since the words are whatever the title and children rendered.
  useEffect(() => {
    const next = polite ? spokenWords(box.current, region.current) : ''
    if (next !== words) {
      setWords(next)
    }
  })
  useEffect(() => {
    if (!words) {
      return
    }
    const say = setTimeout(() => setSaid(words), SAY_AFTER_MS)
    const clear = setTimeout(() => setSaid(''), SAY_AFTER_MS + SAID_FOR_MS)
    return () => {
      clearTimeout(say)
      clearTimeout(clear)
      // Empty again, so the next words, or the same ones when it goes live again, are a change.
      setSaid('')
    }
  }, [words])
  const Icon = toneIcons[tone]
  const controls = (
    <>
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
          className={cx('shrink-0', small ? '-my-1 -me-1' : '-my-0.5 -me-1')}
        />
      )}
    </>
  )
  return (
    <div
      ref={box}
      data-testid={testId}
      {...(live && !polite ? { role: 'alert' } : {})}
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
      {title !== undefined ? (
        // With a title, the action and the dismiss button sit on its line, and the body below
        // reaches the callout's far edge under them, such as a value to copy.
        <div className="min-w-0 flex-1">
          <div className={cx('flex items-start', small ? 'gap-2' : 'gap-3')}>
            <p className="m-0 min-w-0 flex-1 font-medium">{title}</p>
            {controls}
          </div>
          {children !== undefined && <div className="mt-0.5">{children}</div>}
        </div>
      ) : (
        <>
          <div className="min-w-0 flex-1">{children}</div>
          {controls}
        </>
      )}
      {polite && (
        <span ref={region} role="status" className="sr-only">
          {said}
        </span>
      )}
    </div>
  )
}

/** The callout's words, leaving out its own status region, which repeats them. */
function spokenWords(box: HTMLElement | null, region: HTMLElement | null): string {
  if (!box) {
    return ''
  }
  return Array.from(box.children)
    .filter((child) => child !== region)
    .map(
      (child) =>
        // biome-ignore lint/performance/useDomNodeTextContent: innerText keeps the breaks between its lines, so a list's items aren't read as one word
        (child as HTMLElement).innerText ?? child.textContent ?? '',
    )
    .filter(Boolean)
    .join('\n')
}

// Long enough after the callout appears for assistive technology to have met its empty
// status region, so filling it is read as a change.
const SAY_AFTER_MS = 150

import { type CSSProperties, type ReactNode, useLayoutEffect, useRef, useState } from 'react'
import { cx } from '../cx'
import { RunningIcon } from '../icons'
import { useStrings } from './Provider'
import { pinnedAbove, scrollContainer } from './stickyTop'

const RIPPLE_STAGGER_S = 0.22

const LOGO_RINGS = [
  'M24.89,55V32.14a7.25,7.25,0,1,1,7.25,7.25h-6',
  'M17.27,58.12v-26A14.88,14.88,0,1,1,32.14,47H24.89',
  'M9.25,52.35V32.14A22.9,22.9,0,1,1,32.14,55H24.89',
  'M62.68,32.14A30.54,30.54,0,1,1,1.6,32.14,30.54,30.54,0,1,1,62.68,32.14',
]

export interface LoaderProps {
  /** The spinner's size, in pixels or any CSS length: 48 by default, and 40
   *  when it fills a page or a section. */
  size?: number | string
  /** Shown under the spinner, and its accessible name. Without one, the
   *  loader is named with the provider's `loading` string. */
  label?: string | undefined
  variant?: 'spinner' | 'logo'
  /** Sits in a line of text or a button instead of centering in its own row. */
  inline?: boolean
  /** The spinner's color, such as `currentColor` inside a button. */
  color?: string | undefined
  /** Beside text that already says what is happening, such as a busy button's
   *  label: hidden from assistive technology, and in the text's color. */
  decorative?: boolean
  /** Centers it in the room it stands for, so the page needs no box of its
   *  own: `screen` the whole window, such as while the app starts; `content`
   *  the app's content area beside its sidebar and under its top bar, however
   *  the page around it is laid out; `page` the page's scrolling region, such
   *  as while a route loads; `section` a pane or a card with no height of its
   *  own. */
  fill?: 'screen' | 'content' | 'page' | 'section' | undefined
}

// Full literal strings, so Tailwind's scanner emits them.
const fillClasses = {
  screen: 'flex min-h-dvh w-full items-center justify-center',
  // As tall as the window, held to the region when the region has a height.
  page: 'flex h-dvh max-h-full w-full items-center justify-center',
  section: 'flex w-full items-center justify-center py-16',
} as const

/** Something on the way that has no shape to sketch yet. When its shape is
 *  known, such as rows of a list, sketch it with `Skeleton` instead. */
export function Loader({ fill, ...props }: LoaderProps) {
  if (!fill) {
    return <LoaderMark {...props} />
  }
  if (fill === 'content') {
    return (
      <ContentArea>
        <LoaderMark {...props} size={props.size ?? 48} />
      </ContentArea>
    )
  }
  return (
    <div className={fillClasses[fill]}>
      <LoaderMark {...props} size={props.size ?? (fill === 'screen' ? 48 : 40)} />
    </div>
  )
}

function LoaderMark({
  size = 48,
  label,
  variant = 'spinner',
  inline = false,
  color,
  decorative = false,
}: Omit<LoaderProps, 'fill'>) {
  const { loading } = useStrings().common
  const dimension = typeof size === 'number' ? `${size}px` : size
  const spinner = (
    <RunningIcon
      aria-hidden="true"
      className="animate-spin motion-reduce:animate-none"
      style={{ fontSize: dimension }}
    />
  )
  if (decorative) {
    return (
      <span
        aria-hidden="true"
        className="inline-flex shrink-0"
        style={color ? { color } : undefined}
      >
        {spinner}
      </span>
    )
  }
  return (
    <span
      role="status"
      aria-label={label || loading}
      className={cx(
        'items-center',
        inline ? 'inline-flex gap-2' : 'flex w-full flex-col justify-center gap-y-1',
      )}
    >
      <span
        className={cx('inline-flex', !color && 'text-(--theme-accent)')}
        style={color ? { color } : undefined}
      >
        {variant === 'logo' ? (
          <svg
            viewBox="0 0 64.29 64.29"
            width={dimension}
            height={dimension}
            fill="none"
            stroke="currentColor"
            strokeWidth={3.2}
            aria-hidden="true"
          >
            {LOGO_RINGS.map((d, i) => (
              <path
                key={d}
                d={d}
                className="logo-loader-ring"
                style={{
                  animationDelay: `${(i * RIPPLE_STAGGER_S).toFixed(2)}s`,
                }}
              />
            ))}
          </svg>
        ) : (
          spinner
        )}
      </span>
      {label && <span className="text-center text-sm theme-muted-text">{label}</span>}
    </span>
  )
}

/** Centers its content in the box of the scrolling region it sits in, which in an app with a
 *  sidebar is its content area, below what that region pins at its top and held to what of it
 *  the window shows; the window, where the document itself scrolls. It lays nothing out around
 *  it and takes no pointer. */
function ContentArea({ children }: { children: ReactNode }) {
  const anchor = useRef<HTMLSpanElement>(null)
  const [box, setBox] = useState<CSSProperties | null>(null)
  useLayoutEffect(() => {
    const el = anchor.current
    if (!el) {
      return
    }
    const area = scrollContainer(el)
    if (area === el.ownerDocument.documentElement) {
      return
    }
    const view = el.ownerDocument.defaultView ?? window
    // Under what the page pins at the area's top, such as its header, which is chrome, not room.
    const pinned = pinnedAbove(el)
    const place = () => {
      const rect = area.getBoundingClientRect()
      const chrome = Math.max(0, ...pinned.chrome.map((c) => c.getBoundingClientRect().bottom))
      const top = Math.max(rect.top, chrome, 0)
      const bottom = Math.min(rect.bottom, view.innerHeight)
      setBox({ top, left: rect.left, width: rect.width, height: Math.max(bottom - top, 0) })
    }
    place()
    view.addEventListener('resize', place)
    // A sidebar opening or closing resizes the area beside it.
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place)
    observer?.observe(area)
    for (const chrome of pinned.chrome) {
      observer?.observe(chrome)
    }
    return () => {
      view.removeEventListener('resize', place)
      observer?.disconnect()
    }
  }, [])
  return (
    <>
      <span ref={anchor} hidden />
      <div
        data-loader-area=""
        className="pointer-events-none fixed inset-0 flex items-center justify-center"
        style={box ?? undefined}
      >
        {children}
      </div>
    </>
  )
}

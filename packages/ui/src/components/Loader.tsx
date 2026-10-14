import { cx } from '../cx'
import { RunningIcon } from '../icons'
import { useStrings } from './Provider'

const RIPPLE_STAGGER_S = 0.22

const LOGO_RINGS = [
  'M24.89,55V32.14a7.25,7.25,0,1,1,7.25,7.25h-6',
  'M17.27,58.12v-26A14.88,14.88,0,1,1,32.14,47H24.89',
  'M9.25,52.35V32.14A22.9,22.9,0,1,1,32.14,55H24.89',
  'M62.68,32.14A30.54,30.54,0,1,1,1.6,32.14,30.54,30.54,0,1,1,62.68,32.14',
]

export interface LoaderProps {
  /** The spinner's size, in pixels or any CSS length. */
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
}

/** Something on the way that has no shape to sketch yet. When its shape is
 *  known, such as rows of a list, sketch it with `Skeleton` instead. */
export function Loader({
  size = 48,
  label,
  variant = 'spinner',
  inline = false,
  color,
  decorative = false,
}: LoaderProps) {
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

import { mergeProps } from '@base-ui/react/merge-props'
import { useRender } from '@base-ui/react/use-render'
import type { ComponentPropsWithRef, ReactElement, ReactNode } from 'react'
import { cx } from '../cx'
import { useStrings } from './Provider'
import { type Tone, toneSurface, toneText } from './tone'

/** A badge's tone: a status, or the theme's accent for something set apart that
 *  isn't a status, such as "New". */
export type BadgeVariant = Tone | 'accent'

/** How loud a badge is: `soft` tints it, `solid` fills it for the one thing that
 *  must catch the eye, and `outline` leaves only its edge and text. */
export type BadgeEmphasis = 'soft' | 'solid' | 'outline'

/** A badge's outline: a `pill`, or a squarer `tag` for a label such as "Beta". */
export type BadgeShape = 'pill' | 'tag'

// The accent's own text shade can lack contrast on a tint, so words in the accent
// take the link color, which every theme keeps readable.
const softClasses: Record<BadgeVariant, string> = {
  ...toneSurface,
  accent: 'bg-(--theme-accent)/10 text-(--theme-link) border-(--theme-accent)/25',
}

// A solid fill carries small text, so it takes a status's text shade, which holds
// 4.5:1 against the page's own color in light and dark themes alike.
const solidClasses: Record<BadgeVariant, string> = {
  default: 'bg-(--theme-app) text-(--theme-app-bg) border-transparent',
  success: 'bg-(--theme-success-text) text-(--theme-app-bg) border-transparent',
  warning: 'bg-(--theme-warning-text) text-(--theme-app-bg) border-transparent',
  error: 'bg-(--theme-error-text) text-(--theme-app-bg) border-transparent',
  info: 'bg-(--theme-info-text) text-(--theme-app-bg) border-transparent',
  muted: 'bg-(--theme-muted-text-color) text-(--theme-app-bg) border-transparent',
  accent: 'bg-(--theme-accent) text-(--theme-accent-text) border-transparent',
}

const outlineClasses: Record<BadgeVariant, string> = {
  default: 'bg-transparent text-(--theme-app) border-(--theme-border)',
  success: 'bg-transparent text-(--theme-success-text) border-(--theme-success)/40',
  warning: 'bg-transparent text-(--theme-warning-text) border-(--theme-warning)/40',
  error: 'bg-transparent text-(--theme-error-text) border-(--theme-error)/40',
  info: 'bg-transparent text-(--theme-info-text) border-(--theme-info)/40',
  muted: 'bg-transparent text-(--theme-muted-text-color) border-(--theme-border)',
  accent: 'bg-transparent text-(--theme-link) border-(--theme-accent)/40',
}

const emphasisClasses: Record<BadgeEmphasis, Record<BadgeVariant, string>> = {
  soft: softClasses,
  solid: solidClasses,
  outline: outlineClasses,
}

// A lit lamp, as status lights have always looked: its tone's own light from a vivid top to a
// pale bottom, from the `--lamp-*` tokens, and a soft shadow that sets it slightly raised.
const LAMP = 'bg-[linear-gradient(var(--lamp-from),var(--lamp-to))] shadow-[0_0_3px_rgb(0_0_0/0.5)]'

// An unlit lamp: a hollow ring in the strong border color, which holds 3:1 in both modes.
const LAMP_OFF = 'shadow-[inset_0_0_0_1.5px_var(--theme-border-strong)]'

const sizeClasses = {
  sm: 'gap-1 py-px text-[10px] leading-3.5',
  md: 'gap-1.5 py-0.5 text-[11px] leading-4',
} as const

export type BadgeSize = keyof typeof sizeClasses

const padClasses: Record<BadgeShape, Record<BadgeSize, string>> = {
  pill: { sm: 'px-1.5', md: 'px-2' },
  tag: { sm: 'px-1', md: 'px-1.5' },
}

const shapeClasses: Record<BadgeShape, string> = {
  pill: 'rounded-full',
  tag: 'rounded-[4px]',
}

/** Any other span attribute and the ref reach its element, so it can be a Tooltip's or a popover's
 *  direct child. */
export interface StatusBadgeProps
  extends Omit<ComponentPropsWithRef<'span'>, 'children' | 'className'> {
  /** Badge content */
  children: ReactNode
  /** Visual variant */
  variant?: BadgeVariant | undefined
  /** `soft` (the default) tints it; `solid` fills it; `outline` draws only its edge. */
  emphasis?: BadgeEmphasis | undefined
  /** `pill` (the default), or `tag` for a squarer label such as "Preview". */
  shape?: BadgeShape | undefined
  /** Uppercase, tracked letters, for a short label such as "Beta". */
  caps?: boolean | undefined
  /** Cuts a long label off with an ellipsis instead of growing past its cell. */
  truncate?: boolean | undefined
  /** Show animated pulse indicator */
  pulse?: boolean | undefined
  /** Show a still indicator in the variant's color */
  dot?: boolean | undefined
  /** Size */
  size?: BadgeSize | undefined
  /** Renders the badge as this element, such as a link to what it names. */
  render?: ReactElement | undefined
  /** Additional class */
  className?: string | undefined
}

/** A line of text in a variant's color, for a status that stands beside a
 *  dot rather than inside a badge. */
export function statusTextClass(variant: BadgeVariant): string {
  return variant === 'accent' ? 'text-(--theme-link)' : toneText[variant]
}

/** A short status or label in a tone, such as "Running" or "Preview". */
export function StatusBadge({
  children,
  variant = 'default',
  emphasis = 'soft',
  shape = 'pill',
  caps = false,
  truncate = false,
  pulse = false,
  dot = false,
  size = 'sm',
  render,
  className,
  ref,
  ...rest
}: StatusBadgeProps) {
  return useRender({
    render: render ?? <span />,
    ref,
    props: mergeProps<'span'>(rest, {
      className: cx(
        'inline-flex items-center border font-medium no-underline',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--theme-focus)',
        sizeClasses[size],
        padClasses[shape][size],
        shapeClasses[shape],
        caps && 'uppercase tracking-wider',
        truncate && 'min-w-0 max-w-full',
        emphasisClasses[emphasis][variant],
        className,
      ),
      children: (
        <>
          {(pulse || dot) && (
            <StatusDot
              variant={variant}
              pulse={pulse}
              size={7}
              current={emphasis === 'solid'}
              className="shrink-0"
            />
          )}
          {truncate ? <span className="min-w-0 truncate">{children}</span> : children}
        </>
      ),
    }),
  })
}

/** Any other span attribute and the ref reach its element, so it can be a Tooltip's or a popover's
 *  direct child. */
export interface CountBadgeProps
  extends Omit<ComponentPropsWithRef<'span'>, 'children' | 'className'> {
  count: number
  /** Above it, the count reads as `max` and a plus, such as "99+". */
  max?: number | undefined
  /** Its tone, `accent` by default. A host with a color of its own, such as one
   *  for work waiting on an agent, passes it in `className`. */
  variant?: BadgeVariant | undefined
  /** `solid` (the default) for a count that asks for attention, such as unread
   *  messages; `soft` for one that only informs, such as a tab's total. */
  emphasis?: Exclude<BadgeEmphasis, 'outline'> | undefined
  size?: BadgeSize | undefined
  /** Read after the number by assistive technology, such as "unread", when the
   *  text around it doesn't say what it counts. */
  label?: string | undefined
  /** Shows a zero; otherwise a count of zero renders nothing. */
  showZero?: boolean | undefined
  /** The locale the number is written in; the browser's own without it. */
  locale?: string | undefined
  className?: string | undefined
}

const countSizeClasses: Record<BadgeSize, string> = {
  sm: 'min-w-3.5 px-1 text-[10px] leading-3.5',
  md: 'min-w-4 px-1.5 text-[11px] leading-4',
}

/** A number beside a link or tab, such as unread messages or items waiting,
 *  capped at `max` so a big count doesn't widen what it sits in. */
export function CountBadge({
  count,
  max = 99,
  variant = 'accent',
  emphasis = 'solid',
  size = 'md',
  label,
  showZero = false,
  locale,
  className,
  ...rest
}: CountBadgeProps) {
  const { common } = useStrings()
  if (count <= 0 && !showZero) {
    return null
  }
  const number = new Intl.NumberFormat(locale)
  const text = count > max ? common.countOverflow(number.format(max)) : number.format(count)
  return (
    <span
      {...rest}
      data-count={count}
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold tabular-nums',
        countSizeClasses[size],
        emphasisClasses[emphasis][variant],
        className,
      )}
    >
      {text}
      {label && <span className="sr-only"> {label}</span>}
    </span>
  )
}

/** Any other span attribute and the ref reach its element, so it can be a Tooltip's or a popover's
 *  direct child. */
export interface StatusDotProps
  extends Omit<ComponentPropsWithRef<'span'>, 'children' | 'className'> {
  /** The status's tone. */
  variant?: BadgeVariant | undefined
  /** A ping that ripples out from the lamp, for something under way; still for reduced motion. */
  pulse?: boolean | undefined
  /** Unlit: a hollow ring, for a status that is off or not known. */
  off?: boolean | undefined
  /** The lamp's width and height in pixels; 10 by default, as beside a status's words. A
   *  badge's is 7, so it keeps the badge's height. */
  size?: number | undefined
  /** A flat dot in the text's color, for one on a solid fill, where the tone would vanish. */
  current?: boolean | undefined
  className?: string | undefined
}

/** A status's lamp, lit in its tone, for a status that stands beside its words without a badge,
 *  such as "running" in a list's cell. A badge's own dot is a smaller one. Name the status in
 *  words beside it; the lamp alone is only seen. */
export function StatusDot({
  variant = 'default',
  pulse = false,
  off = false,
  size = 10,
  current = false,
  className,
  style,
  ...rest
}: StatusDotProps) {
  const look = current ? 'bg-current' : off ? LAMP_OFF : LAMP
  return (
    <span
      aria-hidden="true"
      {...rest}
      className={cx('relative inline-flex', className)}
      style={{
        ...style,
        width: size,
        height: size,
        ['--lamp-from' as string]: `var(--lamp-${variant}-from)`,
        ['--lamp-to' as string]: `var(--lamp-${variant}-to)`,
      }}
    >
      {pulse && !off && (
        <span
          className={cx(
            'absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 motion-reduce:hidden',
            current ? 'bg-current' : 'bg-(--lamp-from)',
          )}
        />
      )}
      <span
        data-lamp={current ? 'flat' : off ? 'off' : 'lit'}
        className={cx('relative inline-flex rounded-full', look)}
        style={{ width: size, height: size }}
      />
    </span>
  )
}

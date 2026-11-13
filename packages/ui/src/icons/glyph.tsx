import { type ReactNode, type SVGProps, useId } from 'react'

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  /** Width and height; the text's size by default. */
  size?: string | number | undefined
  /** Names the icon for assistive technology. Without it, or an `aria-label`,
   *  the icon is decoration and hidden from assistive technology. */
  title?: string | undefined
}

/** An icon from this module or the brand icons. */
export type IconType = (props: IconProps) => ReactNode

// Every glyph is drawn for this module on a 16px grid, with fewer and simpler
// shapes than a 24px set so they stay crisp at the 16px they're mostly shown at.
export const STROKE_WIDTH = 1.5

/** A glyph drawn as one path on the 16px grid, in the text's size and color by
 *  default, so a class such as `size-4` or a parent's font size sets it. */
export function drawn(d: string, defaults?: IconProps): IconType {
  // biome-ignore lint/correctness/noComponentHookFactories: the factory runs at module initialization, preserving component identity
  function Icon({
    title,
    children,
    size = '1em',
    color = 'currentColor',
    strokeWidth = STROKE_WIDTH,
    ...props
  }: IconProps) {
    const named = Boolean(title || props['aria-label'] || props['aria-labelledby'])
    return (
      // biome-ignore lint/a11y/noSvgWithoutTitle: hidden from assistive technology unless a title or label names it
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 16 16"
        width={size}
        height={size}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        {...defaults}
        {...(named ? { role: 'img' } : { 'aria-hidden': true })}
        {...props}
      >
        {title && <title>{title}</title>}
        <path d={d} />
        {children}
      </svg>
    )
  }
  return Icon
}

// A filled glyph marks a state its outline doesn't have, such as pinned.
export const filled: IconProps = { fill: 'currentColor' }

// Status icons. A status that has ended is a solid shape with its mark cut out through a mask,
// so the mark shows whatever is behind it — a hovered or selected row, a badge, a tooltip —
// rather than a color painted to match one surface. One still under way, or not begun, is a
// ring. They stay on the 16px grid but aren't one path, so they're built here, not `drawn`.

export const DISC = 'M8 14.75A6.75 6.75 0 1 0 8 1.25a6.75 6.75 0 0 0 0 13.5Z'
export const TRIANGLE =
  'M7.13 1.9a1 1 0 0 1 1.74 0l6.1 10.6a1 1 0 0 1-.87 1.5H1.9a1 1 0 0 1-.87-1.5Z'

// A cut-out mark loses a little to the shape's edge, so it is cut a touch wider than a stroke.
export const KNOCKOUT_WIDTH = 1.6

/** The `svg` every status icon shares: the 16px grid at the text's size, hidden from assistive
 *  technology unless a title or label names it. */
export function StatusSvg({
  title,
  children,
  size = '1em',
  color = 'currentColor',
  strokeWidth = STROKE_WIDTH,
  ...props
}: IconProps) {
  const named = Boolean(title || props['aria-label'] || props['aria-labelledby'])
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: hidden from assistive technology unless a title or label names it
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...(named ? { role: 'img' } : { 'aria-hidden': true })}
      {...props}
    >
      {title && <title>{title}</title>}
      {children}
    </svg>
  )
}

/** A solid `shape` with `mark` cut out of it. The mask's id is the instance's own, so two on a
 *  page never borrow each other's. */
export function knockedOut(shape: string, mark: string): IconType {
  // biome-ignore lint/correctness/noComponentHookFactories: the factory runs at module initialization, preserving component identity
  function Icon({ children, color = 'currentColor', ...props }: IconProps) {
    const id = `status-mask-${useId().replace(/[^\w-]/g, '')}`
    return (
      <StatusSvg color={color} data-status-icon="filled" {...props}>
        <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="16" height="16">
          <rect width="16" height="16" fill="#fff" stroke="none" />
          <path d={mark} stroke="#000" strokeWidth={KNOCKOUT_WIDTH} />
        </mask>
        <path d={shape} fill={color} stroke="none" mask={`url(#${id})`} />
        {children}
      </StatusSvg>
    )
  }
  return Icon
}

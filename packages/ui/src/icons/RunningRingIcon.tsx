import { type IconProps, StatusSvg } from './glyph'

/** Under way: a faint track, a quarter arc that turns around it and a center dot that breathes.
 *  Both hold still for a reader who asks for reduced motion. */
export function RunningRingIcon({ children, color = 'currentColor', ...props }: IconProps) {
  return (
    <StatusSvg color={color} data-status-icon="ring" {...props}>
      <circle cx="8" cy="8" r="6" opacity="0.25" />
      <path
        d="M8 2a6 6 0 0 1 6 6"
        className="origin-center [transform-box:view-box] motion-safe:animate-[spin_1.6s_linear_infinite]"
      />
      <circle
        cx="8"
        cy="8"
        r="2.6"
        fill={color}
        stroke="none"
        className="motion-safe:animate-pulse"
      />
      {children}
    </StatusSvg>
  )
}

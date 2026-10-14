import type { ReactNode } from 'react'
import { cx } from '../cx'
import { type Tone, toneFill, toneSurface, toneText } from './tone'

/** A badge's tone. */
export type BadgeVariant = Tone

interface StatusBadgeProps {
  /** Badge content */
  children: ReactNode
  /** Visual variant */
  variant?: BadgeVariant
  /** Show animated pulse indicator */
  pulse?: boolean
  /** Show a still indicator in the variant's color */
  dot?: boolean
  /** Size */
  size?: 'sm' | 'md'
  /** Additional class */
  className?: string
}

/** A line of text in a variant's color, for a status that stands beside a
 *  dot rather than inside a badge. */
export function statusTextClass(variant: BadgeVariant): string {
  return toneText[variant]
}

export function StatusBadge({
  children,
  variant = 'default',
  pulse = false,
  dot = false,
  size = 'sm',
  className,
}: StatusBadgeProps) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full border font-medium',
        size === 'sm' && 'px-2 py-0.5 text-[10px]',
        size === 'md' && 'px-2.5 py-1 text-xs',
        toneSurface[variant],
        className,
      )}
    >
      {pulse && (
        <span className="relative flex h-2 w-2">
          <span
            className={cx(
              'absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 motion-reduce:hidden',
              toneFill[variant],
            )}
          />
          <span className={cx('relative inline-flex h-2 w-2 rounded-full', toneFill[variant])} />
        </span>
      )}
      {dot && !pulse && (
        <span className={cx('inline-flex h-1.5 w-1.5 rounded-full', toneFill[variant])} />
      )}
      {children}
    </span>
  )
}

interface StatusDotProps {
  variant?: BadgeVariant
  pulse?: boolean
  size?: number
  className?: string
}

export function StatusDot({
  variant = 'default',
  pulse = false,
  size = 8,
  className,
}: StatusDotProps) {
  return (
    <span className={cx('relative inline-flex', className)} style={{ width: size, height: size }}>
      {pulse && (
        <span
          className={cx(
            'absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 motion-reduce:hidden',
            toneFill[variant],
          )}
        />
      )}
      <span
        className={cx('relative inline-flex rounded-full', toneFill[variant])}
        style={{ width: size, height: size }}
      />
    </span>
  )
}

import type { ComponentPropsWithRef } from 'react'
import { cx } from '../cx'

/** A compact letter badge ("AI", "PUB", "SSH") used as a type mark in place of
 * an icon. Size the box and text via className (e.g. "h-5 w-5 text-[8px]"). */
/** Any other span attribute and the ref reach its element, so it can be a Tooltip's or a popover's
 *  direct child. */
export interface LetterBadgeProps
  extends Omit<ComponentPropsWithRef<'span'>, 'children' | 'className'> {
  text: string
  className?: string | undefined
}

export function LetterBadge({ text, className, ...rest }: LetterBadgeProps) {
  return (
    <span
      {...rest}
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-[3px] border theme-border font-bold leading-none tracking-tight text-(--theme-app)',
        className,
      )}
    >
      {text}
    </span>
  )
}

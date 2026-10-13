import { type ComponentPropsWithRef, type ReactNode, useCallback, useRef } from 'react'
import { cx } from '../cx'
import { type ButtonSize, type ButtonVariant, buttonClasses } from './buttonClasses'
import { useShortcutKey } from './shortcutKey'
import { Tooltip } from './Tooltip'

export interface IconButtonProps extends ComponentPropsWithRef<'button'> {
  icon: ReactNode
  /** The accessible name, also shown as the tooltip. */
  label: string
  variant?: ButtonVariant
  size?: ButtonSize
  /** A toggle's state: set, it reads as pressed (`aria-pressed`). */
  pressed?: boolean | undefined
  /** A dot in the corner, such as for filters narrowing what the page shows. */
  dot?: boolean
  /** A single key, such as F, that presses the button from anywhere on the page
   *  outside a text field. Also shown in the tooltip. */
  shortcut?: string | undefined
}

/** A button that shows only an icon, named by its tooltip. It can be a popup's
 *  trigger: it passes the trigger's props and ref on, and hides its tooltip while
 *  the popup is open. */
export function IconButton({
  icon,
  label,
  variant = 'ghost',
  size = 'sm',
  pressed,
  dot = false,
  shortcut,
  className,
  ref,
  ...props
}: IconButtonProps) {
  const button = useRef<HTMLButtonElement | null>(null)
  const setButton = useCallback(
    (node: HTMLButtonElement | null) => {
      button.current = node
      if (typeof ref === 'function') {
        ref(node)
      } else if (ref) {
        ref.current = node
      }
    },
    [ref],
  )
  useShortcutKey(shortcut, () => button.current?.click())
  return (
    <Tooltip
      content={label}
      shortcut={shortcut?.toUpperCase()}
      // A popup trigger reports itself expanded while its popup is open; a
      // disclosure, such as a sidebar toggle, keeps its tooltip.
      disabled={props['aria-expanded'] === true && !!props['aria-haspopup']}
    >
      <button
        type="button"
        aria-label={label}
        aria-pressed={pressed}
        ref={setButton}
        className={cx(buttonClasses({ variant, size, iconOnly: true }), className)}
        {...props}
      >
        {icon}
        {dot && (
          <span className="absolute right-0 top-0 h-1.5 w-1.5 rounded-full bg-(--theme-link)" />
        )}
      </button>
    </Tooltip>
  )
}

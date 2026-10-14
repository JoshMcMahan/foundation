import { type ComponentPropsWithRef, type ReactNode, type Ref, useCallback, useRef } from 'react'
import { cx } from '../cx'
import { AppLink, type AppLinkProps } from './AppLink'
import { type ButtonSize, type ButtonVariant, buttonClasses } from './buttonClasses'
import { useShortcutKey } from './shortcutKey'
import { Tooltip } from './Tooltip'

interface IconButtonOwnProps {
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

/** With `href` it is a link that looks like the button, for navigation. */
export type IconButtonProps = IconButtonOwnProps &
  (
    | (ComponentPropsWithRef<'button'> & { href?: undefined })
    | (Omit<AppLinkProps, 'href'> & { href: string })
  )

/** A button that shows only an icon, named by its tooltip, or with `href` a
 *  link that looks like one. It can be a popup's trigger: it passes the
 *  trigger's props and ref on, and hides its tooltip while the popup is open. */
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
  const button = useRef<HTMLElement | null>(null)
  const setButton = useCallback(
    (node: HTMLButtonElement & HTMLAnchorElement) => {
      button.current = node
      const forward = ref as Ref<HTMLElement> | undefined
      if (typeof forward === 'function') {
        forward(node)
      } else if (forward) {
        forward.current = node
      }
    },
    [ref],
  )
  const shared = {
    'aria-label': label,
    className: cx(buttonClasses({ variant, size, iconOnly: true }), className),
  }
  const content = (
    <>
      {icon}
      {dot && (
        <span className="absolute right-0 top-0 h-1.5 w-1.5 rounded-full bg-(--theme-link)" />
      )}
    </>
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
      {props.href !== undefined ? (
        <AppLink {...shared} ref={setButton} {...props}>
          {content}
        </AppLink>
      ) : (
        <button type="button" aria-pressed={pressed} {...shared} ref={setButton} {...props}>
          {content}
        </button>
      )}
    </Tooltip>
  )
}

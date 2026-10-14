import { Button as BaseButton } from '@base-ui/react/button'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cx } from '../cx'
import { ChevronRightIcon } from '../icons'
import { AppLink, type AppLinkProps, type LinkTarget } from './AppLink'
import { type ButtonStyle, buttonClasses } from './buttonClasses'
import { Loader } from './Loader'

interface ButtonOwnProps extends ButtonStyle {
  className?: string | undefined
  /** Before the label. */
  icon?: ReactNode
  /** Busy with what it started: a spinner takes the icon's place, and it can't
   *  be pressed again until done. */
  loading?: boolean | undefined
}

/** A button, or with `href` a link that looks like one: navigation stays a
 *  link, so it opens in a new tab and shows its URL like any other. */
export type ButtonProps = ButtonOwnProps &
  (
    | (Omit<BaseButton.Props, 'className'> & { href?: undefined })
    | (Omit<AppLinkProps, 'className'> & LinkTarget & { href: string })
  )

/** A button in the package's one look (see `buttonClasses`).
 *  `focusableWhenDisabled` keeps a disabled button's tooltip reachable; a
 *  disabled link stays focusable on its own. */
export function Button({
  variant,
  size = 'md',
  iconOnly,
  icon,
  loading = false,
  className,
  children,
  ...props
}: ButtonProps) {
  const classes = cx(buttonClasses({ variant, size, iconOnly }), className)
  const content = (
    <>
      {loading ? <Loader inline decorative size="1em" /> : icon}
      {children}
    </>
  )
  if (props.href !== undefined) {
    return (
      <AppLink
        {...props}
        disabled={props.disabled || loading}
        aria-busy={loading || undefined}
        className={classes}
      >
        {content}
      </AppLink>
    )
  }
  return (
    <BaseButton
      {...props}
      disabled={props.disabled || loading}
      aria-busy={loading || undefined}
      className={classes}
    >
      {content}
    </BaseButton>
  )
}

interface MethodButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: ReactNode
  label: string
  description?: string
  href?: string
  loading?: boolean
}

export function MethodButton({
  icon,
  label,
  description,
  href,
  loading,
  disabled,
  className = '',
  ...props
}: MethodButtonProps) {
  const baseClasses =
    'flex items-center w-full p-4 bg-[var(--theme-muted-panel-bg)] border border-[var(--theme-border)] rounded-xl text-[var(--theme-app)] text-[0.9375rem] font-medium cursor-pointer transition-all duration-200 no-underline mb-3 last:mb-0 hover:not-disabled:bg-(--theme-border) hover:not-disabled:border-(--theme-muted-text-color) hover:not-disabled:-translate-y-0.5 active:translate-y-0'

  // Hover lifts only while it can be pressed, so a disabled one keeps its resting look.
  const disabledClasses = 'disabled:opacity-60 disabled:cursor-not-allowed'

  const content = (
    <>
      {icon && (
        <span className="size-10 rounded-lg bg-gradient-to-br from-[var(--gradient-start,var(--theme-accent))] to-[var(--gradient-mid,var(--theme-link))] flex items-center justify-center shrink-0 mr-4 [&_svg]:size-5 [&_svg]:text-white">
          {icon}
        </span>
      )}
      <span className="flex-1 text-left">
        <span className="block font-semibold text-[var(--theme-app)]">{label}</span>
        {description && (
          <span className="block text-[0.8125rem] text-[var(--theme-muted-text-color)] font-normal mt-0.5">
            {description}
          </span>
        )}
      </span>
      {loading ? (
        <span className="ml-2 shrink-0 text-[var(--theme-muted-text-color)]">
          <Loader inline decorative size={20} color="currentColor" />
        </span>
      ) : (
        <ChevronRightIcon className="size-5 text-[var(--theme-muted-text-color)] shrink-0 ml-2 transition-all duration-200 group-hover:translate-x-[3px] group-hover:text-[var(--theme-app)]" />
      )}
    </>
  )

  if (href) {
    // API paths are files the router doesn't serve, so they load the page.
    return (
      <AppLink
        href={href}
        reloadDocument={href.startsWith('/api/')}
        className={cx('group', baseClasses, className)}
      >
        {content}
      </AppLink>
    )
  }

  return (
    <button
      type="button"
      className={cx('group', baseClasses, disabledClasses, className)}
      disabled={disabled || loading}
      {...props}
    >
      {content}
    </button>
  )
}

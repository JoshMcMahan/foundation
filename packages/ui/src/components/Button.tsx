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
  /** Busy with what it started: a spinner takes the icon's place, or without an
   *  icon sits over the label, so the button keeps its width. It can't be
   *  pressed again until done. */
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
  // A caller that shows its own progress, such as a label that says what is
  // under way, keeps its busy state when `loading` isn't set.
  const busy = loading || props['aria-busy'] || undefined
  const content =
    loading && !icon ? (
      // The label stays, unseen but still the button's name, so the button
      // keeps its width and a row of them doesn't shift.
      <>
        <span className="inline-flex items-center gap-1.5 opacity-0">{children}</span>
        <span className="absolute inset-0 flex items-center justify-center">
          <Loader inline decorative size="1em" />
        </span>
      </>
    ) : (
      <>
        {loading ? <Loader inline decorative size="1em" /> : icon}
        {children}
      </>
    )
  if (props.href !== undefined) {
    return (
      <AppLink {...props} disabled={props.disabled || loading} aria-busy={busy} className={classes}>
        {content}
      </AppLink>
    )
  }
  return (
    <BaseButton
      // A button that turns busy under the pointer or keyboard keeps focus, which a
      // plain disabled button would drop to the page.
      focusableWhenDisabled={loading || undefined}
      {...props}
      disabled={props.disabled || loading}
      aria-busy={busy}
      className={classes}
    >
      {content}
    </BaseButton>
  )
}

interface MethodButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon?: ReactNode
  label: string
  description?: string
  href?: string
  loading?: boolean
}

const methodClasses =
  'group flex w-full cursor-pointer items-center rounded-xl border border-(--theme-border) bg-(--theme-muted-panel-bg) p-4 text-[0.9375rem] font-medium text-(--theme-app) no-underline transition-[background-color,border-color,translate] duration-200 hover:not-disabled:not-aria-disabled:border-(--theme-muted-text-color) hover:not-disabled:not-aria-disabled:bg-(--theme-border) hover:not-disabled:not-aria-disabled:-translate-y-0.5 active:translate-y-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--theme-link) disabled:cursor-not-allowed disabled:opacity-60 aria-disabled:cursor-not-allowed aria-disabled:opacity-60 motion-reduce:transition-none motion-reduce:hover:translate-y-0'

/** One way to go on, such as a sign-in method: a large row with an icon, a
 *  label and a line under it. A list of them is spaced by its container. */
export function MethodButton({
  icon,
  label,
  description,
  href,
  loading = false,
  disabled = false,
  className,
  ...props
}: MethodButtonProps) {
  const content = (
    <>
      {icon && (
        // Text on the accent takes the accent's text color, which the theme keeps
        // readable on it in light and dark.
        <span className="mr-4 flex size-10 shrink-0 items-center justify-center rounded-lg bg-linear-to-br from-(--gradient-start,var(--theme-accent)) to-(--gradient-mid,var(--theme-link)) [&_svg]:size-5 [&_svg]:text-(--theme-accent-text)">
          {icon}
        </span>
      )}
      <span className="flex-1 text-left">
        <span className="block font-semibold">{label}</span>
        {description && (
          <span className="mt-0.5 block text-[0.8125rem] font-normal text-(--theme-muted-text-color)">
            {description}
          </span>
        )}
      </span>
      {loading ? (
        <span className="ml-2 shrink-0 text-(--theme-muted-text-color)">
          <Loader inline decorative size={20} color="currentColor" />
        </span>
      ) : (
        <ChevronRightIcon className="ml-2 size-5 shrink-0 text-(--theme-muted-text-color) transition-[translate,color] duration-200 group-hover:translate-x-[3px] group-hover:text-(--theme-app) motion-reduce:transition-none motion-reduce:group-hover:translate-x-0 rtl:-scale-x-100" />
      )}
    </>
  )

  if (href) {
    // API paths are files the router doesn't serve, so they load the page.
    return (
      <AppLink
        href={href}
        reloadDocument={href.startsWith('/api/')}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={cx(methodClasses, className)}
      >
        {content}
      </AppLink>
    )
  }

  return (
    <button
      type="button"
      {...props}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(methodClasses, className)}
    >
      {content}
    </button>
  )
}

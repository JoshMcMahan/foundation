import { cx } from '../cx'

/** `primary` is the one action a view leads to; `secondary` sits beside it;
 *  `outline` and `ghost` are toolbar and inline actions, bordered or not;
 *  `danger` confirms what can't be undone; `danger-outline` is a destructive
 *  action that isn't the view's confirmation, such as Revoke or Disable on a row. */
export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'danger'
  | 'danger-outline'

/** `md` (32px) lines up with inputs and is the default; `lg` (40px) is for a
 *  standalone page's one action, such as signing in or approving a device. */
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg'

export interface ButtonStyle {
  variant?: ButtonVariant | undefined
  size?: ButtonSize | undefined
  /** A square holding only an icon. */
  iconOnly?: boolean | undefined
}

// Focus draws in --theme-focus, the token the theme solves for focus indicators.
// Hover classes carry not-disabled and not-aria-disabled so a button that
// can't be pressed doesn't react. Hovered, a button rises a pixel on a soft
// shadow and settles back while pressed; with reduced motion it keeps the
// shadow and doesn't move. Written out in full for Tailwind's scanner.
const base =
  'relative inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium no-underline transition-[color,background-color,border-color,box-shadow,translate] duration-150 hover:not-disabled:not-aria-disabled:-translate-y-px hover:not-disabled:not-aria-disabled:shadow-(--theme-shadow-sm) active:not-disabled:not-aria-disabled:translate-y-0 active:not-disabled:not-aria-disabled:shadow-none motion-reduce:hover:not-disabled:not-aria-disabled:translate-y-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--theme-focus) disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50'

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-(--theme-accent) text-(--theme-accent-text) hover:not-disabled:not-aria-disabled:bg-(--theme-accent-hover)',
  secondary:
    'border border-(--theme-border) bg-(--theme-panel-bg) text-(--theme-app) hover:not-disabled:not-aria-disabled:bg-(--theme-hover)',
  outline:
    'border border-(--theme-border) text-(--theme-muted-text-color) hover:not-disabled:not-aria-disabled:bg-(--theme-muted-panel-bg) hover:not-disabled:not-aria-disabled:text-(--theme-app) aria-pressed:border-(--theme-link) aria-pressed:text-(--theme-app) data-selected:border-(--theme-link) data-selected:text-(--theme-app) data-popup-open:bg-(--theme-muted-panel-bg) data-popup-open:text-(--theme-app)',
  ghost:
    'text-(--theme-muted-text-color) hover:not-disabled:not-aria-disabled:bg-(--theme-muted-panel-bg) hover:not-disabled:not-aria-disabled:text-(--theme-app) aria-pressed:bg-(--theme-muted-panel-bg) aria-pressed:text-(--theme-link) data-selected:bg-(--theme-muted-panel-bg) data-selected:text-(--theme-link) data-popup-open:bg-(--theme-muted-panel-bg) data-popup-open:text-(--theme-app)',
  danger:
    'bg-(--theme-error-solid) text-white hover:not-disabled:not-aria-disabled:bg-(--theme-error-solid)/90',
  'danger-outline':
    'border border-(--theme-error)/40 text-(--theme-error-text) hover:not-disabled:not-aria-disabled:border-(--theme-error)/60 hover:not-disabled:not-aria-disabled:bg-(--theme-error-muted) data-popup-open:bg-(--theme-error-muted)',
}

// Each size names every box property once: a utility overriding another for the
// same property wins by stylesheet order, not by its place in the class list.
// The icon size is a default: :where() drops the selector's weight to the svg's
// own, so a size class on the icon, such as size-3.5, wins.
const sizes: Record<ButtonSize, string> = {
  xs: 'h-6 px-2 text-xs [:where(&)_svg]:size-3',
  sm: 'h-7 px-2.5 text-xs [:where(&)_svg]:size-3.5',
  md: 'h-8 px-3 text-sm [:where(&)_svg]:size-4',
  lg: 'h-10 px-4 text-base [:where(&)_svg]:size-5',
}

const squares: Record<ButtonSize, string> = {
  xs: 'size-6 text-xs [:where(&)_svg]:size-3',
  sm: 'size-7 text-xs [:where(&)_svg]:size-3.5',
  md: 'size-8 text-sm [:where(&)_svg]:size-4',
  lg: 'size-10 text-base [:where(&)_svg]:size-5',
}

/** The one look for anything pressed: a button, or a link or popup trigger
 *  that acts as one. `Button` and `IconButton` apply it; use it directly on a
 *  host link or another component's trigger. Outline and ghost read as
 *  selected for a pressed toggle (`aria-pressed`), an open popup's trigger
 *  (`data-popup-open`, which Base UI triggers set), or a button that shows its
 *  state some other way, such as by its label (`data-selected`). */
export function buttonClasses({
  variant = 'secondary',
  size = 'md',
  iconOnly = false,
}: ButtonStyle = {}): string {
  return cx(base, variants[variant], (iconOnly ? squares : sizes)[size])
}

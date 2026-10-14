import { cx } from '../cx'

/** `primary` is the one action a view leads to; `secondary` sits beside it;
 *  `outline` and `ghost` are toolbar and inline actions, bordered or not;
 *  `danger` confirms what can't be undone. */
export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'

export type ButtonSize = 'xs' | 'sm' | 'md'

export interface ButtonStyle {
  variant?: ButtonVariant | undefined
  size?: ButtonSize | undefined
  /** A square holding only an icon. */
  iconOnly?: boolean | undefined
}

// Hover classes carry not-disabled and not-aria-disabled so a button that
// can't be pressed doesn't react. Written out in full for Tailwind's scanner.
const base =
  'relative inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium no-underline transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--theme-link) disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50'

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
}

// Each size names every box property once: a utility overriding another for the
// same property wins by stylesheet order, not by its place in the class list.
const sizes: Record<ButtonSize, string> = {
  xs: 'h-6 px-2 text-xs [&_svg]:size-3',
  sm: 'h-7 px-2.5 text-xs [&_svg]:size-3.5',
  md: 'h-8 px-3 text-sm [&_svg]:size-4',
}

const squares: Record<ButtonSize, string> = {
  xs: 'size-6 text-xs [&_svg]:size-3',
  sm: 'size-7 text-xs [&_svg]:size-3.5',
  md: 'size-8 text-sm [&_svg]:size-4',
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

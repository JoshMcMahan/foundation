import { cx } from '../cx'

export type FieldBoxSize = 'sm' | 'md'

export interface FieldBoxOptions {
  size?: FieldBoxSize | undefined
  /** Grows with its content, as a textarea or a field of chips does, instead of holding one line. */
  multiline?: boolean | undefined
  /** False when what is inside pads itself, as an input beside buttons does. */
  padded?: boolean | undefined
  /** Drawn around the element that takes focus rather than on it, as for an input with
   *  buttons beside it: focus, invalid and disabled then follow what is inside. */
  within?: boolean | undefined
}

const sizes = {
  sm: { height: 'h-7', minHeight: 'min-h-7', px: 'px-2', py: 'py-1', text: 'text-xs' },
  md: { height: 'h-9', minHeight: 'min-h-9', px: 'px-3', py: 'py-2', text: 'text-sm' },
} satisfies Record<FieldBoxSize, Record<string, string>>

/** The keyboard focus ring of a control that isn't a box, such as a checkbox, switch or slider
 *  thumb: an outline in the theme's focus color, which is solved for 3:1 on every surface a
 *  control sits on, so it shows on a checked control as well as an empty one. */
export const focusOutline =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--theme-focus)'

// The edge is often all that shows where a box is, so it takes the control edge the theme solves
// to 3:1 on every surface, not the decorative border cards and dividers draw.
const base =
  'w-full min-w-0 rounded-md border border-(--theme-border-strong) bg-(--theme-input-bg) text-(--theme-app) outline-none transition-colors placeholder:text-(--theme-placeholder)'

// One look for every state, on the control itself, or on the box around it with `within`. Focus
// takes the focus color rather than the accent, which is the color picked for buttons' fill and
// may be too light to show on the box.
const own = cx(
  'focus-visible:border-(--theme-focus) focus-visible:ring-1 focus-visible:ring-(--theme-focus)',
  'aria-invalid:border-(--theme-error) aria-invalid:focus-visible:ring-(--theme-error)',
  'disabled:cursor-not-allowed disabled:bg-(--theme-input-disabled-bg) disabled:text-(--theme-placeholder)',
  'data-disabled:cursor-not-allowed data-disabled:bg-(--theme-input-disabled-bg) data-disabled:text-(--theme-placeholder)',
)
const inside = cx(
  'has-[:focus-visible]:border-(--theme-focus) has-[:focus-visible]:ring-1 has-[:focus-visible]:ring-(--theme-focus)',
  'has-[[aria-invalid=true]]:border-(--theme-error) has-[[aria-invalid=true]:focus-visible]:ring-(--theme-error)',
  // The input, not a stepper or clear button that disables itself at a limit.
  'has-[input:disabled]:cursor-not-allowed has-[input:disabled]:bg-(--theme-input-disabled-bg) has-[input:disabled]:text-(--theme-placeholder)',
  'data-disabled:cursor-not-allowed data-disabled:bg-(--theme-input-disabled-bg) data-disabled:text-(--theme-placeholder)',
)

/** The box every input-like control draws: text inputs, textareas, and the triggers of
 *  pickers. Invalid follows `aria-invalid`, disabled follows `disabled` or `data-disabled`. */
export function fieldBox({
  size = 'md',
  multiline = false,
  padded = true,
  within = false,
}: FieldBoxOptions = {}) {
  const box = sizes[size]
  return cx(
    base,
    box.text,
    multiline ? box.minHeight : box.height,
    padded && box.px,
    padded && multiline && box.py,
    within ? inside : own,
  )
}

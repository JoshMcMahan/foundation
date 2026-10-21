// One look for everything that floats: menus, selects, comboboxes, tooltips, infotips and hover cards.

/** Above dialogs, toasts and sticky chrome; hidden while its anchor is scrolled out of view. */
export const positionerClassName = 'z-(--layer-popover) outline-none data-anchor-hidden:invisible'

// With reduced motion a popup only fades: the scale is the movement.
const enterExit =
  'origin-(--transform-origin) transition-[transform,opacity] duration-100 data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0 motion-reduce:data-starting-style:scale-100 motion-reduce:data-ending-style:scale-100'

/** The opaque surface a popover stands on, and its shadow: what is under it never shows
 *  through, such as a chart's marks under its tooltip. */
export const surfaceClassName =
  'rounded-lg border border-(--theme-border) bg-(--theme-app-bg) text-(--theme-app) shadow-(--theme-shadow-lg)'

/** A panel of choices: a menu, a select's list, a combobox's list. */
export const panelClassName = `${surfaceClassName} text-sm outline-none ${enterExit}`

/** A panel's rows inset by the same gutter on every side, so a highlighted first or last row
 *  keeps the margin it has at its sides rather than leaving a strip against the border. */
export const panelListClassName = 'p-1'

/** A row in a panel, inside its `panelListClassName` gutter; its text lines up with a field's. */
export const panelItemClassName =
  'flex w-full cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-left outline-none data-highlighted:bg-(--theme-hover) data-highlighted:text-(--theme-app) data-disabled:cursor-not-allowed data-disabled:opacity-50'

/** A tooltip's, infotip's or popover tip's surface: a small panel in the page's colors, so a
 *  hint reads as part of the page rather than a dark patch over it. */
export const tipClassName = `max-w-64 rounded-lg border border-(--theme-border) bg-(--theme-panel-bg) px-2.5 py-1.5 text-xs text-(--theme-app) shadow-(--theme-shadow-lg) whitespace-pre-line break-words data-instant:transition-none ${enterExit}`

/** A hover card's surface; the card sets its own width and padding. */
export const cardClassName = `overflow-hidden rounded-lg border border-(--theme-border) bg-(--theme-panel-bg) text-(--theme-app) shadow-(--theme-shadow-lg) outline-none ${enterExit}`

/** Where a popup opens: under an element, such as the button that opened it, or
 *  at a pointer event's point, which then moves with the element it landed on. */
export type FloatingAnchor =
  | Element
  | { clientX: number; clientY: number; currentTarget?: EventTarget | null }

/** A popup positioner's anchor: an element, or a point that reads its place each frame. */
export type PositionerAnchor =
  | Element
  | {
      getBoundingClientRect: () => DOMRect | ReturnType<typeof pointRect>
      contextElement?: Element
    }

function pointRect(x: number, y: number) {
  return { x, y, left: x, top: y, right: x, bottom: y, width: 0, height: 0 }
}

export function toPositionerAnchor(at: FloatingAnchor): PositionerAnchor {
  if (at instanceof Element) {
    return at
  }
  const { clientX, clientY } = at
  const on = at.currentTarget instanceof Element ? at.currentTarget : null
  if (!on) {
    return { getBoundingClientRect: () => pointRect(clientX, clientY) }
  }
  // The point keeps its place on the element, so the popup follows it as the page scrolls.
  const start = on.getBoundingClientRect()
  const dx = clientX - start.left
  const dy = clientY - start.top
  return {
    contextElement: on,
    getBoundingClientRect: () => {
      const now = on.getBoundingClientRect()
      return pointRect(now.left + dx, now.top + dy)
    },
  }
}

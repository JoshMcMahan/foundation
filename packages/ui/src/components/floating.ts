// One look for everything that floats: menus, selects, comboboxes, tooltips, infotips and hover cards.

/** Popups portal into the host's .ds-root when it has one, so they inherit the
 *  design system's CSS variables; undefined lets the portal use document.body. */
export function portalContainer(): HTMLElement | undefined {
  if (typeof document === 'undefined') {
    return undefined
  }
  return document.querySelector<HTMLElement>('.ds-root') ?? undefined
}

/** Above dialogs and sticky chrome; hidden while its anchor is scrolled out of view. */
export const positionerClassName = 'z-[10000] outline-none data-anchor-hidden:invisible'

const enterExit =
  'origin-(--transform-origin) transition-[transform,opacity] duration-100 data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0'

/** A panel of choices: a menu, a select's list, a combobox's list. */
export const panelClassName = `rounded-lg border border-(--theme-border) bg-(--theme-app-bg) text-sm text-(--theme-app) shadow-(--theme-shadow-lg) outline-none ${enterExit}`

/** A row in a panel. */
export const panelItemClassName =
  'flex w-full cursor-pointer select-none items-center gap-2 px-3 py-1.5 text-left outline-none data-highlighted:bg-(--theme-hover) data-highlighted:text-(--theme-hover-text) data-disabled:cursor-not-allowed data-disabled:opacity-50'

/** A tooltip's or infotip's small inverted surface. */
export const tipClassName = `rounded-md bg-(--theme-app) px-2 py-1 text-xs text-(--theme-app-bg) shadow-(--theme-shadow) whitespace-pre-line break-words data-instant:transition-none ${enterExit}`

export const tipArrowClassName =
  'size-2 rotate-45 bg-(--theme-app) data-[side=top]:-bottom-1 data-[side=bottom]:-top-1 data-[side=left]:-right-1 data-[side=right]:-left-1'

/** A hover card's surface; the card sets its own width and padding. */
export const cardClassName = `overflow-hidden rounded-xl border border-(--theme-border) bg-(--theme-panel-bg) text-(--theme-app) shadow-(--theme-shadow-lg) outline-none ${enterExit}`

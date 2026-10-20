import { createContext } from 'react'
import type { MenuEntry } from './MenuEntries'

/**
 * Which of the page header's actions have moved into its "…" menu, and what
 * each would be as a row of that menu. The actions render in the page's tree
 * and the bar measures them in its own, so they meet here: each action
 * registers its menu row and hides while it has moved, and the bar decides
 * which move and lists them.
 */
export class HeaderActionsFit {
  private entries = new Map<string, MenuEntry>()
  private overflow: readonly string[] = []
  private version = 0
  private listeners = new Set<() => void>()

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** Changes whenever the menu would: what moved, or a moved action's row. */
  getVersion = (): number => this.version

  register(id: string, entry: MenuEntry) {
    this.entries.set(id, entry)
    // Only a moved action's row shows, so only its changes need the bar.
    if (this.overflow.includes(id)) {
      this.changed()
    }
  }

  unregister(id: string) {
    this.entries.delete(id)
    if (this.overflow.includes(id)) {
      this.overflow = this.overflow.filter((other) => other !== id)
      this.changed()
    }
  }

  isOverflowed(id: string): boolean {
    return this.overflow.includes(id)
  }

  /** The moved actions' rows, in the bar's order. */
  menu(): MenuEntry[] {
    return this.overflow.flatMap((id) => {
      const entry = this.entries.get(id)
      return entry ? [entry] : []
    })
  }

  setOverflow(ids: readonly string[]) {
    if (ids.length === this.overflow.length && ids.every((id, i) => this.overflow[i] === id)) {
      return
    }
    this.overflow = ids
    this.changed()
  }

  private changed() {
    this.version++
    for (const listener of this.listeners) {
      listener()
    }
  }
}

/** Set around the header's `actions`, so the actions there can move into its
 *  menu; title actions sit beside the title and never do. */
export const HeaderActionsFitContext = createContext<HeaderActionsFit | null>(null)

// gap-1 between the bar's actions, and the size-6 "…" button.
const ACTION_GAP = 4
const MENU_BUTTON_WIDTH = 24

/**
 * The trailing actions to move into the "…" menu so the rest fit in `room`
 * pixels, last first, or none when everything fits. `shown` is the actions'
 * width as they are now, with `moved` already in the menu, so what they would
 * take with nothing moved is worked out from it and each action's width.
 */
export function overflowingActions(
  items: readonly { id: string; width: number }[],
  shown: number,
  moved: readonly string[],
  room: number,
): string[] {
  const width = new Map(items.map((item) => [item.id, item.width]))
  let total = shown
  if (moved.length > 0) {
    total += moved.reduce((sum, id) => sum + (width.get(id) ?? 0) + ACTION_GAP, 0)
    total -= MENU_BUTTON_WIDTH + ACTION_GAP
  }
  const next: string[] = []
  // Rounding in the measured widths, so a bar that just fits keeps everything.
  for (let i = items.length - 1; i >= 0 && total > room + 0.5; i--) {
    const item = items[i] as { id: string; width: number }
    if (next.length === 0) {
      total += MENU_BUTTON_WIDTH + ACTION_GAP
    }
    total -= item.width + ACTION_GAP
    next.unshift(item.id)
  }
  return next
}

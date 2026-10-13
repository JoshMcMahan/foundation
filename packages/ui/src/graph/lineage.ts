import { createContext, useContext } from 'react'
import { Store, useStore } from './store'

/**
 * The hovered job's lineage on one graph level: the jobs it leads to or follows from, by hops. Each
 * node, connector and dot reads only its own part of it, so hovering re-renders those whose highlight
 * changes and nothing else, however large the graph.
 */
export class Lineage extends Store {
  /** Hops from the hovered job, or none while no job is. */
  private hovered: Map<string, number> | null = null
  /** The lineage shown, kept after unhover while its highlight draws back out. */
  private shown: Map<string, number> | null = null
  private furthest = 0
  private timer: ReturnType<typeof setTimeout> | undefined

  private readonly walk: (job: string) => Map<string, number>
  /** Seconds each hop of the highlight takes. */
  readonly animT: number
  /** How deeply the level nests, which names the classes that dim it. */
  readonly depth: number
  /** Whether its nodes fade as they dim, rather than dim at once. */
  readonly fade: boolean

  constructor(
    walk: (job: string) => Map<string, number>,
    { animT, depth = 0, fade = true }: { animT: number; depth?: number; fade?: boolean },
  ) {
    super()
    this.walk = walk
    this.animT = animT
    this.depth = depth
    this.fade = fade
  }

  get hovering() {
    return this.hovered !== null
  }

  /** Whether a lineage shows, hovered or drawing out. */
  get showing() {
    return this.shown !== null
  }

  hover = (job: string | null) => {
    clearTimeout(this.timer)
    this.hovered = job === null ? null : this.walk(job)
    if (this.hovered) {
      this.shown = this.hovered
      this.furthest = 0
      for (const hops of this.hovered.values()) {
        this.furthest = Math.max(this.furthest, hops)
      }
    } else if (this.shown) {
      // Once the draw-out has run back from the furthest hop, nothing is shown.
      this.timer = setTimeout(
        () => {
          this.shown = null
          this.furthest = 0
          this.notify()
        },
        ((this.furthest + 1) * this.animT + 0.2) * 1000,
      )
    }
    this.notify()
  }

  /** Stops a draw-out still to finish, as the level goes. */
  dispose() {
    clearTimeout(this.timer)
  }

  /** A node's highlight: 2 in the hovered lineage, 1 drawing out of it, 0 neither. */
  node(job: string): number {
    return this.hovered?.has(job) ? 2 : this.shown?.has(job) ? 1 : 0
  }

  /**
   * A dot's or connector's highlight between `from` and `to` (a dot's both the same job), as one
   * value React compares: none, or lit or drawing out, its delay, and whether it draws from `to`.
   */
  between(from: string, to: string): string {
    const shown = this.shown
    const fromHops = shown?.get(from)
    const toHops = shown?.get(to)
    if (fromHops === undefined || toHops === undefined) {
      return ''
    }
    const lit = !!this.hovered?.has(from) && this.hovered.has(to)
    // Each hop from the hovered job delays the draw-in by animT, and the draw-out runs back.
    const closer = Math.min(fromHops, toHops)
    const delay = (lit ? closer : this.furthest - closer) * this.animT
    return `${lit ? 'lit' : 'out'} ${delay} ${toHops < fromHops ? 'back' : 'on'}`
  }
}

/** A highlight `between` describes, read back. */
export function highlightOf(value: string) {
  const [state = '', delay = '0', direction] = value.split(' ')
  return {
    lit: state === 'lit',
    out: state === 'out',
    delay: Number(delay),
    back: direction === 'back',
  }
}

export const LineageContext = createContext<Lineage | null>(null)

/** Part of the enclosing level's lineage, re-rendering only when that part changes. */
export function useLineage<T extends string | number>(read: (lineage: Lineage) => T, none: T): T {
  return useStore(useContext(LineageContext), read, none)
}

/** The enclosing level's lineage, for what hovers it. */
export function useLineageStore() {
  return useContext(LineageContext)
}

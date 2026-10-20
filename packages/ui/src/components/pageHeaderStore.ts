import type { Breadcrumb } from './Breadcrumbs'
import { HeaderActionsFit } from './headerActionsFit'

export type PageHeaderRegion = 'titleActions' | 'actions' | 'toolbar'

/** The nodes a declaration portals its regions into. They are created with the
 *  declaration, before any bar exists, so its content renders on the first pass
 *  and keeps its state when the bar unmounts or moves. */
export type RegionNodes = Readonly<Record<PageHeaderRegion, HTMLElement>>

export interface Declaration {
  breadcrumbs: readonly Breadcrumb[] | undefined
  /** Whether the trail's last crumb is the page's `h1`. */
  heading: boolean
  hidden: boolean
  nodes: RegionNodes | null
  fills: Readonly<Record<PageHeaderRegion, boolean>>
}

export interface PageHeaderSnapshot {
  breadcrumbs: readonly Breadcrumb[]
  /** Whether the trail's last crumb is the page's `h1`, as the page whose trail it is says. */
  heading: boolean
  hidden: boolean
  titleActions: readonly HTMLElement[]
  actions: readonly HTMLElement[]
  toolbar: readonly HTMLElement[]
}

const NO_NODES: readonly HTMLElement[] = []
const NO_CRUMBS: readonly Breadcrumb[] = []

const EMPTY: PageHeaderSnapshot = {
  breadcrumbs: NO_CRUMBS,
  heading: true,
  hidden: false,
  titleActions: NO_NODES,
  actions: NO_NODES,
  toolbar: NO_NODES,
}

export function sameCrumbs(
  a: readonly Breadcrumb[] | undefined,
  b: readonly Breadcrumb[] | undefined,
): boolean {
  if (a === b) {
    return true
  }
  if (!a || !b || a.length !== b.length) {
    return false
  }
  return a.every((crumb, i) => crumb.label === b[i]?.label && crumb.href === b[i]?.href)
}

function sameDeclaration(a: Declaration, b: Declaration): boolean {
  return (
    sameCrumbs(a.breadcrumbs, b.breadcrumbs) &&
    a.heading === b.heading &&
    a.hidden === b.hidden &&
    a.nodes === b.nodes &&
    a.fills.titleActions === b.fills.titleActions &&
    a.fills.actions === b.fills.actions &&
    a.fills.toolbar === b.fills.toolbar
  )
}

function sameNodes(a: readonly HTMLElement[], b: readonly HTMLElement[]): boolean {
  return a.length === b.length && a.every((node, i) => node === b[i])
}

/**
 * Holds what each mounted PageHeader declares, keyed by its render order. The
 * bar reads one merged snapshot through useSyncExternalStore, so a page
 * changing its header re-renders the bar alone, never the app under the
 * provider.
 */
export class PageHeaderStore {
  /** Which of the declared actions the bar has moved into its "…" menu. */
  readonly actionsFit = new HeaderActionsFit()
  private declarations = new Map<number, Declaration>()
  private listeners = new Set<() => void>()
  private snapshot = EMPTY

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = (): PageHeaderSnapshot => this.snapshot

  set(order: number, declaration: Declaration): void {
    const prev = this.declarations.get(order)
    if (prev && sameDeclaration(prev, declaration)) {
      return
    }
    this.declarations.set(order, declaration)
    this.publish()
  }

  delete(order: number): void {
    if (this.declarations.delete(order)) {
      this.publish()
    }
  }

  private publish(): void {
    // Render order: a layout renders before the pages under it, and a page
    // navigated to renders after the one it replaced, so the last declaration
    // with a trail is the innermost, newest page's.
    const ordered = [...this.declarations.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, declaration]) => declaration)
    const regionNodes = (region: PageHeaderRegion, prev: readonly HTMLElement[]) => {
      const next = ordered.flatMap((d) => (d.nodes && d.fills[region] ? [d.nodes[region]] : []))
      // Keeping the old array lets the bar's regions skip re-rendering.
      return sameNodes(next, prev) ? prev : next
    }
    const owner = ordered.findLast((d) => d.breadcrumbs !== undefined)
    const trail = owner?.breadcrumbs ?? NO_CRUMBS
    const prev = this.snapshot
    this.snapshot = {
      breadcrumbs: sameCrumbs(trail, prev.breadcrumbs) ? prev.breadcrumbs : trail,
      heading: owner?.heading ?? true,
      hidden: ordered.some((d) => d.hidden),
      titleActions: regionNodes('titleActions', prev.titleActions),
      actions: regionNodes('actions', prev.actions),
      toolbar: regionNodes('toolbar', prev.toolbar),
    }
    for (const listener of this.listeners) {
      listener()
    }
  }
}

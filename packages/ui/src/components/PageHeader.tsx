import type { ReactNode } from 'react'
import {
  createContext,
  use,
  useCallback,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
} from 'react'
import { createPortal } from 'react-dom'
import { cx } from '../cx'
import { MoreIcon } from '../icons'
import { ActionMenu } from './ActionMenu'
import { type Breadcrumb, Breadcrumbs } from './Breadcrumbs'
import { buttonClasses } from './buttonClasses'
import {
  ACTION_GAP,
  HeaderActionsFit,
  HeaderActionsFitContext,
  MENU_BUTTON_WIDTH,
  overflowingActions,
} from './headerActionsFit'
import { useSlots, useStrings } from './Provider'
import { type PageHeaderRegion, PageHeaderStore, type RegionNodes } from './pageHeaderStore'

export type { Breadcrumb } from './Breadcrumbs'

const StoreContext = createContext<PageHeaderStore | null>(null)

/**
 * Holds the header the current page declares, for the `PageHeaderBar` the
 * shell renders. Wrap the shell, above both the bar and the routes.
 */
export function PageHeaderProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => new PageHeaderStore())
  return <StoreContext value={store}>{children}</StoreContext>
}

export interface PageHeaderProps {
  /** The trail to this page, ending with the page itself, which becomes its
   *  `h1`. A crumb with an empty label, such as a name still loading, shows a
   *  placeholder. */
  breadcrumbs?: readonly Breadcrumb[] | undefined
  /** False keeps the last crumb out of the page's outline, for a page whose `h1` is in its
   *  body, such as a title field or a section's heading: the crumb still says it is the
   *  current page, and the page has one `h1`. */
  heading?: boolean | undefined
  /** Beside the title: actions on the page's subject, such as edit, rename or
   *  favorite, or its `PageHeaderMenu`. */
  titleActions?: ReactNode
  /** At the end of the bar: the page's commands, such as Save or "+ Create". */
  actions?: ReactNode
  /** A row under the bar, such as tabs or a time range, that stays put while
   *  the page scrolls. */
  toolbar?: ReactNode
  /** Takes the bar away, for a page that fills the window. */
  hidden?: boolean | undefined
}

// Render order stands in for depth: React renders a layout before the routes
// under it, and a page navigated to after the one it replaced.
let renderOrder = 0

const subscribeNever = () => () => {}

function createRegionNodes(): RegionNodes | null {
  if (typeof document === 'undefined') {
    return null
  }
  const node = () => {
    const el = document.createElement('div')
    // The region's flex layout and gap reach the actions inside.
    el.style.display = 'contents'
    return el
  }
  return { titleActions: node(), actions: node(), toolbar: node() }
}

/**
 * Declares the page's header: its breadcrumbs, title actions, actions and
 * toolbar. Under a `PageHeaderProvider` it renders nothing in place: the
 * shell's `PageHeaderBar` shows it, while the actions stay in the page's React
 * tree, with its context and state. Without a provider it renders the bar
 * itself, for a page with no shell, with no fill of its own, so it shows the
 * surface it sits on. A host that pins it gives its pinned wrapper the page's
 * surface, so content scrolling under it is covered.
 *
 * Any component may render one, such as a form adding its Save button: the bar
 * shows the actions of all of them, outermost first, and the trail of the last
 * one rendered that has one, so a page's trail replaces its layout's.
 */
export function PageHeader(props: PageHeaderProps) {
  const store = use(StoreContext)
  if (!store) {
    return props.hidden ? null : (
      <HeaderLayout
        inPlace
        breadcrumbs={props.breadcrumbs ?? []}
        heading={props.heading ?? true}
        titleActions={props.titleActions}
        actions={props.actions}
        toolbar={props.toolbar}
      />
    )
  }
  return <DeclaredHeader store={store} {...props} />
}

function DeclaredHeader({
  store,
  breadcrumbs,
  heading = true,
  titleActions,
  actions,
  toolbar,
  hidden = false,
}: PageHeaderProps & { store: PageHeaderStore }) {
  const [order] = useState(() => ++renderOrder)
  const [nodes] = useState(createRegionNodes)
  // False while hydrating, so the portals don't differ from the server's
  // markup, which has none.
  const client = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  )
  const fills: Record<PageHeaderRegion, boolean> = {
    titleActions: present(titleActions),
    actions: present(actions),
    toolbar: present(toolbar),
  }
  // Layout effects publish before paint, so a page never shows the previous
  // page's trail or actions. The store ignores a declaration equal to the
  // last, so an inline trail array costs nothing.
  useLayoutEffect(() => {
    store.set(order, { breadcrumbs, heading, hidden, nodes, fills })
  })
  useLayoutEffect(() => () => store.delete(order), [store, order])

  if (!nodes || !client) {
    return null
  }
  return (
    <>
      {fills.titleActions && createPortal(titleActions, nodes.titleActions)}
      {fills.actions &&
        createPortal(
          <HeaderActionsFitContext value={store.actionsFit}>{actions}</HeaderActionsFitContext>,
          nodes.actions,
        )}
      {fills.toolbar && createPortal(toolbar, nodes.toolbar)}
    </>
  )
}

function present(node: ReactNode): boolean {
  return node !== undefined && node !== null && node !== false && node !== ''
}

export interface PageHeaderBarProps {
  /** A shorter bar, for a page that gives the window to an embedded app. */
  compact?: boolean | undefined
  /** Keep the bar when the page declares nothing, such as on a narrow screen
   *  where it holds the navigation toggle. A page's `hidden` still wins. */
  persistent?: boolean | undefined
  className?: string | undefined
}

/**
 * The bar showing what the current page declares with `PageHeader`. The shell
 * renders one, inside a `PageHeaderProvider`, wherever its chrome puts it. It
 * renders nothing while the page declares nothing.
 */
export function PageHeaderBar({
  compact = false,
  persistent = false,
  className,
}: PageHeaderBarProps) {
  const store = use(StoreContext)
  if (!store) {
    throw new Error('PageHeaderBar needs a PageHeaderProvider above it')
  }
  const header = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const empty =
    header.breadcrumbs.length === 0 &&
    header.titleActions.length === 0 &&
    header.actions.length === 0 &&
    header.toolbar.length === 0
  if (header.hidden || (empty && !persistent)) {
    return null
  }
  return (
    <HeaderLayout
      breadcrumbs={header.breadcrumbs}
      heading={header.heading}
      titleActions={header.titleActions.length > 0 && <Mounts nodes={header.titleActions} />}
      actions={header.actions.length > 0 && <Mounts nodes={header.actions} />}
      toolbar={header.toolbar.length > 0 && <Mounts nodes={header.toolbar} />}
      fit={store.actionsFit}
      compact={compact}
      className={className}
    />
  )
}

const nodeKeys = new WeakMap<HTMLElement, number>()
let nextNodeKey = 0

// A key per node, so a node keeps its span, and React moves rather than
// remounts it, when a declaration before it comes or goes.
function nodeKey(node: HTMLElement): number {
  let key = nodeKeys.get(node)
  if (key === undefined) {
    key = ++nextNodeKey
    nodeKeys.set(node, key)
  }
  return key
}

function Mounts({ nodes }: { nodes: readonly HTMLElement[] }) {
  return nodes.map((node) => <Mount key={nodeKey(node)} node={node} />)
}

/** Moves a declaration's region node into the bar. React owns the span and
 *  keeps it in order; the node inside is the page's. */
function Mount({ node }: { node: HTMLElement }) {
  const attach = useCallback(
    (span: HTMLSpanElement | null) => {
      if (span && node.parentNode !== span) {
        span.append(node)
      }
    },
    [node],
  )
  return <span ref={attach} className="contents" />
}

function HeaderLayout({
  breadcrumbs,
  heading,
  titleActions,
  actions,
  toolbar,
  fit: sharedFit,
  compact = false,
  inPlace = false,
  className,
}: {
  breadcrumbs: readonly Breadcrumb[]
  heading: boolean
  titleActions: ReactNode
  actions: ReactNode
  toolbar: ReactNode
  /** The store's, when the actions are declared elsewhere; without one the bar keeps its own. */
  fit?: HeaderActionsFit | undefined
  compact?: boolean
  /** Rendered in the page rather than the shell's chrome: it shows the surface it sits on, a
   *  panel or the app's background alike, rather than painting the app's over a panel. */
  inPlace?: boolean
  className?: string | undefined
}) {
  const { breadcrumbPin, navToggle } = useSlots()
  const { list: t } = useStrings()
  const [ownFit] = useState(() => new HeaderActionsFit())
  const fit = sharedFit ?? ownFit
  const [row, setRow] = useState<HTMLDivElement | null>(null)
  const [lead, setLead] = useState<HTMLDivElement | null>(null)
  const [end, setEnd] = useState<HTMLDivElement | null>(null)
  const [cover, setCover] = useState<HTMLDivElement | null>(null)
  useActionsFit(fit, row, lead, end)
  useLayoutEffect(() => {
    fit.setCoverNode(cover)
    return () => fit.setCoverNode(null)
  }, [fit, cover])
  useSyncExternalStore(fit.subscribe, fit.getVersion, fit.getVersion)
  const moved = fit.menu()
  const hasTrail = breadcrumbs.length > 0
  // A search that takes the bar covers the rest, which stays laid out as it was, so closing the
  // search puts the bar back exactly, but can't be seen, reached or pressed meanwhile.
  const covered = fit.isCovered()
  return (
    <div
      className={cx(
        '@container w-full shrink-0',
        // The shell's bar is chrome, on the app's background; content scrolls under it.
        !inPlace && 'bg-(--theme-app-bg)',
        className,
      )}
    >
      <div
        ref={setRow}
        className={cx(
          'relative flex items-center justify-between gap-4 border-b border-(--theme-border) px-4',
          compact ? 'h-8' : 'h-12',
        )}
      >
        {/* Grows to the room the actions leave, so the trail can measure it. */}
        <div
          ref={setLead}
          inert={covered}
          className={cx('flex min-w-0 flex-1 items-center gap-2', covered && 'invisible')}
        >
          {navToggle?.()}
          {hasTrail && <Breadcrumbs crumbs={breadcrumbs} heading={heading} />}
          {present(titleActions) && (
            <div className="flex shrink-0 items-center gap-0.5">{titleActions}</div>
          )}
          {hasTrail && breadcrumbPin?.({ crumbs: breadcrumbs })}
        </div>
        {present(actions) && (
          <div
            ref={setEnd}
            inert={covered}
            className={cx('flex shrink-0 items-center gap-1', covered && 'invisible')}
          >
            <HeaderActionsFitContext value={fit}>{actions}</HeaderActionsFitContext>
            {moved.length > 0 && (
              <ActionMenu
                items={moved}
                label={t.moreActions}
                triggerClassName={buttonClasses({ variant: 'ghost', size: 'xs', iconOnly: true })}
              >
                <MoreIcon />
              </ActionMenu>
            )}
          </div>
        )}
        {/* The layer a search takes the bar in, from its start to its end. It stays laid out,
            so the field can take focus the moment it arrives. */}
        <div
          ref={setCover}
          className="pointer-events-none absolute inset-0 flex items-center px-4"
        />
      </div>
      {present(toolbar) && <div className="px-4">{toolbar}</div>}
    </div>
  )
}

// The bar's spacing, in pixels: gap-4 between the trail and the actions, gap-2
// in the trail's row.
const ROW_GAP = 16
const LEAD_GAP = 8
// The least of the trail worth keeping beside the actions: the page's name,
// truncated, with a folded "…" before it.
const TRAIL_MIN_WIDTH = 160
// Below this width the bar folds the actions' labels to their icons
// (`@max-md`), so an action has one width folded and another not.
const FOLD_WIDTH = 448

/**
 * Fits the actions to the bar. Labels fold to their icons first, by the bar's
 * own container query; when the folded actions still leave the trail too
 * little room, the trailing ones move into a "…" menu at the end, last first,
 * until the rest fit. It measures each action as it shows and remembers its
 * width while it has moved, so the answer doesn't depend on what has moved.
 */
function useActionsFit(
  fit: HeaderActionsFit,
  row: HTMLElement | null,
  lead: HTMLElement | null,
  end: HTMLElement | null,
) {
  const [widths] = useState(() => new Map<string, number>())
  useLayoutEffect(() => {
    if (!row || !lead || !end) {
      fit.setOverflow([])
      return
    }
    const measure = () => {
      const rowWidth = row.clientWidth
      if (rowWidth === 0) {
        // Not laid out, as in a test without layout: everything shows.
        fit.setOverflow([])
        return
      }
      const folded = rowWidth < FOLD_WIDTH
      const key = (id: string, fold: boolean) => `${fold ? 'folded' : 'full'}:${id}`
      const items = [...end.querySelectorAll<HTMLElement>('[data-header-action]')].map(
        (el) => el.dataset['headerAction'] ?? '',
      )
      for (const el of end.querySelectorAll<HTMLElement>('[data-header-action]')) {
        const id = el.dataset['headerAction'] ?? ''
        const control = el.firstElementChild
        if (!fit.isOverflowed(id) && control) {
          widths.set(key(id, folded), control.getBoundingClientRect().width)
        }
      }
      const width = (id: string) => widths.get(key(id, folded)) ?? widths.get(key(id, !folded)) ?? 0
      const style = getComputedStyle(row)
      let leadMin = 0
      let leadItems = 0
      for (const child of lead.children) {
        const w = child.tagName === 'NAV' ? TRAIL_MIN_WIDTH : child.getBoundingClientRect().width
        if (w > 0) {
          leadMin += w
          leadItems++
        }
      }
      leadMin += Math.max(0, leadItems - 1) * LEAD_GAP
      const room =
        rowWidth -
        Number.parseFloat(style.paddingLeft || '0') -
        Number.parseFloat(style.paddingRight || '0') -
        leadMin -
        ROW_GAP
      const shown = end.getBoundingClientRect().width
      const moved = items.filter((id) => fit.isOverflowed(id))
      fit.setOverflow(
        overflowingActions(
          items.map((id) => ({ id, width: width(id) })),
          shown,
          moved,
          room,
        ),
      )
      fit.setSearchCovers(searchCovers(end, items, moved, width, shown, room))
    }
    measure()
    const resize = new ResizeObserver(measure)
    resize.observe(row)
    resize.observe(end)
    // Actions come and go as the page's declarations do, and the trail's row
    // changes as title actions load.
    const changes = new MutationObserver(measure)
    changes.observe(end, { childList: true, subtree: true })
    changes.observe(lead, { childList: true })
    return () => {
      resize.disconnect()
      changes.disconnect()
    }
  }, [fit, row, lead, end, widths])
}

// The search field's width where it opens in the bar (w-72).
const SEARCH_FIELD_WIDTH = 288

/**
 * Whether a search in the actions, opened in place, would leave the trail too little room even
 * with every action in the "…" menu, so it takes the whole bar instead. It works from the
 * actions' width as they are now, whether the search shows as its button or its field, so the
 * answer is the same either way.
 */
function searchCovers(
  end: HTMLElement,
  items: readonly string[],
  moved: readonly string[],
  width: (id: string) => number,
  shown: number,
  room: number,
): boolean {
  const search = end.querySelector<HTMLElement>('[data-header-search]')
  const control = search?.firstElementChild
  if (!control) {
    return false
  }
  let least = shown - control.getBoundingClientRect().width + SEARCH_FIELD_WIDTH
  const still = items.filter((id) => !moved.includes(id))
  if (still.length > 0) {
    least -= still.reduce((sum, id) => sum + width(id) + ACTION_GAP, 0)
    if (moved.length === 0) {
      least += MENU_BUTTON_WIDTH + ACTION_GAP
    }
  }
  return least > room + 0.5
}

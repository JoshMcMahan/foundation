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
import { ChevronRightIcon, MoreIcon } from '../icons'
import { ActionMenu } from './ActionMenu'
import { AppLink } from './AppLink'
import { buttonClasses } from './buttonClasses'
import { keyedByContent } from './keys'
import { useSlots, useStrings } from './Provider'
import {
  type Breadcrumb,
  type PageHeaderRegion,
  PageHeaderStore,
  type RegionNodes,
} from './pageHeaderStore'
import { Skeleton } from './Skeleton'
import { Tooltip } from './Tooltip'

export type { Breadcrumb } from './pageHeaderStore'

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
 * itself, for a page with no shell.
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
        breadcrumbs={props.breadcrumbs ?? []}
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
    store.set(order, { breadcrumbs, hidden, nodes, fills })
  })
  useLayoutEffect(() => () => store.delete(order), [store, order])

  if (!nodes || !client) {
    return null
  }
  return (
    <>
      {fills.titleActions && createPortal(titleActions, nodes.titleActions)}
      {fills.actions && createPortal(actions, nodes.actions)}
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
      titleActions={header.titleActions.length > 0 && <Mounts nodes={header.titleActions} />}
      actions={header.actions.length > 0 && <Mounts nodes={header.actions} />}
      toolbar={header.toolbar.length > 0 && <Mounts nodes={header.toolbar} />}
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
  titleActions,
  actions,
  toolbar,
  compact = false,
  className,
}: {
  breadcrumbs: readonly Breadcrumb[]
  titleActions: ReactNode
  actions: ReactNode
  toolbar: ReactNode
  compact?: boolean
  className?: string | undefined
}) {
  const { breadcrumbPin, navToggle } = useSlots()
  const hasTrail = breadcrumbs.length > 0
  return (
    <div className={cx('@container w-full shrink-0 bg-(--theme-app-bg)', className)}>
      <div
        className={cx(
          'flex items-center justify-between gap-4 border-b border-(--theme-border) px-4',
          compact ? 'h-8' : 'h-11',
        )}
      >
        {/* Grows to the room the actions leave, so the trail can measure it. */}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {navToggle?.()}
          {hasTrail && <BreadcrumbTrail crumbs={breadcrumbs} />}
          {present(titleActions) && (
            <div className="flex shrink-0 items-center gap-0.5">{titleActions}</div>
          )}
          {hasTrail && breadcrumbPin?.({ crumbs: breadcrumbs })}
        </div>
        {present(actions) && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
      </div>
      {present(toolbar) && <div className="px-4">{toolbar}</div>}
    </div>
  )
}

const crumbText = 'block truncate text-(--theme-muted-text-color)'
const crumbLink =
  'rounded-sm transition-colors hover:text-(--theme-app) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--theme-link)'

function Separator() {
  return <ChevronRightIcon className="size-3 shrink-0 text-(--theme-muted-text-color) opacity-60" />
}

// What a folded trail adds before its crumbs: the "…" button, its chevron and
// their gaps.
const FOLD_WIDTH = 48
// A folded parent's widest (max-w-36), and the least of the page's own name
// worth keeping beside it.
const PARENT_MAX_WIDTH = 144
const TITLE_MIN_WIDTH = 128

/** How many of the trail's ancestors fit: all, the parent alone, or none. */
type TrailFit = 'all' | 'parent' | 'none'

/**
 * Fits the trail to the room its row leaves it. It measures a hidden copy of
 * the trail at its natural width against the row's width less its other items,
 * so the answer doesn't depend on how the trail is folded at the moment.
 */
function useTrailFit(nav: HTMLElement | null, natural: HTMLElement | null): TrailFit {
  const [fit, setFit] = useState<TrailFit>('all')
  useLayoutEffect(() => {
    const row = nav?.parentElement
    if (!nav || !natural || !row) {
      return
    }
    const measure = () => {
      const gap = Number.parseFloat(getComputedStyle(row).columnGap) || 0
      let room = row.clientWidth
      for (const child of row.children) {
        if (child !== nav) {
          room -= child.getBoundingClientRect().width + gap
        }
      }
      if (natural.scrollWidth <= room) {
        setFit('all')
        return
      }
      const steps = [...natural.children]
      const width = (el: Element | undefined) => el?.getBoundingClientRect().width ?? 0
      const parent = Math.min(width(steps[steps.length - 2]), PARENT_MAX_WIDTH)
      const title = Math.min(width(steps[steps.length - 1]), TITLE_MIN_WIDTH)
      setFit(FOLD_WIDTH + parent + title <= room ? 'parent' : 'none')
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(row)
    // A label changing, such as a name that loads, resizes the copy.
    observer.observe(natural)
    return () => observer.disconnect()
  }, [nav, natural])
  return fit
}

function BreadcrumbTrail({ crumbs }: { crumbs: readonly Breadcrumb[] }) {
  const { common } = useStrings()
  const [nav, setNav] = useState<HTMLElement | null>(null)
  const [natural, setNatural] = useState<HTMLElement | null>(null)
  const fit = useTrailFit(nav, natural)
  const current = crumbs[crumbs.length - 1]
  const ancestors = crumbs.slice(0, -1)
  // When the trail doesn't fit, every ancestor but the parent, the way back,
  // folds into one menu, and the parent too when even it can't fit beside the
  // page's name, so the crumbs left stay readable rather than each truncating
  // to a few letters.
  const folded = fit === 'none' ? ancestors : fit === 'parent' ? ancestors.slice(0, -1) : []
  const shown = ancestors.slice(folded.length)
  return (
    <nav ref={setNav} aria-label={common.breadcrumb} className="relative min-w-0">
      <ol className="m-0 flex min-w-0 list-none items-center gap-1.5 p-0 text-[13px] leading-none">
        {folded.length > 0 && (
          <li className="flex shrink-0 items-center gap-1.5">
            <ActionMenu
              label={common.showFullPath}
              align="start"
              items={folded.map((crumb) =>
                crumb.href
                  ? { label: crumb.label, href: crumb.href }
                  : { label: crumb.label, disabled: true, onClick: () => {} },
              )}
              triggerClassName={buttonClasses({ variant: 'ghost', size: 'xs', iconOnly: true })}
            >
              <MoreIcon />
            </ActionMenu>
            <Separator />
          </li>
        )}
        {keyedByContent(shown, (c) => c.href ?? c.label).map(({ key, item: crumb }) => (
          <li
            key={key}
            // Once folded, the parent keeps up to 9rem rather than shrinking to
            // a letter beside a long page name, which truncates instead.
            className={cx(
              'flex items-center gap-1.5',
              folded.length > 0 ? 'min-w-0 max-w-36 shrink-0' : 'min-w-0',
            )}
          >
            {crumb.label === '' ? (
              <CrumbPlaceholder />
            ) : (
              <Tooltip content={crumb.label} overflowOnly>
                {crumb.href ? (
                  <AppLink href={crumb.href} className={cx(crumbText, crumbLink, 'max-w-48')}>
                    {crumb.label}
                  </AppLink>
                ) : (
                  <span className={cx(crumbText, 'max-w-48')}>{crumb.label}</span>
                )}
              </Tooltip>
            )}
            <Separator />
          </li>
        ))}
        {current && (
          <li className="flex min-w-0 items-center">
            {current.label === '' ? (
              <h1 aria-current="page" className="m-0">
                <CrumbPlaceholder />
              </h1>
            ) : (
              // The last resort, once only the parent is left beside it.
              <Tooltip content={current.label} overflowOnly>
                <h1
                  aria-current="page"
                  className="m-0 truncate text-[13px] font-medium leading-none text-(--theme-app)"
                >
                  {current.label}
                </h1>
              </Tooltip>
            )}
          </li>
        )}
      </ol>
      {/* The trail at its natural width, for measuring only. */}
      <div
        ref={setNatural}
        aria-hidden
        className="invisible absolute top-0 left-0 flex items-center gap-1.5 whitespace-nowrap text-[13px] leading-none"
      >
        {crumbs.map((crumb, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: a static copy that never reorders
          <span key={i} className="flex items-center gap-1.5">
            <span
              className={cx(
                i < crumbs.length - 1 && 'max-w-48 truncate',
                i === crumbs.length - 1 && 'font-medium',
              )}
            >
              {crumb.label || '\u2003'.repeat(6)}
            </span>
            {i < crumbs.length - 1 && <Separator />}
          </span>
        ))}
      </div>
    </nav>
  )
}

function CrumbPlaceholder() {
  const { common } = useStrings()
  return (
    <span className="flex items-center">
      <Skeleton width="6rem" height="0.8125rem" />
      <span className="sr-only">{common.loading}</span>
    </span>
  )
}

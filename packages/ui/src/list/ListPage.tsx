import type { ReactElement, MouseEvent as ReactMouseEvent, ReactNode } from 'react'
import { Children, cloneElement, createContext, isValidElement, useContext, useMemo } from 'react'
import { AppLink, isPlainClick } from '../components/AppLink'
import type { OpenMenu } from '../components/ContextMenu'
import { EmptyState } from '../components/EmptyState'
import {
  isMenuDivider,
  isMenuGroup,
  isMenuSubmenu,
  type MenuEntry,
  useRunAction,
  warnIfInert,
} from '../components/MenuEntries'
import { useNavigation } from '../components/Provider'
import { type SortDirection, Table } from '../components/Table'
import { Tooltip } from '../components/Tooltip'
import { cx } from '../cx'
import { ListFilterBar } from './ListFilterBar'
import {
  FLOATING_ACTIONS_LANE,
  HEADERS_OFF,
  ListActionsHeader,
  ListError,
  ListSkeleton,
  NAME_MIN_WIDTH_PX,
  STRETCHED_LINK_ROW,
  StretchRowLinkContext,
} from './ListTable'
import type { ListView, ListViewChrome } from './listView'
import { MoreButton, type RowAction, rowContextMenuProps, useRowMenuActive } from './rowMenu'

/** Defaults mean rows outside a ListView fully show actions (no view = show everything). */
const RowActionsContext = createContext<{
  show: boolean
  always: boolean
  columnClasses: string[]
  columnStacks: boolean[]
}>({ show: true, always: false, columnClasses: [], columnStacks: [] })

function useRowActions(view?: ListViewChrome) {
  return useMemo(
    () => ({
      show: view?.showActions ?? true,
      always: view?.alwaysShowActions ?? false,
      columnClasses: view?.columnClasses ?? [],
      columnStacks: view?.columnStacks ?? [],
    }),
    [view?.showActions, view?.alwaysShowActions, view?.columnClasses, view?.columnStacks],
  )
}

export function ListRowActionsProvider({
  view,
  children,
}: {
  view?: ListViewChrome | undefined
  children: ReactNode
}) {
  const rowActions = useRowActions(view)
  return <RowActionsContext.Provider value={rowActions}>{children}</RowActionsContext.Provider>
}

// The name cell's own top padding, so the value lines up with the name.
const STAYS_BESIDE_STACK = '@max-[36rem]:align-top @max-[36rem]:pt-2.5'

export interface ListPageProps {
  /** Reaches past the host's content padding (`p-4`) to the container's
   *  edges, for a host whose page container is padded. A list runs edge to
   *  edge so its rows' hover and dividers span the page. */
  bleed?: boolean | undefined
  /** The list's search, filters and view controls, above the rows, such as a
   *  `ListToolbar`. The page's trail and actions, "+ Add" among them, go in
   *  its `PageHeader`. With `total`, it hides while the list is empty. */
  toolbar?: ReactNode
  /** Under the toolbar: the chips of the list's active filters. By default the view's own
   *  `ListFilterBar`, shown while a filter is on; pass one to add a trailing slot, such as Save
   *  view, or `null` to leave it out. */
  filterBar?: ReactNode
  /** Omit on pages without a list view — rows show all actions by default. */
  view?: ListViewChrome | undefined
  /** Still loading: a sketch of rows in place of the list. */
  loading?: boolean | undefined
  /** Why the list couldn't load. Shown only while there is nothing to show
   *  from before, so a failed refresh keeps the rows on screen. */
  error?: unknown
  /** What failed to load, as the error names it: "Couldn't load clusters". */
  errorNoun?: string | undefined
  /** How many rows there are before any search or filter. Given, the page
   *  picks its body: the rows, `empty` while there are none, and `noMatches`
   *  while a search or filter leaves none. */
  total?: number | undefined
  /** How many rows the search and filters leave; `total` by default. */
  matches?: number | undefined
  /** What shows while there is nothing in the list yet. */
  empty?: ListPageEmpty | undefined
  /** What shows while a search or filter leaves nothing, such as "No clusters
   *  match". */
  noMatches?: ReactNode
  /** Keeps the toolbar while the list is empty, for one whose controls still
   *  matter then, such as a filter set by default that hides everything. */
  toolbarWhenEmpty?: boolean | undefined
  children: ReactNode
}

/** A list's empty state: what is missing, and what to do about it. */
export interface ListPageEmpty {
  /** A glyph for what the list holds, drawn faded above the title. */
  icon?: ReactNode
  title: ReactNode
  description?: ReactNode
  /** Such as a link to the docs; the page's "+ Add" stays in its header. */
  action?: ReactNode
}

/** A list filling the page: its toolbar stays put while only the rows scroll.
 *  Given `total`, it also shows the list's states in one shared look: a
 *  sketch while loading, the error when loading failed, the empty state with
 *  the toolbar hidden, the no-matches state, or the rows. */
export function ListPage({
  bleed = false,
  toolbar,
  filterBar,
  view,
  loading = false,
  error,
  errorNoun,
  total,
  matches,
  empty,
  noMatches,
  toolbarWhenEmpty = false,
  children,
}: ListPageProps) {
  const failed = !loading && error !== undefined && error !== null && !total
  const known = total !== undefined && !loading && !failed
  const isEmpty = known && total === 0
  const noneMatch = known && !isEmpty && (matches ?? total) === 0
  // Nothing to search or filter until there is something, so the toolbar waits for rows.
  const controls = total === undefined || toolbarWhenEmpty || (known && total > 0)
  const bar =
    filterBar === undefined ? (
      view?.filterState && view.filterState.fields.length > 0 ? (
        <ListFilterBar filters={view.filterState} />
      ) : null
    ) : (
      filterBar
    )
  let body: ReactNode = children
  if (loading) {
    body = <ListSkeleton />
  } else if (failed) {
    body = <ListError error={error} noun={errorNoun} />
  } else if (isEmpty && empty) {
    body = <EmptyState variant="plain" {...empty} />
  } else if (noneMatch && noMatches) {
    body = <EmptyState variant="plain" title={noMatches} />
  }
  return (
    <div className={cx('flex h-full min-h-0 flex-col', bleed && '-m-4')}>
      {!!toolbar && controls && <div className="shrink-0 px-4">{toolbar}</div>}
      {/* The filters' chips go with the toolbar: an empty list has nothing to filter. */}
      {!!bar && controls && <div className="shrink-0 px-4">{bar}</div>}
      {/* The list body is the @container priority columns measure to auto-hide. */}
      <div className="relative @container min-h-0 flex-1 overflow-auto">
        <ListRowActionsProvider view={view}>{body}</ListRowActionsProvider>
      </div>
    </div>
  )
}

export function ListRow({
  href,
  onActivate,
  items,
  goTo,
  openMenu,
  pinnedActions,
  selected,
  selectionActive,
  onRowSelect,
  leading,
  className,
  children,
}: {
  /** Where the row goes. Its `NameCell` with the same href becomes a link
   *  covering the row; a click the link doesn't catch still goes there. */
  href: string | null
  /** Plain-click handler for rows that open something in place instead of navigating. */
  onActivate?: (() => void) | undefined
  items: MenuEntry[]
  goTo: (to: string) => void
  openMenu: OpenMenu
  /** Actions shown as buttons on the row, beside the menu. */
  pinnedActions?: RowAction[] | undefined
  className?: string
  /** Tints the whole row to mark it as part of a multi-selection. */
  selected?: boolean
  /** When multi-selection is active, plain row click toggles selection instead of navigating. */
  selectionActive?: boolean
  onRowSelect?: ((e: ReactMouseEvent) => void) | undefined
  /** Non-column cell rendered before the column cells; kept out of `children` so they stay aligned with `columns`. */
  leading?: ReactNode
  children: ReactNode
}) {
  // Hold the row's hover affordance while its menu is open — the menu overlay
  // would otherwise steal the pointer and drop `:hover`/`group-hover`.
  const { active: menuActive, openMenu: openRowMenu } = useRowMenuActive(openMenu)
  const {
    show: showActions,
    always: alwaysShowActions,
    columnClasses,
    columnStacks,
  } = useContext(RowActionsContext)

  // Apply each column's responsive class to its cell by position. toArray drops
  // the falsy `{isVisible && ...}` entries, so cells line up with columnClasses.
  const cells = Children.toArray(children)
  // A stacked column's content also rides under the first cell, shown only
  // where its own cell has given way, so it never leaves the row.
  // A cell with nothing in it (a status only some rows have) adds nothing.
  const stacked = cells.flatMap((child, i) => {
    if (i === 0 || !columnStacks[i] || !isValidElement(child)) {
      return []
    }
    const content = (child as ReactElement<{ children?: ReactNode }>).props.children
    return Children.toArray(content).length > 0 ? [content] : []
  })
  const styledCells = cells.map((child, i) => {
    // Where columns stack under the name, a column that stays a column, such as
    // a total, sits on the name's line rather than floating mid-row.
    const cls = cx(
      columnClasses[i],
      i > 0 && stacked.length > 0 && !columnStacks[i] && STAYS_BESIDE_STACK,
    )
    if (!isValidElement(child) || (!cls && !(i === 0 && stacked.length > 0))) {
      return child
    }
    const el = child as ReactElement<{ className?: string; children?: ReactNode }>
    if (i === 0 && stacked.length > 0) {
      return cloneElement(el, {
        className: cx(el.props.className, cls),
        children: (
          <>
            {el.props.children}
            {stacked.map((content, j) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: stacked cells keep their column order
                key={j}
                // A flex box, so its line is the value's own height, not the cell's
                // 24px: it follows the subtitle by a 4px step and leaves the row
                // the same padding below as above.
                className="mt-1 flex min-w-0 items-center @[36rem]:hidden"
                data-stacked
              >
                {content}
              </div>
            ))}
          </>
        ),
      })
    }
    return cloneElement(el, { className: cx(el.props.className, cls) })
  })

  // A row whose only action is a `⋯` shown on hover floats it over its end
  // instead of keeping a lane for it (see ListActionsHeader).
  const floating = !alwaysShowActions && !(pinnedActions && pinnedActions.length > 0)

  // While selecting, a plain click on the row selects it, so the link stays in its cell.
  const stretch = !!href && !selectionActive

  const handleRowClick = (e: ReactMouseEvent) => {
    if ((e.target as HTMLElement).closest('a,button,input,label')) {
      return
    }
    if (selectionActive && onRowSelect) {
      onRowSelect(e)
      return
    }
    if (href) {
      // A modified click asks for a new tab, which only the link can give.
      if (isPlainClick(e)) {
        goTo(href)
      }
    } else {
      onActivate?.()
    }
  }

  // Hide the overflow "..." when every menu item is already shown as a pinned
  // action (e.g. a single pinned action) — the menu would only duplicate it.
  // A submenu (e.g. Copy) or a group can never be pinned, so either keeps "..." visible.
  const pinnedLabels = new Set((pinnedActions ?? []).map((a) => a.label))
  const hasOverflowItems = items.some(
    (item) =>
      !isMenuDivider(item) &&
      (isMenuSubmenu(item) || isMenuGroup(item) || !pinnedLabels.has(item.label)),
  )

  return (
    <tr
      className={cx(
        'group',
        selected
          ? 'bg-(--theme-accent-subtle)/60'
          : menuActive
            ? 'theme-hover'
            : 'hover:theme-hover',
        (href || onActivate || selectionActive) && 'cursor-pointer',
        // The row is its stretched link's box; other controls rise above the link.
        stretch && STRETCHED_LINK_ROW,
        className,
      )}
      onClick={handleRowClick}
      {...rowContextMenuProps(openRowMenu, items)}
    >
      {leading}
      <StretchRowLinkContext.Provider value={stretch}>{styledCells}</StretchRowLinkContext.Provider>
      {/* Actions off by default (Display toggle); right-click still opens the
       * menu. Buttons are absolutely positioned so toggling them never changes
       * row height. */}
      {showActions && (
        <Table.Item className={cx('relative py-2.5', floating && FLOATING_ACTIONS_LANE)}>
          <div
            className={cx(
              'absolute inset-y-0 right-0 flex items-center gap-0.5 pr-4',
              // Over the last column's end, on the row's hover color, so its value
              // gives way to the menu only while the row is hovered or focused.
              floating &&
                !menuActive &&
                'pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:focus-within:opacity-100',
              floating &&
                'pointer-fine:bg-linear-to-l pointer-fine:from-(--theme-hover) pointer-fine:from-70% pointer-fine:to-transparent pointer-fine:pl-6',
            )}
          >
            {/* Below ~44rem pinned buttons collapse into `⋯` (even with "always
             * show"), freeing their lane. */}
            {pinnedActions && pinnedActions.length > 0 && (
              <span className="hidden items-center gap-0.5 @[44rem]:flex">
                {pinnedActions.map((action) => (
                  <PinnedActionButton
                    key={action.key}
                    action={action}
                    visible={alwaysShowActions || menuActive}
                  />
                ))}
              </span>
            )}
            {/* `⋯` opens the full menu; when redundant (all items pinned) hide
             * it at ≥44rem, where the buttons show. */}
            <MoreButton
              open={menuActive}
              visible={menuActive || alwaysShowActions || floating}
              onOpen={(button) => openRowMenu(button, items)}
              className={hasOverflowItems ? undefined : '@[44rem]:hidden'}
            />
          </div>
        </Table.Item>
      )}
    </tr>
  )
}

function PinnedActionButton({ action, visible }: { action: RowAction; visible: boolean }) {
  warnIfInert(action, 'ListPage pinned action')
  const runAction = useRunAction()
  const reason = action.disabled ? action.disabledReason : undefined
  const props = {
    'aria-label': reason ? `${action.label}. ${reason}` : action.label,
    className: cx(
      'rounded p-1 cursor-pointer text-(--theme-muted-text-color) transition-colors hover:bg-(--theme-muted-panel-bg) hover:text-(--theme-app) focus-visible:outline-2 focus-visible:outline-(--theme-link) aria-disabled:cursor-not-allowed aria-disabled:opacity-20 aria-disabled:hover:bg-transparent aria-disabled:hover:text-(--theme-muted-text-color) [&>svg]:h-4 [&>svg]:w-4',
      visible ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
    ),
  }
  return (
    <Tooltip content={reason ?? action.label} side="bottom">
      {action.href ? (
        <AppLink
          href={action.href}
          reloadDocument={action.reloadDocument}
          target={action.target}
          disabled={action.disabled}
          {...props}
        >
          {action.icon}
        </AppLink>
      ) : (
        <button
          type="button"
          aria-disabled={action.disabled}
          onClick={(e) => {
            e.stopPropagation()
            if (!action.disabled) {
              runAction(action)
            }
          }}
          {...props}
        >
          {action.icon}
        </button>
      )}
    </Tooltip>
  )
}

function columnSort<T>(view: ListView<T>, orderBy: string): SortDirection {
  if (view.orderBy !== orderBy) {
    return 'none'
  }
  return view.orderDir === 'asc' ? 'ascending' : 'descending'
}

/** Name column min-width is by role, not position, so a leading checkbox
 *  doesn't shift it. A column with an `orderBy` the view offers sorts by it.
 *  While the view's column headers are off, the header row collapses: its
 *  cells still size the columns, but nobody sees or hears them, as with any
 *  other display option that is off. */
export function ListColumns<T>({ view }: { view: ListView<T> }) {
  return (
    <>
      {view.visibleColumns.map((col, i) => {
        // A column naming an order the view doesn't offer stays a plain title.
        const orderBy = view.orderBys.some((o) => o.value === col.orderBy) ? col.orderBy : undefined
        return (
          <Table.Header
            key={col.key}
            caps={false}
            className={cx(
              col.headerClassName,
              view.columnClasses[i],
              // listTableProps collapses the header row when it holds this marker.
              !view.showColumnHeaders && HEADERS_OFF,
            )}
            style={col.alwaysVisible ? { minWidth: NAME_MIN_WIDTH_PX } : undefined}
            sort={orderBy === undefined ? undefined : columnSort(view, orderBy)}
            onSort={orderBy === undefined ? undefined : () => view.sortBy(orderBy)}
          >
            {col.label}
          </Table.Header>
        )
      })}
      <ListActionsHeader view={view} />
    </>
  )
}

// Hoisted into <thead> (see Table getHeaders).
ListColumns.isTableHeader = true

/** Stable `goTo` for whole-row navigation (`rowNavProps`, `ListRow`). */
export function useListNavigate() {
  return useNavigation().goTo
}

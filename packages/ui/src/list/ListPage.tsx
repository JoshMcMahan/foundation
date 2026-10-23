import type {
  ComponentProps,
  CSSProperties,
  ReactElement,
  MouseEvent as ReactMouseEvent,
  ReactNode,
} from 'react'
import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
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
import {
  CellPlacementContext,
  hasContent,
  type SortDirection,
  STACKED_ITEM,
  STACKED_JOINED,
  Table,
} from '../components/Table'
import { Tooltip } from '../components/Tooltip'
import { cx } from '../cx'
import { ListFilterBar, type ListFilterBarProps } from './ListFilterBar'
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
import { ListToolbar, type ListToolbarProps, toolbarCount } from './ListToolbar'
import { ListCountText, ListFooterCountContext } from './listSearch'
import type { ColumnDef, ListView, ListViewChrome, StackLine } from './listView'
import { MoreButton, type RowAction, rowContextMenuProps, useRowMenuActive } from './rowMenu'

/** Defaults mean rows outside a ListView fully show actions (no view = show everything). */
const RowActionsContext = createContext<{
  show: boolean
  always: boolean
  columnClasses: string[]
  columnStacks: boolean[]
  columnStackLines: (StackLine | undefined)[]
  reservesLane: boolean
}>({
  show: true,
  always: false,
  columnClasses: [],
  columnStacks: [],
  columnStackLines: [],
  reservesLane: false,
})

const NO_STACK_LINES: (StackLine | undefined)[] = []

function useRowActions(view?: ListViewChrome) {
  return useMemo(
    () => ({
      show: view?.showActions ?? true,
      always: view?.alwaysShowActions ?? false,
      columnClasses: view?.columnClasses ?? [],
      columnStacks: view?.columnStacks ?? [],
      columnStackLines: view?.columnStackLines ?? NO_STACK_LINES,
      reservesLane: view?.reservesActionLane ?? view?.lastColumnLocked ?? false,
    }),
    [
      view?.showActions,
      view?.alwaysShowActions,
      view?.columnClasses,
      view?.columnStacks,
      view?.columnStackLines,
      view?.lastColumnLocked,
      view?.reservesActionLane,
    ],
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
   *  its `PageHeader`. With `total`, it hides while the list is empty. Once
   *  the page shows the count under its rows, the toolbar sits at the end of
   *  the filter chips' first line, or takes the line alone while no chip
   *  shows. */
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
  /** Names what the list counts. With `total` (and `matches`), the page
   *  shows the count under its last row: "7 tokens", or "2 of 7 tokens"
   *  while a search or filter narrows the list. It shows only while there
   *  are rows: the empty and no-matches states say enough. A `ListToolbar`'s
   *  own `count` shows there too. */
  count?: ListPageCount | undefined
  /** Under the last row, on the count's line: a `Pagination`, or a "Load
   *  more" button. */
  pager?: ReactNode
  children: ReactNode
}

/** What a list's count calls its rows. */
export interface ListPageCount {
  noun: string
  nounPlural: string
  /** Whether a search or filter narrows the list, so the count reads "2 of
   *  7". By default, whether the view's filters are on or `matches` differs
   *  from `total`; pass it for a search the page holds. */
  filterActive?: boolean | undefined
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
  count,
  pager,
  children,
}: ListPageProps) {
  const failed = !loading && error !== undefined && error !== null && !total
  const known = total !== undefined && !loading && !failed
  const isEmpty = known && total === 0
  const noneMatch = known && !isEmpty && (matches ?? total) === 0
  // Nothing to search or filter until there is something, so the toolbar waits for rows.
  const controls = total === undefined || toolbarWhenEmpty || (known && total > 0)
  const givenBar =
    filterBar === undefined ? (
      view?.filterState && view.filterState.fields.length > 0 ? (
        <ListFilterBar filters={view.filterState} />
      ) : null
    ) : (
      filterBar
    )
  // A ListToolbar's count moves under the rows, read from its props so it
  // shows in one place from the first render.
  const fromToolbar =
    isValidElement<ListToolbarProps<unknown>>(toolbar) && toolbar.type === ListToolbar
      ? toolbarCount(toolbar.props)
      : undefined
  const counted =
    count && total !== undefined
      ? {
          total,
          matches: matches ?? total,
          filterActive:
            count.filterActive ??
            ((view?.filterState?.count ?? 0) > 0 || (matches ?? total) !== total),
          noun: count.noun,
          nounPlural: count.nounPlural,
        }
      : fromToolbar
  // The count shows under rows only: never while loading, failed, empty or matching nothing.
  const showsRows =
    !loading && !failed && !isEmpty && !noneMatch && (!counted || counted.matches > 0)
  const footerCount = showsRows ? counted : undefined
  // With the count gone from the toolbar, the toolbar shares the chips' line, at its end, rather
  // than keep a line for its controls alone. A toolbar that still holds a count of its own keeps
  // its line.
  const shareLine =
    counted !== undefined &&
    !!toolbar &&
    isValidElement<ListFilterBarProps>(givenBar) &&
    givenBar.type === ListFilterBar
  const bar = shareLine ? cloneElement(givenBar, { end: toolbar }) : givenBar
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
      {/* With the count under the rows, the toolbar leaves its own out. */}
      <ListFooterCountContext value={counted !== undefined}>
        {!!toolbar && !shareLine && controls && <div className="shrink-0 px-4">{toolbar}</div>}
        {/* The filters' chips go with the toolbar: an empty list has nothing to filter. */}
        {!!bar && controls && <div className="shrink-0 px-4">{bar}</div>}
      </ListFooterCountContext>
      {/* The list body is the @container priority columns measure to auto-hide. */}
      <div className="relative @container min-h-0 flex-1 overflow-auto">
        <ListRowActionsProvider view={view}>{body}</ListRowActionsProvider>
        {(footerCount || (showsRows && !!pager)) && (
          <ListFooter count={footerCount} pager={pager} />
        )}
      </div>
    </div>
  )
}

/** The line under a list's last row: its count at the rows' start, its pager at their end. */
function ListFooter({
  count,
  pager,
}: {
  count: ComponentProps<typeof ListCountText> | undefined
  pager: ReactNode
}) {
  return (
    // No rule or band of its own: it sits on the rows' last divider, its text
    // on the rows' 16px start. A pager that renders nothing leaves it empty, and
    // then it takes no space. A `Pagination` takes the rest of the line (it
    // sizes by its own width), its position beside its steps, and its inset
    // gives way to the line's.
    <div className="flex min-h-10 flex-wrap items-center gap-x-3 px-4 empty:hidden [&>:not([role=status])]:ml-auto [&>nav]:flex-1 [&>nav]:px-0 [&>nav>div:first-child]:justify-end">
      {count && <ListCountText {...count} />}
      {pager}
    </div>
  )
}

// How a list row shows a cell under its first: as an item of a line, in place of a cell.
const STACKED = { stacked: true }
const STACKED_JOINED_PLACEMENT = { stacked: true, joined: true }

// The line the stacked values share: it follows the subtitle by a 4px step, and its items wrap
// with a 4px step between lines and 12px between values.
const STACKED_LINE =
  'mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-(--theme-muted-text-color) empty:hidden @[36rem]:hidden'

// Stacked values on lines of their own: the same steps, each line wrapping on its own.
const STACKED_LINES =
  'mt-1 flex min-w-0 flex-col gap-y-1 text-xs text-(--theme-muted-text-color) empty:hidden @[36rem]:hidden'
const STACKED_LINES_LINE = 'flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1'

// A cell given straight to a row, whose content is there to see, rather than through a component.
const isCellElement = (child: ReactElement) => child.type === Table.Item || child.type === 'td'

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
    columnStackLines,
    reservesLane,
  } = useContext(RowActionsContext)

  // Apply each column's responsive class to its cell by position. toArray drops
  // the falsy `{isVisible && ...}` entries, so cells line up with columnClasses.
  // A cell is a `Table.Item`, as a child or rendered by a component of the host's,
  // which takes its column's classes from the placement set around it.
  const cells = Children.toArray(children)
  // A stacked column's content also rides under the first cell, shown only
  // where its own cell has given way, so it never leaves the row. A cell given
  // straight with nothing in it (a status only some rows have) adds nothing.
  const stacked = cells.flatMap((child, i) => {
    if (i === 0 || !columnStacks[i] || !isValidElement(child)) {
      return []
    }
    const line = columnStackLines[i]
    if (isCellElement(child)) {
      const content = (child as ReactElement<{ children?: ReactNode }>).props.children
      return hasContent(content) ? [{ child, line }] : []
    }
    return [{ child, line }]
  })
  // A stacked value as an item of its line; one joined to the value before it brings its dot.
  const item = (child: ReactNode, j: number, joined = false) =>
    // A bare `<td>` can't show as an item, so its content does.
    isValidElement(child) && child.type === 'td' ? (
      <div
        // biome-ignore lint/suspicious/noArrayIndexKey: stacked cells keep their column order
        key={j}
        className={cx(STACKED_ITEM, joined && STACKED_JOINED)}
        data-stacked
      >
        {(child as ReactElement<{ children?: ReactNode }>).props.children}
      </div>
    ) : (
      // biome-ignore lint/suspicious/noArrayIndexKey: stacked cells keep their column order
      <CellPlacementContext key={j} value={joined ? STACKED_JOINED_PLACEMENT : STACKED}>
        {child}
      </CellPlacementContext>
    )
  // The stacked values share one line under the name, flowing inline and wrapping between them,
  // so a phone's row stays a few lines tall rather than one line per column. A column can ask for
  // a line of its own, or to join the value before it after a dot, so every row reads alike. It
  // shows only where the columns' own cells have given way, and is gone when no value renders.
  let under: ReactNode
  if (stacked.length > 0 && stacked.every(({ line }) => line === undefined)) {
    under = (
      <div className={STACKED_LINE} data-stacked-line>
        {stacked.map(({ child }, j) => item(child, j))}
      </div>
    )
  } else if (stacked.length > 0) {
    const lines: ReactNode[][] = []
    stacked.forEach(({ child, line }, j) => {
      const current = lines.at(-1)
      if (!current || line === 'own') {
        lines.push([item(child, j)])
        return
      }
      current.push(item(child, j, line === 'join'))
    })
    under = (
      <div className={STACKED_LINES} data-stacked-lines>
        {lines.map((values, k) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: the lines keep their columns' order
          <div key={k} className={STACKED_LINES_LINE} data-stacked-line>
            {values}
          </div>
        ))}
      </div>
    )
  }
  const styledCells = cells.map((child, i) => {
    // Where columns stack under the name, a column that stays a column, such as
    // a total, sits on the name's line rather than floating mid-row.
    const cls = cx(
      columnClasses[i],
      i > 0 && stacked.length > 0 && !columnStacks[i] && STAYS_BESIDE_STACK,
    )
    const after = i === 0 ? under : undefined
    if (!isValidElement(child) || (!cls && !after)) {
      return child
    }
    // A bare `<td>` reads no placement, so it takes its classes and what follows its own.
    if (child.type === 'td') {
      const el = child as ReactElement<{ className?: string; children?: ReactNode }>
      return cloneElement(el, {
        className: cx(el.props.className, cls),
        ...(after
          ? {
              children: (
                <>
                  {el.props.children}
                  {after}
                </>
              ),
            }
          : {}),
      })
    }
    return (
      <CellPlacementContext key={child.key} value={{ className: cls || undefined, after }}>
        {child}
      </CellPlacementContext>
    )
  })

  // A row whose only action is a `⋯` shown on hover floats it over its end
  // instead of keeping a lane for it (see ListActionsHeader).
  // Not over a locked column, such as a delete button's, or an end-aligned one, such as a
  // runtime, whose value it would cover: there it keeps its lane after the column.
  const floating =
    !alwaysShowActions && !(pinnedActions && pinnedActions.length > 0) && !reservesLane

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
        // Visible: a floating `⋯` reaches over the last column's end.
        <Table.Item
          className={cx('relative overflow-visible py-2.5', floating && FLOATING_ACTIONS_LANE)}
        >
          <div
            className={cx(
              'absolute inset-y-0 right-0 flex items-center gap-0.5 pr-4',
              // Where columns stack under the name, the row's controls line up at its top, with
              // the name's first line and any column that stays beside the stack.
              stacked.length > 0 && '@max-[36rem]:items-start @max-[36rem]:pt-2',
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

/**
 * A group's header row in a list: its label, such as a status or a cluster,
 * and, against the row's far end, what sums it up, such as "2/3 running".
 *
 * Inside a `ListPage` with a view, it has one cell per column, each hiding
 * with its column as the list narrows, so a group never holds a hidden
 * column's width open; its content lays out across the row's visible width
 * from the first cell. Elsewhere it is one cell spanning `colSpan` columns.
 */
export function GroupRow({
  label,
  detail,
  count,
  trailing,
  children,
  leading = 0,
  colSpan,
  className,
}: {
  /** The group's name: text, or an icon, a name with its tooltip, badges. */
  label?: ReactNode
  /** A secondary detail after the label, such as an ID, that gives way first: it shows only
   *  where the list is at least 36rem wide, and truncates before the label does. */
  detail?: ReactNode
  /** How many rows the group holds, shown after the label. */
  count?: number | undefined
  /** Set against the row's far end, such as "2/3 running". */
  trailing?: ReactNode
  /** The whole header, laid out in a row, in place of `label`, `count` and `trailing`. */
  children?: ReactNode
  /** Cells the list's rows have before its columns, such as a selection checkbox. */
  leading?: number | undefined
  /** Outside a list view, the columns the row spans. */
  colSpan?: number | undefined
  className?: string | undefined
}) {
  const { show: showActions, columnClasses } = useContext(RowActionsContext)
  const gutters = useRowGutters()
  const content = children ?? (
    <>
      <span className="flex min-w-0 items-center gap-2 text-(--theme-app)">{label}</span>
      {detail !== undefined && detail !== null && detail !== false && (
        <span
          className="ml-2 hidden min-w-0 shrink-[100] truncate text-(--theme-muted-text-color) @[36rem]:block"
          data-group-detail
        >
          {detail}
        </span>
      )}
      {count !== undefined && (
        <span className="shrink-0 text-(--theme-muted-text-color)">
          <span className="mx-1.5 opacity-50" aria-hidden="true">
            ·
          </span>
          {count}
        </span>
      )}
      {trailing !== undefined && trailing !== null && trailing !== false && (
        <span className="ml-auto flex shrink-0 items-center gap-2 pl-3 text-(--theme-muted-text-color) tabular-nums">
          {trailing}
        </span>
      )}
    </>
  )
  // A fixed height, so a header with badges is as tall as one without.
  const line = 'flex h-8 min-w-0 items-center text-xs font-medium whitespace-nowrap'
  const row = cx('bg-(--theme-muted-panel-bg)', className)
  if (columnClasses.length === 0) {
    return (
      <tr className={row}>
        <td colSpan={colSpan}>
          <div className={line}>{content}</div>
        </td>
      </tr>
    )
  }
  const cells = leading + columnClasses.length + (showActions ? 1 : 0)
  return (
    <tr className={row} data-group-row ref={gutters.ref} style={gutters.style}>
      {Array.from({ length: cells }, (_, i) => {
        const column = i - leading
        const cls = column >= 0 && column < columnClasses.length ? columnClasses[column] : undefined
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: one cell per column, in column order
          <td key={i} className={cx('p-0', cls)}>
            {i === 0 && (
              // No width of its own, so the cell sizes as an empty one would;
              // the content runs on across the empty cells to the list's far
              // edge, less the row's own padding at each end.
              <div className="w-0">
                <div
                  className={line}
                  style={{
                    width: 'calc(100cqw - var(--group-start, 1rem) - var(--group-end, 1rem))',
                  }}
                >
                  {content}
                </div>
              </div>
            )}
          </td>
        )
      })}
    </tr>
  )
}

/** The padding at a row's ends, read from its first and last shown cells, as custom properties a
 *  group row's header subtracts from the list's width: so it lines up with the rows however the
 *  host pads its list. Until it has measured, 16px, as `listTableProps` pads. */
function useRowGutters() {
  const ref = useRef<HTMLTableRowElement>(null)
  const [gutters, setGutters] = useState<{ start: string; end: string } | null>(null)
  useLayoutEffect(() => {
    const row = ref.current
    if (!row || typeof getComputedStyle === 'undefined') {
      return
    }
    const measure = () => {
      const cells = Array.from(row.cells).filter((cell) => cell.getClientRects().length > 0)
      const first = cells[0]
      const last = cells.at(-1)
      if (!first || !last) {
        return
      }
      const start = getComputedStyle(first).paddingInlineStart
      const end = getComputedStyle(last).paddingInlineEnd
      setGutters((was) => (was?.start === start && was.end === end ? was : { start, end }))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') {
      return
    }
    // Container queries can change which cells show, and so which is last.
    const observer = new ResizeObserver(measure)
    observer.observe(row)
    return () => observer.disconnect()
  }, [])
  const style = gutters
    ? ({ '--group-start': gutters.start, '--group-end': gutters.end } as CSSProperties)
    : undefined
  return { ref, style }
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

// Which width a column with a share takes: its own where every column shows, more where the low
// columns have dropped (below 52rem), and more again where the medium and stacked ones have (below
// 36rem), as `ColumnDef.priority` and `stack` drop them.
const SHARE_WIDTH = 'w-(--share-narrow) @[36rem]:w-(--share-medium) @[52rem]:w-(--share-wide)'

type Tiers = { wide: number; medium: number; narrow: number }

function percent(width: ColumnDef['width']): number | undefined {
  const match = typeof width === 'string' ? /^(\d+(?:\.\d+)?)%$/.exec(width.trim()) : null
  return match ? Number(match[1]) : undefined
}

/** Each column's width at each tier, for a column whose width is a share of the list. The
 *  shares of the columns a tier drops go to those left, each in proportion to its own: the
 *  name's, the rest of the list, among them. */
function shareWidths(columns: ColumnDef[], stacks: boolean[]): (Tiers | undefined)[] {
  const shares = columns.map((col) => percent(col.width))
  const shows = (col: ColumnDef, i: number, tier: keyof Tiers) =>
    tier === 'wide' || (tier === 'medium' ? col.priority !== 'low' : !col.priority && !stacks[i])
  const total = shares.reduce<number>((sum, share) => sum + (share ?? 0), 0)
  const scale = (tier: keyof Tiers) => {
    const kept = columns.reduce(
      (sum, col, i) => sum + (shows(col, i, tier) ? (shares[i] ?? 0) : 0),
      0,
    )
    // Where the tier drops columns and every column left holds a share, as when a phone stacks
    // the rest under the name, the shares take the whole list between them. Otherwise the
    // auto-laid-out table hands the spare width to the row's actions, and the name, with what
    // stacks under it, gets half a row.
    const drops = columns.some((col, i) => !shows(col, i, tier))
    const unshared = columns.some((col, i) => shows(col, i, tier) && shares[i] === undefined)
    if (drops && !unshared && kept > 0) {
      return 100 / kept
    }
    // The list's width less the shares the tier drops.
    const left = 100 - (total - kept)
    return left > 0 ? 100 / left : 1
  }
  const factors = { wide: 1, medium: scale('medium'), narrow: scale('narrow') }
  return shares.map((share) =>
    share === undefined
      ? undefined
      : {
          wide: share,
          medium: share * factors.medium,
          narrow: share * factors.narrow,
        },
  )
}

function headerStyle(col: ColumnDef, tiers: Tiers | undefined): CSSProperties | undefined {
  const style: Record<string, string | number> = {}
  if (col.alwaysVisible) {
    // Half a phone-narrow list at most, so the columns that stay beside the
    // name and the `⋯`'s lane still fit beside it there.
    style['minWidth'] = `min(${NAME_MIN_WIDTH_PX}px, 50cqw)`
  }
  if (tiers) {
    style['--share-wide'] = `${tiers.wide}%`
    style['--share-medium'] = `${tiers.medium}%`
    style['--share-narrow'] = `${tiers.narrow}%`
  } else if (col.width !== undefined) {
    style['width'] = col.width
  }
  return Object.keys(style).length > 0 ? (style as CSSProperties) : undefined
}

/** Name column min-width is by role, not position, so a leading checkbox
 *  doesn't shift it. A column with an `orderBy` the view offers sorts by it.
 *  While the view's column headers are off, the header row collapses: its
 *  cells still size the columns, but nobody sees or hears them, as with any
 *  other display option that is off. */
export function ListColumns<T>({ view }: { view: ListView<T> }) {
  const widths = shareWidths(view.visibleColumns, view.columnStacks)
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
              // A share takes the width its tier gives it, as narrower lists drop columns.
              widths[i] && SHARE_WIDTH,
              // listTableProps collapses the header row when it holds this marker.
              !view.showColumnHeaders && HEADERS_OFF,
            )}
            style={headerStyle(col, widths[i])}
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

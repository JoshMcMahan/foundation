import type { ReactNode } from 'react'
import { useCallback, useMemo, useState } from 'react'
import { usePersistedState, useStrings } from '../components/Provider'
import type { ActiveFilter, FilterField, QuickFilter } from './filterModel'
import { actionsColumnWidth } from './ListTable'
import { type FilterStore, type ListFilters, useListFilters } from './useListFilters'

/** A toggleable column. Rendering stays in the page's row component, gated by
 * {@link ListView.isVisible}; this is just the header metadata + visibility. */
export interface ColumnDef {
  key: string
  label: string
  headerClassName?: string
  /** Pinned on — never offered in the column picker — and the list's name
   * column, which keeps a minimum width so it can't be crushed. */
  alwaysVisible?: boolean
  /** Always shown and never offered in the column picker, at its own width:
   * for a column such as a delete button's, which `alwaysVisible` would widen
   * to a name's minimum. */
  locked?: boolean
  /** Hidden until the user turns it on in the Display menu. */
  defaultHidden?: boolean
  /** NOT a table column (no header) — appears in picker and isVisible, but excluded from visibleColumns. */
  inline?: boolean
  /** Drops below a container width instead of stacking (see `stack`). */
  priority?: ColumnPriority
  /** Below the `medium` width, a column without a `priority` gives up its cell
   * and its content shows under the first column's instead, so a phone gets a
   * row it can read rather than one running off the side. `false` keeps it a
   * column there: for something short that compares best lined up, like a
   * total. The first column never stacks; it is what the others stack under. */
  stack?: boolean
  /** Where a stacked column's value sits on the lines under the name. By default the stacked
   *  values share a line, flowing and wrapping between them. `own` starts a line of its own, for
   *  a value read first, such as a status; `join` stays on the line before it after a "·", for
   *  one that belongs with that value, such as a job's nodes after its partition. */
  stackLine?: StackLine | undefined
  /** The `value` of the {@link OrderByOption} this column sorts by. Its header
   * then sorts the list: it shows, and sets, the same order as Display
   * options' Ordering. */
  orderBy?: string
  /** The column's width, such as `'12%'` or `128`, set on its header. In a
   * fixed-layout list (`listTableFixedProps`), where every column without one
   * takes an equal share, give the other columns a width each and leave the
   * name without one, so it takes what they leave. A percentage is a share of
   * the list: when narrower widths drop columns, the shares they held go to
   * the columns left, each in proportion to its own, the name's among them. */
  width?: string | number
  /** `end` sets the header and the cells against the column's far edge, for
   * figures, sizes and times that compare best lined up on their last digit. */
  align?: 'start' | 'end'
}

/** Column responsive importance; `low` drops before `medium`. See {@link ColumnDef.priority}. */
type ColumnPriority = 'low' | 'medium'

/** How a stacked column's value lines up with the others under the name; see
 *  {@link ColumnDef.stackLine}. */
export type StackLine = 'own' | 'join'

// Per-priority "show at/above this container width" classes (hidden below it).
// Full literal strings so Tailwind's scanner emits them.
const PRIORITY_SHOW_CLASS: Record<ColumnPriority, string> = {
  low: 'hidden @[52rem]:table-cell',
  medium: 'hidden @[36rem]:table-cell',
}

/** Whether the column at index `i` of the visible ones stacks on a narrow container. */
function stacks(col: ColumnDef, i: number): boolean {
  return i > 0 && !col.priority && col.stack !== false
}

/** Whether a column is always shown and kept out of the column picker. */
export function isLocked(col: ColumnDef): boolean {
  return Boolean(col.alwaysVisible || col.locked)
}

function columnResponsiveClass(col: ColumnDef, i: number): string {
  if (stacks(col, i)) {
    return PRIORITY_SHOW_CLASS.medium
  }
  return col.priority ? PRIORITY_SHOW_CLASS[col.priority] : ''
}

/** A column's classes for its header and every cell: when it shows, and how it aligns. */
function columnClass(col: ColumnDef, i: number): string {
  const show = columnResponsiveClass(col, i)
  return col.align === 'end' ? (show ? `${show} text-right` : 'text-right') : show
}

interface GroupByOption {
  value: string
  label: string
}

/** compare is the ascending comparator; the view negates it for descending. */
export interface OrderByOption<T> {
  value: string
  label: string
  compare: (a: T, b: T) => number
}

type OrderDir = 'asc' | 'desc'

/** A multi-choice filter: shorthand for an `enum` {@link FilterField} offering "is" and "is not".
 *  `matches` decides whether a row passes given the values chosen ("is not" passes the rows it
 *  turns away). */
export interface FilterFacet<T> {
  key: string
  label: string
  options: { value: string; label: string; icon?: ReactNode }[]
  matches: (row: T, selected: string[]) => boolean
  shared?: boolean
  searchable?: boolean
}

/** Picker metadata + default pinned state only — per-row icons and handlers live in the row component. */
export interface ActionDef {
  key: string
  label: string
  defaultPinned?: boolean
}

export interface ListViewConfig<T> {
  /** Persistence namespace for this page's grouping/columns/filters. */
  storageKey: string
  sharedFiltersKey?: string
  columns: ColumnDef[]
  groupBys?: GroupByOption[]
  defaultGroupBy?: string
  orderBys?: OrderByOption<T>[]
  defaultOrderBy?: string
  facets?: FilterFacet<T>[]
  /** Filters beyond facets: people, dates, text, yes-or-no, with conditions. They follow the
   *  facets in the Filter menu. */
  filterFields?: FilterField<T>[] | undefined
  /** What the page shows before the reader changes anything; Reset returns to them. */
  defaultFilters?: ActiveFilter[] | undefined
  /** Filters held outside the list too, such as the URL: its filters win while it has any, and
   *  changes go to both. See `decodeFilters` and `encodeFilters`. */
  filterStore?: FilterStore | undefined
  /** False leaves remembering the filters to `filterStore` alone. */
  rememberFilters?: boolean | undefined
  /** Fields whose values also show as toggles above the chips, such as a job's state with how
   *  many jobs are in each. */
  quickFilters?: readonly QuickFilter[] | undefined
  actions?: ActionDef[]
  /** Explicit pinned-button count when not using actions+isPinned; sizes the actions column. */
  actionCount?: number
  /** Whether the column-header row shows before the user changes Display
   * options (default true). */
  defaultShowColumnHeaders?: boolean
  /** Whether row action affordances show before the user changes Display options. */
  defaultShowActions?: boolean
  /** Adds built-in "Default" and "Favorites" sort modes; "Default" wins until the user picks a sort. */
  isFavorite?: (row: T) => boolean
  /** Whether a row is powered on/running; "Default" sort keeps on-rows above off-rows. */
  isOn?: (row: T) => boolean
  /** Creation time (ms) for a row; "Default" sort falls back to newest-first. */
  createdAt?: (row: T) => number | null | undefined
}

export const DEFAULT_ORDER = '__default'
export const FAVORITE_ORDER = '__favorite'

/** Generic-free so pages can pass view to ListPage regardless of row type. */
export interface ListViewChrome {
  /** Whether rows render their action affordances at all (the `⋯` + pinned
   * buttons). Usually on by default; pages can opt out via defaultShowActions. */
  showActions: boolean
  /** Whether those actions show at rest rather than only on hover/focus. */
  alwaysShowActions: boolean
  /** Responsive show/hide class per visible column (aligned to
   * {@link visibleColumns}); `ListColumns` and `ListRow` apply entry `i`. */
  columnClasses: string[]
  /** Per visible column, whether it stacks under the first on a narrow
   * container ({@link ColumnDef.stack}); `ListRow` reads entry `i`. */
  columnStacks: boolean[]
  /** Per visible column, the line its stacked value takes ({@link ColumnDef.stackLine}). */
  columnStackLines?: (StackLine | undefined)[] | undefined
  /** Whether the last column is a locked one, such as a delete button's: the
   * row's `⋯` then keeps a lane of its own after it rather than floating over
   * it on hover. */
  lastColumnLocked?: boolean | undefined
  /** Whether the row's `⋯` keeps a lane of its own after the last column
   * rather than floating over its end on hover: the last column is locked, or
   * it is end-aligned, such as a runtime or a count, whose value sits right
   * where the `⋯` would and would be hidden while the row is hovered. A text
   * column's end is usually blank, so the `⋯` floats there and the list keeps
   * its width. */
  reservesActionLane?: boolean | undefined
  /** The list's filters, which `ListPage` shows as a row of chips under its toolbar. */
  filterState?: ListFilters | undefined
  /** Which of the list's groups are collapsed, remembered with the view: a `ListGroup` with a
   *  `groupKey` inside the `ListPage` reads and sets it. */
  groupState?: ListGroupState | undefined
}

/** The collapsed state of a list's groups, kept by its view under its `storageKey`. */
export interface ListGroupState {
  /** Whether the group is collapsed: as the reader last left it, or else `defaultCollapsed`. */
  isCollapsed: (key: string, defaultCollapsed?: boolean) => boolean
  setCollapsed: (key: string, collapsed: boolean) => void
  /** A shown group's place in Collapse all and Expand all, until the returned function drops it. */
  register: (key: string, defaultCollapsed: boolean) => () => void
}

// The most groups a view remembers; the oldest choice goes first. A key whose group is gone is
// only an entry nothing reads, so the cap keeps a list whose groups come and go from growing.
const REMEMBERED_GROUPS = 200

export interface ListView<T> extends ListViewChrome {
  columns: ColumnDef[]
  /** Columns rendered as table columns right now (user-enabled, not inline).
   * Headers and group-row colspans read this so they always match the cells. */
  visibleColumns: ColumnDef[]
  /** Whether a column is turned on (drives both cells and the Display picker). */
  isVisible: (key: string) => boolean
  /** Number of always-visible pinned buttons a row shows (drives column width). */
  pinnedCount: number
  /** Pixel width the trailing actions column reserves for its buttons. */
  actionsWidth: number
  toggleColumn: (key: string) => void
  groupBys: GroupByOption[]
  groupBy: string
  setGroupBy: (value: string) => void
  orderBys: OrderByOption<T>[]
  orderBy: string
  setOrderBy: (value: string) => void
  orderDir: OrderDir
  toggleOrderDir: () => void
  /** Orders by `value` ascending, or flips the direction when the list
   * already orders by it: a sortable column header's click. */
  sortBy: (value: string) => void
  applyOrder: (rows: T[]) => T[]
  facets: FilterFacet<T>[]
  filterState: ListFilters
  /** The values of each filter that reads "is"; `filterState.active` has every filter. */
  filters: Record<string, string[]>
  setFacetValues: (key: string, values: string[]) => void
  /** Empties every filter but the required ones. */
  clearFilters: () => void
  activeFilterCount: number
  applyFilters: (rows: T[]) => T[]
  actions: ActionDef[]
  isPinned: (key: string) => boolean
  togglePinned: (key: string) => void
  /** Whether the table renders its column-header row (default on). */
  showColumnHeaders: boolean
  toggleColumnHeaders: () => void
  /** Toggle whether rows expose action affordances. */
  toggleShowActions: () => void
  toggleAlwaysShowActions: () => void
  /** True when grouping, columns, header row, and pinned actions are all at
   * their defaults. */
  isDisplayDefault: boolean
  /** Restore grouping, columns, header row, and pinned actions to their
   * defaults (does not touch field filters — those have their own Clear). */
  resetDisplay: () => void
  groupState: ListGroupState
  /** The keys of the collapsible groups the list shows now. */
  groupKeys: string[]
  /** Whether every group the list shows is collapsed. */
  allGroupsCollapsed: boolean
  collapseAllGroups: () => void
  expandAllGroups: () => void
}

/** Persisted grouping + column-visibility + field-filter state for a list page,
 * driving the shared Display/Filter menus. */
export function useListView<T>({
  storageKey,
  sharedFiltersKey,
  columns,
  groupBys = [],
  defaultGroupBy,
  orderBys = [],
  defaultOrderBy,
  facets = [],
  filterFields,
  defaultFilters,
  filterStore,
  rememberFilters = true,
  quickFilters,
  actions = [],
  actionCount,
  defaultShowColumnHeaders = true,
  defaultShowActions = true,
  isFavorite,
  isOn,
  createdAt,
}: ListViewConfig<T>): ListView<T> {
  const t = useStrings().list
  const tiebreak = orderBys[0]?.compare
  const effectiveOrderBys = useMemo<OrderByOption<T>[]>(() => {
    if (!isFavorite) {
      return orderBys
    }
    const favoriteRank = (row: T) => (isFavorite(row) ? 0 : 1)
    const onRank = (row: T) => (isOn?.(row) ? 0 : 1)
    const createdMs = (row: T): number => {
      const v = createdAt?.(row)
      return v === null || v === undefined || Number.isNaN(v) ? 0 : v
    }
    const newestFirst = (a: T, b: T) => createdMs(b) - createdMs(a)
    const builtIns: OrderByOption<T>[] = [
      {
        value: DEFAULT_ORDER,
        label: t.orderDefault,
        compare: (a, b) =>
          onRank(a) - onRank(b) ||
          favoriteRank(a) - favoriteRank(b) ||
          newestFirst(a, b) ||
          (tiebreak?.(a, b) ?? 0),
      },
      {
        value: FAVORITE_ORDER,
        label: t.orderFavorites,
        compare: (a, b) => favoriteRank(a) - favoriteRank(b) || (tiebreak?.(a, b) ?? 0),
      },
    ]
    return [...builtIns, ...orderBys]
  }, [orderBys, isFavorite, isOn, createdAt, tiebreak, t])

  const defaultGroupByValue = defaultGroupBy ?? groupBys[0]?.value ?? ''
  const defaultOrderByValue = isFavorite
    ? DEFAULT_ORDER
    : (defaultOrderBy ?? orderBys[0]?.value ?? '')
  const defaultHiddenKeys = useMemo(
    () => columns.filter((c) => c.defaultHidden && !isLocked(c)).map((c) => c.key),
    [columns],
  )
  const defaultPinnedKeys = useMemo(
    () => actions.filter((a) => a.defaultPinned).map((a) => a.key),
    [actions],
  )

  const [hiddenKeys, setHiddenKeys] = usePersistedState<string[]>(
    `${storageKey}:hiddenColumns`,
    defaultHiddenKeys,
  )
  const [pinnedKeys, setPinnedKeys] = usePersistedState<string[]>(
    `${storageKey}:pinnedActions`,
    defaultPinnedKeys,
  )
  const [groupBy, setGroupBy] = usePersistedState<string>(
    `${storageKey}:groupBy`,
    defaultGroupByValue,
  )
  const [showColumnHeaders, setShowColumnHeaders] = usePersistedState<boolean>(
    `${storageKey}:showColumnHeaders`,
    defaultShowColumnHeaders,
  )
  const [showActions, setShowActions] = usePersistedState<boolean>(
    `${storageKey}:showActions`,
    defaultShowActions,
  )
  const [alwaysShowActions, setAlwaysShowActions] = usePersistedState<boolean>(
    `${storageKey}:alwaysShowActions`,
    false,
  )
  const [orderBy, setOrderBy] = usePersistedState<string>(
    `${storageKey}:orderBy`,
    defaultOrderByValue,
  )
  const [orderDir, setOrderDir] = usePersistedState<OrderDir>(`${storageKey}:orderDir`, 'asc')
  const fields = useMemo<FilterField<T>[]>(
    () => [...facets.map(facetField), ...(filterFields ?? [])],
    [facets, filterFields],
  )
  const filterState = useListFilters<T>({
    storageKey,
    sharedFiltersKey,
    fields,
    defaultFilters,
    store: filterStore,
    remember: rememberFilters,
    quick: quickFilters,
  })
  const filters = useMemo(() => {
    const out: Record<string, string[]> = {}
    for (const f of filterState.active) {
      if (f.op === 'is') {
        out[f.field] = [...f.values]
      }
    }
    return out
  }, [filterState.active])

  const pinnedCount =
    actionCount ?? pinnedKeys.filter((key) => actions.some((action) => action.key === key)).length
  // "Always show" implies showing at all (handles legacy standalone prefs).
  const effectiveShowActions = showActions || alwaysShowActions
  // Width the trailing actions column reserves; 0 (no column) when actions off.
  const actionsWidth = effectiveShowActions ? actionsColumnWidth(pinnedCount) : 0

  const isVisible = useCallback(
    (key: string) => {
      const col = columns.find((c) => c.key === key)
      return (col !== undefined && isLocked(col)) || !hiddenKeys.includes(key)
    },
    [columns, hiddenKeys],
  )

  const visibleColumns = useMemo(
    () => columns.filter((c) => !c.inline && (isLocked(c) || !hiddenKeys.includes(c.key))),
    [columns, hiddenKeys],
  )

  const columnClasses = useMemo(() => visibleColumns.map(columnClass), [visibleColumns])
  const columnStacks = useMemo(() => visibleColumns.map(stacks), [visibleColumns])
  const columnStackLines = useMemo(() => visibleColumns.map((c) => c.stackLine), [visibleColumns])
  const last = visibleColumns.at(-1)
  const lastColumnLocked =
    visibleColumns.length > 1 && last !== undefined && !last.alwaysVisible && isLocked(last)
  const reservesActionLane =
    lastColumnLocked || (visibleColumns.length > 1 && last?.align === 'end')

  const toggleColumn = useCallback(
    (key: string) =>
      setHiddenKeys((prev) =>
        prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
      ),
    [setHiddenKeys],
  )

  const { add, update, remove } = filterState
  const setFacetValues = useCallback(
    (key: string, values: string[]) => {
      if (values.length === 0) {
        remove(key)
      } else if (filterState.active.some((f) => f.field === key)) {
        update(key, { op: 'is', values })
      } else {
        add(key, 'is', values)
      }
    },
    [add, update, remove, filterState.active],
  )
  const clearFilters = filterState.clear

  const isPinned = useCallback((key: string) => pinnedKeys.includes(key), [pinnedKeys])
  const togglePinned = useCallback(
    (key: string) =>
      setPinnedKeys((prev) =>
        prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
      ),
    [setPinnedKeys],
  )
  const toggleColumnHeaders = useCallback(
    () => setShowColumnHeaders((prev) => !prev),
    [setShowColumnHeaders],
  )
  // Keep the two switches consistent: off clears "always"; "always" implies on.
  const toggleShowActions = useCallback(() => {
    if (effectiveShowActions) {
      setShowActions(false)
      setAlwaysShowActions(false)
    } else {
      setShowActions(true)
    }
  }, [effectiveShowActions, setShowActions, setAlwaysShowActions])
  const toggleAlwaysShowActions = useCallback(() => {
    const next = !alwaysShowActions
    setAlwaysShowActions(next)
    if (next) {
      setShowActions(true)
    }
  }, [alwaysShowActions, setAlwaysShowActions, setShowActions])
  const toggleOrderDir = useCallback(
    () => setOrderDir((d) => (d === 'asc' ? 'desc' : 'asc')),
    [setOrderDir],
  )
  const sortBy = useCallback(
    (value: string) => {
      if (value === orderBy) {
        toggleOrderDir()
        return
      }
      setOrderBy(value)
      setOrderDir('asc')
    },
    [orderBy, toggleOrderDir, setOrderBy, setOrderDir],
  )
  const applyOrder = useCallback(
    (rows: T[]) => {
      const opt = effectiveOrderBys.find((o) => o.value === orderBy)
      if (!opt) {
        return rows
      }
      const sign = orderDir === 'asc' ? 1 : -1
      return [...rows].sort((a, b) => opt.compare(a, b) * sign)
    },
    [effectiveOrderBys, orderBy, orderDir],
  )

  const sameKeys = (a: string[], b: string[]) =>
    a.length === b.length && a.every((k) => b.includes(k))
  const isDisplayDefault =
    groupBy === defaultGroupByValue &&
    orderBy === defaultOrderByValue &&
    orderDir === 'asc' &&
    showColumnHeaders === defaultShowColumnHeaders &&
    showActions === defaultShowActions &&
    alwaysShowActions === false &&
    sameKeys(hiddenKeys, defaultHiddenKeys) &&
    sameKeys(pinnedKeys, defaultPinnedKeys)
  const resetDisplay = useCallback(() => {
    setGroupBy(defaultGroupByValue)
    setOrderBy(defaultOrderByValue)
    setOrderDir('asc')
    setShowColumnHeaders(defaultShowColumnHeaders)
    setShowActions(defaultShowActions)
    setAlwaysShowActions(false)
    setHiddenKeys(defaultHiddenKeys)
    setPinnedKeys(defaultPinnedKeys)
  }, [
    setGroupBy,
    setOrderBy,
    setOrderDir,
    defaultOrderByValue,
    setShowColumnHeaders,
    setShowActions,
    setAlwaysShowActions,
    setHiddenKeys,
    setPinnedKeys,
    defaultGroupByValue,
    defaultHiddenKeys,
    defaultPinnedKeys,
    defaultShowColumnHeaders,
    defaultShowActions,
  ])

  const groups = useGroupState(storageKey)

  const activeFilterCount = filterState.count
  const applyFilters = useCallback((rows: T[]) => filterState.apply(rows), [filterState.apply])

  return {
    columns,
    visibleColumns,
    columnClasses,
    columnStacks,
    columnStackLines,
    lastColumnLocked,
    reservesActionLane,
    isVisible,
    pinnedCount,
    actionsWidth,
    toggleColumn,
    groupBys,
    groupBy,
    setGroupBy,
    orderBys: effectiveOrderBys,
    orderBy,
    setOrderBy,
    orderDir,
    toggleOrderDir,
    sortBy,
    applyOrder,
    facets,
    filterState,
    filters,
    setFacetValues,
    clearFilters,
    activeFilterCount,
    applyFilters,
    actions,
    isPinned,
    togglePinned,
    showColumnHeaders,
    toggleColumnHeaders,
    showActions: effectiveShowActions,
    toggleShowActions,
    alwaysShowActions,
    toggleAlwaysShowActions,
    isDisplayDefault,
    resetDisplay,
    ...groups,
  }
}

/** Which groups the reader collapsed or expanded, by key, and which groups show now. A choice
 *  stays with its key while the group is gone, filtered out or emptied, so it holds when the
 *  group comes back. */
function useGroupState(storageKey: string) {
  const [choices, setChoices] = usePersistedState<Record<string, boolean>>(
    `${storageKey}:collapsedGroups`,
    {},
  )
  const [shown, setShown] = useState<ReadonlyMap<string, boolean>>(() => new Map())
  // What was stored is only trusted as a map of booleans.
  const remembered = useMemo(
    () => (choices && typeof choices === 'object' && !Array.isArray(choices) ? choices : {}),
    [choices],
  )
  const isCollapsed = useCallback(
    (key: string, defaultCollapsed = false) => {
      const choice = Object.hasOwn(remembered, key) ? remembered[key] : undefined
      return typeof choice === 'boolean' ? choice : defaultCollapsed
    },
    [remembered],
  )
  const setMany = useCallback(
    (keys: string[], collapsed: boolean) =>
      setChoices((prev) => {
        const next: Record<string, boolean> = {}
        for (const [k, v] of Object.entries(
          prev && typeof prev === 'object' && !Array.isArray(prev) ? prev : {},
        )) {
          if (!keys.includes(k) && typeof v === 'boolean') {
            next[k] = v
          }
        }
        for (const k of keys) {
          next[k] = collapsed
        }
        const entries = Object.entries(next)
        return entries.length > REMEMBERED_GROUPS
          ? Object.fromEntries(entries.slice(-REMEMBERED_GROUPS))
          : next
      }),
    [setChoices],
  )
  const setCollapsed = useCallback(
    (key: string, collapsed: boolean) => setMany([key], collapsed),
    [setMany],
  )
  const register = useCallback((key: string, defaultCollapsed: boolean) => {
    setShown((prev) => {
      if (prev.get(key) === defaultCollapsed) {
        return prev
      }
      const next = new Map(prev)
      next.set(key, defaultCollapsed)
      return next
    })
    return () =>
      setShown((prev) => {
        if (!prev.has(key)) {
          return prev
        }
        const next = new Map(prev)
        next.delete(key)
        return next
      })
  }, [])
  const groupState = useMemo<ListGroupState>(
    () => ({ isCollapsed, setCollapsed, register }),
    [isCollapsed, setCollapsed, register],
  )
  const groupKeys = useMemo(() => [...shown.keys()], [shown])
  const allGroupsCollapsed =
    groupKeys.length > 0 && groupKeys.every((key) => isCollapsed(key, shown.get(key)))
  const collapseAllGroups = useCallback(() => setMany(groupKeys, true), [setMany, groupKeys])
  const expandAllGroups = useCallback(() => setMany(groupKeys, false), [setMany, groupKeys])
  return { groupState, groupKeys, allGroupsCollapsed, collapseAllGroups, expandAllGroups }
}

/** A facet as the field it is shorthand for. */
function facetField<T>(facet: FilterFacet<T>): FilterField<T> {
  return {
    key: facet.key,
    label: facet.label,
    kind: 'enum',
    options: facet.options,
    searchable: facet.searchable,
    shared: facet.shared,
    matches: (row, filter) =>
      filter.op === 'isNot'
        ? !facet.matches(row, [...filter.values])
        : facet.matches(row, [...filter.values]),
  }
}

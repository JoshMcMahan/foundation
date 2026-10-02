import type { ReactNode } from 'react'
import { useCallback, useMemo } from 'react'
import { usePersistedState, useStrings } from '../components/Provider'
import { actionsColumnWidth } from './ListTable'

/** A toggleable column. Rendering stays in the page's row component, gated by
 * {@link ListView.isVisible}; this is just the header metadata + visibility. */
export interface ColumnDef {
  key: string
  label: string
  headerClassName?: string
  /** Pinned on — never offered in the column picker (e.g. the Name column). */
  alwaysVisible?: boolean
  /** Hidden until the user turns it on in the Display menu. */
  defaultHidden?: boolean
  /** NOT a table column (no header) — appears in picker and isVisible, but excluded from visibleColumns. */
  inline?: boolean
  priority?: ColumnPriority
}

/** Column responsive importance; `low` drops before `medium`. See {@link ColumnDef.priority}. */
type ColumnPriority = 'low' | 'medium'

// Per-priority "show at/above this container width" classes (hidden below it).
// Full literal strings so Tailwind's scanner emits them.
const PRIORITY_SHOW_CLASS: Record<ColumnPriority, string> = {
  low: 'hidden @[52rem]:table-cell',
  medium: 'hidden @[36rem]:table-cell',
}

function columnResponsiveClass(col: ColumnDef): string {
  return col.priority ? PRIORITY_SHOW_CLASS[col.priority] : ''
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

/** matches decides whether a row passes given the user's selected values for this facet. */
export interface FilterFacet<T> {
  key: string
  label: string
  options: { value: string; label: string; icon?: ReactNode }[]
  matches: (row: T, selected: string[]) => boolean
  shared?: boolean
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
  actions?: ActionDef[]
  /** Explicit pinned-button count when not using actions+isPinned; sizes the actions column. */
  actionCount?: number
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
}

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
  applyOrder: (rows: T[]) => T[]
  facets: FilterFacet<T>[]
  filters: Record<string, string[]>
  setFacetValues: (key: string, values: string[]) => void
  clearFilters: () => void
  activeFilterCount: number
  applyFilters: (rows: T[]) => T[]
  actions: ActionDef[]
  isPinned: (key: string) => boolean
  togglePinned: (key: string) => void
  /** Whether the table renders its column-header row (default off). */
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
  actions = [],
  actionCount,
  defaultShowColumnHeaders = false,
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
    () => columns.filter((c) => c.defaultHidden && !c.alwaysVisible).map((c) => c.key),
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
  const [localFilters, setLocalFilters] = usePersistedState<Record<string, string[]>>(
    `${storageKey}:filters`,
    {},
  )
  const [sharedFilters, setSharedFilters] = usePersistedState<Record<string, string[]>>(
    `${sharedFiltersKey ?? storageKey}:sharedFilters`,
    {},
  )

  const sharedKeys = useMemo(
    () => new Set(facets.filter((f) => f.shared).map((f) => f.key)),
    [facets],
  )

  const filters = useMemo(() => {
    if (sharedKeys.size === 0) {
      return localFilters
    }
    const merged: Record<string, string[]> = {}
    for (const [key, values] of Object.entries(localFilters)) {
      if (!sharedKeys.has(key)) {
        merged[key] = values
      }
    }
    for (const key of sharedKeys) {
      const values = sharedFilters[key]
      if (values?.length) {
        merged[key] = values
      }
    }
    return merged
  }, [localFilters, sharedFilters, sharedKeys])

  const pinnedCount =
    actionCount ?? pinnedKeys.filter((key) => actions.some((action) => action.key === key)).length
  // "Always show" implies showing at all (handles legacy standalone prefs).
  const effectiveShowActions = showActions || alwaysShowActions
  // Width the trailing actions column reserves; 0 (no column) when actions off.
  const actionsWidth = effectiveShowActions ? actionsColumnWidth(pinnedCount) : 0

  const isVisible = useCallback(
    (key: string) => {
      const col = columns.find((c) => c.key === key)
      return Boolean(col?.alwaysVisible) || !hiddenKeys.includes(key)
    },
    [columns, hiddenKeys],
  )

  const visibleColumns = useMemo(
    () => columns.filter((c) => !c.inline && (c.alwaysVisible || !hiddenKeys.includes(c.key))),
    [columns, hiddenKeys],
  )

  const columnClasses = useMemo(() => visibleColumns.map(columnResponsiveClass), [visibleColumns])

  const toggleColumn = useCallback(
    (key: string) =>
      setHiddenKeys((prev) =>
        prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
      ),
    [setHiddenKeys],
  )

  const setFacetValues = useCallback(
    (key: string, values: string[]) => {
      const update = (prev: Record<string, string[]>) => {
        const next = { ...prev }
        if (values.length) {
          next[key] = values
        } else {
          delete next[key]
        }
        return next
      }
      if (sharedKeys.has(key)) {
        setSharedFilters(update)
      } else {
        setLocalFilters(update)
      }
    },
    [setLocalFilters, setSharedFilters, sharedKeys],
  )

  const clearFilters = useCallback(() => {
    setLocalFilters({})
    if (sharedKeys.size > 0) {
      setSharedFilters((prev) => {
        const next = { ...prev }
        for (const key of sharedKeys) {
          delete next[key]
        }
        return next
      })
    }
  }, [setLocalFilters, setSharedFilters, sharedKeys])

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

  const activeFilterCount = useMemo(
    () => Object.values(filters).filter((v) => v && v.length > 0).length,
    [filters],
  )

  const applyFilters = useCallback(
    (rows: T[]) =>
      rows.filter((row) =>
        facets.every((f) => {
          const selected = filters[f.key]
          return !selected || selected.length === 0 ? true : f.matches(row, selected)
        }),
      ),
    [facets, filters],
  )

  return {
    columns,
    visibleColumns,
    columnClasses,
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
    applyOrder,
    facets,
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
  }
}

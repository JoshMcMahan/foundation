import type { ReactNode } from 'react'
import { useStrings } from '../components/Provider'
import { ListDisplayMenu, ListFilterMenu } from './ListViewControls'
import { ListCount, type ListSearch, ListSearchControl } from './listSearch'
import type { ListView } from './listView'

export interface ListToolbarProps<T> {
  /** What the count says: how many there are and, while a search or filter
   *  is on, how many match. `filterActive` defaults to whether the search or
   *  the view's filters narrow the list. */
  count: {
    total: number
    matches: number
    filterActive?: boolean | undefined
    noun: string
    nounPlural: string
  }
  /** Adds its filter menu, when it has facets, and its display options. */
  view?: ListView<T> | undefined
  search?: ListSearch | undefined
  /** Names the search for assistive technology; the strings' "Search" by default. */
  searchLabel?: string | undefined
  /** The search field's placeholder; the label by default. */
  searchPlaceholder?: string | undefined
  /** After the search, such as a control that acts on the whole list. A list
   *  page's "+ Add" belongs in its `PageHeader`. */
  action?: ReactNode
  /** More controls, before the filter and display menus. */
  children?: ReactNode
}

/** A list page's toolbar in the shared order: the count on the left; then
 *  the page's own controls, the filter menu, the display options, the search
 *  and an action on the right. Give it to `ListPage` as its `toolbar`. */
export function ListToolbar<T>({
  count,
  view,
  search,
  searchLabel,
  searchPlaceholder,
  action,
  children,
}: ListToolbarProps<T>) {
  const { common } = useStrings()
  const filterActive =
    count.filterActive ??
    ((search !== undefined && (search.filter.trim() !== '' || search.terms.length > 0)) ||
      (view?.activeFilterCount ?? 0) > 0)
  return (
    <div className="flex min-h-10 items-center justify-between gap-3 py-1">
      {/* The count keeps its line; an open search gives up width first. */}
      <div className="shrink-0 whitespace-nowrap">
        <ListCount
          total={count.total}
          matches={count.matches}
          filterActive={filterActive}
          noun={count.noun}
          nounPlural={count.nounPlural}
        />
      </div>
      <div className="flex min-w-0 items-center gap-1">
        {children}
        {view && <ListFilterMenu view={view} />}
        {view && <ListDisplayMenu view={view} />}
        {search && (
          <ListSearchControl
            search={search}
            label={searchLabel}
            placeholder={searchPlaceholder ?? searchLabel ?? common.search}
          />
        )}
        {!!action && <span className="ml-1 flex">{action}</span>}
      </div>
    </div>
  )
}

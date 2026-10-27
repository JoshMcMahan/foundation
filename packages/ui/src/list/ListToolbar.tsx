import type { ReactNode } from 'react'
import { useContext } from 'react'
import { HeaderActionsFitContext } from '../components/headerActionsFit'
import { useStrings } from '../components/Provider'
import { cx } from '../cx'
import { ListDisplayMenu, ListFilterMenu } from './ListViewControls'
import {
  type ListCountProps,
  ListCountText,
  ListFooterCountContext,
  type ListSearch,
  ListSearchControl,
  ListToolbarInlineContext,
} from './listSearch'
import type { ListView } from './listView'

export interface ListToolbarProps<T> {
  /** What the count says: how many there are and, while a search or filter
   *  is on, how many match. `filterActive` defaults to whether the search or
   *  the view's filters narrow the list. As a `ListPage`'s `toolbar`, the
   *  page shows it under the last row, as its own `count` would; anywhere
   *  else, it leads the toolbar. */
  count?: {
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

/** The count a `ListToolbar` was given, as a `ListPage` shows it under its rows. */
export function toolbarCount<T>({
  count,
  view,
  search,
}: ListToolbarProps<T>): ListCountProps | undefined {
  if (!count) {
    return undefined
  }
  const filterActive =
    count.filterActive ??
    ((search !== undefined && (search.filter.trim() !== '' || search.terms.length > 0)) ||
      (view?.activeFilterCount ?? 0) > 0)
  return {
    total: count.total,
    matches: count.matches,
    filterActive,
    noun: count.noun,
    nounPlural: count.nounPlural,
  }
}

/** A list page's toolbar in the shared order, at its end: the page's own
 *  controls, the filter menu, the display options, the search and an action.
 *  Give it to `ListPage` as its `toolbar`; the list's count goes under its
 *  rows (see `ListPage`'s `count`), and while filter chips show, the toolbar
 *  sits at the end of their first line. */
export function ListToolbar<T>(props: ListToolbarProps<T>) {
  const { view, search, searchLabel, searchPlaceholder, action, children } = props
  const { common } = useStrings()
  // Inside a ListPage that shows the count under its rows, the toolbar leaves it out.
  const inFooter = useContext(ListFooterCountContext)
  const count = inFooter ? undefined : toolbarCount(props)
  // At the end of the chips' line, the line sets the height.
  const inline = useContext(ListToolbarInlineContext)
  // On a line of its own, rather than at the end of the chips' or in a page header's, an open
  // search takes the rest of the line on a phone.
  const inHeader = useContext(HeaderActionsFitContext) !== null
  const ownLine = !inline && !inHeader
  return (
    <div
      className={
        inline
          ? 'flex items-center justify-end gap-3'
          : 'flex min-h-10 items-center justify-end gap-3 py-1'
      }
    >
      {count && (
        // The count keeps its line; an open search gives up width first.
        <div className="mr-auto flex h-8 shrink-0 items-center whitespace-nowrap">
          <ListCountText {...count} />
        </div>
      )}
      <div
        className={cx('flex min-w-0 items-center justify-end gap-1', ownLine && 'max-sm:flex-1')}
      >
        {children}
        {view && <ListFilterMenu view={view} />}
        {view && <ListDisplayMenu view={view} />}
        {search && (
          <ListSearchControl
            search={search}
            label={searchLabel}
            placeholder={searchPlaceholder ?? searchLabel ?? common.search}
            fill={ownLine}
          />
        )}
        {!!action && <span className="ml-1 flex">{action}</span>}
      </div>
    </div>
  )
}

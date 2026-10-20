import React, { createContext, useContext, useState } from 'react'
import { cx } from '../cx'
import { SortDownIcon, SortUnsortedIcon, SortUpIcon } from '../icons'
import { Loader } from './Loader'
import { useStickyTop } from './stickyTop'

/** Which way a column sorts, as `aria-sort` names it. */
export type SortDirection = 'ascending' | 'descending' | 'none'

/** `comfortable` gives each row room; `compact` fits a short key and value
 *  list; `dense` sets small type in tight rows, for a table inside a card or
 *  a panel of figures. */
export type TableDensity = 'comfortable' | 'compact' | 'dense'

const DensityContext = createContext<TableDensity>('comfortable')
// Whether a header sets its title in small capitals unless it says otherwise.
const CapsContext = createContext(true)

const cellY: Record<TableDensity, string> = {
  comfortable: 'py-4',
  compact: 'py-1.5 text-sm',
  dense: 'py-1 text-xs',
}

const headerY: Record<TableDensity, string> = {
  comfortable: 'py-3',
  compact: 'py-2',
  dense: 'py-1.5',
}

// A header and the cells under it share their side padding, so a column's
// title lines up with its values.
const cellX = 'px-3'

interface ItemProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  /** Lets the text wrap; by default a cell keeps to one line. */
  wrap?: boolean
}

function Item({ wrap = false, children, className, ...tdProps }: ItemProps) {
  const density = useContext(DensityContext)
  return (
    <td {...tdProps} className={cx(cellX, cellY[density], !wrap && 'whitespace-nowrap', className)}>
      {children}
    </td>
  )
}

interface HeaderProps {
  children?: React.ReactNode
  className?: string | undefined
  style?: React.CSSProperties | undefined
  colSpan?: number | undefined
  /** Which way the column sorts now. With `onSort`, the header is a button
   *  that shows it; `none` for a sortable column that isn't the sorted one. */
  sort?: SortDirection | undefined
  /** Sorts by this column, or flips its direction. */
  onSort?: (() => void) | undefined
  /** False sets the title in sentence case instead of small capitals. The
   *  table's `caps` by default. */
  caps?: boolean | undefined
}

const sortIcons = {
  ascending: SortUpIcon,
  descending: SortDownIcon,
  none: SortUnsortedIcon,
} as const

function Header({ children, className, style, colSpan, sort, onSort, caps }: HeaderProps) {
  const density = useContext(DensityContext)
  const tableCaps = useContext(CapsContext)
  const Icon = sortIcons[sort ?? 'none']
  return (
    <th
      scope="col"
      colSpan={colSpan}
      style={style}
      aria-sort={onSort ? (sort ?? 'none') : undefined}
      className={cx(
        cellX,
        headerY[density],
        'text-left text-xs font-medium',
        (caps ?? tableCaps) && 'uppercase tracking-wider',
        className,
      )}
    >
      {onSort ? (
        <button
          type="button"
          onClick={onSort}
          // In a right-aligned column the mark leads, so the title still lines up with the values.
          className="group/sort -mx-1 -my-1 inline-flex cursor-pointer py-1 align-middle items-center gap-1 rounded px-1 text-inherit [text-transform:inherit] hover:text-(--theme-app) focus-visible:outline-2 focus-visible:outline-(--theme-link) in-[.text-right]:flex-row-reverse"
        >
          {children}
          {/* Only the sorted column shows its mark at rest: a mark on every
           * column is noise across the row. An unsorted one shows a faint mark
           * under the pointer or keyboard focus, and always on a touch screen,
           * which has no hover to find it with. Its space stays reserved, so
           * the title never moves. */}
          <Icon
            aria-hidden="true"
            className={cx(
              'size-3.5 shrink-0',
              (sort ?? 'none') === 'none' &&
                'opacity-0 group-hover/sort:opacity-40 group-focus-visible/sort:opacity-40 pointer-coarse:opacity-40',
            )}
          />
        </button>
      ) : (
        children
      )}
    </th>
  )
}

interface TableProps {
  children?: React.ReactNode
  density?: TableDensity | undefined
  /** Each column's width, in order, such as `['20%', '8rem', undefined]`; a
   *  column left undefined takes what the others leave. With
   *  `table-fixed` in `className`, the widths hold whatever the cells hold. */
  columns?: readonly (string | undefined)[] | undefined
  /** False sets every header in sentence case, as a small table in a card
   *  reads best; a header's own `caps` still wins. */
  caps?: boolean | undefined
  /** Drops the outer side padding of the first and last columns and the
   *  header's fill, for a table inside something already padded, such as a
   *  card: it reads as part of the card, its titles in line with the card's
   *  other content and set apart by the rule under them. */
  flush?: boolean | undefined
  /** Rules a line between columns as well as rows, for a grid of figures to
   *  read across and down. */
  columnDividers?: boolean | undefined
  borderless?: boolean
  /** When false, drops the theme-panel background. */
  panel?: boolean
  className?: string
  tbodyClassName?: string | undefined
  theadClassName?: string
  wrapperClassName?: string
  roundedTop?: boolean
  rounded?: boolean
  roundedBottom?: boolean
  isLoading?: boolean
  /** The header row stays in view while the rows scroll under it. It sticks
   *  to the nearest scrolling ancestor, just below whatever that ancestor
   *  already pins at its top, such as a page header, a toolbar or tabs, which
   *  it finds and follows by itself; in a box that scrolls on its own it pins
   *  at the box's top. So the table no longer scrolls or clips on its own: a
   *  box that scrolls itself is all a sticky header can stick to. Its ancestor
   *  scrolls it sideways as well as down. Rows pass under the header, so a
   *  `theadClassName` of your own needs a background. */
  stickyHeader?: boolean | undefined
  /** Forwarded to the `<table>`, for attributes that must sit on the element owning
   *  the rows — `role='grid'`, aria-activedescendant, aria-rowcount. `className` is
   *  excluded because it is spread after the table's own classes; use the
   *  `className` prop, which merges. */
  tableProps?: Omit<React.TableHTMLAttributes<HTMLTableElement>, 'className'> & {
    'aria-activedescendant'?: string
    'aria-rowcount'?: number
  }
}

// A <Table.Header>, or a wrapper opting in via a static `isTableHeader` flag
// (Table can't import those wrappers), so it hoists into <thead> not <tbody>.
const isHeaderChild = (child: unknown): boolean => {
  if (!React.isValidElement(child)) {
    return false
  }
  return (
    child.type === Header ||
    (typeof child.type === 'function' &&
      (child.type as { isTableHeader?: boolean }).isTableHeader === true)
  )
}

/** Rows of values under a row of column titles. Put `Table.Header`s first among
 *  the children, then `<tr>`s of `Table.Item`s. */
export function Table({
  density = 'comfortable',
  columns,
  caps = true,
  flush = false,
  columnDividers = false,
  borderless = false,
  panel = true,
  className,
  wrapperClassName = '',
  tbodyClassName = 'divide-y',
  theadClassName,
  children,
  roundedTop = false,
  rounded = false,
  roundedBottom = false,
  isLoading = false,
  stickyHeader = false,
  tableProps,
}: TableProps) {
  const childList = React.Children.toArray(children)
  const [thead, setThead] = useState<HTMLTableSectionElement | null>(null)
  useStickyTop(thead, stickyHeader && !isLoading)
  const hasOverflow = wrapperClassName.split(' ').some((cls) => cls.startsWith('overflow-'))

  return (
    <DensityContext value={density}>
      <CapsContext value={caps}>
        <div
          aria-busy={isLoading}
          className={cx(
            'flex w-full flex-col',
            !hasOverflow && !stickyHeader && 'overflow-hidden',
            wrapperClassName,
          )}
        >
          {isLoading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader />
            </div>
          ) : (
            <div
              className={cx(
                'inline-block min-w-full align-middle',
                !stickyHeader && 'overflow-x-auto',
                panel && 'theme-panel',
                !borderless && 'border theme-border',
                rounded && 'rounded-xl',
                roundedBottom && 'rounded-b-xl',
                roundedTop && 'rounded-t-xl',
              )}
            >
              <table
                className={cx(
                  'min-w-full divide-y theme-border',
                  flush &&
                    '[&_td:first-child]:pl-0 [&_th:first-child]:pl-0 [&_td:last-child]:pr-0 [&_th:last-child]:pr-0',
                  columnDividers && '[&_tr]:divide-x [&_tr]:divide-(--theme-border)',
                  className,
                )}
                {...tableProps}
              >
                {columns && (
                  // The table's row rules are a divide between its children; a
                  // collapsed column group's own would draw under the last row.
                  <colgroup className="border-0">
                    {columns.map((width, i) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: a column is its position
                      <col key={i} style={width ? { width } : undefined} />
                    ))}
                  </colgroup>
                )}
                <thead
                  ref={setThead}
                  className={cx(
                    // Collapsed borders stay where the row was, so the line under
                    // a stuck header is a shadow that moves with it. It sits on
                    // the sticky layer, under menus and popovers. Its `top` is set
                    // as it renders, below the chrome pinned above it.
                    stickyHeader &&
                      'sticky top-0 z-(--layer-sticky) border-b-0 shadow-[inset_0_-1px_0_var(--theme-border)]',
                    theadClassName ??
                      (flush ? 'text-(--theme-muted-text-color)' : 'theme-muted-panel'),
                  )}
                >
                  <tr>{childList.filter(isHeaderChild)}</tr>
                </thead>
                <tbody className={tbodyClassName}>
                  {childList.filter((c) => !isHeaderChild(c))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </CapsContext>
    </DensityContext>
  )
}

Table.Header = Header
Table.Item = Item

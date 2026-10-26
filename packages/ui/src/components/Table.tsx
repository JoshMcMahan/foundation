import React, { createContext, useContext, useState } from 'react'
import { cx } from '../cx'
import { SortDownIcon, SortUnsortedIcon, SortUpIcon } from '../icons'
import { Loader } from './Loader'
import { useStickyTop } from './stickyTop'

/** Which way a column sorts, as `aria-sort` names it. */
export type SortDirection = 'ascending' | 'descending' | 'none'

/** `comfortable` gives each row room; `compact` fits many rows in little
 *  height, such as a key and value list or a dashboard card's runs; `dense`
 *  sets small type in tight rows, for a panel of figures. */
export type TableDensity = 'comfortable' | 'compact' | 'dense'

const DensityContext = createContext<TableDensity>('comfortable')
// Whether a header sets its title in small capitals unless it says otherwise.
const CapsContext = createContext(true)

// A compact row is 32px tall whatever it holds up to that: a line of text,
// a 24px logo or a button. The height is a floor, as a cell's height is, and
// with no padding of its own taller content sets the row's height, so a row
// with a 32px logo stays 32px instead of growing by the padding. A cell that
// wraps keeps a little padding, so its lines stay off the rules.
const cellY: Record<TableDensity, string> = {
  comfortable: 'py-4',
  compact: 'h-8 py-0 text-sm',
  dense: 'py-1 text-xs',
}

const wrapY: Record<TableDensity, string | false> = {
  comfortable: false,
  compact: 'py-1',
  dense: false,
}

const headerY: Record<TableDensity, string> = {
  comfortable: 'py-3',
  compact: 'py-1.5',
  dense: 'py-1',
}

// A header and the cells under it share their side padding, so a column's
// title lines up with its values.
const cellX = 'px-3'

/** What a list row asks of the cell in a place, through whatever component of the host's renders
 *  it: its column's classes, content to show after its own, or that it shows stacked, under the
 *  first cell's, as a line in place of a cell. */
export interface CellPlacement {
  className?: string | undefined
  after?: React.ReactNode
  stacked?: boolean | undefined
  /** A stacked value joined to the one before it on its line, after a dot. */
  joined?: boolean | undefined
}

/** A stacked column's value on the line under a row's name: it flows inline with the others and
 *  wraps between them, never inside a value, which truncates if it is wider than the line. */
export const STACKED_ITEM =
  'flex min-w-0 max-w-full items-center whitespace-nowrap [&>*]:min-w-0 [&>*]:truncate'

/** A joined stacked value's dot, part of the value so a value that renders nothing leaves none:
 *  6px either side of it, where the line keeps 12px between values. */
export const STACKED_JOINED =
  "-ml-1.5 before:pr-1.5 before:content-['·'] before:text-(--theme-muted-text-color)"

/** Whether a cell's content shows anything: an empty string, like a missing value, doesn't. */
export function hasContent(children: React.ReactNode): boolean {
  return React.Children.toArray(children).some((child) => child !== '')
}

/** Set by a list row around each of its cells; a `Table.Item` takes what it asks. */
export const CellPlacementContext = createContext<CellPlacement | null>(null)

interface ItemProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  /** Lets the text wrap; by default a cell keeps to one line. */
  wrap?: boolean
}

function Item({ wrap = false, children, className, ...tdProps }: ItemProps) {
  const density = useContext(DensityContext)
  const placed = useContext(CellPlacementContext)
  if (placed?.stacked) {
    // One item of the line under the name, shown only where the column's own cell has given way
    // (see `ListRow`); a cell with nothing in it, such as a status only some rows have, adds none.
    return hasContent(children) ? (
      <div className={cx(STACKED_ITEM, placed.joined && STACKED_JOINED)} data-stacked>
        {children}
      </div>
    ) : null
  }
  return (
    <td
      {...tdProps}
      className={cx(
        cellX,
        cellY[density],
        // A one-line cell keeps what it holds inside its column, cutting text off with an
        // ellipsis, so a long value never paints over the next cell. Its 4px margin keeps a
        // control's focus ring; a cell whose content must reach past it says overflow-visible.
        wrap
          ? wrapY[density]
          : 'overflow-clip text-ellipsis whitespace-nowrap [overflow-clip-margin:4px]',
        className,
        placed?.className,
      )}
    >
      {/* What the cell holds is its own, even another table's cells. */}
      <CellPlacementContext value={null}>
        {children}
        {placed?.after}
      </CellPlacementContext>
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

// A child that renders its own `<tbody>`s, such as a list's collapsible group, by a static
// `isTableSection` flag: the rows around it go in bodies of their own rather than hold it.
const isSectionChild = (child: unknown): boolean =>
  React.isValidElement(child) &&
  typeof child.type === 'function' &&
  (child.type as { isTableSection?: boolean }).isTableSection === true

/** The class of the table's row bodies, for a section that renders bodies of its own. Null
 *  outside a section, where a section can't add a body. */
export const TableBodyContext = createContext<{ className: string | undefined } | null>(null)

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
                <TableBody
                  className={tbodyClassName}
                  rows={childList.filter((c) => !isHeaderChild(c))}
                />
              </table>
            </div>
          )}
        </div>
      </CapsContext>
    </DensityContext>
  )
}

/** The rows in one `<tbody>`, or, among sections that render bodies of their own, the rows
 *  between them in a body each. */
function TableBody({
  className,
  rows,
}: {
  className: string | undefined
  rows: React.ReactNode[]
}) {
  if (!rows.some(isSectionChild)) {
    return <tbody className={className}>{rows}</tbody>
  }
  const parts: React.ReactNode[] = []
  let run: React.ReactNode[] = []
  const flush = () => {
    if (run.length > 0) {
      parts.push(
        <tbody key={`rows-${parts.length}`} className={className}>
          {run}
        </tbody>,
      )
      run = []
    }
  }
  for (const row of rows) {
    if (isSectionChild(row)) {
      flush()
      parts.push(row)
    } else {
      run.push(row)
    }
  }
  flush()
  return <TableBodyContext value={{ className }}>{parts}</TableBodyContext>
}

Table.Header = Header
Table.Item = Item

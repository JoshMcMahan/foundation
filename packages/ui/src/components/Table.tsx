import cx from 'classnames'
import React from 'react'
import Loader from './Loader'
import { useStrings } from './Provider'
import type { TDirection } from './Sort'

interface IItemProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  wrap?: boolean
  colspan?: number
}

function Item({ wrap = false, children, className, colspan = 1, ...tdProps }: IItemProps) {
  const yPadding = className?.includes('py-') ? '' : 'py-4'
  const xPadding = className?.includes('px-') ? '' : 'px-2'

  return (
    <td
      {...tdProps}
      colSpan={colspan}
      className={cx(yPadding, xPadding, wrap ? '' : 'whitespace-nowrap', className)}
    >
      {children}
    </td>
  )
}

function CompactItem({ wrap = false, children, className, colspan = 1, ...tdProps }: IItemProps) {
  return (
    <td
      {...tdProps}
      colSpan={colspan}
      className={cx('px-2 text-sm font-medium', !wrap && 'whitespace-nowrap', className)}
    >
      {children}
    </td>
  )
}

interface ITableHeaderProps {
  children?: React.ReactNode
  className?: string
  style?: React.CSSProperties | undefined
  colspan?: number
  onClick?: (() => void) | undefined
  sort?: TDirection | 'none'
  /** When false, drops uppercase + tracking-wider for a sentence-case header. */
  caps?: boolean
}

function Header({
  children,
  className,
  style,
  colspan = 1,
  onClick,
  sort,
  caps = true,
}: ITableHeaderProps) {
  const yPadding = className?.includes('py-') ? '' : 'py-3'
  const xPadding = className?.includes('px-') ? '' : 'px-3'
  const textAlign = className?.includes('text-') ? '' : 'text-left'
  const casingClasses = caps ? 'uppercase tracking-wider' : ''
  return (
    <th
      scope="col"
      colSpan={colspan}
      style={style}
      aria-sort={sort === 'unsorted' ? 'none' : sort}
      className={cx(className, yPadding, xPadding, textAlign, 'text-xs font-medium', casingClasses)}
    >
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          className="w-full cursor-pointer text-inherit [text-align:inherit] hover:opacity-80 transition-opacity"
        >
          {children}
        </button>
      ) : (
        children
      )}
    </th>
  )
}

interface ITableProps {
  children?: React.ReactNode
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
  Item?: typeof Item
  Header?: typeof Header
  isLoading?: boolean
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

const getHeaders = (children: ReturnType<typeof React.Children.toArray>) =>
  children.filter(isHeaderChild)

export function Table({
  borderless = false,
  panel = true,
  className = '',
  wrapperClassName = '',
  tbodyClassName = 'divide-y',
  theadClassName = 'theme-muted-panel',
  children,
  roundedTop = false,
  rounded = false,
  roundedBottom = false,
  isLoading = false,
  tableProps,
}: ITableProps) {
  const { loading } = useStrings()
  const ChildrenArr = React.Children.toArray(children)
  const Headers = getHeaders(ChildrenArr)
  const hasOverflow = wrapperClassName.split(' ').some((cls) => cls.startsWith('overflow-'))

  return (
    <div
      aria-busy={isLoading}
      className={cx(
        'flex flex-col w-full',
        !hasOverflow && 'overflow-hidden', // only apply overflow-hidden if no overflow is set
        wrapperClassName,
      )}
    >
      {isLoading ? (
        <div role="status" aria-label={loading} className="flex justify-center items-center h-32">
          <Loader />
          <span className="sr-only">{loading}</span>
        </div>
      ) : (
        <div
          className={cx(
            'align-middle inline-block min-w-full overflow-x-auto',
            panel && 'theme-panel',
            !borderless && 'border theme-border',
            rounded && 'rounded-2xl',
            roundedBottom && 'rounded-b-2xl',
            roundedTop && 'rounded-t-2xl',
          )}
        >
          <table className={cx(className, 'min-w-full divide-y theme-border')} {...tableProps}>
            <thead className={theadClassName}>
              <tr>{Headers}</tr>
            </thead>
            <tbody className={tbodyClassName}>{ChildrenArr.filter((c) => !isHeaderChild(c))}</tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export function CompactTable({
  wrapperClassName = '',
  className = '',
  tbodyClassName = 'divide-y',
  children,
  roundedTop = false,
  rounded = false,
  roundedBottom = false,
}: ITableProps) {
  const ChildrenArr = React.Children.toArray(children)
  const Headers = getHeaders(ChildrenArr)
  const hasOverflow = wrapperClassName.split(' ').some((cls) => cls.startsWith('overflow-'))

  return (
    <div
      className={cx('flex flex-col w-full', !hasOverflow && 'overflow-hidden', wrapperClassName)}
    >
      <div
        className={cx(
          'theme-panel inline-block min-w-full align-middle overflow-x-auto',
          rounded && 'rounded-2xl',
          roundedBottom && 'rounded-b-2xl pb-1',
          roundedTop && 'rounded-t-2xl',
        )}
      >
        <table className={cx('min-w-full divide-y theme-border', className)}>
          <thead className="theme-muted-panel">
            <tr className="divide-x">{Headers}</tr>
          </thead>
          <tbody className={tbodyClassName}>{ChildrenArr.filter((c) => !isHeaderChild(c))}</tbody>
        </table>
      </div>
    </div>
  )
}

Table.Header = Header
Table.Item = Item
CompactTable.Header = Header
CompactTable.Item = CompactItem

import type { ReactNode } from 'react'
import { cx } from '../cx'
import { ChevronLeftIcon, ChevronRightIcon } from '../icons'
import { IconButton } from './IconButton'
import { useStrings } from './Provider'
import { Select } from './Select'

/** Page sizes a list offers; the first is the default. */
export const PAGE_SIZES: readonly [number, ...number[]] = [50, 100, 200]

export interface PaginationProps {
  /** The page shown, counting from 0. */
  page: number
  pageSize: number
  /** How many rows there are. Leave it out for a list that only knows whether
   *  more follow, and pass `hasNext`. */
  total?: number | undefined
  /** Whether a page follows. Needed without a `total`, and for a total that is
   *  a capped count, so paging doesn't stop at the cap. */
  hasNext?: boolean | undefined
  /** Moves to a page. */
  onPageChange?: ((page: number) => void) | undefined
  /** Makes each page a link instead, for pages the address names. */
  pageHref?: ((page: number) => string) | undefined
  /** Page sizes to offer; shown only with `onPageSizeChange`. */
  pageSizes?: readonly number[]
  onPageSizeChange?: ((size: number) => void) | undefined
  /** Replaces "1–50 of 200", such as with the time range a page covers. */
  summary?: ReactNode
  className?: string | undefined
}

/** Steps through a list a page at a time: where the page sits in the list,
 *  previous and next, and optionally how many rows a page holds. Renders
 *  nothing when everything fits on one page. */
export function Pagination({
  page,
  pageSize,
  total,
  hasNext,
  onPageChange,
  pageHref,
  pageSizes = PAGE_SIZES,
  onPageSizeChange,
  summary,
  className,
}: PaginationProps) {
  const t = useStrings().list
  const start = page * pageSize + 1
  const pageEnd = (page + 1) * pageSize
  const known = total !== undefined
  const pageCount = known ? Math.max(1, Math.ceil(total / pageSize)) : undefined
  // A capped total can read as the last page while more rows follow.
  const pastCap = known && hasNext === true && pageEnd >= total
  const end = known && !pastCap ? Math.min(total, pageEnd) : pageEnd
  const hasPrevious = page > 0
  const hasMore = hasNext ?? (pageCount !== undefined && page < pageCount - 1)
  const smallest = Math.min(...pageSizes)
  // Also keep the size picker when a larger size is what hid paging, so it can be reset.
  const showSizes = !!onPageSizeChange && ((known && total > smallest) || pageSize > smallest)
  if (!hasPrevious && !hasMore && !showSizes) {
    return null
  }
  const position = summary ?? (known ? t.pager(start, end, pastCap ? end : total, pastCap) : null)
  return (
    <nav
      aria-label={t.pagination}
      className={cx('flex h-10 shrink-0 items-center justify-between gap-3 px-2.5', className)}
    >
      {/* Takes the bar's free space, so the position truncates only when the bar runs out. */}
      <div className="flex min-w-0 flex-1 items-center gap-3 text-xs text-(--theme-muted-text-color)">
        {position && <span className="truncate">{position}</span>}
        {showSizes && (
          <Select
            aria-label={t.perPage}
            size="sm"
            className="w-20"
            items={pageSizes.map((size) => ({ value: size, label: String(size) }))}
            value={pageSize}
            onValueChange={(size) => size !== null && onPageSizeChange(size)}
          />
        )}
      </div>
      <div className="flex items-center gap-1">
        <PageStep
          to={page - 1}
          enabled={hasPrevious}
          label={t.paginationPrevious}
          icon={<ChevronLeftIcon />}
          onPageChange={onPageChange}
          pageHref={pageHref}
        />
        <PageStep
          to={page + 1}
          enabled={hasMore}
          label={t.paginationNext}
          icon={<ChevronRightIcon />}
          onPageChange={onPageChange}
          pageHref={pageHref}
        />
      </div>
    </nav>
  )
}

function PageStep({
  to,
  enabled,
  label,
  icon,
  onPageChange,
  pageHref,
}: {
  to: number
  enabled: boolean
  label: string
  icon: ReactNode
  onPageChange: ((page: number) => void) | undefined
  pageHref: ((page: number) => string) | undefined
}) {
  if (pageHref && enabled) {
    return <IconButton variant="outline" icon={icon} label={label} href={pageHref(to)} />
  }
  return (
    <IconButton
      variant="outline"
      icon={icon}
      label={label}
      disabled={!enabled}
      onClick={() => onPageChange?.(to)}
    />
  )
}

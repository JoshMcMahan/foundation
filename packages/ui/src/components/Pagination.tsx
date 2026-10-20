import type { ReactNode } from 'react'
import { cx } from '../cx'
import { formatInteger } from '../format'
import { ChevronLeftIcon, ChevronRightIcon, MoreIcon } from '../icons'
import { AppLink } from './AppLink'
import { buttonClasses } from './buttonClasses'
import { IconButton } from './IconButton'
import { useLocale, useStrings } from './Provider'
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
  /** Numbers the pages between previous and next, for a list a reader jumps
   *  around in, such as a catalog: the first and last, and a window around
   *  the current one, with gaps between. `max` is how many steps show at
   *  most, gaps included (7 by default, 5 at least). Needs a `total`; hidden
   *  on a phone-width screen, where previous and next remain. */
  pageNumbers?: boolean | { max?: number | undefined } | undefined
  className?: string | undefined
}

/** The pages to number, counting from 0, with `null` for a gap: all of them
 *  when they fit in `max` steps, and otherwise the first and last around a
 *  window on the current one, `max` steps in all. */
export function pageSteps(page: number, count: number, max = 7): (number | null)[] {
  const steps = Math.max(5, Math.floor(max))
  const range = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => from + i)
  if (count <= steps) {
    return range(0, count - 1)
  }
  // The first page, a gap, and the window, when the window reaches the start.
  if (page < steps - 3) {
    return [...range(0, steps - 3), null, count - 1]
  }
  if (page > count - (steps - 2)) {
    return [0, null, ...range(count - (steps - 2), count - 1)]
  }
  const side = Math.floor((steps - 5) / 2)
  return [0, null, ...range(page - side, page + side), null, count - 1]
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
  pageNumbers = false,
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
        {pageNumbers && pageCount !== undefined && pageCount > 1 && (
          <ol className="m-0 hidden list-none items-center gap-1 p-0 sm:flex">
            {pageSteps(
              page,
              pageCount,
              typeof pageNumbers === 'object' ? pageNumbers.max : undefined,
            ).map((step, i) => (
              <li key={step ?? `gap-${i}`} className="flex">
                {step === null ? (
                  <MoreIcon
                    aria-hidden="true"
                    className="size-3.5 w-5 text-(--theme-muted-text-color)"
                  />
                ) : (
                  <PageNumber
                    to={step}
                    current={step === page}
                    label={t.page(step + 1)}
                    onPageChange={onPageChange}
                    pageHref={pageHref}
                  />
                )}
              </li>
            ))}
          </ol>
        )}
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

// The current page reads as a pressed toggle does, so it is told apart without
// the fill a primary action has.
const numberClassName = cx(
  buttonClasses({ variant: 'outline', size: 'sm' }),
  'min-w-7 px-1.5 tabular-nums aria-[current=page]:border-(--theme-link) aria-[current=page]:bg-(--theme-accent-subtle) aria-[current=page]:text-(--theme-app)',
)

function PageNumber({
  to,
  current,
  label,
  onPageChange,
  pageHref,
}: {
  to: number
  current: boolean
  label: string
  onPageChange: ((page: number) => void) | undefined
  pageHref: ((page: number) => string) | undefined
}) {
  // In the host's locale, in full: page 1,204, never 1.2K.
  const number = formatInteger(to + 1, useLocale())
  const props = {
    'aria-label': label,
    'aria-current': current ? ('page' as const) : undefined,
    className: numberClassName,
  }
  if (pageHref) {
    return (
      <AppLink {...props} href={pageHref(to)}>
        {number}
      </AppLink>
    )
  }
  return (
    <button type="button" {...props} onClick={() => !current && onPageChange?.(to)}>
      {number}
    </button>
  )
}

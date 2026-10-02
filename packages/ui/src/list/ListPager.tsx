import cx from 'classnames'
import { useStrings } from '../components/Provider'
import { ChevronLeftIcon, ChevronRightIcon } from '../icons'
import { listControlButtonClasses } from './ListViewControls'

/** Page sizes offered by the pager's per-page select; first entry is the default. */
export const LIST_PAGE_SIZES: readonly [number, ...number[]] = [50, 100, 200]

/** Footer pager bar for paginated new-nav lists: "{start}–{end} of {total}" with prev/next. Renders nothing for a single page. */
export function ListPager({
  page,
  pageSize,
  total,
  onPageChange,
  pageSizes = LIST_PAGE_SIZES,
  onPageSizeChange,
  hasNext,
}: {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
  /** Cursor lists whose `total` is a capped count pass this so paging doesn't stop at the cap. */
  hasNext?: boolean | undefined
  /** Selectable page sizes; shown only when onPageSizeChange is provided. */
  pageSizes?: readonly number[]
  onPageSizeChange?: (size: number) => void
}) {
  const t = useStrings().list
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const start = page * pageSize + 1
  const end = Math.min(total, (page + 1) * pageSize)
  const smallest = Math.min(...pageSizes)
  // Also keep the select when a larger page size is what hid paging, so it can be reset.
  const showSizeSelect = !!onPageSizeChange && (total > smallest || pageSize > smallest)
  if (pageCount <= 1 && !showSizeSelect) {
    return null
  }
  return (
    <div className="flex items-center justify-between px-2.5 h-10 shrink-0 border-t theme-border">
      <div className="flex items-center gap-3 text-xs text-(--theme-muted-text-color)">
        <span>{t.pager(start, end, total)}</span>
        {showSizeSelect && (
          <label className="flex items-center gap-1">
            {t.perPage}
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="theme-input rounded px-1.5 py-0.5 text-xs"
            >
              {pageSizes.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label={t.paginationPrevious}
          disabled={page === 0}
          onClick={() => onPageChange(page - 1)}
          className={cx(
            listControlButtonClasses,
            'disabled:opacity-40 disabled:pointer-events-none',
          )}
        >
          <ChevronLeftIcon className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          aria-label={t.paginationNext}
          disabled={hasNext === undefined ? page >= pageCount - 1 : !hasNext}
          onClick={() => onPageChange(page + 1)}
          className={cx(
            listControlButtonClasses,
            'disabled:opacity-40 disabled:pointer-events-none',
          )}
        >
          <ChevronRightIcon className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

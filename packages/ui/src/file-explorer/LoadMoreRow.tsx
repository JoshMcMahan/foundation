import { useRef } from 'react'
import { Loader } from '../components/Loader'
import { useStrings } from '../components/Provider'
import { Tooltip } from '../components/Tooltip'
import { useFileExplorerStrings } from './strings'
import { useNearEnd } from './useNearEnd'

/** The virtualizer sizes this row from the constant, never by measuring it. */
export const LOAD_MORE_ROW_HEIGHT = 45

/** A folder's paging state, as the table's sentinel row needs it. */
export interface LoadMoreState {
  loading: boolean
  error: string | undefined
  /** The error's own text, shown after `error` as technical detail. */
  errorDetail?: string | undefined
  /** False past the auto-load cap, where the user asks for each page. */
  auto: boolean
  onLoadMore: () => void
}

interface LoadMoreRowProps {
  rowId: string
  rowIndex: number
  loading: boolean
  error: string | undefined
  errorDetail?: string | undefined
  /** False past the auto-load cap, where the user asks for each page. */
  auto: boolean
  /** The table's scroll container, so proximity is not measured against the page. */
  root: HTMLElement | null
  onLoadMore: () => void
}

export function LoadMoreRow({
  rowId,
  rowIndex,
  loading,
  error,
  errorDetail,
  auto,
  root,
  onLoadMore,
}: LoadMoreRowProps) {
  const t = useFileExplorerStrings()
  const { common } = useStrings()
  const ref = useRef<HTMLTableRowElement>(null)

  useNearEnd(ref, {
    active: auto && !loading && !error,
    root,
    onNear: onLoadMore,
  })

  return (
    <tr ref={ref} id={rowId} aria-rowindex={rowIndex} style={{ height: LOAD_MORE_ROW_HEIGHT }}>
      <td colSpan={5} className="px-4 text-sm theme-muted-text">
        {error ? (
          <span className="flex min-w-0 items-center gap-2">
            <span className="shrink-0">{error}</span>
            {errorDetail && (
              <Tooltip content={errorDetail}>
                <span className="min-w-0 truncate font-mono text-[11px]">{errorDetail}</span>
              </Tooltip>
            )}
            <button
              type="button"
              className="cursor-pointer underline theme-link"
              onClick={onLoadMore}
            >
              {common.retry}
            </button>
          </span>
        ) : loading ? (
          <Loader size={16} inline label={t.loadingMore} />
        ) : (
          <button
            type="button"
            className="cursor-pointer underline theme-link"
            onClick={onLoadMore}
          >
            {common.loadMore}
          </button>
        )}
      </td>
    </tr>
  )
}

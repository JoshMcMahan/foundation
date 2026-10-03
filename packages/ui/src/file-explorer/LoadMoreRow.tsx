import { useRef } from 'react'
import Loader from '../components/Loader'
import { useStrings } from '../components/Provider'
import { useNearEnd } from './useNearEnd'

/** The virtualizer sizes this row from the constant, never by measuring it. */
export const LOAD_MORE_ROW_HEIGHT = 45

/** A folder's paging state, as the table's sentinel row needs it. */
export interface LoadMoreState {
  loading: boolean
  error: string | undefined
  /** False past the auto-load cap, where the user asks for each page. */
  auto: boolean
  onLoadMore: () => void
}

interface LoadMoreRowProps {
  rowId: string
  rowIndex: number
  loading: boolean
  error: string | undefined
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
  auto,
  root,
  onLoadMore,
}: LoadMoreRowProps) {
  const t = useStrings().fileExplorer
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
          <span className="flex items-center gap-2">
            <span>{error}</span>
            <button
              type="button"
              className="cursor-pointer underline theme-link"
              onClick={onLoadMore}
            >
              {t.retry}
            </button>
          </span>
        ) : loading ? (
          <span className="flex items-center gap-2">
            <Loader size={16} full={false} />
            <span>{t.loadingMore}</span>
          </span>
        ) : (
          <button
            type="button"
            className="cursor-pointer underline theme-link"
            onClick={onLoadMore}
          >
            {t.loadMore}
          </button>
        )}
      </td>
    </tr>
  )
}

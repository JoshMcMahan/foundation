import cx from 'classnames'
import { useStrings } from './Provider'

interface IPaginationProps {
  nextCallback: () => void
  prevCallback: () => void
  startingNumber?: string | number
  endingNumber?: string | number
  startingTime?: string | undefined
  endingTime?: string | undefined
  nextDisabled: boolean
  prevDisabled: boolean
  name?: string
  roundedBottom?: boolean
  useTimeRange?: boolean
}

function Pagination({
  endingNumber,
  endingTime,
  nextCallback,
  prevCallback,
  roundedBottom,
  startingNumber,
  startingTime,
  nextDisabled,
  prevDisabled,
  name,
  useTimeRange = false,
}: IPaginationProps) {
  const t = useStrings().list

  return (
    <nav
      className={cx(
        roundedBottom && 'rounded-b-2xl',
        'theme-muted-panel flex items-center justify-between border-t theme-border  px-4 py-1 sm:px-6',
      )}
      aria-label="Pagination"
    >
      <div
        className={cx(
          'hidden',
          ((startingNumber !== undefined && endingNumber !== undefined) ||
            (startingTime && endingTime)) &&
            'sm:block',
        )}
      >
        <p className="text-sm whitespace-nowrap">
          {useTimeRange && startingTime && endingTime
            ? t.paginationShowingTimeRange(name ?? '', startingTime, endingTime)
            : t.paginationShowing(name ?? '', startingNumber ?? '', endingNumber ?? '')}
        </p>
      </div>
      <div className="flex flex-1 justify-between sm:justify-end gap-x-2">
        <button
          type="button"
          disabled={prevDisabled}
          onClick={prevCallback}
          className={cx('link text-sm', prevDisabled && 'disabled')}
        >
          {t.paginationPrevious}
        </button>
        <button
          type="button"
          disabled={nextDisabled}
          onClick={nextCallback}
          className={cx('link text-sm', nextDisabled && 'disabled')}
        >
          {t.paginationNext}
        </button>
      </div>
    </nav>
  )
}

export { Pagination }

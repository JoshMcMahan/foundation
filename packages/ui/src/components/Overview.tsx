import type { ReactNode } from 'react'
import { cx } from '../cx'
import { LoadingRegion, Skeleton } from './Skeleton'

export interface OverviewProps {
  /** The thing's mark, such as its type's icon or an avatar. On a narrow page it shrinks to
   *  32px beside the name, with no padding, whatever size and padding it's given. */
  icon: ReactNode
  name: ReactNode
  /** Under the name, such as its kind. */
  type?: ReactNode
  /** A row under the type, such as badges. It wraps. */
  children?: ReactNode
  /** At the row's end, centered against the name block, such as actions. */
  actions?: ReactNode
  /** Sketches the icon and two lines while the thing loads. */
  loading?: boolean | undefined
  /** The loading sketch's icon size, in pixels, to match the icon that replaces it. */
  iconSize?: number | undefined
  className?: string | undefined
}

/** A thing's summary at the top of its page: its mark, its name and kind, and
 *  what to do with it.
 *
 *  Where there's room the mark has a column of its own beside the name block. On a narrow
 *  page, where that column would push every line in and leave them a different edge from the
 *  content below, the mark shrinks to sit beside the name, and the lines under it start at the
 *  page's edge. */
export function Overview({
  icon,
  name,
  type,
  children,
  actions,
  className,
  loading = false,
  iconSize = 75,
}: OverviewProps) {
  return (
    <div className={cx('@container/overview w-full', className)}>
      <div
        className={cx(
          // Narrow: a grid whose first row is the mark, the name and the actions, with every
          // other line across its full width. Wide: a row with the name block in a column.
          'grid w-full items-center gap-x-2.5 gap-y-0.5',
          actions ? 'grid-cols-[auto_minmax(0,1fr)_auto]' : 'grid-cols-[auto_minmax(0,1fr)]',
          '@md/overview:flex @md/overview:gap-x-3 @md/overview:gap-y-0',
        )}
      >
        {/* Narrow, the mark is the name's height and its drawing starts on the edge the lines
            below start on, so a host's own size and padding give way: important, as a host may
            set them inline. */}
        <div className="col-start-1 row-start-1 shrink-0 @max-md/overview:size-8 @max-md/overview:*:size-full! @max-md/overview:**:p-0!">
          {loading ? <Skeleton circle height={iconSize} className="shrink-0" /> : icon}
        </div>
        {/* Narrow, the name block's lines are the grid's own rows. */}
        <div className="contents @md/overview:flex @md/overview:min-w-0 @md/overview:flex-1 @md/overview:flex-col">
          {loading ? (
            <LoadingRegion className="col-start-2 row-start-1 space-y-1">
              <Skeleton count={2} height={12} />
            </LoadingRegion>
          ) : (
            <>
              <div className="col-start-2 row-start-1 min-w-0 text-xl font-semibold tracking-tight">
                {name}
              </div>
              {type && (
                <p className="col-span-full m-0 text-sm text-(--theme-muted-text-color)">{type}</p>
              )}
              {children && (
                <div className="col-span-full flex flex-wrap items-center gap-x-2 gap-y-1">
                  {children}
                </div>
              )}
            </>
          )}
        </div>
        {actions && <div className="col-start-3 row-start-1 shrink-0 self-center">{actions}</div>}
      </div>
    </div>
  )
}

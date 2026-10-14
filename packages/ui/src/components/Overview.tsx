import type { ReactNode } from 'react'
import { cx } from '../cx'
import { LoadingRegion, Skeleton } from './Skeleton'

export interface OverviewProps {
  /** The thing's mark, such as its type's icon or an avatar. */
  icon: ReactNode
  name: ReactNode
  /** Under the name, such as its kind. */
  type?: ReactNode
  /** A row under the type, such as badges. */
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
 *  what to do with it. */
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
    <div className={cx('flex w-full items-center gap-3', className)}>
      {loading ? <Skeleton circle height={iconSize} className="shrink-0" /> : icon}
      <div className="flex min-w-0 flex-1 flex-col">
        {loading ? (
          <LoadingRegion className="space-y-1">
            <Skeleton count={2} height={12} />
          </LoadingRegion>
        ) : (
          <>
            <div className="text-xl font-semibold tracking-tight">{name}</div>
            {type && <p className="m-0 text-sm text-(--theme-muted-text-color)">{type}</p>}
            {children && <div className="flex flex-row gap-x-2">{children}</div>}
          </>
        )}
      </div>
      {actions && <div className="shrink-0 self-center">{actions}</div>}
    </div>
  )
}

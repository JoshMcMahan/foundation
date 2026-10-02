import cx from 'classnames'
import Skeleton from 'react-loading-skeleton'
export function Overview({
  Icon,
  name,
  type,
  children,
  right,
  className,
  loading,
  iconSize = 75,
}: {
  Icon: React.ReactNode
  name: string | React.ReactNode
  type?: string | React.ReactNode
  children?: React.ReactNode
  /** Right-aligned content on the header row (e.g. a detail-page action bar),
   * vertically centered against the name block. */
  right?: React.ReactNode
  className?: string
  loading?: boolean
  iconSize?: number
}) {
  return (
    <div className={cx('flex items-center w-full', className)}>
      {loading ? <Skeleton width={iconSize} height={iconSize} circle /> : Icon}
      <div className="flex flex-col min-w-0 flex-1">
        {loading ? (
          <Skeleton count={2} height={12} />
        ) : (
          <>
            <div className="font-semibold text-xl tracking-tight">{name}</div>
            {type && <p>{type}</p>}
            <div className="flex flex-row gap-x-2">{children}</div>
          </>
        )}
      </div>
      {right && <div className="shrink-0 self-center">{right}</div>}
    </div>
  )
}

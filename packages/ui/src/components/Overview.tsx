import { clsx as cx } from 'clsx'
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
      {loading ? (
        <div
          className="shrink-0 animate-pulse rounded-full bg-(--theme-muted-panel-bg)"
          style={{ width: iconSize, height: iconSize }}
        />
      ) : (
        Icon
      )}
      <div className="flex flex-col min-w-0 flex-1">
        {loading ? (
          <div className="space-y-1">
            <div className="h-3 animate-pulse rounded bg-(--theme-muted-panel-bg)" />
            <div className="h-3 animate-pulse rounded bg-(--theme-muted-panel-bg)" />
          </div>
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

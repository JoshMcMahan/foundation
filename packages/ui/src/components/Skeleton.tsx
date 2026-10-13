import type { ReactNode } from 'react'
import { cx } from '../cx'
import { positionKeys } from './keys'
import { useStrings } from './Provider'

export interface SkeletonProps {
  /** Any CSS length, or pixels. Defaults to the container's width. */
  width?: number | string | undefined
  /** Any CSS length, or pixels. Defaults to a line of text. */
  height?: number | string | undefined
  circle?: boolean | undefined
  /** Lines of the same shape, one under another; space them with `className`. */
  count?: number | undefined
  className?: string | undefined
}

/** The shape of content still loading. Hidden from assistive technology, so
 *  wrap a page's skeletons in one `LoadingRegion` that says they are loading. */
export function Skeleton({ width, height, circle, count = 1, className }: SkeletonProps) {
  return positionKeys(count, 'skeleton').map((key) => (
    <span
      key={key}
      aria-hidden="true"
      className={cx(
        'block animate-pulse bg-(--theme-muted-panel-bg) motion-reduce:animate-none',
        circle ? 'rounded-full' : 'rounded',
        height === undefined && 'h-[1em]',
        className,
      )}
      style={{ width: width ?? (circle ? height : undefined), height }}
    />
  ))
}

/** Says, once, that what it holds is still loading, for skeletons or a chart
 *  drawing its first data. */
export function LoadingRegion({
  label,
  className,
  children,
}: {
  /** Defaults to the provider's `loading` string. */
  label?: string | undefined
  className?: string | undefined
  children: ReactNode
}) {
  const { loading } = useStrings().common
  const name = label || loading
  return (
    <div role="status" aria-label={name} className={className}>
      {children}
      <span className="sr-only">{name}</span>
    </div>
  )
}

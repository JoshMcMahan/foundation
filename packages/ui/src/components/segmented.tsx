import type { ReactNode } from 'react'
import { cx } from '../cx'

/** The parts SegmentedControl and segmented Tabs share, so a picker and a set
 *  of views beside it look the same. */
export interface SegmentLayout {
  /** Segments share the container's width equally. */
  fill?: boolean | undefined
  /** Segments stack as icons with their labels in tooltips, for a collapsed rail. */
  iconOnly?: boolean | undefined
}

export function segmentGroupClassName({ fill, iconOnly }: SegmentLayout) {
  return cx(
    'gap-0.5',
    iconOnly
      ? 'flex flex-col items-center'
      : cx(
          'rounded-lg theme-muted-panel p-0.5',
          fill ? 'grid auto-cols-fr grid-flow-col' : 'inline-flex',
        ),
  )
}

export function segmentClassName(current: boolean, { fill, iconOnly }: SegmentLayout) {
  return cx(
    'relative flex min-w-0 cursor-pointer items-center justify-center rounded-md font-medium transition-colors duration-150 outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--theme-link) data-disabled:cursor-not-allowed data-disabled:opacity-50',
    current
      ? 'bg-(--theme-panel-bg) theme-text shadow-sm ring-1 ring-(--theme-border)'
      : 'theme-muted-text hover:theme-text hover:bg-(--theme-hover)',
    iconOnly ? 'h-8 w-8' : cx('h-7 gap-1.5 text-[13px]', fill ? 'px-1.5' : 'px-2.5'),
  )
}

export function SegmentContent({
  label,
  icon,
  badge,
  iconOnly,
}: {
  label: string
  icon?: ReactNode
  badge?: ReactNode
  iconOnly?: boolean | undefined
}) {
  return (
    <>
      {icon}
      {iconOnly ? (
        <span className="sr-only">{label}</span>
      ) : (
        <span className="truncate">{label}</span>
      )}
      {badge &&
        (iconOnly ? <span className="absolute top-1 right-1 inline-flex">{badge}</span> : badge)}
    </>
  )
}

import type { ReactNode } from 'react'
import { cx } from '../cx'
import { formatCount } from '../format'
import { useLocale } from './Provider'

/** The parts SegmentedControl and segmented Tabs share, so a picker and a set
 *  of views beside it look the same. */
export interface SegmentLayout {
  /** Segments share the container's width equally. `narrow` does so only on a
   *  phone-width screen and sits at its own width from the `sm` breakpoint,
   *  such as a choice at the head of a form. */
  fill?: boolean | 'narrow' | undefined
  /** Segments stack as icons with their labels in tooltips, for a collapsed rail. */
  iconOnly?: boolean | undefined
  /** `sm` fits a page header, a toolbar or a pane's head beside other small
   *  controls; `md` stands on its own. */
  size?: 'sm' | 'md' | undefined
}

/** A segment's or tab's tone, for a view that needs attention, such as what failed. */
export type SegmentTone = 'warning' | 'danger'

type FillKey = 'fill' | 'narrow' | 'none'

const fillKey = (fill: SegmentLayout['fill']): FillKey =>
  fill === 'narrow' ? 'narrow' : fill ? 'fill' : 'none'

// Full literal strings, so Tailwind's scanner emits them.
const fillGroup: Record<FillKey, string> = {
  fill: 'grid auto-cols-fr grid-flow-col',
  narrow: 'grid auto-cols-fr grid-flow-col sm:inline-flex',
  none: 'inline-flex',
}

const segmentSizes: Record<'sm' | 'md', Record<FillKey, string>> = {
  md: {
    fill: 'h-7 gap-1.5 px-1.5 text-[13px]',
    narrow: 'h-7 gap-1.5 px-1.5 text-[13px] sm:px-2.5',
    none: 'h-7 gap-1.5 px-2.5 text-[13px]',
  },
  sm: {
    fill: 'h-6 gap-1 px-1.5 text-xs',
    narrow: 'h-6 gap-1 px-1.5 text-xs sm:px-2',
    none: 'h-6 gap-1 px-2 text-xs',
  },
}

const toneText: Record<SegmentTone, string> = {
  warning: 'text-(--theme-warning)',
  danger: 'text-(--theme-error-text)',
}

// A tint of the muted text rather than the muted panel, so an unselected
// segment's pill still shows on the segmented track, which is that panel.
const tonePill: Record<SegmentTone | 'none', string> = {
  warning: 'bg-(--theme-warning-muted) text-(--theme-warning)',
  danger: 'bg-(--theme-error-muted) text-(--theme-error-text)',
  none: 'bg-(--theme-muted-text-color)/12 text-(--theme-muted-text-color)',
}

export function segmentGroupClassName({ fill, iconOnly }: SegmentLayout) {
  return cx(
    'gap-0.5',
    iconOnly
      ? 'flex flex-col items-center'
      : cx('rounded-lg theme-muted-panel p-0.5', fillGroup[fillKey(fill)]),
  )
}

export function segmentClassName(
  current: boolean,
  { fill, iconOnly, size = 'md' }: SegmentLayout,
  tone?: SegmentTone | undefined,
) {
  return cx(
    'relative flex min-w-0 cursor-pointer items-center justify-center rounded-md font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--theme-focus) data-disabled:cursor-not-allowed data-disabled:opacity-50',
    current
      ? 'bg-(--theme-panel-bg) shadow-sm ring-1 ring-(--theme-border)'
      : 'hover:not-data-disabled:bg-(--theme-hover)',
    tone
      ? toneText[tone]
      : current
        ? 'theme-text'
        : 'theme-muted-text hover:not-data-disabled:theme-text',
    iconOnly ? 'h-8 w-8' : segmentSizes[size][fillKey(fill)],
  )
}

/** How many things a tab or segment holds, as a pill after its label. */
export function CountPill({ count, tone }: { count: number; tone?: SegmentTone | undefined }) {
  const locale = useLocale()
  return (
    <span
      className={cx(
        'inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-medium tabular-nums',
        tonePill[tone ?? 'none'],
      )}
    >
      {formatCount(count, locale)}
    </span>
  )
}

export function SegmentContent({
  label,
  icon,
  badge,
  count,
  tone,
  iconOnly,
}: {
  label: string
  icon?: ReactNode
  badge?: ReactNode
  count?: number | undefined
  tone?: SegmentTone | undefined
  iconOnly?: boolean | undefined
}) {
  const locale = useLocale()
  return (
    <>
      {icon}
      {iconOnly ? (
        // The pill has no room beside an icon alone, so the count joins the name.
        <span className="sr-only">
          {count === undefined ? label : `${label} ${formatCount(count, locale)}`}
        </span>
      ) : (
        <span className="truncate">{label}</span>
      )}
      {!iconOnly && count !== undefined && <CountPill count={count} tone={tone} />}
      {badge &&
        (iconOnly ? <span className="absolute top-1 right-1 inline-flex">{badge}</span> : badge)}
    </>
  )
}

// The pieces of a chart that don't depend on how it is drawn: a color for each series, its
// swatch, a legend, a tooltip's content and the dimming of the series not in focus. A chart
// drawn in SVG by hand and one from a charting library use them alike.
import { type CSSProperties, type ReactNode, useCallback, useMemo, useState } from 'react'
import { cx } from '../cx'
import { CATEGORY_CLASSES, categoryOf } from './category'
import { useLocale, useStrings } from './Provider'

const SLOTS = CATEGORY_CLASSES.length

/** A series' mark color for palette slot 1–8: the theme's category hue, between the slot's
 *  soft fill and its text and twice as saturated, so a bar or a line stands out from the page
 *  in light and dark alike and keeps the hue the slot has everywhere else. */
export function seriesSlotColor(slot: number): string {
  const n = ((((slot - 1) % SLOTS) + SLOTS) % SLOTS) + 1
  return `oklch(from color-mix(in oklch, var(--theme-category-${n}), var(--theme-category-${n}-text)) l calc(c * 2) h)`
}

/** A series' color by its key, any CSS color for a fill, a stroke or a style: the same key
 *  gets the same color on every chart, as `categoryOf` gives a name its avatar color. */
export function seriesColor(key: string): string {
  return seriesSlotColor(categoryOf(key))
}

/** Colors for a chart's series, each key its `seriesColor` unless another key took that slot
 *  first, when it moves to the next free one: up to eight series never share a color. */
export function seriesColors(keys: readonly string[]): Record<string, string> {
  const taken = new Set<number>()
  const colors: Record<string, string> = {}
  for (const key of keys) {
    if (key in colors) {
      continue
    }
    let slot = categoryOf(key)
    if (taken.size < SLOTS) {
      while (taken.has(slot)) {
        slot = (slot % SLOTS) + 1
      }
    }
    taken.add(slot)
    colors[key] = seriesSlotColor(slot)
  }
  return colors
}

export type SeriesSwatchShape = 'square' | 'dot' | 'line'

/** A series' color as a mark, for a legend or a tooltip's row. Only seen: the series' name
 *  beside it says which it is. */
export function SeriesSwatch({
  color,
  shape = 'square',
  className,
}: {
  color: string
  shape?: SeriesSwatchShape | undefined
  className?: string | undefined
}) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'inline-block shrink-0',
        shape === 'line' ? 'h-0.5 w-3 rounded-full' : 'size-2.5',
        shape === 'dot' && 'rounded-full',
        shape === 'square' && 'rounded-[3px]',
        className,
      )}
      style={{ background: color }}
    />
  )
}

/** Which series is in focus, from hovering a mark or the legend, and how strongly every other
 *  series draws while it is: their marks fade so the one in focus reads alone. */
export function useSeriesHighlight(): {
  highlighted: string | null
  highlight: (key: string | null) => void
  /** 1 for the series in focus or when none is, 0.3 for the rest. */
  opacity: (key: string) => number
} {
  const [highlighted, highlight] = useState<string | null>(null)
  const opacity = useCallback((key: string) => seriesOpacity(key, highlighted), [highlighted])
  return { highlighted, highlight, opacity }
}

/** A series' opacity while `highlighted` is in focus: full for it, or for all when none is. */
export function seriesOpacity(key: string, highlighted: string | null | undefined): number {
  return highlighted == null || highlighted === key ? 1 : 0.3
}

export interface ChartLegendItem {
  key: string
  label: ReactNode
  color: string
}

/** A chart's legend: each series' swatch and name. With `onHighlight` hovering or focusing a
 *  name puts its series in focus, and pressing one keeps it there until pressed again. */
export function ChartLegendList({
  items,
  highlighted,
  onHighlight,
  shape,
  className,
}: {
  items: readonly ChartLegendItem[]
  highlighted?: string | null | undefined
  onHighlight?: ((key: string | null) => void) | undefined
  shape?: SeriesSwatchShape | undefined
  className?: string | undefined
}) {
  const [pinned, setPinned] = useState<string | null>(null)
  const leave = () => onHighlight?.(pinned)
  return (
    <ul
      className={cx(
        'm-0 flex list-none flex-wrap items-center gap-x-3 gap-y-1 p-0 text-xs text-(--theme-app)',
        className,
      )}
    >
      {items.map((item) => {
        const faded = highlighted != null && highlighted !== item.key
        const body = (
          <>
            <SeriesSwatch color={item.color} shape={shape} />
            <span className="min-w-0 truncate">{item.label}</span>
          </>
        )
        return (
          <li
            key={item.key}
            className={cx(
              'flex min-w-0 items-center transition-opacity motion-reduce:transition-none',
              faded && 'opacity-50',
            )}
          >
            {onHighlight ? (
              <button
                type="button"
                aria-pressed={pinned === item.key}
                onPointerEnter={() => onHighlight(item.key)}
                onPointerLeave={leave}
                onFocus={() => onHighlight(item.key)}
                onBlur={leave}
                onClick={() => {
                  const next = pinned === item.key ? null : item.key
                  setPinned(next)
                  onHighlight(next ?? item.key)
                }}
                className="-mx-1 flex min-w-0 cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 hover:bg-(--theme-muted-panel-bg) focus-visible:outline-2 focus-visible:outline-(--theme-focus) aria-pressed:font-medium"
              >
                {body}
              </button>
            ) : (
              <span className="flex min-w-0 items-center gap-1.5">{body}</span>
            )}
          </li>
        )
      })}
    </ul>
  )
}

export interface ChartTooltipItem {
  key: string
  name: ReactNode
  value: number
  color: string
}

/** What a chart's tooltip shows for a point: its label, then each series' swatch, name and
 *  value, largest first, the series in focus in bold, and a total when there is more than one.
 *  A charting library's tooltip renders it as its content. */
export function ChartTooltipContent({
  label,
  items,
  formatValue,
  total,
  highlighted,
  hideZero = true,
  sort = true,
  className,
  style,
}: {
  label?: ReactNode
  items: readonly ChartTooltipItem[]
  /** Formats each value and the total, such as a currency; numbers in the host's locale
   *  (`UIProvider locale`) by default. */
  formatValue?: ((n: number) => string) | undefined
  /** Adds a total row; on by default when more than one series shows. */
  total?: boolean | undefined
  highlighted?: string | null | undefined
  /** Leaves out series whose value is zero; on by default. */
  hideZero?: boolean | undefined
  /** Lists the largest value first; on by default. */
  sort?: boolean | undefined
  className?: string | undefined
  /** Places it, such as beside the point it describes. */
  style?: CSSProperties | undefined
}) {
  const { chart: t } = useStrings()
  const locale = useLocale()
  const number = useMemo(
    () => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }),
    [locale],
  )
  const format = formatValue ?? ((n: number) => number.format(n))
  let rows = hideZero ? items.filter((item) => item.value !== 0) : [...items]
  if (sort) {
    rows = [...rows].sort((a, b) => b.value - a.value)
  }
  const sum = rows.reduce((acc, item) => acc + item.value, 0)
  const showTotal = total ?? rows.length > 1
  return (
    <div
      className={cx(
        'min-w-40 rounded-lg border border-(--theme-border) bg-(--theme-panel-bg) p-3 text-xs text-(--theme-app) shadow-(--theme-shadow-lg)',
        className,
      )}
      style={style}
    >
      {label != null && label !== '' && <div className="mb-1.5 font-semibold">{label}</div>}
      <ul className="m-0 list-none space-y-1 p-0">
        {rows.map((item) => (
          <li
            key={item.key}
            className={cx(
              'flex items-center gap-2',
              highlighted === item.key
                ? 'font-semibold'
                : highlighted != null && 'text-(--theme-muted-text-color)',
            )}
          >
            <SeriesSwatch color={item.color} />
            <span className="min-w-0 flex-1 truncate">{item.name}</span>
            <span className="ml-2 tabular-nums">{format(item.value)}</span>
          </li>
        ))}
      </ul>
      {showTotal && (
        <div className="mt-1.5 flex justify-between gap-4 border-t border-(--theme-border) pt-1.5 font-medium">
          <span>{t.total}</span>
          <span className="tabular-nums">{format(sum)}</span>
        </div>
      )}
    </div>
  )
}

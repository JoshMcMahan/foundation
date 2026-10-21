// The pieces of a chart that don't depend on how it is drawn: a color for each series, its
// swatch, a legend, a tooltip's content and the dimming of the series not in focus. A chart
// drawn in SVG by hand and one from a charting library use them alike.
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { cx } from '../cx'
import { CATEGORY_CLASSES } from './category'
import { useLocale, useStrings } from './Provider'

/** How many series a chart colors: a series past the eighth folds into "Other" (`foldSeries`)
 *  rather than taking a hue made up for it. */
export const SERIES_LIMIT = CATEGORY_CLASSES.length

/** The theme's category slots in the order series take them. Each run from the first — three,
 *  four or all eight — keeps neighbors apart in hue and lightness, for color-blind readers too,
 *  in light and dark, where the theme's own order steps through neighboring hues. */
const SERIES_ORDER = [5, 2, 8, 3, 6, 4, 7, 1] as const

/** The key `foldSeries` gives the series that sums those past the limit. */
export const OTHER_SERIES_KEY = '__other__'

/** The mark color of the "Other" series: a neutral gray, so it never reads as one more series. */
export const OTHER_SERIES_COLOR =
  'color-mix(in oklch, var(--theme-muted-text-color) 75%, var(--theme-panel-bg))'

/** The color of a chart's nth series, 1–8: the theme's category hue, between the slot's soft
 *  fill and its text and twice as saturated, so a bar or a line stands out from the page in
 *  light and dark alike. Past the eighth it is the "Other" gray; a hue is never repeated. */
export function seriesSlotColor(position: number): string {
  const n = SERIES_ORDER[position - 1]
  if (n === undefined) {
    return OTHER_SERIES_COLOR
  }
  return `oklch(from color-mix(in oklch, var(--theme-category-${n}), var(--theme-category-${n}-text)) l calc(c * 2) h)`
}

/** Colors for a chart's series by their place in `keys`: the first takes the first color, the
 *  second the next, so the first few are always the most distinct. Pass every key the chart can
 *  show, in an order that doesn't depend on the data shown, such as by name or as configured:
 *  a filter that hides a series then leaves the others their colors. `OTHER_SERIES_KEY`, and any
 *  key past the eighth, is the "Other" gray; fold them first with `foldSeries`. */
export function seriesColors(keys: readonly string[]): Record<string, string> {
  const colors: Record<string, string> = {}
  let position = 0
  for (const key of keys) {
    if (key in colors) {
      continue
    }
    colors[key] = key === OTHER_SERIES_KEY ? OTHER_SERIES_COLOR : seriesSlotColor(++position)
  }
  return colors
}

/** Splits a chart's series at the limit: up to eight show as they are, and more keep the first
 *  seven and fold the rest into one "Other" series, `OTHER_SERIES_KEY`, whose value at a point
 *  is the sum of `folded`. Name it with the `chart.other` string. */
export function foldSeries(
  keys: readonly string[],
  limit: number = SERIES_LIMIT,
): { keys: string[]; folded: string[] } {
  const unique = [...new Set(keys)]
  if (unique.length <= limit) {
    return { keys: unique, folded: [] }
  }
  return {
    keys: [...unique.slice(0, limit - 1), OTHER_SERIES_KEY],
    folded: unique.slice(limit - 1),
  }
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
  /** Places it; `ChartTooltipBeside` places it beside a crosshair. */
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
        'min-w-[var(--chart-tooltip-min,10rem)] rounded-lg border border-(--theme-border) bg-(--theme-panel-bg) p-3 text-xs text-(--theme-app) shadow-(--theme-shadow-lg)',
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

export interface ChartTooltipPlacement {
  /** The tooltip's left edge. */
  left: number
  side: 'left' | 'right'
  /** A width to hold it to when neither side has room for all of it, its names truncating. */
  maxWidth: number | null
}

/** Where a chart's tooltip goes beside a crosshair at `x`, so it never covers the column under
 *  the pointer: `gap` to the `prefer` side, or the other when it doesn't fit between `x` and
 *  that edge, or held to the wider side when neither fits. `start` and `end` bound it, in the
 *  same coordinates as `x`, such as the chart's box or the viewport. A charting library's
 *  tooltip takes `left` as its position. */
export function chartTooltipPlacement({
  x,
  width,
  start,
  end,
  gap = 12,
  prefer = 'right',
}: {
  x: number
  width: number
  start: number
  end: number
  gap?: number | undefined
  prefer?: 'left' | 'right' | undefined
}): ChartTooltipPlacement {
  const room = { left: x - gap - start, right: end - x - gap }
  const order = prefer === 'right' ? (['right', 'left'] as const) : (['left', 'right'] as const)
  let side: 'left' | 'right' | undefined = order.find((s) => width <= room[s])
  let maxWidth: number | null = null
  if (side === undefined) {
    side = room.right >= room.left ? 'right' : 'left'
    maxWidth = Math.max(0, room[side])
  }
  const shown = maxWidth ?? width
  return { left: side === 'right' ? x + gap : x - gap - shown, side, maxWidth }
}

/** Keeps a tooltip clear of the viewport's edge by this much. */
const VIEWPORT_MARGIN = 8

/** Holds a chart's tooltip beside its crosshair, inside a positioned box around the plot: `x`
 *  is the crosshair in that box, and the tooltip sits `top` from its top, to the crosshair's
 *  inline end, or its start where the box has no room. When neither side of the box has room,
 *  as on a phone, it may reach past the box to the viewport's edge, and is held narrower when
 *  even that is too small. It never covers the hovered column or the pointer on it. Nothing
 *  shows while `x` is null. */
export function ChartTooltipBeside({
  x,
  top = 0,
  gap = 12,
  className,
  children,
}: {
  x: number | null
  top?: number | undefined
  gap?: number | undefined
  className?: string | undefined
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || x === null) {
      return
    }
    // Measure the tooltip at its own width, then place it.
    el.style.maxWidth = ''
    el.style.removeProperty('--chart-tooltip-min')
    const width = el.offsetWidth
    const box = el.offsetParent as HTMLElement | null
    const origin = box ? box.getBoundingClientRect().left + box.clientLeft : 0
    const view = document.documentElement.clientWidth || window.innerWidth
    const place = (start: number, end: number) =>
      chartTooltipPlacement({
        x,
        width,
        start,
        end,
        gap,
        prefer: getComputedStyle(el).direction === 'rtl' ? 'left' : 'right',
      })
    // Inside the chart's box when it fits beside the crosshair, else out to the viewport's edge.
    let placement = box ? place(0, box.clientWidth) : null
    if (placement === null || placement.maxWidth !== null) {
      placement = place(VIEWPORT_MARGIN - origin, view - VIEWPORT_MARGIN - origin)
    }
    el.style.left = `${placement.left}px`
    if (placement.maxWidth !== null) {
      el.style.maxWidth = `${placement.maxWidth}px`
      el.style.setProperty('--chart-tooltip-min', '0px')
    }
  })
  if (x === null) {
    return null
  }
  return (
    <div
      ref={ref}
      className={cx('pointer-events-none absolute z-10 w-max', className)}
      style={{ top }}
    >
      {children}
    </div>
  )
}

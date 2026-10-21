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
import { surfaceClassName } from './floating'
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
  /** Detail under the name and value, such as what a ratio was measured from, in muted text.
   *  It wraps onto as many lines as it needs and is never cut. */
  detail?: ReactNode
  value: number
  color: string
}

// A 10px swatch centered on a 16px line of extra-small text.
const SWATCH_ON_LINE = 'mt-[3px]'

/** A series' detail, on the lines under its name and value, in muted text: it wraps onto as
 *  many lines as it needs and is never cut. */
function SeriesDetail({ item, className }: { item: ChartTooltipItem; className?: string }) {
  if (item.detail == null || item.detail === '') {
    return null
  }
  return (
    <span
      className={cx(
        'col-start-2 col-end-[-1] font-normal break-words text-(--theme-muted-text-color)',
        className,
      )}
    >
      {item.detail}
    </span>
  )
}

/** A reading's rows: zeros left out when asked, and largest first when asked. */
function readingRows(
  items: readonly ChartTooltipItem[],
  order: ChartReadingOrder,
  hideZero: boolean,
): ChartTooltipItem[] {
  const rows = hideZero ? items.filter((item) => item.value !== 0) : [...items]
  return order === 'value' ? rows.sort((a, b) => b.value - a.value) : rows
}

/** How a reading lists its series: in the order given, which is the legend's, or largest
 *  first. */
export type ChartReadingOrder = 'series' | 'value'

/** What a chart's tooltip shows for a point: its label, then each series' swatch, name and
 *  value in the legend's order, zeros too, the series in focus in bold, and a total when there
 *  is more than one. A charting library's tooltip renders it as its content. */
export function ChartTooltipContent({
  label,
  items,
  formatValue,
  total,
  highlighted,
  hideZero = false,
  order,
  sort,
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
  /** Leaves out series whose value is zero; off by default, since a zero is a reading too. */
  hideZero?: boolean | undefined
  /** `series` (the default) keeps the order of `items`, which is the legend's; `value` lists
   *  the largest first. */
  order?: ChartReadingOrder | undefined
  /** @deprecated Use `order="value"`. */
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
  const rows = readingRows(items, order ?? (sort ? 'value' : 'series'), hideZero)
  const sum = rows.reduce((acc, item) => acc + item.value, 0)
  const showTotal = total ?? rows.length > 1
  return (
    <div
      className={cx(
        'relative isolate z-10 min-w-[var(--chart-tooltip-min,10rem)] p-(--chart-tooltip-pad,0.75rem) text-xs',
        surfaceClassName,
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
              // The swatch and value line up with the name's line, above any detail.
              'grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-2',
              highlighted === item.key
                ? 'font-semibold'
                : highlighted != null && 'text-(--theme-muted-text-color)',
            )}
          >
            <SeriesSwatch color={item.color} className={SWATCH_ON_LINE} />
            <span className="truncate">{item.name}</span>
            <span className="ml-2 tabular-nums">{format(item.value)}</span>
            {/* Up to 16rem wide, so a long detail widens the tooltip a little, then wraps. */}
            <SeriesDetail item={item} className="max-w-64" />
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
  /** The tooltip's top edge: `top` beside the crosshair, or above the plot when it goes there. */
  top: number
  /** Beside the crosshair to its left or right, or above the plot when neither side has room. */
  side: 'left' | 'right' | 'above'
  /** A width to hold it to, its names truncating, when its side has room for less than all of
   *  it. */
  maxWidth: number | null
}

/** Where a chart's tooltip goes so it never covers the point being read: `gap` beside the
 *  crosshair at `x`, on the side with more room, so it flips sides as the crosshair passes the
 *  middle, and held narrower when that side is short, its names truncating.
 *  Only when that side is narrower still does it go above the plot, clear of every point,
 *  where the chart must leave it room. `start` and `end`
 *  bound it in the same coordinates as `x`, such as the chart's own box, so it stays inside
 *  the card, and `top` is the plot's top. A charting library's tooltip takes `left` and `top`
 *  as its position. */
export function chartTooltipPlacement({
  x,
  width,
  height = 0,
  start,
  end,
  top = 0,
  gap = 12,
  minWidth = 96,
  prefer = 'right',
}: {
  x: number
  width: number
  /** The tooltip's height, for placing it above the plot. */
  height?: number | undefined
  start: number
  end: number
  top?: number | undefined
  gap?: number | undefined
  /** The narrowest it is held to beside the crosshair before it goes above instead. */
  minWidth?: number | undefined
  /** The side it takes when both have the same room, such as the left in a right-to-left
   *  layout. */
  prefer?: 'left' | 'right' | undefined
}): ChartTooltipPlacement {
  const room = { left: x - gap - start, right: end - x - gap }
  const side: 'left' | 'right' =
    room.left === room.right ? prefer : room.right > room.left ? 'right' : 'left'
  if (room[side] >= Math.min(width, minWidth)) {
    const maxWidth = width <= room[side] ? null : room[side]
    const shown = maxWidth ?? width
    return { left: side === 'right' ? x + gap : x - gap - shown, top, side, maxWidth }
  }
  const span = Math.max(0, end - start)
  const shown = Math.min(width, span)
  const left = Math.min(Math.max(x - shown / 2, start), end - shown)
  return { left, top: top - height - gap, side: 'above', maxWidth: width > span ? span : null }
}

/** Holds a chart's tooltip beside its crosshair, inside a positioned box around the plot: `x`
 *  is the crosshair in that box, and the tooltip sits `top` from its top on the side with more
 *  room, flipping as the crosshair passes the middle, held narrower and tighter when that side
 *  is short, and above the plot only when it is shorter still. It stays inside the box's width
 *  and never covers the point being read or the pointer on it. Nothing shows while `x` is null.
 *  On a narrow chart, such as on a phone, `ChartTooltipFrame` docks the reading in a readout
 *  above the plot instead. */
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
    el.style.removeProperty('--chart-tooltip-pad')
    const width = el.offsetWidth
    const box = el.offsetParent as HTMLElement | null
    const end = box?.clientWidth || document.documentElement.clientWidth || window.innerWidth
    const placement = chartTooltipPlacement({
      x,
      width,
      height: el.offsetHeight,
      start: 0,
      end,
      top,
      gap,
      prefer: getComputedStyle(el).direction === 'rtl' ? 'left' : 'right',
    })
    el.style.left = `${placement.left}px`
    el.style.top = `${placement.top}px`
    el.dataset['side'] = placement.side
    if (placement.maxWidth !== null) {
      el.style.maxWidth = `${placement.maxWidth}px`
      el.style.setProperty('--chart-tooltip-min', '0px')
      // Held narrow, it gives its names the room its padding took.
      el.style.setProperty('--chart-tooltip-pad', '0.5rem')
    }
  })
  if (x === null) {
    return null
  }
  return (
    <div ref={ref} className={cx('pointer-events-none absolute z-10 w-max', className)}>
      {children}
    </div>
  )
}

/** A point's reading: what a chart's tooltip or readout shows for it. */
export interface ChartReading {
  label?: ReactNode
  items: readonly ChartTooltipItem[]
  /** Formats each value and the total; numbers in the host's locale by default. */
  formatValue?: ((n: number) => string) | undefined
  /** Adds the total; on by default when there is more than one series. */
  total?: boolean | undefined
  highlighted?: string | null | undefined
  /** `series` (the default) lists the series in the order of `items`, the legend's; `value`
   *  lists the largest first. The tooltip and the readout both follow it. */
  order?: ChartReadingOrder | undefined
  /** Leaves out series whose value is zero; off by default, since a zero is a reading too. */
  hideZero?: boolean | undefined
}

// Swatch, name and value tracks: two sets side by side, or one whose names give way.
const TWO_COLUMNS = 'repeat(2, auto minmax(0, max-content) auto)'

/** The width an element's content needs, every line of it at full length: the widest of its
 *  own and its descendants' scroll widths, since a truncated line hides what overflows it. */
function fullWidth(el: HTMLElement | undefined): number {
  if (!el) {
    return 0
  }
  let widest = el.scrollWidth
  for (const child of el.querySelectorAll<HTMLElement>('*')) {
    widest = Math.max(widest, child.scrollWidth)
  }
  return widest
}
// The space between two columns, drawn as the first column's values' end margin (`me-2`).
const COLUMN_SPACE = 8
// The last track takes what is left, so a detail can run the readout's whole width; the value
// stays beside its name.
const ONE_COLUMN = 'auto minmax(0, max-content) auto 1fr'

/** A point's reading docked above a chart's plot, for a chart too narrow for a tooltip beside
 *  its crosshair: the label and total on one line, then each series' swatch, name and value,
 *  in two columns as wide as their content when everything fits at full length, else one.
 *  By default every series keeps its place and its row, zero or not, so the readout keeps its
 *  height and order as the reading changes. */
export function ChartReadout({
  label,
  items,
  formatValue,
  total,
  highlighted,
  order = 'series',
  hideZero = false,
  className,
}: ChartReading & { className?: string | undefined }) {
  const { chart: t } = useStrings()
  const locale = useLocale()
  const number = useMemo(
    () => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }),
    [locale],
  )
  const format = formatValue ?? ((n: number) => number.format(n))
  const rows = readingRows(items, order, hideZero)
  const sum = rows.reduce((acc, item) => acc + item.value, 0)
  const showTotal = total ?? rows.length > 1
  // Two columns, each only as wide as its names and values, when both fit at full length;
  // else one, whose names truncate only when even it is too narrow.
  const list = useRef<HTMLUListElement>(null)
  const [columns, setColumns] = useState<1 | 2>(2)
  useLayoutEffect(() => {
    const ul = list.current
    if (!ul) {
      return
    }
    // Measured from each name's and value's own full width, every line of it, without changing
    // the layout: widening the list to measure it could widen whatever holds it too, and then
    // two columns would always seem to fit.
    const choose = () => {
      const cols = [0, 1].map(() => ({ swatch: 0, name: 0, value: 0 }))
      ;[...ul.children].forEach((li, i) => {
        const [swatch, name, value] = [...li.children] as HTMLElement[]
        const col = cols[i % 2] as { swatch: number; name: number; value: number }
        col.swatch = Math.max(col.swatch, swatch?.offsetWidth ?? 0)
        col.name = Math.max(col.name, fullWidth(name))
        col.value = Math.max(col.value, fullWidth(value))
      })
      const gap = Number.parseFloat(getComputedStyle(ul).columnGap) || 0
      const need =
        cols.reduce((sum, c) => sum + c.swatch + c.name + c.value, 0) + 5 * gap + COLUMN_SPACE
      // A series with a detail takes a row of its own, its detail across the readout under it.
      const detailed = rows.some((item) => item.detail != null && item.detail !== '')
      setColumns(rows.length > 1 && !detailed && need <= ul.clientWidth ? 2 : 1)
    }
    choose()
    // Again once its fonts load, which can widen every name, and whenever it resizes.
    let live = true
    const fonts = typeof document === 'undefined' ? undefined : document.fonts
    fonts?.ready.then(() => live && choose())
    fonts?.addEventListener?.('loadingdone', choose)
    const observer = new ResizeObserver(choose)
    observer.observe(ul)
    return () => {
      live = false
      fonts?.removeEventListener?.('loadingdone', choose)
      observer.disconnect()
    }
  })
  return (
    <div
      data-chart-readout=""
      className={cx(
        'rounded-lg border border-(--theme-border) bg-(--theme-muted-panel-bg)/50 px-2 py-1.5 text-xs text-(--theme-app)',
        className,
      )}
    >
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate font-semibold">{label}</span>
        {showTotal && (
          <span className="shrink-0 tabular-nums">
            <span className="text-(--theme-muted-text-color)">{t.total}</span>{' '}
            <span className="font-semibold">{format(sum)}</span>
          </span>
        )}
      </div>
      <ul
        ref={list}
        className="m-0 grid list-none items-start justify-start gap-x-1.5 gap-y-0.5 p-0"
        style={{ gridTemplateColumns: columns === 2 ? TWO_COLUMNS : ONE_COLUMN }}
      >
        {rows.map((item, i) => (
          <li
            key={item.key}
            className={cx(
              'contents',
              highlighted === item.key
                ? 'font-semibold'
                : highlighted != null && 'text-(--theme-muted-text-color)',
            )}
          >
            <SeriesSwatch
              color={item.color}
              // In one column, each row starts again at the first track, past the empty last one.
              className={cx(SWATCH_ON_LINE, columns === 1 && 'col-start-1')}
            />
            <span className="truncate">{item.name}</span>
            <span
              className={cx(
                'text-end tabular-nums',
                // The space between the two columns.
                columns === 2 && i % 2 === 0 && 'me-2',
              )}
            >
              {format(item.value)}
            </span>
            {/* Across the rest of the readout, taking no width of its own. */}
            <SeriesDetail item={item} className="[contain:inline-size]" />
          </li>
        ))}
      </ul>
    </div>
  )
}

/** A chart's plot with its reading, placed for its width: on a wide chart a tooltip beside the
 *  crosshair at `x` while a point is hovered, and under 28rem, as on a phone, a readout docked
 *  above the plot that never covers it or its legend, showing `rest`, such as the latest point,
 *  while none is. `children` is the plot, and `x` the crosshair in it, or null. The app positions
 *  nothing: the frame measures itself through a container query. */
export function ChartTooltipFrame({
  x,
  reading,
  rest,
  top = 0,
  gap = 12,
  className,
  children,
}: {
  x: number | null
  /** The hovered point's reading, or null while none is. */
  reading: ChartReading | null
  /** What the readout shows while no point is hovered, so it keeps its place. */
  rest: ChartReading
  top?: number | undefined
  gap?: number | undefined
  className?: string | undefined
  children: ReactNode
}) {
  const shown = x !== null && reading ? reading : null
  return (
    <div className={cx('@container/chart', className)}>
      <ChartReadout {...(shown ?? rest)} className="mb-2 @min-[28rem]/chart:hidden" />
      <div className="relative">
        {children}
        {shown && (
          <ChartTooltipBeside x={x} top={top} gap={gap} className="hidden @min-[28rem]/chart:block">
            <ChartTooltipContent {...shown} />
          </ChartTooltipBeside>
        )}
      </div>
    </div>
  )
}

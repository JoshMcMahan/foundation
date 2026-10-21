import type { Meta, StoryObj } from '@storybook/react-vite'
import { type PointerEvent, type ReactNode, useEffect, useRef, useState } from 'react'
import { expect, within } from 'storybook/test'
import {
  ChartLegendList,
  type ChartReadingOrder,
  ChartTooltipFrame,
  foldSeries,
  OTHER_SERIES_COLOR,
  OTHER_SERIES_KEY,
  SeriesSwatch,
  seriesColors,
  seriesSlotColor,
  useSeriesHighlight,
} from './chart'

/** A box's width as it lays out, so a tooltip can sit beside a column drawn in a scaled SVG. */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) {
      return
    }
    const observer = new ResizeObserver(() => setWidth(el.clientWidth))
    observer.observe(el)
    setWidth(el.clientWidth)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

/** The index of the column under the pointer across an element split into `n` columns. */
function columnAt(event: PointerEvent<Element>, n: number) {
  const box = event.currentTarget.getBoundingClientRect()
  const i = Math.floor(((event.clientX - box.left) / box.width) * n)
  return Math.min(n - 1, Math.max(0, i))
}

const meta: Meta = {
  title: 'UI/Charts',
}
export default meta

const SERIES = ['Compute', 'Storage', 'Network', 'GPU', 'Support']
const DAYS = ['Oct 6', 'Oct 7', 'Oct 8', 'Oct 9', 'Oct 10', 'Oct 11', 'Oct 12']
const VALUES: Record<string, number[]> = {
  Compute: [42, 51, 47, 63, 58, 31, 28],
  Storage: [12, 12, 13, 13, 14, 14, 14],
  Network: [6, 9, 7, 11, 8, 3, 2],
  GPU: [80, 96, 74, 120, 110, 40, 22],
  Support: [5, 5, 5, 5, 5, 5, 5],
}
const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

/** The colors a chart's series take, in order: the first series the first, and so on, from
 *  the theme's eight category hues in an order whose every run from the start keeps neighbors
 *  apart for color-blind readers too. A series past the eighth folds into a gray "Other". */
export const Palette: StoryObj = {
  render: () => (
    <div
      className="text-xs text-(--theme-app)"
      style={{ display: 'flex', flexWrap: 'wrap', gap: 16, padding: 24 }}
    >
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((position) => (
        <div
          key={position}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}
        >
          <span
            className="rounded-md"
            style={{ width: 56, height: 40, background: seriesSlotColor(position) }}
          />
          <span className="theme-muted-text">{position === 9 ? 'Other' : position}</span>
        </div>
      ))}
      <div style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 16 }}>
        <span className="flex items-center gap-1.5">
          <SeriesSwatch color={seriesSlotColor(1)} /> square
        </span>
        <span className="flex items-center gap-1.5">
          <SeriesSwatch color={seriesSlotColor(1)} shape="dot" /> dot
        </span>
        <span className="flex items-center gap-1.5">
          <SeriesSwatch color={seriesSlotColor(1)} shape="line" /> line
        </span>
      </div>
    </div>
  ),
}

function StackedBars({ pinned }: { pinned?: number }) {
  const colors = seriesColors(SERIES)
  const { highlighted, highlight, opacity } = useSeriesHighlight()
  const [column, setColumn] = useState<number | null>(pinned ?? null)
  const [box, boxWidth] = useWidth()
  const totals = DAYS.map((_, i) => SERIES.reduce((sum, s) => sum + (VALUES[s]?.[i] ?? 0), 0))
  const top = Math.max(...totals)
  const width = 560
  const height = 200
  const slot = width / DAYS.length
  const bar = slot * 0.56
  // The tooltip clears the hovered bar, not only its center.
  const barHalf = (boxWidth / DAYS.length) * 0.28
  const readingAt = (i: number) => ({
    label: DAYS[i],
    highlighted,
    formatValue: (n: number) => currency.format(n),
    items: SERIES.map((s) => ({
      key: s,
      name: s,
      value: VALUES[s]?.[i] ?? 0,
      color: colors[s] ?? '',
    })),
  })
  return (
    <div
      className="rounded-xl border border-(--theme-border) bg-(--theme-panel-bg)"
      style={{ width: '100%', maxWidth: 600, padding: 16, boxSizing: 'border-box' }}
    >
      <div
        className="text-(--theme-app)"
        style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}
      >
        Daily cost
      </div>
      <ChartTooltipFrame
        x={column === null ? null : ((column + 0.5) / DAYS.length) * boxWidth}
        gap={barHalf + 8}
        top={8}
        reading={column === null ? null : readingAt(column)}
        rest={readingAt(DAYS.length - 1)}
      >
        <div ref={box} style={{ position: 'relative' }}>
          <svg
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            style={{ display: 'block', width: '100%', height: 208 }}
            role="img"
            aria-label={`Daily cost by ${SERIES.join(', ')}`}
            onPointerMove={(e) => setColumn(columnAt(e, DAYS.length))}
            onPointerLeave={() => setColumn(pinned ?? null)}
          >
            <line
              x1={0}
              x2={width}
              y1={height - 0.5}
              y2={height - 0.5}
              stroke="var(--theme-border)"
            />
            {column !== null && (
              <rect
                x={column * slot}
                y={0}
                width={slot}
                height={height}
                fill="var(--theme-muted-panel-bg)"
              />
            )}
            {DAYS.map((day, i) => {
              let y = height
              return (
                <g key={day}>
                  {SERIES.map((s) => {
                    const h = ((VALUES[s]?.[i] ?? 0) / top) * (height - 8)
                    y -= h
                    return (
                      <rect
                        key={s}
                        x={i * slot + (slot - bar) / 2}
                        y={y}
                        width={bar}
                        height={Math.max(0, h - 2)}
                        fill={colors[s]}
                        fillOpacity={opacity(s)}
                        onPointerEnter={() => highlight(s)}
                        onPointerLeave={() => highlight(null)}
                      />
                    )
                  })}
                </g>
              )
            })}
          </svg>
        </div>
      </ChartTooltipFrame>
      <div
        className="text-(--theme-muted-text-color)"
        style={{ display: 'flex', fontSize: 11, marginTop: 4 }}
      >
        {DAYS.map((day) => (
          <span key={day} style={{ flex: 1, textAlign: 'center' }}>
            {day}
          </span>
        ))}
      </div>
      <ChartLegendList
        className="mt-3"
        highlighted={highlighted}
        onHighlight={highlight}
        items={SERIES.map((s) => ({ key: s, label: s, color: colors[s] ?? '' }))}
      />
    </div>
  )
}

/** A stacked bar chart drawn by hand in SVG with the kit: colors from `seriesColors` by each
 *  series' place, a legend that puts a series in focus as it is hovered, focused or pressed,
 *  and its reading through `ChartTooltipFrame`: on a wide chart a tooltip beside the hovered
 *  day, clear of its bar, and under 28rem a readout docked above the plot, showing the latest
 *  day while none is hovered. */
export const StackedBarChart: StoryObj = {
  render: () => (
    <div style={{ padding: 24 }}>
      <StackedBars />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Total')).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'GPU' })).toBeInTheDocument()
  },
}

const HOURS = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00']
const LATENCY: Record<string, number[]> = {
  'p50 latency': [120, 118, 125, 122, 130, 128, 126, 124],
  'p95 latency': [210, 220, 205, 240, 260, 230, 225, 215],
  'p99 latency': [320, 360, 340, 410, 450, 380, 350, 330],
}

function Lines({
  hidden = [],
  reference,
}: {
  hidden?: readonly string[]
  /** An hour marked with a dashed line and a label, such as where reprocessed data begins. */
  reference?: number
}) {
  // Every series the chart can show, so hiding one leaves the rest their colors.
  const all = Object.keys(LATENCY)
  const colors = seriesColors(all)
  const keys = all.filter((k) => !hidden.includes(k))
  const { highlighted, highlight, opacity } = useSeriesHighlight()
  const [index, setIndex] = useState<number | null>(null)
  const [box, boxWidth] = useWidth()
  const width = 560
  const height = 160
  const last = HOURS.length - 1
  const x = (i: number) => (i / last) * width
  const y = (v: number) => height - 4 - (v / 480) * (height - 8)
  const nearest = (e: PointerEvent<Element>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return Math.round(((e.clientX - r.left) / r.width) * last)
  }
  const ms = (n: number) => `${n} ms`
  const readingAt = (i: number) => ({
    label: HOURS[i],
    total: false,
    highlighted,
    formatValue: ms,
    items: keys.map((k) => ({
      key: k,
      name: k,
      value: LATENCY[k]?.[i] ?? 0,
      color: colors[k] ?? '',
    })),
  })
  return (
    <div
      className="rounded-xl border border-(--theme-border) bg-(--theme-panel-bg)"
      style={{ width: '100%', maxWidth: 600, padding: 16, boxSizing: 'border-box' }}
    >
      <div
        className="text-(--theme-app)"
        style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}
      >
        Latency
      </div>
      <ChartTooltipFrame
        x={index === null ? null : (index / last) * boxWidth}
        reading={index === null ? null : readingAt(index)}
        rest={readingAt(last)}
      >
        <div
          ref={box}
          style={{ position: 'relative', marginTop: reference === undefined ? 0 : 20 }}
        >
          <svg
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            style={{ display: 'block', width: '100%', height: 160, overflow: 'visible' }}
            role="img"
            aria-label="Latency"
            onPointerMove={(e) => setIndex(nearest(e))}
            onPointerLeave={() => setIndex(null)}
          >
            {reference !== undefined && (
              <line
                x1={x(reference)}
                x2={x(reference)}
                y1={0}
                y2={height}
                stroke="var(--theme-muted-text-color)"
                strokeDasharray="4 3"
                vectorEffect="non-scaling-stroke"
              />
            )}
            {index !== null && (
              <line
                x1={x(index)}
                x2={x(index)}
                y1={0}
                y2={height}
                stroke="var(--theme-border)"
                vectorEffect="non-scaling-stroke"
              />
            )}
            {keys.map((k) => (
              <polyline
                key={k}
                fill="none"
                stroke={colors[k]}
                strokeOpacity={opacity(k)}
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
                points={(LATENCY[k] ?? []).map((v, i) => `${x(i)},${y(v)}`).join(' ')}
              />
            ))}
          </svg>
          {index !== null &&
            keys.map((k) => (
              <span
                key={k}
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  left: (index / last) * boxWidth - 4,
                  top: y(LATENCY[k]?.[index] ?? 0) - 4,
                  width: 8,
                  height: 8,
                  borderRadius: 9999,
                  background: colors[k],
                  boxShadow: '0 0 0 2px var(--theme-panel-bg)',
                  pointerEvents: 'none',
                }}
              />
            ))}
          {reference !== undefined && (
            <span
              className="text-(--theme-muted-text-color)"
              style={{
                position: 'absolute',
                top: -18,
                right: `calc(${100 - (reference / last) * 100}% + 4px)`,
                fontSize: 11,
                whiteSpace: 'nowrap',
              }}
            >
              Reprocessed before this
            </span>
          )}
        </div>
      </ChartTooltipFrame>
      <div
        className="text-(--theme-muted-text-color)"
        style={{ position: 'relative', height: 16, fontSize: 11, marginTop: 4 }}
      >
        {HOURS.map((h, i) =>
          i % 2 === 0 ? (
            <span
              key={h}
              style={{
                position: 'absolute',
                left: `${(i / last) * 100}%`,
                transform: i === 0 ? undefined : 'translateX(-50%)',
              }}
            >
              {h}
            </span>
          ) : null,
        )}
      </div>
      <ChartLegendList
        className="mt-3"
        shape="line"
        highlighted={highlighted}
        onHighlight={highlight}
        items={keys.map((k) => ({ key: k, label: k, color: colors[k] ?? '' }))}
      />
    </div>
  )
}

/** Lines take the same colors, with a line swatch in the legend. Hovering puts a crosshair on
 *  the nearest hour; a wide chart shows the tooltip beside it, flipping as it passes the
 *  middle, and a narrow one the readout above the plot. */
export const LineChart: StoryObj = {
  render: () => (
    <div style={{ padding: 24 }}>
      <Lines />
    </div>
  ),
}

/** With p50 filtered out, p95 and p99 keep the colors they had: the chart passes every key it
 *  can show to `seriesColors`, not only the ones shown. */
export const LineChartFiltered: StoryObj = {
  render: () => (
    <div style={{ padding: 24 }}>
      <Lines hidden={['p50 latency']} />
    </div>
  ),
}

/** A dashed reference line with its label above the plot, in the lane the plot leaves for it,
 *  so the tooltip beside the crosshair never covers the label or the point being read. */
export const LineChartWithReference: StoryObj = {
  render: () => (
    <div style={{ padding: 24 }}>
      <Lines reference={6} />
    </div>
  ),
}

const REGIONS = [
  'us-east-1',
  'us-west-2',
  'eu-west-1',
  'eu-central-1',
  'ap-south-1',
  'ap-northeast-1',
  'sa-east-1',
  'ca-central-1',
  'af-south-1',
  'me-south-1',
]
const SPEND = [420, 380, 260, 210, 160, 120, 90, 60, 30, 20]

/** Ten regions in a chart that colors eight: the first seven keep their own colors, and the
 *  last three fold into one gray "Other" series, its value their sum. */
export const NineOrMoreSeries: StoryObj = {
  render: () => {
    const { keys, folded } = foldSeries(REGIONS)
    const colors = seriesColors(keys)
    const value = (k: string) =>
      k === OTHER_SERIES_KEY
        ? folded.reduce((sum, r) => sum + (SPEND[REGIONS.indexOf(r)] ?? 0), 0)
        : (SPEND[REGIONS.indexOf(k)] ?? 0)
    const total = keys.reduce((sum, k) => sum + value(k), 0)
    const label = (k: string) => (k === OTHER_SERIES_KEY ? `Other (${folded.length})` : k)
    return (
      <div style={{ padding: 24 }}>
        <div
          className="rounded-xl border border-(--theme-border) bg-(--theme-panel-bg)"
          style={{ width: '100%', maxWidth: 600, padding: 16, boxSizing: 'border-box' }}
        >
          <div style={{ display: 'flex', gap: 2, height: 24 }}>
            {keys.map((k, i) => (
              <span
                key={k}
                title={label(k)}
                style={{
                  flex: value(k) / total,
                  background: colors[k],
                  borderRadius: i === 0 ? '4px 0 0 4px' : i === keys.length - 1 ? '0 4px 4px 0' : 0,
                }}
              />
            ))}
          </div>
          <ChartLegendList
            className="mt-3"
            items={keys.map((k) => ({ key: k, label: label(k), color: colors[k] ?? '' }))}
          />
        </div>
      </div>
    )
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Other (3)')).toBeInTheDocument()
    await expect(OTHER_SERIES_COLOR).toContain('--theme-muted-text-color')
  },
}

interface ReadingSeries {
  key: string
  /** The series' name in the legend. */
  label: string
  /** A line of detail under its name in a reading. */
  detail?: (i: number) => ReactNode
  values: number[]
}

/** A small multi-line chart read through `ChartTooltipFrame`, for the reading stories. */
function ReadingLines({
  title,
  series,
  steps,
  format,
  total = false,
  order,
}: {
  title: string
  series: ReadingSeries[]
  steps: string[]
  format: (n: number) => string
  total?: boolean
  order?: ChartReadingOrder
}) {
  const colors = seriesColors(series.map((s) => s.key))
  const [index, setIndex] = useState<number | null>(null)
  const [box, boxWidth] = useWidth()
  const width = 560
  const height = 140
  const last = steps.length - 1
  const top = Math.max(...series.flatMap((s) => s.values)) || 1
  const x = (i: number) => (i / last) * width
  const y = (v: number) => height - 4 - (v / top) * (height - 8)
  const readingAt = (i: number) => ({
    label: steps[i],
    total,
    order,
    formatValue: format,
    items: series.map((s) => ({
      key: s.key,
      name: s.label,
      detail: s.detail?.(i),
      value: s.values[i] ?? 0,
      color: colors[s.key] ?? '',
    })),
  })
  return (
    <div
      className="rounded-xl border border-(--theme-border) bg-(--theme-panel-bg)"
      style={{ flex: 1, width: '100%', maxWidth: 600, padding: 16, boxSizing: 'border-box' }}
    >
      <div
        className="text-(--theme-app)"
        style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}
      >
        {title}
      </div>
      <ChartTooltipFrame
        x={index === null ? null : (index / last) * boxWidth}
        reading={index === null ? null : readingAt(index)}
        rest={readingAt(last)}
      >
        <div ref={box} style={{ position: 'relative' }}>
          <svg
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            style={{ display: 'block', width: '100%', height }}
            role="img"
            aria-label={title}
            onPointerMove={(e) => {
              const r = e.currentTarget.getBoundingClientRect()
              setIndex(Math.round(((e.clientX - r.left) / r.width) * last))
            }}
            onPointerLeave={() => setIndex(null)}
          >
            {index !== null && (
              <line
                x1={x(index)}
                x2={x(index)}
                y1={0}
                y2={height}
                stroke="var(--theme-border)"
                vectorEffect="non-scaling-stroke"
              />
            )}
            {series.map((s) => (
              <polyline
                key={s.key}
                fill="none"
                stroke={colors[s.key]}
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
                points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
              />
            ))}
          </svg>
        </div>
      </ChartTooltipFrame>
      <ChartLegendList
        className="mt-3"
        shape="line"
        items={series.map((s) => ({ key: s.key, label: s.label, color: colors[s.key] ?? '' }))}
      />
    </div>
  )
}

const DAYS5 = ['Oct 14', 'Oct 15', 'Oct 16', 'Oct 17', 'Oct 18']
const tokens = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })

/** Model names just too long for two columns on a phone: the readout takes one, so every name
 *  shows in full. It measures again once its font loads, so a narrower fallback font seen
 *  first can't leave it in two columns that cut the names off. */
export const ReadingLongNames: StoryObj = {
  render: () => (
    // In a dashboard's row, whose cards grow to what they hold unless held.
    <div style={{ display: 'flex', padding: 24 }}>
      <ReadingLines
        title="Tokens by model"
        steps={DAYS5}
        format={(n) => tokens.format(n)}
        total
        series={[
          { key: 'r', label: 'reasoning-large', values: [820e3, 910e3, 760e3, 1.2e6, 990e3] },
          {
            key: 'e',
            label: 'text-embed-large',
            values: [310e3, 280e3, 350e3, 400e3, 380e3],
          },
          { key: 'v', label: 'vision-preview', values: [90e3, 120e3, 60e3, 150e3, 110e3] },
        ]}
      />
    </div>
  ),
}

const ratio = new Intl.NumberFormat('en-US', { style: 'percent' })
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const RATIO_DETAIL: Record<string, [number, number, number][]> = {
  north: [
    [606.31, 606.04, 39],
    [598.2, 611.5, 39],
    [612.75, 603.1, 40],
    [604.4, 609.9, 39],
    [667.87, 648.11, 50],
  ],
  south: [
    [270.69, 271.66, 35],
    [265.1, 270.2, 35],
    [281.3, 268.4, 36],
    [219.12, 208.88, 32],
    [219.12, 208.88, 32],
  ],
}

/** A reading whose series carry a line of detail, such as what a ratio was estimated and
 *  invoiced at: muted under the name, it wraps onto as many lines as it needs, in the readout
 *  and in the tooltip, and is never cut. The value stays on the name's line. */
export const ReadingSecondLine: StoryObj = {
  render: () => (
    // In a dashboard's row, whose cards grow to what they hold unless held.
    <div style={{ display: 'flex', padding: 24 }}>
      <ReadingLines
        title="Daily ratio"
        steps={DAYS5}
        format={(n) => ratio.format(n)}
        series={(['north', 'south'] as const).map((region) => ({
          key: region,
          label: region === 'north' ? 'North region' : 'South region',
          detail: (i: number) => {
            const [estimated, invoiced, days] = RATIO_DETAIL[region]?.[i] ?? [0, 0, 0]
            return `${usd.format(estimated)} / ${usd.format(invoiced)} · ${days} deployment-days`
          },
          values: (RATIO_DETAIL[region] ?? []).map(([e, inv]) => e / inv),
        }))}
      />
    </div>
  ),
}

/** Nodes listed in the legend's order, node01 to node03, and a node at exactly 0% kept, both
 *  in the tooltip and in the readout: a zero is a reading too. */
export const ReadingLegendOrderAndZero: StoryObj = {
  render: () => (
    // In a dashboard's row, whose cards grow to what they hold unless held.
    <div style={{ display: 'flex', padding: 24 }}>
      <ReadingLines
        title="CPU by node"
        steps={DAYS5}
        format={(n) => `${n}%`}
        series={[
          { key: 'n1', label: 'node01', values: [34, 41, 38, 52, 47] },
          { key: 'n2', label: 'node02', values: [62, 70, 66, 81, 74] },
          { key: 'n3', label: 'node03', values: [12, 8, 0, 0, 0] },
        ]}
      />
    </div>
  ),
}

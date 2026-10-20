import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, within } from 'storybook/test'
import { categoryOf } from './category'
import {
  ChartLegendList,
  ChartTooltipContent,
  SeriesSwatch,
  seriesColors,
  seriesSlotColor,
  useSeriesHighlight,
} from './chart'

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

/** The palette a chart draws from: the theme's eight category hues, as marks strong enough to
 *  stand out from the page in light and dark. A series keeps its color across charts. */
export const Palette: StoryObj = {
  render: () => (
    <div className="flex flex-wrap gap-4 p-8 text-xs text-(--theme-app)">
      {[1, 2, 3, 4, 5, 6, 7, 8].map((slot) => (
        <div key={slot} className="flex flex-col items-center gap-1.5">
          <span
            className="rounded-md"
            style={{ width: 56, height: 40, background: seriesSlotColor(slot) }}
          />
          <span className="theme-muted-text">{slot}</span>
        </div>
      ))}
      <div className="flex w-full items-center gap-4 pt-2">
        <span className="flex items-center gap-1.5">
          <SeriesSwatch color={seriesSlotColor(categoryOf('Compute'))} /> square
        </span>
        <span className="flex items-center gap-1.5">
          <SeriesSwatch color={seriesSlotColor(categoryOf('Compute'))} shape="dot" /> dot
        </span>
        <span className="flex items-center gap-1.5">
          <SeriesSwatch color={seriesSlotColor(categoryOf('Compute'))} shape="line" /> line
        </span>
      </div>
    </div>
  ),
}

function StackedBars({ pinned }: { pinned?: number }) {
  const colors = seriesColors(SERIES)
  const { highlighted, highlight, opacity } = useSeriesHighlight()
  const [column, setColumn] = useState<number | null>(pinned ?? null)
  const totals = DAYS.map((_, i) => SERIES.reduce((sum, s) => sum + (VALUES[s]?.[i] ?? 0), 0))
  const top = Math.max(...totals)
  const width = 560
  const height = 200
  const slot = width / DAYS.length
  const bar = slot * 0.56
  return (
    <div
      className="rounded-xl border border-(--theme-border) bg-(--theme-panel-bg) p-4"
      style={{ width: '100%', maxWidth: 600 }}
    >
      <div className="relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full"
          style={{ height: 208 }}
          role="img"
          aria-label={`Daily cost by ${SERIES.join(', ')}`}
          onPointerLeave={() => setColumn(pinned ?? null)}
        >
          <line
            x1={0}
            x2={width}
            y1={height - 0.5}
            y2={height - 0.5}
            stroke="var(--theme-border)"
          />
          {DAYS.map((day, i) => {
            let y = height
            return (
              <g key={day} onPointerEnter={() => setColumn(i)}>
                {SERIES.map((s) => {
                  const h = ((VALUES[s]?.[i] ?? 0) / top) * (height - 8)
                  y -= h
                  return (
                    <rect
                      key={s}
                      x={i * slot + (slot - bar) / 2}
                      y={y}
                      width={bar}
                      height={h}
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
        {column !== null && (
          <ChartTooltipContent
            // Beside the column, on the side with room.
            className="pointer-events-none absolute top-2"
            style={
              column < DAYS.length / 2
                ? { left: `${((column + 1) / DAYS.length) * 100}%` }
                : { right: `${((DAYS.length - column) / DAYS.length) * 100}%` }
            }
            label={DAYS[column]}
            highlighted={highlighted}
            formatValue={(n) => currency.format(n)}
            items={SERIES.map((s) => ({
              key: s,
              name: s,
              value: VALUES[s]?.[column] ?? 0,
              color: colors[s] ?? '',
            }))}
          />
        )}
      </div>
      <div className="mt-1 flex text-[11px] text-(--theme-muted-text-color)">
        {DAYS.map((day) => (
          <span key={day} className="flex-1 text-center">
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

/** A stacked bar chart drawn by hand in SVG with the kit: colors from `seriesColors`, a
 *  legend that puts a series in focus as it is hovered, focused or pressed, the other series
 *  fading, and a tooltip's content listing a day's values largest first with a total. */
export const StackedBarChart: StoryObj = {
  render: () => (
    <div className="p-8">
      <StackedBars pinned={3} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Total')).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'GPU' })).toBeInTheDocument()
  },
}

function Lines() {
  const keys = ['p50 latency', 'p95 latency', 'p99 latency']
  const colors = seriesColors(keys)
  const { highlighted, highlight, opacity } = useSeriesHighlight()
  const data: Record<string, number[]> = {
    'p50 latency': [120, 118, 125, 122, 130, 128, 126, 124],
    'p95 latency': [210, 220, 205, 240, 260, 230, 225, 215],
    'p99 latency': [320, 360, 340, 410, 450, 380, 350, 330],
  }
  const width = 560
  const height = 160
  const x = (i: number) => (i / 7) * width
  const y = (v: number) => height - (v / 480) * height
  return (
    <div
      className="rounded-xl border border-(--theme-border) bg-(--theme-panel-bg) p-4"
      style={{ width: '100%', maxWidth: 600 }}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-40 w-full"
        role="img"
        aria-label="Latency"
      >
        {keys.map((k) => (
          <polyline
            key={k}
            fill="none"
            stroke={colors[k]}
            strokeOpacity={opacity(k)}
            strokeWidth={2}
            points={(data[k] ?? []).map((v, i) => `${x(i)},${y(v)}`).join(' ')}
          />
        ))}
      </svg>
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

/** Lines take the same colors, with a line swatch in the legend. */
export const LineChart: StoryObj = {
  render: () => (
    <div className="p-8">
      <Lines />
    </div>
  ),
}

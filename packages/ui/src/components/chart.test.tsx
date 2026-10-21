// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import {
  ChartLegendList,
  ChartTooltipBeside,
  ChartTooltipContent,
  chartTooltipPlacement,
  foldSeries,
  OTHER_SERIES_COLOR,
  OTHER_SERIES_KEY,
  seriesColors,
  seriesOpacity,
  seriesSlotColor,
} from './chart'
import { UIProvider } from './Provider'

describe('series colors', () => {
  it('colors series by position, from the theme’s category colors in a checked order', () => {
    expect(seriesSlotColor(1)).toContain('var(--theme-category-5)')
    expect(seriesSlotColor(2)).toContain('var(--theme-category-2)')
    expect(seriesSlotColor(8)).toContain('var(--theme-category-1)')
    const colors = seriesColors(['Storage', 'Compute', 'Storage', 'GPU'])
    expect(colors).toEqual({
      Storage: seriesSlotColor(1),
      Compute: seriesSlotColor(2),
      GPU: seriesSlotColor(3),
    })
  })

  it('never shares a color among eight series, and never makes up a ninth', () => {
    const keys = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
    expect(new Set(Object.values(seriesColors(keys))).size).toBe(8)
    expect(seriesSlotColor(9)).toBe(OTHER_SERIES_COLOR)
    expect(seriesColors([...keys, 'i'])['i']).toBe(OTHER_SERIES_COLOR)
  })

  it('leaves a series its color when a filter hides another, given every key', () => {
    const all = ['Compute', 'Storage', 'Network']
    const colors = seriesColors(all)
    const shown = all.filter((k) => k !== 'Compute')
    expect(shown.map((k) => colors[k])).toEqual([seriesSlotColor(2), seriesSlotColor(3)])
  })

  it('folds series past the eighth into Other', () => {
    const eight = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
    expect(foldSeries(eight)).toEqual({ keys: eight, folded: [] })
    const { keys, folded } = foldSeries([...eight, 'i'])
    expect(keys).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', OTHER_SERIES_KEY])
    expect(folded).toEqual(['h', 'i'])
    expect(seriesColors(keys)[OTHER_SERIES_KEY]).toBe(OTHER_SERIES_COLOR)
  })

  it('fades every series but the one in focus', () => {
    expect(seriesOpacity('a', null)).toBe(1)
    expect(seriesOpacity('a', 'a')).toBe(1)
    expect(seriesOpacity('b', 'a')).toBe(0.3)
  })
})

describe('ChartTooltipContent', () => {
  const items = [
    { key: 'storage', name: 'Storage', value: 2.5, color: 'red' },
    { key: 'compute', name: 'Compute', value: 10, color: 'blue' },
    { key: 'network', name: 'Network', value: 0, color: 'green' },
  ]

  it('lists the largest first, leaves out zero and adds a total', () => {
    render(<ChartTooltipContent label="Oct 12" items={items} formatValue={(n) => `$${n}`} />)
    const rows = screen.getAllByRole('listitem').map((li) => li.textContent)
    expect(rows).toEqual(['Compute$10', 'Storage$2.5'])
    expect(screen.getByText('Total').nextSibling).toHaveTextContent('$12.5')
  })

  it('has no total for one series', () => {
    render(<ChartTooltipContent items={items.slice(0, 1)} />)
    expect(screen.queryByText('Total')).toBeNull()
  })
})

describe('ChartLegendList', () => {
  it('puts a series in focus from the legend, and keeps it there when pressed', () => {
    const onHighlight = vi.fn()
    render(
      <ChartLegendList
        items={[
          { key: 'a', label: 'Compute', color: 'red' },
          { key: 'b', label: 'Storage', color: 'blue' },
        ]}
        onHighlight={onHighlight}
      />,
    )
    const compute = screen.getByRole('button', { name: 'Compute' })
    fireEvent.focus(compute)
    expect(onHighlight).toHaveBeenLastCalledWith('a')
    fireEvent.click(compute)
    expect(compute).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('ChartTooltipContent locale', () => {
  it('formats numbers in the host’s locale', () => {
    render(
      <UIProvider locale="de-DE">
        <ChartTooltipContent items={[{ key: 'a', name: 'A', value: 1234.5, color: 'red' }]} />
      </UIProvider>,
    )
    expect(screen.getByText('1.234,5')).toBeInTheDocument()
  })
})

describe('chartTooltipPlacement', () => {
  const bounds = { start: 0, end: 400, gap: 12 }

  it('goes to the right of the crosshair when it fits', () => {
    expect(chartTooltipPlacement({ ...bounds, x: 100, width: 160 })).toEqual({
      left: 112,
      side: 'right',
      maxWidth: null,
    })
  })

  it('flips to the left at the right edge, still clear of the crosshair', () => {
    const p = chartTooltipPlacement({ ...bounds, x: 300, width: 160 })
    expect(p).toEqual({ left: 128, side: 'left', maxWidth: null })
    expect(p.left + 160).toBeLessThan(300)
  })

  it('starts on the left when asked, flipping at the left edge', () => {
    expect(chartTooltipPlacement({ ...bounds, x: 300, width: 160, prefer: 'left' }).side).toBe(
      'left',
    )
    expect(chartTooltipPlacement({ ...bounds, x: 100, width: 160, prefer: 'left' }).side).toBe(
      'right',
    )
  })

  it('holds itself to the wider side when neither fits, never across the crosshair', () => {
    const p = chartTooltipPlacement({ start: 0, end: 300, x: 140, width: 180 })
    expect(p).toEqual({ left: 152, side: 'right', maxWidth: 148 })
    const q = chartTooltipPlacement({ start: 0, end: 300, x: 170, width: 180 })
    expect(q).toEqual({ left: 0, side: 'left', maxWidth: 158 })
  })
})

describe('ChartTooltipBeside', () => {
  it('shows nothing without a crosshair', () => {
    const { container } = render(<ChartTooltipBeside x={null}>tip</ChartTooltipBeside>)
    expect(container).toBeEmptyDOMElement()
  })

  it('places its tooltip beside the crosshair, out of the pointer’s way', () => {
    render(
      <ChartTooltipBeside x={40}>
        <span>tip</span>
      </ChartTooltipBeside>,
    )
    const tip = screen.getByText('tip').parentElement as HTMLElement
    expect(tip.style.left).toBe('52px')
    expect(tip).toHaveClass('pointer-events-none')
  })
})

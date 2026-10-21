// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import {
  ChartLegendList,
  ChartReadout,
  ChartTooltipBeside,
  ChartTooltipContent,
  ChartTooltipFrame,
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

  it('lists every series in the legend’s order, zeros too, and adds a total', () => {
    render(<ChartTooltipContent label="Oct 12" items={items} formatValue={(n) => `$${n}`} />)
    const rows = screen.getAllByRole('listitem').map((li) => li.textContent)
    expect(rows).toEqual(['Storage$2.5', 'Compute$10', 'Network$0'])
    expect(screen.getByText('Total').nextSibling).toHaveTextContent('$12.5')
  })

  it('lists the largest first and leaves out zeros when the reading asks', () => {
    render(
      <ChartTooltipContent items={items} order="value" hideZero formatValue={(n) => `$${n}`} />,
    )
    const rows = screen.getAllByRole('listitem').map((li) => li.textContent)
    expect(rows).toEqual(['Compute$10', 'Storage$2.5'])
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

  it('goes beside the crosshair on the side with more room, flipping at the middle', () => {
    expect(chartTooltipPlacement({ ...bounds, x: 100, width: 160 })).toEqual({
      left: 112,
      top: 0,
      side: 'right',
      maxWidth: null,
    })
    const p = chartTooltipPlacement({ ...bounds, x: 300, width: 160 })
    expect(p).toEqual({ left: 128, top: 0, side: 'left', maxWidth: null })
    expect(p.left + 160).toBeLessThan(300)
  })

  it('takes the side it prefers when both have the same room', () => {
    expect(chartTooltipPlacement({ ...bounds, x: 200, width: 160 }).side).toBe('right')
    expect(chartTooltipPlacement({ ...bounds, x: 200, width: 160, prefer: 'left' }).side).toBe(
      'left',
    )
  })

  it('holds itself narrower when its side is a little short, never across the crosshair', () => {
    const p = chartTooltipPlacement({ start: 0, end: 300, x: 140, width: 180 })
    expect(p).toEqual({ left: 152, top: 0, side: 'right', maxWidth: 148 })
  })

  it('goes above the plot, inside the box, when neither side has room for it', () => {
    // A phone: a 300px chart with the crosshair near the middle and a wide tooltip.
    const p = chartTooltipPlacement({
      start: 0,
      end: 300,
      x: 150,
      width: 200,
      height: 90,
      top: 0,
      minWidth: 140,
    })
    expect(p).toEqual({ left: 50, top: -102, side: 'above', maxWidth: null })
    // Near an edge it stays inside the box.
    const q = chartTooltipPlacement({ start: 0, end: 300, x: 20, width: 290, minWidth: 280 })
    expect(q.left).toBe(0)
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

describe('ChartTooltipContent surface', () => {
  it('stands on the opaque popover surface, so marks never show through it', () => {
    const { container } = render(<ChartTooltipContent items={[]} />)
    expect(container.firstElementChild).toHaveClass(
      'bg-(--theme-app-bg)',
      'shadow-(--theme-shadow-lg)',
    )
  })
})

describe('ChartReadout and ChartTooltipFrame', () => {
  const at = (label: string, a: number, b: number) => ({
    label,
    items: [
      { key: 'a', name: 'Compute', value: a, color: 'red' },
      { key: 'b', name: 'Storage', value: b, color: 'blue' },
    ],
  })

  it('keeps every series in its place, zero or not, with the total beside the label', () => {
    render(<ChartReadout {...at('Oct 9', 0, 5)} />)
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Compute0',
      'Storage5',
    ])
    expect(screen.getByText('Total').parentElement).toHaveTextContent('Total 5')
  })

  it('reads the rest point while none is hovered, and the hovered one while one is', () => {
    const { rerender, container } = render(
      <ChartTooltipFrame x={null} reading={null} rest={at('Oct 12', 1, 2)}>
        <svg />
      </ChartTooltipFrame>,
    )
    const readout = () => container.querySelector('[data-chart-readout]')
    expect(readout()).toHaveTextContent('Oct 12')
    rerender(
      <ChartTooltipFrame x={40} reading={at('Oct 9', 3, 4)} rest={at('Oct 12', 1, 2)}>
        <svg />
      </ChartTooltipFrame>,
    )
    expect(readout()).toHaveTextContent('Oct 9')
    // The floating tooltip is there for a wide chart; the container query picks one.
    expect(readout()).toHaveClass('@min-[28rem]/chart:hidden')
    expect(container.querySelector('.pointer-events-none')).toHaveClass(
      'hidden',
      '@min-[28rem]/chart:block',
    )
  })
})

describe('ChartReadout columns', () => {
  it('sizes its columns to their names and values, not to halves of the readout', () => {
    const { container } = render(
      <ChartReadout
        items={[
          { key: 'a', name: 'p50 latency', value: 130, color: 'red' },
          { key: 'b', name: 'p95 latency', value: 260, color: 'blue' },
        ]}
      />,
    )
    const list = container.querySelector('ul') as HTMLElement
    expect(list.style.gridTemplateColumns).toContain('max-content')
    expect(list).toHaveClass('justify-start')
    expect(screen.getByText('p50 latency').closest('li')).toHaveClass('contents')
  })
})

describe('ChartReadout order and zeros', () => {
  const items = [
    { key: 'n1', name: 'node01', value: 12, color: 'red' },
    { key: 'n2', name: 'node02', value: 40, color: 'blue' },
    { key: 'n3', name: 'node03', value: 0, color: 'green' },
  ]

  it('keeps the legend’s order and a series at zero by default', () => {
    render(<ChartReadout items={items} />)
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'node0112',
      'node0240',
      'node030',
    ])
  })

  it('follows the reading’s order and zeros, as the tooltip does', () => {
    render(<ChartReadout items={items} order="value" hideZero />)
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'node0240',
      'node0112',
    ])
  })
})

describe('a series’ detail', () => {
  const items = [
    {
      key: 'n',
      name: 'North region',
      detail: '$612.75 / $603.10 · 40 deployment-days',
      value: 1.02,
      color: 'red',
    },
  ]

  it('wraps under the name and value in the tooltip and the readout, never cut', () => {
    render(
      <>
        <ChartTooltipContent items={items} />
        <ChartReadout items={items} />
      </>,
    )
    for (const detail of screen.getAllByText('$612.75 / $603.10 · 40 deployment-days')) {
      expect(detail).toHaveClass('break-words', 'col-start-2', 'col-end-[-1]')
      expect(detail).not.toHaveClass('truncate')
      // The name and value keep their line above it.
      expect(detail.previousElementSibling).toHaveTextContent('1.02')
      expect(detail.previousElementSibling?.previousElementSibling).toHaveTextContent(
        'North region',
      )
    }
  })

  it('gives each detailed series a row of its own in the readout', () => {
    // Room for two columns, which plain series take.
    const width = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1000)
    const south = { key: 's', name: 'South', value: 1.05, color: 'blue' }
    const plain = render(<ChartReadout items={[{ ...items[0]!, detail: undefined }, south]} />)
    expect(screen.getByRole('list').style.gridTemplateColumns).toContain('repeat(2')
    plain.unmount()
    render(<ChartReadout items={[...items, south]} />)
    expect(screen.getByRole('list').style.gridTemplateColumns).toBe(
      'auto minmax(0, max-content) auto 1fr',
    )
    width.mockRestore()
  })
})

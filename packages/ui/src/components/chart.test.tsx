// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { categoryOf } from './category'
import {
  ChartLegendList,
  ChartTooltipContent,
  seriesColor,
  seriesColors,
  seriesOpacity,
  seriesSlotColor,
} from './chart'
import { UIProvider } from './Provider'

describe('series colors', () => {
  it('gives a key its category slot, built on the theme’s category colors', () => {
    expect(seriesColor('compute')).toBe(seriesSlotColor(categoryOf('compute')))
    expect(seriesSlotColor(3)).toContain('var(--theme-category-3)')
    expect(seriesSlotColor(9)).toContain('var(--theme-category-1)')
  })

  it('never shares a color among eight series', () => {
    const keys = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
    const colors = seriesColors(keys)
    expect(new Set(Object.values(colors)).size).toBe(8)
    // A key keeps its own slot when nothing took it first.
    expect(seriesColors(['compute'])['compute']).toBe(seriesColor('compute'))
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

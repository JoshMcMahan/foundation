// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { UIProvider } from './Provider'
import { StatTile, StatTileGroup } from './StatTile'

describe('StatTile', () => {
  it('reads the value and label as one phrase', () => {
    const { container } = render(<StatTile value={3} label="Running" />)
    const spoken = container.querySelector('.sr-only')
    expect(spoken).toHaveTextContent(/^3 Running$/)
    // The lines a sighted reader sees are hidden, so nothing is read twice.
    for (const line of container.querySelectorAll('.sr-only ~ span')) {
      expect(line).toHaveAttribute('aria-hidden', 'true')
    }
  })

  it('writes a number in the provider locale, or in the format asked for', () => {
    const { container, rerender } = render(
      <UIProvider locale="de-DE">
        <StatTile value={1204} label="Jobs" />
      </UIProvider>,
    )
    expect(container.querySelector('.sr-only')).toHaveTextContent('1.204 Jobs')
    rerender(
      <UIProvider locale="en-US">
        <StatTile value={1_284_093} label="Jobs" format={{ notation: 'compact' }} />
      </UIProvider>,
    )
    expect(container.querySelector('.sr-only')).toHaveTextContent('1.3M Jobs')
  })

  it('says the suffix after the value, or reads as spoken asks', () => {
    const { container, rerender } = render(
      <StatTile value={35} suffix="/ 102 free" label="Nodes" />,
    )
    expect(container.querySelector('.sr-only')).toHaveTextContent('35 / 102 free Nodes')
    rerender(
      <StatTile value={35} suffix="/ 102 free" label="Nodes" spoken="35 of 102 nodes free" />,
    )
    expect(container.querySelector('.sr-only')).toHaveTextContent(/^35 of 102 nodes free$/)
  })

  it('pings its lamp only while the count is above zero', () => {
    const { container, rerender } = render(
      <StatTile value={2} label="Running" lamp={{ variant: 'info', pulse: true }} />,
    )
    expect(container.querySelector('.animate-ping')).not.toBeNull()
    rerender(<StatTile value={0} label="Running" lamp={{ variant: 'info', pulse: true }} />)
    expect(container.querySelector('.animate-ping')).toBeNull()
  })

  it('draws a segmented bar under the label, named for assistive technology', () => {
    render(
      <StatTile
        value={35}
        label="Nodes"
        bar={{
          value: 40,
          max: 102,
          tone: 'success',
          segments: [{ value: 20, tone: 'info' }],
          'aria-label': '60 of 102 nodes in use',
        }}
      />,
    )
    const bar = screen.getByRole('progressbar', { name: '60 of 102 nodes in use' })
    expect(bar.querySelectorAll('[data-segment]')).toHaveLength(1)
  })

  it('is a link with href and a button with onClick, named by its phrase', () => {
    const onClick = vi.fn()
    const { rerender } = render(<StatTile value={4} label="Failed" href="/jobs?status=failed" />)
    expect(screen.getByRole('link', { name: '4 Failed' })).toHaveAttribute(
      'href',
      '/jobs?status=failed',
    )
    rerender(<StatTile value={4} label="Failed" onClick={onClick} />)
    fireEvent.click(screen.getByRole('button', { name: '4 Failed' }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('sketches the value while it loads and keeps the label', () => {
    render(<StatTile value={3} label="Running" loading />)
    expect(screen.queryByText('3')).toBeNull()
    expect(screen.getAllByText('Running').length).toBeGreaterThan(0)
    expect(screen.getByText('Loading…')).toHaveClass('sr-only')
  })
})

describe('StatTileGroup', () => {
  const phoneSpan = (name: string) =>
    (
      screen.getByText(name, { selector: '.sr-only' }).parentElement as HTMLElement
    ).classList.contains('col-span-2')

  it('sets four counts in two rows of two, with a wide tile across the row under them', () => {
    render(
      <StatTileGroup>
        <StatTile value={12} label="Jobs" />
        <StatTile value={3} label="Running" />
        <StatTile value={8} label="Pending" />
        <StatTile value={1} label="Failed" />
        <StatTile value={35} label="Nodes" wide />
      </StatTileGroup>,
    )
    expect(['12 Jobs', '3 Running', '8 Pending', '1 Failed'].map(phoneSpan)).toEqual([
      false,
      false,
      false,
      false,
    ])
    expect(phoneSpan('35 Nodes')).toBe(true)
  })

  it('stretches a tile that would sit alone in half a row', () => {
    render(
      <StatTileGroup>
        <StatTile value={1} label="One" />
        <StatTile value={2} label="Two" wide />
        <StatTile value={3} label="Three" />
        <StatTile value={4} label="Four" />
        <StatTile value={5} label="Five" />
      </StatTileGroup>,
    )
    expect(['1 One', '2 Two', '3 Three', '4 Four', '5 Five'].map(phoneSpan)).toEqual([
      true,
      true,
      false,
      false,
      true,
    ])
  })
})

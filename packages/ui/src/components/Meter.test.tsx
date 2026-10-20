// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { hoverTooltip } from '../test/tooltip'
import { levelTone, Meter, ProgressBar } from './Meter'
import { TooltipProvider } from './Tooltip'

const fill = (bar: HTMLElement) => bar.querySelector('[style*="width"]') as HTMLElement

describe('Meter', () => {
  it('is a meter named by its label, reading its share of the range', () => {
    render(<Meter value={45.25} label="Storage" />)
    const meter = screen.getByRole('meter', { name: 'Storage' })
    expect(meter).toHaveAttribute('aria-valuenow', '45.25')
    expect(meter).toHaveTextContent('45%')
  })

  it('reads a value against its own range and format', () => {
    render(<Meter value={3} max={12} format={{}} label="Cores" />)
    expect(screen.getByRole('meter', { name: 'Cores' })).toHaveTextContent('3')
  })

  it('clamps a value outside its range', () => {
    render(<Meter value={140} aria-label="Quota" />)
    expect(screen.getByRole('meter', { name: 'Quota' })).toHaveAttribute('aria-valuenow', '100')
  })

  it.each([
    [50, 'bg-(--theme-info)'],
    [85, 'bg-(--theme-warning)'],
    [95, 'bg-(--theme-error)'],
  ])('colors %s by its levels', (value, color) => {
    render(<Meter value={value} aria-label="Used" />)
    expect(fill(screen.getByRole('meter'))).toHaveClass(color)
  })

  it('takes a tone over its levels', () => {
    render(<Meter value={10} tone="error" aria-label="Frozen" />)
    expect(fill(screen.getByRole('meter'))).toHaveClass('bg-(--theme-error)')
  })

  it('shows its value on hover when asked to', async () => {
    render(
      <TooltipProvider>
        <Meter value={45} label="Memory" showValue="tooltip" />
      </TooltipProvider>,
    )
    const meter = screen.getByRole('meter', { name: 'Memory' })
    expect(meter).not.toHaveTextContent('45%')
    const track = fill(meter).parentElement as HTMLElement
    expect(await hoverTooltip(track)).toHaveTextContent('45%')
  })

  it('takes a tone below its warning level', () => {
    render(<Meter value={40} okTone="success" aria-label="Budget" />)
    expect(fill(screen.getByRole('meter'))).toHaveClass('bg-(--theme-success)')
  })

  it('shows its value after the bar, on a track the host sizes', () => {
    render(<Meter value={45} label="Disk" showValue="end" trackClassName="w-24" />)
    const meter = screen.getByRole('meter', { name: 'Disk' })
    const track = fill(meter).parentElement as HTMLElement
    expect(track).toHaveClass('w-24')
    expect(track.nextElementSibling).toHaveTextContent('45%')
  })

  it('hides its value when asked to', () => {
    render(<Meter value={45} label="Disk" showValue="none" />)
    expect(screen.getByRole('meter', { name: 'Disk' })).not.toHaveTextContent('45%')
  })

  it('writes its value in the host’s words, and says its level', () => {
    render(
      <Meter
        value={82}
        label="Disk"
        valueText={(formatted) => `${formatted} used`}
        getAriaValueText={(formatted) => `${formatted}, near limit`}
      />,
    )
    const meter = screen.getByRole('meter', { name: 'Disk' })
    expect(meter).toHaveTextContent('82% used')
    expect(meter).toHaveAttribute('aria-valuetext', '82%, near limit')
  })

  it('writes its value in the locale it is given', () => {
    render(<Meter value={3.5} max={10} format={{}} locale="de-DE" label="Cores" />)
    expect(screen.getByRole('meter', { name: 'Cores' })).toHaveTextContent('3,5')
  })

  it('draws a sliver for a small reading, and none for nothing', () => {
    const { rerender } = render(<Meter value={0.5} minFill={2} aria-label="Adoption" />)
    expect(fill(screen.getByRole('meter')).style.minWidth).toBe('2%')
    rerender(<Meter value={0} minFill={2} aria-label="Adoption" />)
    expect(fill(screen.getByRole('meter')).style.minWidth).toBe('')
  })

  it('shows a detail line', () => {
    render(<Meter value={45} label="Memory" detail="4.5 / 10 GB" />)
    expect(screen.getByText('4.5 / 10 GB')).toBeInTheDocument()
  })
})

describe('levelTone', () => {
  it('rises with the value', () => {
    expect(levelTone(10, 80, 90)).toBe('info')
    expect(levelTone(10, 80, 90, 'accent')).toBe('accent')
    expect(levelTone(80, 80, 90)).toBe('warning')
    expect(levelTone(90, 80, 90)).toBe('error')
  })
})

describe('ProgressBar', () => {
  it('is a progressbar named by its label, with its percentage beside it', () => {
    render(<ProgressBar value={40} label="report.csv" />)
    const bar = screen.getByRole('progressbar', { name: 'report.csv' })
    expect(bar).toHaveAttribute('aria-valuenow', '40')
    expect(bar).toHaveTextContent('40%')
  })

  it('shows a status in place of the percentage', () => {
    render(<ProgressBar value={100} tone="success" label="report.csv" status="Completed" />)
    const bar = screen.getByRole('progressbar', { name: 'report.csv' })
    expect(bar).toHaveTextContent('Completed')
    expect(bar).not.toHaveTextContent('100%')
    expect(fill(bar)).toHaveClass('bg-(--theme-success)')
  })

  it('stacks further stretches after its value, which alone it reads as', () => {
    render(
      <ProgressBar
        value={3}
        max={8}
        tone="success"
        segments={[{ value: 2, tone: 'info', subtle: true }]}
        aria-label="Cycle"
      />,
    )
    const bar = screen.getByRole('progressbar', { name: 'Cycle' })
    expect(bar).toHaveAttribute('aria-valuenow', '3')
    const segment = bar.querySelector('[data-segment]') as HTMLElement
    expect(segment).toHaveClass('bg-(--theme-info)', 'opacity-60')
    expect(segment.style.width).toBe('25%')
  })

  it('cuts a stretch to the room left in the track', () => {
    render(<ProgressBar value={6} max={8} segments={[{ value: 5 }]} aria-label="Cycle" />)
    const segment = screen.getByRole('progressbar').querySelector('[data-segment]') as HTMLElement
    expect(segment.style.width).toBe('25%')
  })

  it('shows its value after the bar in the host’s words', () => {
    render(
      <ProgressBar
        value={3}
        max={8}
        showValue="end"
        valueText={(formatted) => `3 of 8 done, ${formatted}`}
        aria-label="Cycle"
      />,
    )
    expect(screen.getByRole('progressbar', { name: 'Cycle' })).toHaveTextContent('3 of 8 done, 38%')
  })

  it('is indeterminate without a value', () => {
    render(<ProgressBar value={null} aria-label="Preparing" />)
    expect(screen.getByRole('progressbar', { name: 'Preparing' })).not.toHaveAttribute(
      'aria-valuenow',
    )
  })
})

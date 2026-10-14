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
    [50, 'bg-(--theme-accent)'],
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

  it('shows a detail line', () => {
    render(<Meter value={45} label="Memory" detail="4.5 / 10 GB" />)
    expect(screen.getByText('4.5 / 10 GB')).toBeInTheDocument()
  })
})

describe('levelTone', () => {
  it('rises with the value', () => {
    expect(levelTone(10, 80, 90)).toBe('accent')
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

  it('is indeterminate without a value', () => {
    render(<ProgressBar value={null} aria-label="Preparing" />)
    expect(screen.getByRole('progressbar', { name: 'Preparing' })).not.toHaveAttribute(
      'aria-valuenow',
    )
  })
})

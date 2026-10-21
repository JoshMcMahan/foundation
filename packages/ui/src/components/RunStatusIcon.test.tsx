// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { hoverTooltip } from '../test/tooltip'
import { UIProvider } from './Provider'
import { RunStatusIcon, runStatusTone } from './RunStatusIcon'
import { TooltipProvider } from './Tooltip'

describe('RunStatusIcon', () => {
  it('is named by the host’s status label', () => {
    render(
      <UIProvider strings={{ dag: { statusLabel: (status) => `Status: ${status}` } }}>
        <RunStatusIcon status="failed" />
      </UIProvider>,
    )
    expect(screen.getByRole('img', { name: 'Status: failed' })).toBeInTheDocument()
  })

  it('stays out of the accessibility tree when a status has no name', () => {
    const { container } = render(<RunStatusIcon status="" />)
    expect(screen.queryByRole('img')).toBeNull()
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true')
  })

  it('takes a label the host gives it over the status’s own', () => {
    render(<RunStatusIcon status="running" label="Provisioning" />)
    expect(screen.getByRole('img', { name: 'Provisioning' })).toHaveAttribute(
      'data-status',
      'running',
    )
  })

  it('shows its name on hover when asked to', async () => {
    render(
      <TooltipProvider>
        <RunStatusIcon status="pending" label="Queued" tooltip />
      </TooltipProvider>,
    )
    expect(await hoverTooltip(screen.getByRole('img', { name: 'Queued' }))).toHaveTextContent(
      'Queued',
    )
  })

  it('shows a run under way in info blue, keeping amber for warnings', () => {
    expect(runStatusTone('running')).toBe('info')
    expect(runStatusTone('warning')).toBe('warning')
    expect(runStatusTone('pending')).toBe('muted')
  })

  it('gives a badge the tone its icon shows', () => {
    expect(runStatusTone('completed')).toBe('success')
    expect(runStatusTone('faulted')).toBe('error')
    expect(runStatusTone(undefined)).toBe('muted')
  })

  it('shows an ended status solid and an open one as a ring', () => {
    const { container } = render(
      <>
        <RunStatusIcon status="completed" />
        <RunStatusIcon status="failed" />
        <RunStatusIcon status="canceled" />
        <RunStatusIcon status="warning" />
        <RunStatusIcon status="running" />
        <RunStatusIcon status="faulted" />
        <RunStatusIcon status="pending" />
        <RunStatusIcon status="" />
      </>,
    )
    const looks = [...container.querySelectorAll('svg')].map((svg) =>
      svg.getAttribute('data-status-icon'),
    )
    expect(looks).toEqual(['filled', 'filled', 'filled', 'filled', 'ring', 'ring', null, null])
    // Not run is the faint ring; nothing turns the whole icon any more.
    expect(container.querySelectorAll('svg')[7]).toHaveClass('opacity-55')
    expect(container.querySelector('.animate-spin')).toBeNull()
  })
})

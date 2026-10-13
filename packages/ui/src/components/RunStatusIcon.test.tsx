// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { UIProvider } from './Provider'
import { RunStatusIcon, runStatusTone } from './RunStatusIcon'

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

  it('gives a badge the tone its icon shows', () => {
    expect(runStatusTone('completed')).toBe('success')
    expect(runStatusTone('faulted')).toBe('error')
    expect(runStatusTone(undefined)).toBe('muted')
  })
})

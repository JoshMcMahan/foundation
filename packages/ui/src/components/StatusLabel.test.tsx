// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { UIProvider } from './Provider'
import { RunStatusLabel, runStatusLook, StatusLabel } from './StatusLabel'

describe('StatusLabel', () => {
  it('names the state beside a lamp, which is not read twice', () => {
    const { container } = render(<StatusLabel variant="success">Running</StatusLabel>)
    const label = screen.getByText('Running')
    expect(label).toHaveClass('truncate')
    expect(label.parentElement).toHaveClass('text-(--theme-muted-text-color)')
    expect(container.querySelector('[data-lamp]')).toHaveAttribute('data-lamp', 'lit')
    expect(container.querySelector('[data-lamp]')?.parentElement).toHaveAttribute(
      'aria-hidden',
      'true',
    )
    expect(label.parentElement).toHaveAccessibleName('')
  })

  it('shows an unlit lamp for something off', () => {
    const { container } = render(<StatusLabel off>Offline</StatusLabel>)
    expect(container.querySelector('[data-lamp]')).toHaveAttribute('data-lamp', 'off')
  })

  it('hides an icon in place of the lamp', () => {
    render(<StatusLabel icon={<svg role="img" aria-label="ok" />}>Ready</StatusLabel>)
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getByText('Ready')).toBeVisible()
  })
})

describe('RunStatusLabel', () => {
  it('names the status beside its icon, which is not read twice', () => {
    const { container } = render(<RunStatusLabel status="canceling" />)
    expect(screen.getByText('Canceling')).toBeInTheDocument()
    const icon = container.querySelector('[data-status]')
    expect(icon).toHaveAttribute('data-status', 'canceling')
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('names an error, a fault and a failure as failed', () => {
    render(
      <>
        <RunStatusLabel status="error" />
        <RunStatusLabel status="faulted" />
        <RunStatusLabel status="failed" />
      </>,
    )
    expect(screen.getAllByText('Failed')).toHaveLength(3)
  })

  it('names every status the icon draws', () => {
    render(
      ['pending', 'started', 'warning', 'skipped', 'skipped-failed', '', undefined].map(
        (status) => (
          <RunStatusLabel key={String(status)} status={status} fallback={() => 'unused'} />
        ),
      ),
    )
    expect(screen.getByText('Queued')).toBeInTheDocument()
    expect(screen.getByText('Running')).toBeInTheDocument()
    expect(screen.getByText('Warning')).toBeInTheDocument()
    expect(screen.getAllByText('Skipped')).toHaveLength(2)
    expect(screen.getAllByText('Not run')).toHaveLength(2)
    expect(screen.queryByText('unused')).toBeNull()
  })

  it('shows a status the icon doesn’t know as the server sent it, or as the host says', () => {
    render(
      <>
        <RunStatusLabel status="archived" />
        <RunStatusLabel status="provisioning" fallback={() => 'Provisioning'} />
      </>,
    )
    expect(screen.getByText('archived')).toBeInTheDocument()
    expect(screen.getByText('Provisioning')).toBeInTheDocument()
    expect(runStatusLook('archived')).toBe('')
    expect(runStatusLook('pending')).toBe('pending')
  })

  it('takes its names from the host', () => {
    render(
      <UIProvider strings={{ runStatus: { running: 'En cours' } }}>
        <RunStatusLabel status="running" />
      </UIProvider>,
    )
    expect(screen.getByText('En cours')).toBeInTheDocument()
  })
})

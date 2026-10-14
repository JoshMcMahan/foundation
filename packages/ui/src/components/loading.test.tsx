// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Loader } from './Loader'
import { RefreshButton } from './RefreshButton'
import { LoadingRegion, Skeleton } from './Skeleton'

describe('Skeleton', () => {
  it('draws hidden shapes, one per count, at the size asked for', () => {
    const { container } = render(<Skeleton count={3} width={120} height="50%" />)
    const shapes = container.querySelectorAll('[aria-hidden="true"]')
    expect(shapes).toHaveLength(3)
    expect(shapes[0]).toHaveStyle({ width: '120px', height: '50%' })
  })

  it('makes a circle as wide as it is tall', () => {
    const { container } = render(<Skeleton circle height={40} />)
    expect(container.firstChild).toHaveStyle({ width: '40px', height: '40px' })
    expect(container.firstChild).toHaveClass('rounded-full')
  })
})

describe('LoadingRegion', () => {
  it('says once that its contents are loading', () => {
    render(
      <LoadingRegion>
        <Skeleton count={4} />
      </LoadingRegion>,
    )
    expect(screen.getByRole('status', { name: 'Loading…' })).toHaveTextContent('Loading…')
  })
})

describe('Loader', () => {
  it('is named by its label, which it shows', () => {
    render(<Loader label="Loading logs" />)
    expect(screen.getByRole('status', { name: 'Loading logs' })).toHaveTextContent('Loading logs')
  })

  it('falls back to the provider’s loading string', () => {
    render(<Loader />)
    expect(screen.getByRole('status', { name: 'Loading…' })).toBeInTheDocument()
  })
})

describe('RefreshButton', () => {
  it('spins and announces until the refresh it started settles', async () => {
    let settle = () => {}
    const onRefresh = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          settle = resolve
        }),
    )
    render(<RefreshButton onRefresh={onRefresh} />)
    const button = screen.getByRole('button', { name: 'Refresh' })
    fireEvent.click(button)
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('status')).toHaveTextContent('Refreshing')
    // A press while busy starts nothing more.
    fireEvent.click(button)
    expect(onRefresh).toHaveBeenCalledOnce()
    await act(async () => settle())
    await waitFor(() => expect(button).toHaveAttribute('aria-busy', 'false'))
    expect(screen.getByRole('status')).toHaveTextContent('')
  })

  it('spins for a refresh the host tracks', () => {
    render(<RefreshButton onRefresh={() => {}} refreshing />)
    expect(screen.getByRole('button', { name: 'Refresh' })).toHaveAttribute('aria-busy', 'true')
  })

  it('says how long ago the data was fetched', () => {
    render(<RefreshButton onRefresh={() => {}} updatedAt={Date.now() - 5 * 60_000} />)
    expect(screen.getByRole('button')).toHaveTextContent('Updated 5 minutes ago')
    // Named for what it does, not only for when the data is from.
    expect(screen.getByRole('button')).toHaveAccessibleName(/^Refresh\W+Updated 5 minutes ago$/)
  })

  it('keeps its name when only the icon shows', () => {
    render(<RefreshButton onRefresh={() => {}} iconOnly />)
    expect(screen.getByRole('button', { name: 'Refresh' })).toHaveTextContent('')
  })
})

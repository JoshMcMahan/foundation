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

  it('stops spinning when the refresh fails, leaving the failure to the host', async () => {
    let fail = (_: Error) => {}
    const refresh = new Promise<void>((_, reject) => {
      fail = reject
    })
    // The host holds the promise it returned and reports the failure itself.
    refresh.catch(() => {})
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    try {
      render(<RefreshButton onRefresh={() => refresh} />)
      const button = screen.getByRole('button', { name: 'Refresh' })
      fireEvent.click(button)
      expect(button).toHaveAttribute('aria-busy', 'true')
      await act(async () => fail(new Error('offline')))
      await waitFor(() => expect(button).toHaveAttribute('aria-busy', 'false'))
      // Rejections are reported after the microtasks that could still handle them.
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(unhandled).not.toHaveBeenCalled()
    } finally {
      process.off('unhandledRejection', unhandled)
    }
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

  it('reads "Refreshing" while busy, keeping its name', () => {
    render(<RefreshButton onRefresh={() => {}} refreshing />)
    const button = screen.getByRole('button', { name: 'Refresh' })
    expect(button).toHaveTextContent('Refreshing')
  })

  it('takes any time value, and a class of its own', () => {
    render(
      <RefreshButton
        onRefresh={() => {}}
        variant="inline"
        className="-mx-1"
        updatedAt={new Date(Date.now() - 2 * 60_000).toISOString()}
      />,
    )
    expect(screen.getByRole('button')).toHaveTextContent('Updated 2 minutes ago')
    expect(screen.getByRole('button')).toHaveClass('-mx-1')
  })

  it('keeps its name when only the icon shows', () => {
    render(<RefreshButton onRefresh={() => {}} iconOnly />)
    expect(screen.getByRole('button', { name: 'Refresh' })).toHaveTextContent('')
  })
})

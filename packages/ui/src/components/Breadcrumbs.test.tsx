// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { type Breadcrumb, Breadcrumbs } from './Breadcrumbs'

const folders: Breadcrumb[] = [
  { label: 'bucket' },
  { label: 'datasets' },
  { label: '2026' },
  { label: 'october' },
]

/** jsdom lays nothing out: make the trail's natural width exceed its room. */
function tooWide() {
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(1000)
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(300)
}

afterEach(() => vi.restoreAllMocks())

describe('Breadcrumbs', () => {
  it('names its landmark and marks where the reader is, without a heading of its own', () => {
    render(<Breadcrumbs crumbs={[{ label: 'Clusters', href: '/clusters' }, { label: 'gpu-a' }]} />)
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(nav).getByRole('link', { name: 'Clusters' })).toHaveAttribute('href', '/clusters')
    expect(nav.querySelector('[aria-current]')).toHaveAttribute('aria-current', 'page')
    expect(nav.querySelector('[aria-current]')).toHaveTextContent(/^gpu-a$/)
    expect(screen.queryByRole('heading')).toBeNull()
  })

  it('makes the last crumb the page’s h1 when asked', () => {
    render(
      <Breadcrumbs
        crumbs={[{ label: 'Clusters', href: '/clusters' }, { label: 'gpu-a' }]}
        heading
      />,
    )
    const title = screen.getByRole('heading', { level: 1 })
    expect(title).toHaveTextContent('gpu-a')
    expect(title).toHaveAttribute('aria-current', 'page')
  })

  it('marks a place within the page and takes the host’s name', () => {
    render(<Breadcrumbs crumbs={folders} current="location" label="Location" />)
    const nav = screen.getByRole('navigation', { name: 'Location' })
    expect(nav.querySelector('[aria-current]')).toHaveAttribute('aria-current', 'location')
  })

  it('goes to a crumb without an href through onSelect, and leaves one without either as text', () => {
    const onSelect = vi.fn()
    const { rerender } = render(<Breadcrumbs crumbs={folders} onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button', { name: 'datasets' }))
    expect(onSelect).toHaveBeenCalledWith(folders[1], 1)
    // The crumb the reader is on goes nowhere.
    expect(screen.queryByRole('button', { name: 'october' })).toBeNull()

    rerender(<Breadcrumbs crumbs={folders} />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('folds a trail too wide for its room, and goes to a folded crumb through onSelect', () => {
    tooWide()
    const onSelect = vi.fn()
    render(<Breadcrumbs crumbs={folders} onSelect={onSelect} />)
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(nav).queryByRole('button', { name: 'bucket' })).toBeNull()
    fireEvent.click(within(nav).getByRole('button', { name: '2026' }))
    expect(onSelect).toHaveBeenLastCalledWith(folders[2], 2)

    fireEvent.click(within(nav).getByRole('button', { name: 'Show full path' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'datasets' }))
    expect(onSelect).toHaveBeenLastCalledWith(folders[1], 1)
  })

  it('shows a folded crumb that goes nowhere as a disabled row', () => {
    tooWide()
    render(<Breadcrumbs crumbs={folders} />)
    fireEvent.click(screen.getByRole('button', { name: 'Show full path' }))
    expect(screen.getByRole('menuitem', { name: 'bucket' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })

  it('fits again when an item joins its row', async () => {
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(250)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(300)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      return { width: this.getAttribute('data-testid') === 'actions' ? 100 : 0 } as DOMRect
    })
    const Row = ({ actions }: { actions: boolean }) => (
      <div style={{ display: 'flex' }}>
        <Breadcrumbs crumbs={folders} />
        {actions && <span data-testid="actions" />}
      </div>
    )
    const { rerender } = render(<Row actions={false} />)
    expect(screen.queryByRole('button', { name: 'Show full path' })).toBeNull()

    rerender(<Row actions />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Show full path' })).toBeInTheDocument(),
    )
  })
})

describe('crumb icons', () => {
  it('draws an icon before a crumb’s label, out of its name', () => {
    render(
      <Breadcrumbs
        crumbs={[
          { label: 'Projects', href: '/projects', icon: <svg data-testid="projects-icon" /> },
          { label: 'Atlas' },
        ]}
      />,
    )
    const link = screen.getByRole('link', { name: 'Projects' })
    expect(link).toContainElement(screen.getByTestId('projects-icon'))
  })
})

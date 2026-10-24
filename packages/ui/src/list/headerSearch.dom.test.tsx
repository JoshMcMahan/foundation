// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { PageHeader, PageHeaderBar, PageHeaderProvider } from '../components/PageHeader'
import { PageHeaderAction, PageHeaderAddButton } from '../components/PageHeaderAction'
import { memoryStorage } from '../test/storage'
import { ListToolbar } from './ListToolbar'
import { useListSearch } from './listSearch'

const Icon = ({ className }: { className?: string }) => <svg className={className} />

beforeEach(() => {
  Object.defineProperty(window, 'localStorage', { value: memoryStorage(), configurable: true })
})
afterEach(() => vi.restoreAllMocks())

// A bar `barWidth` wide: the search button 28px, its field 288px, and each action 100px, with
// the bar's 4px gaps between the actions.
function layOut(barWidth: number) {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.classList.contains('h-12') ? barWidth : 0
  })
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const el = this as HTMLElement
    const search = (control: Element | null | undefined) =>
      control?.tagName === 'BUTTON' ? 28 : control ? 288 : 0
    let width = 0
    if (el.parentElement?.dataset['headerAction'] !== undefined) {
      width = 100
    } else if (el.parentElement?.dataset['headerSearch'] !== undefined) {
      width = search(el)
    } else if (el.parentElement?.classList.contains('h-12') && !el.querySelector('nav')) {
      const shown = [...el.querySelectorAll('[data-header-action]')].filter(
        (item) => !item.hasAttribute('hidden'),
      ).length
      const menu = el.querySelector('[aria-label="More actions"]') ? 1 : 0
      width =
        search(el.querySelector('[data-header-search]')?.firstElementChild) +
        shown * 100 +
        menu * 24 +
        (shown + menu) * 4
    }
    return { width, height: 24, top: 0, left: 0, right: width, bottom: 24 } as DOMRect
  })
}

function AllocationsHeader() {
  const search = useListSearch(true, 'test-allocations')
  return (
    <PageHeaderProvider>
      <header data-testid="bar">
        <PageHeaderBar />
      </header>
      <PageHeader
        breadcrumbs={[
          { label: 'Billing', href: '/billing' },
          { label: 'Budgets', href: '/billing/budgets' },
          { label: 'Research computing' },
        ]}
        actions={
          <>
            <ListToolbar search={search} searchLabel="Search allocations" />
            <PageHeaderAction icon={Icon} label="Edit allocations" onClick={() => {}} />
            <PageHeaderAddButton label="New allocation" onClick={() => {}} />
          </>
        }
      />
      <p data-testid="query">{search.filter}</p>
    </PageHeaderProvider>
  )
}

const bar = () => within(screen.getByTestId('bar'))
const trail = () => bar().getByRole('navigation', { name: 'Breadcrumb', hidden: true })
const searchButton = () => bar().getByRole('button', { name: /^Search allocations/, hidden: true })
const field = () => screen.getByRole('textbox', { name: 'Search allocations' })
/** The layer over the bar's row that a search takes the bar in. */
const row = () => (trail().parentElement as HTMLElement).parentElement as HTMLElement
const cover = () => row().lastElementChild as HTMLElement

describe('a list search in a narrow page header', () => {
  it('takes the whole bar, covering the trail and the other controls', async () => {
    layOut(360)
    render(<AllocationsHeader />)
    fireEvent.click(searchButton())
    await waitFor(() => expect(field()).toHaveFocus())
    expect(cover()).toContainElement(field())
    // The trail, the other controls and the page's actions are hidden and can't be reached.
    const lead = trail().parentElement as HTMLElement
    const end = searchButton().closest('[inert]')
    expect(lead).toHaveAttribute('inert')
    expect(lead).toHaveClass('invisible')
    expect(end).not.toBeNull()
    expect(end).toHaveClass('invisible')
    expect(end).toContainElement(searchButton())
  })

  it('gives the bar back exactly when it closes, focus on the search button', async () => {
    layOut(360)
    render(<AllocationsHeader />)
    // The bar's markup, but for the tooltip the focused button opens.
    const markup = () => row().innerHTML.replaceAll(' data-popup-open=""', '')
    const before = markup()
    fireEvent.click(searchButton())
    await waitFor(() => expect(field()).toHaveFocus())
    fireEvent.keyDown(field(), { key: 'Escape' })
    await waitFor(() => expect(searchButton()).toHaveFocus())
    expect(screen.queryByRole('textbox')).toBeNull()
    const lead = trail().parentElement as HTMLElement
    expect(lead).not.toHaveAttribute('inert')
    expect(lead).not.toHaveClass('invisible')
    expect(markup()).toBe(before)
  })

  it('closes from its clear button too, handing focus back', async () => {
    layOut(360)
    render(<AllocationsHeader />)
    fireEvent.keyDown(window, { key: '/' })
    await waitFor(() => expect(field()).toHaveFocus())
    fireEvent.change(field(), { target: { value: 'gen' } })
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    await waitFor(() => expect(searchButton()).toHaveFocus())
    expect(trail().parentElement).not.toHaveAttribute('inert')
  })

  it('keeps a term on when it closes, and its button says so', async () => {
    layOut(360)
    render(<AllocationsHeader />)
    fireEvent.click(searchButton())
    await waitFor(() => expect(field()).toHaveFocus())
    fireEvent.change(field(), { target: { value: 'gen' } })
    fireEvent.keyDown(field(), { key: 'Enter' })
    fireEvent.keyDown(field(), { key: 'Escape' })
    const button = await waitFor(() =>
      bar().getByRole('button', { name: 'Search allocations, on' }),
    )
    await waitFor(() => expect(button).toHaveFocus())
    expect(screen.queryByRole('textbox')).toBeNull()
    // Opening it again shows the term.
    fireEvent.click(button)
    await waitFor(() => expect(field()).toHaveFocus())
    expect(screen.getByRole('button', { name: 'Remove filter gen' })).toBeInTheDocument()
  })
})

describe('a list search in a wide page header', () => {
  it('opens in place, beside the trail', async () => {
    layOut(1200)
    render(<AllocationsHeader />)
    fireEvent.click(searchButton())
    await waitFor(() => expect(field()).toHaveFocus())
    expect(cover()).toBeEmptyDOMElement()
    expect(trail().parentElement).not.toHaveAttribute('inert')
    expect(bar().getByRole('button', { name: 'Edit allocations' })).toBeVisible()
    fireEvent.keyDown(field(), { key: 'Escape' })
    await waitFor(() => expect(searchButton()).toHaveFocus())
  })
})

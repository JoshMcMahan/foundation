// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { Pagination, pageSteps } from './Pagination'
import { UIProvider, type UIStrings } from './Provider'

it('shows where the page sits and steps to the next', () => {
  const onPageChange = vi.fn()
  render(<Pagination page={1} pageSize={50} total={120} onPageChange={onPageChange} />)
  expect(screen.getByRole('navigation', { name: 'Pagination' })).toHaveTextContent('51–100 of 120')
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  expect(onPageChange).toHaveBeenCalledWith(2)
})

it('shows a capped total as a floor and keeps paging past it', () => {
  render(<Pagination page={200} pageSize={50} total={10000} hasNext onPageChange={() => {}} />)
  expect(screen.getByText('10001–10050 of 10050+')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Next' })).not.toHaveAttribute('aria-disabled')
})

it('passes a translated pager the floor as a number and flags it', () => {
  const pager = vi.fn<UIStrings['list']['pager']>(() => '')
  const { rerender } = render(
    <UIProvider strings={{ list: { pager } }}>
      <Pagination page={200} pageSize={50} total={10000} hasNext onPageChange={() => {}} />
    </UIProvider>,
  )
  expect(pager).toHaveBeenLastCalledWith(10001, 10050, 10050, true)

  rerender(
    <UIProvider strings={{ list: { pager } }}>
      <Pagination page={1} pageSize={50} total={120} hasNext={false} onPageChange={() => {}} />
    </UIProvider>,
  )
  expect(pager).toHaveBeenLastCalledWith(51, 100, 120, false)
})

it('pages a list with no total by whether more follow, under its own summary', () => {
  render(
    <Pagination
      page={0}
      pageSize={25}
      hasNext
      summary="Runs since Monday"
      onPageChange={() => {}}
    />,
  )
  expect(screen.getByText('Runs since Monday')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Previous' })).toHaveAttribute('aria-disabled', 'true')
  expect(screen.getByRole('button', { name: 'Next' })).not.toHaveAttribute('aria-disabled')
})

it('keeps focus on a step that reaches the end, which then does nothing', () => {
  const onPageChange = vi.fn()
  function Pager() {
    const [page, setPage] = useState(1)
    return (
      <Pagination
        page={page}
        pageSize={50}
        total={120}
        onPageChange={(to) => {
          onPageChange(to)
          setPage(to)
        }}
      />
    )
  }
  render(<Pager />)
  const next = screen.getByRole('button', { name: 'Next' })
  next.focus()
  fireEvent.click(next)
  expect(screen.getByRole('button', { name: 'Next' })).toBe(next)
  expect(next).toHaveFocus()
  expect(next).toHaveAttribute('aria-disabled', 'true')
  expect(next).not.toBeDisabled()
  fireEvent.click(next)
  expect(onPageChange).toHaveBeenCalledTimes(1)
})

it('is named by its label, so two pagers on a page tell apart', () => {
  render(
    <>
      <Pagination label="Pages of users" page={0} pageSize={50} total={120} />
      <Pagination label="Pages of groups" page={0} pageSize={50} total={120} />
    </>,
  )
  expect(screen.getByRole('navigation', { name: 'Pages of users' })).toBeInTheDocument()
  expect(screen.getByRole('navigation', { name: 'Pages of groups' })).toBeInTheDocument()
})

it('reads out where a step or a page size lands, then clears it', () => {
  vi.useFakeTimers()
  try {
    const { rerender } = render(<Pagination page={0} pageSize={50} total={120} />)
    const status = screen.getByRole('status')
    expect(status).toBeEmptyDOMElement()
    rerender(<Pagination page={1} pageSize={50} total={120} />)
    expect(status).toHaveTextContent('51–100 of 120')
    rerender(<Pagination page={0} pageSize={100} total={120} />)
    expect(status).toHaveTextContent('1–100 of 120')
    act(() => vi.advanceTimersByTime(7000))
    expect(status).toBeEmptyDOMElement()
  } finally {
    vi.useRealTimers()
  }
})

it('stays quiet when only the total changes, as a list polls', () => {
  const { rerender } = render(<Pagination page={1} pageSize={50} total={120} />)
  rerender(<Pagination page={1} pageSize={50} total={121} />)
  expect(screen.getByText('51–100 of 121')).toBeInTheDocument()
  expect(screen.getByRole('status')).toBeEmptyDOMElement()
})

it('makes pages links when the address names them', () => {
  render(<Pagination page={2} pageSize={20} total={200} pageHref={(page) => `?page=${page}`} />)
  expect(screen.getByRole('link', { name: 'Previous' })).toHaveAttribute('href', '?page=1')
  expect(screen.getByRole('link', { name: 'Next' })).toHaveAttribute('href', '?page=3')
})

it('stays visible while more rows follow a total that fits one page', () => {
  render(<Pagination page={0} pageSize={50} total={50} hasNext onPageChange={() => {}} />)
  expect(screen.getByText('1–50 of 50+')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Next' })).not.toHaveAttribute('aria-disabled')
})

it('renders nothing for a single page with no more rows', () => {
  const { container } = render(
    <Pagination page={0} pageSize={50} total={30} hasNext={false} onPageChange={() => {}} />,
  )
  expect(container).toBeEmptyDOMElement()
})

describe('page numbers', () => {
  it.each([
    [0, 5, [0, 1, 2, 3, 4]],
    [0, 20, [0, 1, 2, 3, 4, null, 19]],
    [4, 20, [0, null, 3, 4, 5, null, 19]],
    [15, 20, [0, null, 14, 15, 16, null, 19]],
    [16, 20, [0, null, 15, 16, 17, 18, 19]],
  ])('numbers page %i of %i as %j', (page, count, steps) => {
    expect(pageSteps(page, count)).toEqual(steps)
  })

  it('never shows fewer than five steps', () => {
    expect(pageSteps(10, 20, 3)).toEqual([0, null, 10, null, 19])
  })

  it('marks the current page and steps to another, named for each page', () => {
    const onPageChange = vi.fn()
    render(
      <Pagination page={3} pageSize={10} total={200} onPageChange={onPageChange} pageNumbers />,
    )
    // The full window: jsdom applies no container query, so the narrower ones are there too.
    const full = within(screen.getAllByRole('list')[0] as HTMLElement)
    expect(full.getByRole('button', { name: 'Page 4' })).toHaveAttribute('aria-current', 'page')
    fireEvent.click(full.getByRole('button', { name: 'Page 20' }))
    expect(onPageChange).toHaveBeenCalledWith(19)
  })

  it('links each page under pageHref', () => {
    render(
      <Pagination
        page={0}
        pageSize={10}
        total={30}
        pageHref={(page) => `?page=${page + 1}`}
        pageNumbers={{ max: 5 }}
      />,
    )
    expect(screen.getAllByRole('link', { name: 'Page 3' })[0]).toHaveAttribute('href', '?page=3')
  })
})

it("numbers pages in the host's locale, in full", () => {
  render(
    <UIProvider locale="de-DE">
      <Pagination page={1203} pageSize={10} total={20000} onPageChange={() => {}} pageNumbers />
    </UIProvider>,
  )
  expect(screen.getAllByRole('button', { name: 'Page 1204' })[0]).toHaveTextContent('1.204')
})

it('is a slim 32px line with 24px steps that grow under a finger', () => {
  render(<Pagination page={0} pageSize={10} total={30} onPageChange={() => {}} />)
  expect(screen.getByRole('navigation')).toHaveClass('h-8')
  expect(screen.getByRole('button', { name: 'Next' })).toHaveClass(
    'size-6',
    'pointer-coarse:size-8',
  )
})

it('narrows its page numbers as the bar does, down to the page and the count', () => {
  render(<Pagination page={4} pageSize={10} total={120} onPageChange={() => {}} pageNumbers />)
  const [full, narrow] = screen.getAllByRole('list') as HTMLElement[]
  const numbers = (list: HTMLElement | undefined) =>
    within(list as HTMLElement)
      .queryAllByRole('button')
      .map((button) => button.textContent)
  // The full window where the bar has room, a narrower one on a phone: 1 … 5 … 12.
  expect(numbers(full)).toEqual(['1', '4', '5', '6', '12'])
  expect(full).toHaveClass('hidden', '@min-[34rem]/pager:flex')
  expect(numbers(narrow)).toEqual(['1', '5', '12'])
  expect(narrow).toHaveClass('hidden', '@min-[19rem]/pager:flex', '@min-[34rem]/pager:hidden')
  // Narrower still, the page and the count, read whole by a screen reader.
  const count = screen.getByText('Page 5 of 12').parentElement
  expect(count).toHaveTextContent('5 / 12')
  expect(count).toHaveClass('@min-[19rem]/pager:hidden')
  expect(screen.getByRole('navigation')).toHaveClass('@container/pager')
})

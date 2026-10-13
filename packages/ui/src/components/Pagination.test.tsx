// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Pagination } from './Pagination'
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
  expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled()
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
  expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled()
})

it('makes pages links when the address names them', () => {
  render(<Pagination page={2} pageSize={20} total={200} pageHref={(page) => `?page=${page}`} />)
  expect(screen.getByRole('link', { name: 'Previous' })).toHaveAttribute('href', '?page=1')
  expect(screen.getByRole('link', { name: 'Next' })).toHaveAttribute('href', '?page=3')
})

it('stays visible while more rows follow a total that fits one page', () => {
  render(<Pagination page={0} pageSize={50} total={50} hasNext onPageChange={() => {}} />)
  expect(screen.getByText('1–50 of 50+')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled()
})

it('renders nothing for a single page with no more rows', () => {
  const { container } = render(
    <Pagination page={0} pageSize={50} total={30} hasNext={false} onPageChange={() => {}} />,
  )
  expect(container).toBeEmptyDOMElement()
})

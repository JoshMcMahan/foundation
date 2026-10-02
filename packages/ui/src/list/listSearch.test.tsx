// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ListSearchControl, useListSearch } from './listSearch'

function memoryStorage(): Storage {
  const store = new Map<string, string>()
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size
    },
  } as Storage
}

function Harness({ storageKey }: { storageKey?: string }) {
  const search = useListSearch(true, storageKey)
  return (
    <div>
      <ListSearchControl search={search} placeholder="Filter" />
      <div data-testid="queries">{search.queries.join(',')}</div>
    </div>
  )
}

const openSearch = () => fireEvent.click(screen.getByLabelText('Search'))
const getInput = () => screen.getByPlaceholderText('Filter')
const typeAndEnter = (value: string) => {
  fireEvent.change(getInput(), { target: { value } })
  fireEvent.keyDown(getInput(), { key: 'Enter' })
}

describe('list search term chips', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', {
      value: memoryStorage(),
      configurable: true,
    })
  })

  it('commits typed text as a chip on Enter and clears the input', () => {
    render(<Harness storageKey="test-list" />)
    openSearch()
    typeAndEnter('alpha')
    expect(screen.getByLabelText('Remove filter alpha')).toBeInTheDocument()
    expect(getInput()).toHaveValue('')
    typeAndEnter('beta')
    expect(screen.getByTestId('queries')).toHaveTextContent('alpha,beta')
  })

  it('includes the live text alongside committed terms in queries', () => {
    render(<Harness storageKey="test-list" />)
    openSearch()
    typeAndEnter('alpha')
    fireEvent.change(getInput(), { target: { value: 'bet' } })
    expect(screen.getByTestId('queries')).toHaveTextContent('alpha,bet')
  })

  it('does not duplicate terms that differ only by case', () => {
    render(<Harness storageKey="test-list" />)
    openSearch()
    typeAndEnter('alpha')
    typeAndEnter('ALPHA')
    expect(screen.getByTestId('queries')).toHaveTextContent(/^alpha$/)
  })

  it('persists chips across unmount and remount', () => {
    const { unmount } = render(<Harness storageKey="test-list" />)
    openSearch()
    typeAndEnter('alpha')
    unmount()
    render(<Harness storageKey="test-list" />)
    expect(screen.getByLabelText('Remove filter alpha')).toBeInTheDocument()
  })

  it('removes a single chip and removes the last chip with Backspace', () => {
    render(<Harness storageKey="test-list" />)
    openSearch()
    typeAndEnter('alpha')
    typeAndEnter('beta')
    fireEvent.click(screen.getByLabelText('Remove filter alpha'))
    expect(screen.queryByText('alpha')).not.toBeInTheDocument()
    fireEvent.keyDown(getInput(), { key: 'Backspace' })
    expect(screen.queryByText('beta')).not.toBeInTheDocument()
  })

  it('clears all chips and closes with the clear button', () => {
    render(<Harness storageKey="test-list" />)
    openSearch()
    typeAndEnter('alpha')
    typeAndEnter('beta')
    fireEvent.click(screen.getByLabelText('Clear search'))
    expect(screen.queryByText('alpha')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Search')).toBeInTheDocument()
  })

  it('does not create chips without a storage key', () => {
    render(<Harness />)
    openSearch()
    typeAndEnter('alpha')
    expect(getInput()).toHaveValue('alpha')
    expect(screen.getByTestId('queries')).toHaveTextContent(/^alpha$/)
    expect(screen.queryByLabelText('Remove filter alpha')).not.toBeInTheDocument()
  })
})

// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import type { FilterFacet } from './listView'
import { useListView } from './listView'

vi.mock('use-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

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

type Row = { namespace: string; kind: string }

const FACETS: FilterFacet<Row>[] = [
  {
    key: 'namespace',
    label: 'Namespace',
    options: [
      { value: 'alpha', label: 'alpha' },
      { value: 'beta', label: 'beta' },
    ],
    matches: (row, selected) => selected.includes(row.namespace),
    shared: true,
  },
  {
    key: 'kind',
    label: 'Kind',
    options: [
      { value: 'pod', label: 'pod' },
      { value: 'job', label: 'job' },
    ],
    matches: (row, selected) => selected.includes(row.kind),
  },
]

const COLUMNS = [{ key: 'name', label: 'Name' }]

const renderView = (storageKey: string) =>
  renderHook(() =>
    useListView<Row>({
      storageKey,
      sharedFiltersKey: 'section',
      columns: COLUMNS,
      facets: FACETS,
    }),
  )

describe('shared list view filters', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', {
      value: memoryStorage(),
      configurable: true,
    })
  })

  it('shares a shared facet selection across storage keys', () => {
    const pageA = renderView('page-a')
    act(() => pageA.result.current.setFacetValues('namespace', ['alpha']))
    pageA.unmount()
    const pageB = renderView('page-b')
    expect(pageB.result.current.filters['namespace']).toEqual(['alpha'])
  })

  it('keeps non-shared facet selections per page', () => {
    const pageA = renderView('page-a')
    act(() => pageA.result.current.setFacetValues('kind', ['pod']))
    expect(pageA.result.current.filters['kind']).toEqual(['pod'])
    pageA.unmount()
    const pageB = renderView('page-b')
    expect(pageB.result.current.filters['kind']).toBeUndefined()
  })

  it('clears shared selections for every page', () => {
    const pageA = renderView('page-a')
    act(() => pageA.result.current.setFacetValues('namespace', ['alpha']))
    pageA.unmount()
    const pageB = renderView('page-b')
    act(() => pageB.result.current.clearFilters())
    pageB.unmount()
    const pageAAgain = renderView('page-a')
    expect(pageAAgain.result.current.filters['namespace']).toBeUndefined()
    expect(pageAAgain.result.current.activeFilterCount).toBe(0)
  })

  it('applies merged shared and local filters to rows', () => {
    const view = renderView('page-a')
    act(() => view.result.current.setFacetValues('namespace', ['alpha']))
    act(() => view.result.current.setFacetValues('kind', ['pod']))
    const rows: Row[] = [
      { namespace: 'alpha', kind: 'pod' },
      { namespace: 'alpha', kind: 'job' },
      { namespace: 'beta', kind: 'pod' },
    ]
    expect(view.result.current.applyFilters(rows)).toEqual([{ namespace: 'alpha', kind: 'pod' }])
    expect(view.result.current.activeFilterCount).toBe(2)
  })

  it('ignores stale local copies of shared facet keys', () => {
    window.localStorage.setItem('page-a:filters', JSON.stringify({ namespace: ['beta'] }))
    const view = renderView('page-a')
    expect(view.result.current.filters['namespace']).toBeUndefined()
  })
})

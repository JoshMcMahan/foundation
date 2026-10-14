// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { memoryStorage } from '../test/storage'
import type { FilterFacet } from './listView'
import { useListView } from './listView'

vi.mock('use-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

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

describe('stacked columns', () => {
  it('stacks columns without a priority by default, except the first and any set not to', () => {
    const { result } = renderHook(() =>
      useListView<{ id: string }>({
        storageKey: 'stack-test',
        columns: [
          { key: 'name', label: 'Name', alwaysVisible: true },
          { key: 'status', label: 'Status' },
          { key: 'total', label: 'Total', stack: false },
          { key: 'owner', label: 'Owner', priority: 'low' },
        ],
      }),
    )
    // The first is what others stack under; a priority drops instead; stack: false stays a column.
    expect(result.current.columnStacks).toEqual([false, true, false, false])
    expect(result.current.columnClasses).toEqual([
      '',
      'hidden @[36rem]:table-cell',
      '',
      'hidden @[52rem]:table-cell',
    ])
  })
})

describe('ordering', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', { value: memoryStorage(), configurable: true })
  })

  const ORDERS = [
    { value: 'name', label: 'Name', compare: () => 0 },
    { value: 'size', label: 'Size', compare: () => 0 },
  ]

  it('sortBy orders by a new value ascending and flips the current one', () => {
    const { result } = renderHook(() =>
      useListView<Row>({ storageKey: 'order', columns: COLUMNS, orderBys: ORDERS }),
    )
    act(() => result.current.toggleOrderDir())
    expect(result.current.orderDir).toBe('desc')
    act(() => result.current.sortBy('size'))
    expect([result.current.orderBy, result.current.orderDir]).toEqual(['size', 'asc'])
    act(() => result.current.sortBy('size'))
    expect([result.current.orderBy, result.current.orderDir]).toEqual(['size', 'desc'])
  })
})

describe('column headers', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', { value: memoryStorage(), configurable: true })
  })

  const headers = (defaultShowColumnHeaders?: boolean) =>
    renderHook(() =>
      useListView<Row>({
        storageKey: 'headers',
        columns: COLUMNS,
        ...(defaultShowColumnHeaders !== undefined && { defaultShowColumnHeaders }),
      }),
    ).result

  it('show by default', () => {
    expect(headers().current.showColumnHeaders).toBe(true)
  })

  it('stay hidden on a page that hides them', () => {
    expect(headers(false).current.showColumnHeaders).toBe(false)
  })

  it('follow what the user chose over the default', () => {
    window.localStorage.setItem('headers:showColumnHeaders', 'false')
    expect(headers().current.showColumnHeaders).toBe(false)
  })
})

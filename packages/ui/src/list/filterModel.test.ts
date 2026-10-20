import { describe, expect, it } from 'vitest'
import {
  type ActiveFilter,
  applyFilterList,
  dateFilterRange,
  decodeFilters,
  encodeFilters,
  type FilterField,
  fromStored,
  sameFilters,
  toStored,
  withFilterParams,
} from './filterModel'

interface Row {
  status: string
  labels: string[]
  assignee: string | null
  due: string | null
  title: string
}

const FIELDS: FilterField<Row>[] = [
  { key: 'status', label: 'Status', kind: 'enum', value: (r) => r.status },
  {
    key: 'label',
    label: 'Label',
    kind: 'enum',
    operators: ['is', 'isNot', 'includesAll'],
    value: (r) => r.labels,
  },
  { key: 'assignee', label: 'Assignee', kind: 'people', value: (r) => r.assignee },
  { key: 'due', label: 'Due', kind: 'date', value: (r) => r.due },
  { key: 'title', label: 'Title', kind: 'text', value: (r) => r.title },
]

const ROWS: Row[] = [
  { status: 'started', labels: ['bug'], assignee: 'maya', due: '2026-10-05', title: 'Fix login' },
  {
    status: 'done',
    labels: ['bug', 'perf'],
    assignee: null,
    due: '2026-10-20',
    title: 'Speed up search',
  },
  { status: 'todo', labels: ['docs'], assignee: 'jonas', due: null, title: 'Write guide' },
]

describe('URL params', () => {
  it('read as the filters say', () => {
    const filters: ActiveFilter[] = [
      { field: 'status', op: 'is', values: ['started', 'done'] },
      { field: 'label', op: 'isNot', values: ['bug'] },
      { field: 'due', op: 'between', values: ['2026-10-01', '2026-10-31'] },
      { field: 'assignee', op: 'isNotSet', values: [] },
      { field: 'title', op: 'contains', values: ['a,b'] },
    ]
    const params = new URLSearchParams(encodeFilters(filters))
    expect(decodeURIComponent(params.toString())).toBe(
      'status=started,done&label!=bug&due>=2026-10-01&due<=2026-10-31&assignee!=_set&title~=a%2Cb',
    )
    expect(decodeFilters(params, FIELDS)).toEqual(filters)
  })

  it('read a plain value as "is", as links made before conditions do', () => {
    expect(decodeFilters(new URLSearchParams('label=bug&page=2'), FIELDS)).toEqual([
      { field: 'label', op: 'is', values: ['bug'] },
    ])
  })

  it('hold no filters when no field is named, so the remembered ones apply', () => {
    expect(decodeFilters(new URLSearchParams('page=2'), FIELDS)).toBeNull()
  })

  it('read one end of a date range', () => {
    expect(decodeFilters({ 'due<': '2026-10-31' }, FIELDS)).toEqual([
      { field: 'due', op: 'before', values: ['2026-10-31'] },
    ])
  })

  it('replace the fields’ params and keep the rest', () => {
    expect(
      withFilterParams(
        { page: '2', 'label!': 'old' },
        [{ field: 'status', op: 'is', values: ['done'] }],
        FIELDS,
      ),
    ).toEqual({ page: '2', status: 'done' })
  })
})

describe('storage', () => {
  it('keeps the shape earlier versions wrote for "is"', () => {
    const filters: ActiveFilter[] = [
      { field: 'status', op: 'is', values: ['done'] },
      { field: 'label', op: 'isNot', values: ['bug'] },
    ]
    expect(toStored(filters)).toEqual({ status: ['done'], label: { op: 'isNot', values: ['bug'] } })
    expect(fromStored(toStored(filters))).toEqual(filters)
    expect(fromStored({ owner: ['alice'] })).toEqual([
      { field: 'owner', op: 'is', values: ['alice'] },
    ])
  })
})

describe('matching', () => {
  const titles = (filters: ActiveFilter[], now?: Date) =>
    applyFilterList(ROWS, filters, FIELDS, now).map((r) => r.title)

  it('matches each condition', () => {
    expect(titles([{ field: 'label', op: 'isNot', values: ['bug'] }])).toEqual(['Write guide'])
    expect(titles([{ field: 'label', op: 'includesAll', values: ['bug', 'perf'] }])).toEqual([
      'Speed up search',
    ])
    expect(titles([{ field: 'assignee', op: 'isNotSet', values: [] }])).toEqual(['Speed up search'])
    expect(titles([{ field: 'title', op: 'contains', values: ['GUIDE'] }])).toEqual(['Write guide'])
    expect(
      titles([
        { field: 'status', op: 'is', values: ['started', 'done'] },
        { field: 'label', op: 'is', values: ['perf'] },
      ]),
    ).toEqual(['Speed up search'])
  })

  it('keeps relative dates relative', () => {
    const now = new Date(2026, 9, 21)
    expect(titles([{ field: 'due', op: 'is', values: ['-7d'] }], now)).toEqual(['Speed up search'])
    expect(titles([{ field: 'due', op: 'is', values: ['month'] }], now)).toEqual([
      'Fix login',
      'Speed up search',
    ])
    expect(titles([{ field: 'due', op: 'before', values: ['2026-10-05'] }], now)).toEqual([
      'Fix login',
    ])
    expect(dateFilterRange({ field: 'due', op: 'is', values: ['today'] }, now)).toEqual({
      from: new Date(2026, 9, 21),
      to: new Date(2026, 9, 22),
    })
  })

  it('ignores a filter still waiting for a value', () => {
    expect(titles([{ field: 'status', op: 'is', values: [] }])).toHaveLength(3)
  })
})

describe('sameFilters', () => {
  it('ignores order', () => {
    expect(
      sameFilters(
        [
          { field: 'a', op: 'is', values: ['1', '2'] },
          { field: 'b', op: 'isNot', values: ['x'] },
        ],
        [
          { field: 'b', op: 'isNot', values: ['x'] },
          { field: 'a', op: 'is', values: ['2', '1'] },
        ],
      ),
    ).toBe(true)
    expect(
      sameFilters(
        [{ field: 'a', op: 'is', values: ['1'] }],
        [{ field: 'a', op: 'isNot', values: ['1'] }],
      ),
    ).toBe(false)
  })
})

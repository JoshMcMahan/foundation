// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { UIProvider } from '../components/Provider'
import { memoryStorage } from '../test/storage'
import type { ActiveFilter } from './filterModel'
import { ListFilterBar } from './ListFilterBar'
import { ListPage } from './ListPage'
import { ListFilterMenu } from './ListViewControls'
import { useListView } from './listView'

type Row = { status: string; owner: string }

const ROWS: Row[] = [
  { status: 'running', owner: 'alice' },
  { status: 'stopped', owner: 'bob' },
  { status: 'running', owner: 'carol' },
]

function Harness({
  defaultFilters,
  required = false,
  storageKey = 'bar',
}: {
  defaultFilters?: ActiveFilter[]
  required?: boolean
  storageKey?: string
}) {
  const view = useListView<Row>({
    storageKey,
    columns: [{ key: 'name', label: 'Name', alwaysVisible: true }],
    facets: [
      {
        key: 'status',
        label: 'Status',
        options: [
          { value: 'running', label: 'Running' },
          { value: 'stopped', label: 'Stopped' },
        ],
        matches: (row, selected) => selected.includes(row.status),
      },
    ],
    filterFields: [
      {
        key: 'owner',
        label: 'Owner',
        kind: 'people',
        required,
        options: ['alice', 'bob', 'carol'].map((o) => ({ value: o, label: o })),
        value: (row) => row.owner,
      },
    ],
    defaultFilters,
  })
  const rows = view.applyFilters(ROWS)
  return (
    <ListPage view={view} toolbar={<ListFilterMenu view={view} />}>
      <output data-testid="rows">{rows.map((r) => r.owner).join(',')}</output>
    </ListPage>
  )
}

const rows = () => screen.getByTestId('rows').textContent

// The chip opens its picker a frame after it is asked to.
async function nextFrame() {
  await act(() => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined))))
}

beforeEach(() => {
  Object.defineProperty(window, 'localStorage', { value: memoryStorage(), configurable: true })
})

describe('the filter row', () => {
  it('shows nothing until a filter is on', () => {
    render(<Harness />)
    expect(screen.queryByRole('group', { name: 'Active filters' })).not.toBeInTheDocument()
  })

  it('adds a filter from the Filter button: its chip appears and its values open on it', async () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Owner' }))
    const chip = await screen.findByRole('group', { name: /Owner/ })
    expect(chip).toBeInTheDocument()
    await nextFrame()
    fireEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'bob' }))
    expect(rows()).toBe('bob')
    expect(screen.getByRole('group', { name: 'Owner is bob' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Filter, 1 on' })).toBeInTheDocument()
  })

  it('words the condition for how many values follow, and turns it to "is none of"', async () => {
    localStorage.setItem('bar:filters', JSON.stringify({ status: ['running', 'stopped'] }))
    render(<Harness />)
    const chip = screen.getByRole('group', { name: 'Status is any of Running, Stopped' })
    fireEvent.click(within(chip).getByRole('button', { name: 'Condition: is any of' }))
    fireEvent.click(await screen.findByRole('menuitemradio', { name: 'is none of' }))
    expect(
      screen.getByRole('group', { name: 'Status is none of Running, Stopped' }),
    ).toBeInTheDocument()
    expect(rows()).toBe('')
  })

  it('reads filters an earlier version remembered', () => {
    localStorage.setItem('bar:filters', JSON.stringify({ status: ['stopped'] }))
    render(<Harness />)
    expect(rows()).toBe('bob')
    expect(screen.getByRole('group', { name: 'Status is Stopped' })).toBeInTheDocument()
  })

  it('removes a chip with its button or Backspace, and Clear empties the row', async () => {
    localStorage.setItem('bar:filters', JSON.stringify({ status: ['running'], owner: ['alice'] }))
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove Owner filter' }))
    expect(rows()).toBe('alice,carol')
    const status = screen.getByRole('button', { name: 'Value: Running' })
    fireEvent.keyDown(status, { key: 'Backspace' })
    expect(rows()).toBe('alice,bob,carol')
    expect(screen.queryByRole('group', { name: 'Active filters' })).not.toBeInTheDocument()
  })

  it('offers Reset to the page defaults only once they have changed', () => {
    render(<Harness defaultFilters={[{ field: 'status', op: 'is', values: ['running'] }]} />)
    expect(rows()).toBe('alice,carol')
    expect(screen.queryByRole('button', { name: 'Reset' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Remove Status filter' }))
    // The row is gone with its last chip; the Filter menu still resets.
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Reset' }))
    expect(rows()).toBe('alice,carol')
  })

  it('keeps a required chip, without a remove button, reading Any while unset', () => {
    render(<Harness required />)
    const chip = screen.getByRole('group', { name: 'Owner Any' })
    expect(within(chip).queryByRole('button', { name: /Remove/ })).not.toBeInTheDocument()
  })
})

describe('a URL store', () => {
  function UrlHarness({ initial }: { initial: ActiveFilter[] | null }) {
    const [value, setValue] = useState<ActiveFilter[] | null>(initial)
    const view = useListView<Row>({
      storageKey: 'url',
      columns: [],
      facets: [
        {
          key: 'status',
          label: 'Status',
          options: [
            { value: 'running', label: 'Running' },
            { value: 'stopped', label: 'Stopped' },
          ],
          matches: (row, selected) => selected.includes(row.status),
        },
      ],
      filterStore: { value, onChange: setValue },
    })
    return (
      <>
        <ListFilterBar filters={view.filterState} />
        <output data-testid="rows">
          {view
            .applyFilters(ROWS)
            .map((r) => r.owner)
            .join(',')}
        </output>
      </>
    )
  }

  it('wins over what is remembered, and both take every change', async () => {
    localStorage.setItem('url:filters', JSON.stringify({ status: ['running'] }))
    render(<UrlHarness initial={[{ field: 'status', op: 'is', values: ['stopped'] }]} />)
    expect(rows()).toBe('bob')
    fireEvent.click(screen.getByRole('button', { name: 'Remove Status filter' }))
    await waitFor(() => expect(rows()).toBe('alice,bob,carol'))
    expect(JSON.parse(localStorage.getItem('url:filters') ?? 'null')).toEqual({})
  })

  it('leaves the remembered filters in place while it holds none', () => {
    localStorage.setItem('url:filters', JSON.stringify({ status: ['running'] }))
    render(<UrlHarness initial={null} />)
    expect(rows()).toBe('alice,carol')
  })
})

describe('a date chip', () => {
  function Dated() {
    const view = useListView<{ due: string }>({
      storageKey: 'dated',
      columns: [{ key: 'name', label: 'Name', alwaysVisible: true }],
      filterFields: [{ key: 'due', label: 'Due', kind: 'date', value: (r) => r.due }],
      defaultFilters: [{ field: 'due', op: 'is', values: ['2020-03-14'] }],
    })
    return <ListPage view={view}>{null}</ListPage>
  }

  it("reads its day in the provider's locale", () => {
    render(
      <UIProvider locale="de-DE">
        <Dated />
      </UIProvider>,
    )
    expect(screen.getByRole('group', { name: 'Due is 14.03.2020' })).toBeInTheDocument()
  })
})

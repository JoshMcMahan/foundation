// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { UIProvider } from '../components/Provider'
import { mockListLayout } from '../test/layout'
import { memoryStorage } from '../test/storage'
import type { ActiveFilter } from './filterModel'
import { ListFilterBar } from './ListFilterBar'
import { ListPage } from './ListPage'
import { ListFilterMenu } from './ListViewControls'
import { useListView } from './listView'
import { useListFilters } from './useListFilters'

type Row = { status: string; owner: string }

const ROWS: Row[] = [
  { status: 'running', owner: 'alice' },
  { status: 'stopped', owner: 'bob' },
  { status: 'running', owner: 'carol' },
]

function Harness({
  defaultFilters,
  required = false,
  searchable,
  storageKey = 'bar',
}: {
  defaultFilters?: ActiveFilter[]
  required?: boolean
  searchable?: boolean
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
        searchable,
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

  it('searches a long list of people, Enter taking the first match, chosen ones kept listed', async () => {
    // jsdom has no layout, so the virtual list would measure its scroller as empty.
    mockListLayout()
    render(<Harness searchable />)
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Owner' }))
    await nextFrame()
    const search = await screen.findByPlaceholderText('Search options…')
    search.focus()
    fireEvent.input(search, { target: { value: 'car' }, inputType: 'insertText' })
    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'carol' })).toHaveAttribute('data-highlighted'),
    )
    fireEvent.keyDown(search, { key: 'Enter' })
    await waitFor(() => expect(rows()).toBe('carol'))
    fireEvent.input(search, { target: { value: 'bo' }, inputType: 'insertText' })
    expect(await screen.findByRole('option', { name: 'bob' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'carol' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByRole('option', { name: 'alice' })).not.toBeInTheDocument()
    vi.restoreAllMocks()
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

describe('a condition worded by count', () => {
  // As a plural rule words it: "one" for 1, "other" for 0 and for many.
  const byCount = {
    filters: {
      operator: (op: string, n: number) =>
        op === 'is' ? (n === 1 ? 'is' : 'is any of') : op === 'isNot' ? 'is not' : op,
    },
  }
  function Single() {
    const view = useListView<{ priority: string }>({
      storageKey: 'single',
      columns: [{ key: 'name', label: 'Name', alwaysVisible: true }],
      filterFields: [
        {
          key: 'priority',
          label: 'Priority',
          kind: 'enum',
          multiple: false,
          options: [
            { value: 'high', label: 'High' },
            { value: 'low', label: 'Low' },
          ],
          value: (r) => r.priority,
        },
      ],
    })
    return (
      <ListPage view={view} toolbar={<ListFilterMenu view={view} />}>
        {null}
      </ListPage>
    )
  }

  it('reads "is" on a chip just added, before any value is chosen', async () => {
    render(
      <UIProvider strings={byCount}>
        <Single />
      </UIProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Priority' }))
    const chip = await screen.findByRole('group', { name: /^Priority/ })
    expect(within(chip).getByText('is')).toBeInTheDocument()
    expect(within(chip).queryByText('is any of')).toBeNull()
  })

  it('reads "is" in the condition menu too, on a field of one value', async () => {
    localStorage.setItem('single:filters', JSON.stringify({ priority: ['high'] }))
    render(
      <UIProvider strings={byCount}>
        <Single />
      </UIProvider>,
    )
    const chip = screen.getByRole('group', { name: 'Priority is High' })
    fireEvent.click(within(chip).getByRole('button', { name: 'Condition: is' }))
    expect(await screen.findByRole('menuitemradio', { name: 'is' })).toBeInTheDocument()
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

describe('a date field with its own presets', () => {
  function Presets() {
    const view = useListView<{ at: string }>({
      storageKey: 'presets',
      columns: [{ key: 'name', label: 'Name', alwaysVisible: true }],
      filterFields: [
        {
          key: 'at',
          label: 'Time',
          kind: 'date',
          pinned: true,
          presets: ['-24h', '-365d', 'year', 'all'],
          value: (r) => r.at,
        },
      ],
    })
    return <ListPage view={view}>{null}</ListPage>
  }

  it('offers them, worded for hours, days, the year and every date', async () => {
    render(<Presets />)
    fireEvent.click(screen.getByRole('button', { name: 'Value: Any' }))
    for (const name of ['Last 24 hours', 'Last 365 days', 'This year', 'All time']) {
      expect(await screen.findByRole('button', { name })).toBeInTheDocument()
    }
    expect(screen.queryByRole('button', { name: 'Today' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'This year' }))
    expect(await screen.findByRole('group', { name: 'Time is This year' })).toBeInTheDocument()
  })
})

describe('quick filters', () => {
  function Quick({
    multiple,
    defaultFilters,
  }: {
    multiple?: boolean
    defaultFilters?: ActiveFilter[]
  }) {
    const view = useListView<Row>({
      storageKey: `quick-${multiple}-${defaultFilters?.length ?? 0}`,
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
          key: 'mine',
          label: 'Needs attention',
          kind: 'boolean',
          value: (row) => row.owner === 'bob',
        },
      ],
      quickFilters: [
        {
          field: 'status',
          counts: { running: 2, stopped: 1 },
          all: { count: 3 },
          multiple,
        },
        { field: 'mine', counts: { true: 1 }, tone: 'warning' },
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

  const toggle = (name: RegExp) => screen.getByRole('button', { name })
  const chip = (name: RegExp) => screen.queryByRole('group', { name })

  it('show their toggles with counts, All pressed, before any filter is on', () => {
    render(<Quick />)
    expect(toggle(/^All\s*3/)).toHaveAttribute('aria-pressed', 'true')
    expect(toggle(/^Running\s*2/)).toHaveAttribute('aria-pressed', 'false')
    expect(toggle(/^Needs attention\s*1/)).toHaveClass(
      'not-aria-pressed:text-(--theme-warning-text)',
    )
    expect(screen.queryByRole('group', { name: 'Active filters' })).not.toBeInTheDocument()
  })

  it('are the control for what they can say, with no chip beside them, and Clear empties them', () => {
    render(<Quick />)
    fireEvent.click(toggle(/^Running\s*2/))
    expect(rows()).toBe('alice,carol')
    expect(toggle(/^All\s*3/)).toHaveAttribute('aria-pressed', 'false')
    expect(chip(/^Status is/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(rows()).toBe('alice,bob,carol')
    expect(toggle(/^All\s*3/)).toHaveAttribute('aria-pressed', 'true')
  })

  it('leave a condition they cannot say to its chip, pressing nothing, not even All', () => {
    render(<Quick defaultFilters={[{ field: 'status', op: 'isNot', values: ['running'] }]} />)
    expect(rows()).toBe('bob')
    expect(chip(/^Status is not Running/)).toBeInTheDocument()
    expect(toggle(/^Running\s*2/)).toHaveAttribute('aria-pressed', 'false')
    expect(toggle(/^All\s*3/)).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(toggle(/^Running\s*2/))
    expect(rows()).toBe('alice,carol')
    expect(chip(/^Status is/)).not.toBeInTheDocument()
  })

  it('replace the last toggle when only one can be pressed', () => {
    render(<Quick multiple={false} />)
    fireEvent.click(toggle(/^Running\s*2/))
    fireEvent.click(toggle(/^Stopped\s*1/))
    expect(rows()).toBe('bob')
    expect(toggle(/^Running\s*2/)).toHaveAttribute('aria-pressed', 'false')
    expect(chip(/^Status is/)).toBeNull()
  })

  it('turn a yes-or-no field on and off', () => {
    render(<Quick />)
    fireEvent.click(toggle(/^Needs attention\s*1/))
    expect(rows()).toBe('bob')
    expect(toggle(/^Needs attention\s*1/)).toHaveAttribute('aria-pressed', 'true')
    // Only the toggles' group says it; no chip repeats it.
    expect(screen.getAllByRole('group', { name: 'Needs attention' })).toHaveLength(1)
    fireEvent.click(toggle(/^Needs attention\s*1/))
    expect(rows()).toBe('alice,bob,carol')
  })
})

describe('a narrow row', () => {
  function Narrow() {
    const [active, setActive] = useState<ActiveFilter[]>([
      { field: 'queue', op: 'is', values: ['provisioning'] },
    ])
    const filters = useListFilters({
      storageKey: 'narrow',
      fields: [
        {
          key: 'queue',
          label: 'Queue',
          kind: 'enum',
          options: [{ value: 'provisioning', label: 'provisioning' }],
        },
      ],
      remember: false,
      store: { value: active, onChange: setActive },
    })
    return (
      <>
        <ListFilterBar filters={filters} />
        <output data-testid="active">{active.map((f) => f.field).join(',')}</output>
      </>
    )
  }

  it('puts Clear in the + menu rather than on a line of its own', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 300,
    } as DOMRect)
    // Clear would wrap below "+".
    vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.hasAttribute('data-filter-clear') ? 40 : 0
    })
    render(<Narrow />)
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Clear' }))
    await waitFor(() => expect(screen.getByTestId('active').textContent).toBe(''))
    vi.restoreAllMocks()
  })

  it('gives way down to the pressed toggle, so "+n more" never wraps', async () => {
    function Quick() {
      const [active, setActive] = useState<ActiveFilter[]>([
        { field: 'state', op: 'is', values: ['running'] },
      ])
      const filters = useListFilters({
        storageKey: 'narrow-quick',
        fields: [
          {
            key: 'state',
            label: 'State',
            kind: 'enum',
            options: ['discarded', 'retryable', 'running'].map((v) => ({ value: v, label: v })),
          },
        ],
        remember: false,
        store: { value: active, onChange: setActive },
        quick: [{ field: 'state' }],
      })
      return <ListFilterBar filters={filters} />
    }
    // A 300px row: toggles 110px wide, "+n more" 90px, wrapping as a real row does.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.tagName !== 'BUTTON') {
        return { width: 300, top: 0 } as DOMRect
      }
      const row = this.closest('div:not([role])')
      let x = 0
      let top = 0
      for (const button of row?.querySelectorAll('button') ?? []) {
        const w = button.hasAttribute('aria-pressed') ? 110 : 90
        if (x + w > 300) {
          x = 0
          top += 40
        }
        x += w
        if (button === this) {
          break
        }
      }
      return { width: 300, top } as DOMRect
    })
    render(<Quick />)
    await waitFor(() => expect(screen.getByRole('button', { name: '+2 more' })).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /^running/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('button', { name: /^discarded/ })).toBeNull()
    vi.restoreAllMocks()
  })

  it('keeps Clear on the row where it fits after +', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 300,
    } as DOMRect)
    render(<Narrow />)
    expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument()
    vi.restoreAllMocks()
  })
})

describe('a narrow row with required and pinned fields', () => {
  it('never puts their chips in the sheet, only the ones after them', async () => {
    function Fixed() {
      const [active, setActive] = useState<ActiveFilter[]>([
        { field: 'org', op: 'is', values: ['dev'] },
        { field: 'time', op: 'is', values: ['-30d'] },
        { field: 'group', op: 'is', values: ['hpc'] },
        { field: 'user', op: 'is', values: ['maya'] },
      ])
      const filters = useListFilters({
        storageKey: 'narrow-fixed',
        fields: [
          {
            key: 'org',
            label: 'Organization',
            kind: 'enum',
            required: true,
            options: [{ value: 'dev', label: 'dev' }],
          },
          { key: 'time', label: 'Time', kind: 'date', required: true },
          {
            key: 'group',
            label: 'Group',
            kind: 'enum',
            pinned: true,
            options: [{ value: 'hpc', label: 'hpc' }],
          },
          { key: 'user', label: 'User', kind: 'enum', options: [{ value: 'maya', label: 'maya' }] },
        ],
        remember: false,
        store: { value: active, onChange: setActive },
      })
      return <ListFilterBar filters={filters} />
    }
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 300,
    } as DOMRect)
    // Two items to a line.
    vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function (
      this: HTMLElement,
    ) {
      const items = Array.from(this.parentElement?.children ?? [])
      return Math.floor(items.indexOf(this) / 2) * 40
    })
    render(<Fixed />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '+1 filter' })).toBeInTheDocument(),
    )
    const shown = Array.from(document.querySelectorAll('[data-filter-chip]')).map(
      (c) => c.textContent?.split(/\s|is/)[0],
    )
    expect(shown).toEqual(['Organization', 'Time', 'Group'])
    vi.restoreAllMocks()
  })
})

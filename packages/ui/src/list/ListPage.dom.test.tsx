// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Table } from '../components/Table'
import { memoryStorage } from '../test/storage'
import { openTooltip } from '../test/tooltip'
import { ListColumns, ListPage, ListRow, ListRowActionsProvider } from './ListPage'
import { HEADERS_OFF, ListError, ListSelectAllHeader, listTableProps, NameCell } from './ListTable'
import { ListDisplayMenu } from './ListViewControls'
import { type ListViewChrome, useListView } from './listView'
import type { RowAction } from './rowMenu'

function renderRow(disabled: boolean, onSelect: () => void) {
  return renderPinned({
    key: 'stop',
    label: 'Stop',
    icon: <span data-testid="stop-icon" />,
    onClick: onSelect,
    disabled,
  })
}

function renderPinned(action: RowAction) {
  return render(
    <table>
      <tbody>
        <ListRow
          href={null}
          items={[]}
          goTo={() => {}}
          openMenu={() => {}}
          pinnedActions={[action]}
        >
          <Table.Item>row</Table.Item>
        </ListRow>
      </tbody>
    </table>,
  )
}

describe('ListRow pinned actions', () => {
  it('keeps a disabled action focusable and readable but inert', async () => {
    const onSelect = vi.fn()
    renderRow(true, onSelect)

    const action = screen.getByRole('button', { name: 'Stop' })

    expect(action).toHaveAttribute('aria-disabled', 'true')
    expect(action).not.toBeDisabled()

    act(() => action.focus())
    expect(action).toHaveFocus()
    await waitFor(() => expect(openTooltip()).toHaveTextContent('Stop'))

    fireEvent.click(action)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('still runs an enabled action', () => {
    const onSelect = vi.fn()
    renderRow(false, onSelect)

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    expect(onSelect).toHaveBeenCalledOnce()
  })

  it('copies a copy action’s text', () => {
    const writeText = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    renderPinned({ key: 'copy-id', label: 'Copy ID', copy: { text: 'c-1', label: 'ID' } })

    fireEvent.click(screen.getByRole('button', { name: 'Copy ID' }))
    expect(writeText).toHaveBeenCalledWith('c-1')
  })

  it('warns about an action with no behavior', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // A cast stands in for a JavaScript caller, which the types don't reach.
    renderPinned({ key: 'restart', label: 'Restart' } as RowAction)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"Restart" has no onClick'))
    warn.mockRestore()
  })
})

describe('ListRow onActivate', () => {
  it('runs on a plain row click when there is no href', () => {
    const onActivate = vi.fn()
    render(
      <table>
        <tbody>
          <ListRow
            href={null}
            onActivate={onActivate}
            items={[]}
            goTo={() => {}}
            openMenu={() => {}}
          >
            <Table.Item>row</Table.Item>
          </ListRow>
        </tbody>
      </table>,
    )

    fireEvent.click(screen.getByText('row'))
    expect(onActivate).toHaveBeenCalledOnce()
  })
})

describe('ListRow stacked columns', () => {
  const view: ListViewChrome = {
    showActions: false,
    alwaysShowActions: false,
    columnClasses: ['', 'hidden @[36rem]:table-cell', 'hidden @[36rem]:table-cell'],
    columnStacks: [false, false, true],
  }

  it('shows a stacked column under the first cell where its own cell gives way', () => {
    render(
      <ListRowActionsProvider view={view}>
        <table>
          <tbody>
            <ListRow href={null} items={[]} goTo={() => {}} openMenu={() => {}}>
              <Table.Item>Ada</Table.Item>
              <Table.Item>Lisbon</Table.Item>
              <Table.Item>Running</Table.Item>
            </ListRow>
          </tbody>
        </table>
      </ListRowActionsProvider>,
    )
    const cells = screen.getAllByRole('cell')
    // The first cell keeps its content and carries the stacked one, shown only when narrow.
    expect(cells[0]).toHaveTextContent('AdaRunning')
    const stacked = cells[0]?.querySelector('[data-stacked]')
    expect(stacked).toHaveTextContent('Running')
    expect(stacked).toHaveClass('@[36rem]:hidden')
    // Its own cell gives way when narrow, like a medium-priority column.
    expect(cells[2]).toHaveTextContent('Running')
    expect(cells[2]).toHaveClass('hidden', '@[36rem]:table-cell')
    // A column that only drops (priority) isn't stacked.
    expect(cells[0]).not.toHaveTextContent('Lisbon')
  })

  it('stacks under a NameCell too, past its icon and outside its link', () => {
    render(
      <ListRowActionsProvider
        view={{
          ...view,
          columnClasses: ['', 'hidden @[36rem]:table-cell'],
          columnStacks: [false, true],
        }}
      >
        <table>
          <tbody>
            <ListRow href={null} items={[]} goTo={() => {}} openMenu={() => {}}>
              <NameCell icon={<span />} name="gpu-trainer" subtitle="2 nodes" href={null} />
              <Table.Item>Running</Table.Item>
            </ListRow>
          </tbody>
        </table>
      </ListRowActionsProvider>,
    )
    const first = screen.getAllByRole('cell')[0]
    expect(first).toHaveTextContent('gpu-trainer2 nodesRunning')
    expect(first?.querySelector('[data-stacked]')).toHaveTextContent('Running')
  })

  it('adds nothing for a stacked cell with nothing in it', () => {
    render(
      <ListRowActionsProvider view={view}>
        <table>
          <tbody>
            <ListRow href={null} items={[]} goTo={() => {}} openMenu={() => {}}>
              <Table.Item>Ada</Table.Item>
              <Table.Item>Lisbon</Table.Item>
              <Table.Item>{false}</Table.Item>
            </ListRow>
          </tbody>
        </table>
      </ListRowActionsProvider>,
    )
    expect(screen.getAllByRole('cell')[0]?.querySelector('[data-stacked]')).toBeNull()
  })

  it('leaves rows alone when nothing stacks', () => {
    render(
      <ListRowActionsProvider view={{ ...view, columnStacks: [false, false, false] }}>
        <table>
          <tbody>
            <ListRow href={null} items={[]} goTo={() => {}} openMenu={() => {}}>
              <Table.Item>Ada</Table.Item>
              <Table.Item>Lisbon</Table.Item>
              <Table.Item>Running</Table.Item>
            </ListRow>
          </tbody>
        </table>
      </ListRowActionsProvider>,
    )
    expect(screen.getAllByRole('cell')[0]?.querySelector('[data-stacked]')).toBeNull()
  })
})

describe('ListPage bleed', () => {
  it("reaches past the host's padding only when asked", () => {
    const { container, rerender } = render(<ListPage>rows</ListPage>)
    expect(container.firstElementChild).not.toHaveClass('-m-4')
    rerender(<ListPage bleed>rows</ListPage>)
    expect(container.firstElementChild).toHaveClass('-m-4')
  })
})

describe('ListError', () => {
  it('announces the failure and names what failed', () => {
    render(<ListError error={new Error('upstream timed out')} noun="clusters" />)
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load clusters")
    expect(screen.getByRole('alert')).toHaveTextContent('upstream timed out')
  })

  it("falls back to the provider's noun", () => {
    render(<ListError error={null} />)
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load data")
  })
})

type Host = { name: string; nodes: number; favorite: boolean }

const HOSTS: Host[] = [
  { name: 'beta', nodes: 1, favorite: false },
  { name: 'alpha', nodes: 3, favorite: true },
  { name: 'gamma', nodes: 2, favorite: false },
]

function SortableList({ favorites = false }: { favorites?: boolean }) {
  const view = useListView<Host>({
    storageKey: 'sortable-list',
    columns: [
      { key: 'name', label: 'Name', alwaysVisible: true, orderBy: 'name' },
      { key: 'nodes', label: 'Nodes', orderBy: 'nodes' },
      // Names an order the view doesn't offer, so it stays a plain title.
      { key: 'owner', label: 'Owner', orderBy: 'owner' },
    ],
    orderBys: [
      { value: 'name', label: 'Name', compare: (a, b) => a.name.localeCompare(b.name) },
      { value: 'nodes', label: 'Nodes', compare: (a, b) => a.nodes - b.nodes },
    ],
    ...(favorites && { isFavorite: (row: Host) => row.favorite }),
  })
  return (
    <>
      <ListDisplayMenu view={view} />
      <Table {...listTableProps}>
        <ListColumns view={view} />
        {view.applyOrder(HOSTS).map((row) => (
          <tr key={row.name}>
            <Table.Item>{row.name}</Table.Item>
            <Table.Item>{row.nodes}</Table.Item>
            <Table.Item />
          </tr>
        ))}
      </Table>
    </>
  )
}

const header = (name: string) => screen.getByRole('columnheader', { name })
const names = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => row.firstChild?.textContent)
const openDisplay = () => fireEvent.click(screen.getByRole('button', { name: 'Display options' }))

describe('ListColumns sorting', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', { value: memoryStorage(), configurable: true })
  })

  it('marks the column the list orders by, and only sortable columns', () => {
    render(<SortableList />)
    expect(header('Name')).toHaveAttribute('aria-sort', 'ascending')
    expect(header('Nodes')).toHaveAttribute('aria-sort', 'none')
    expect(header('Owner')).not.toHaveAttribute('aria-sort')
    expect(within(header('Owner')).queryByRole('button')).toBeNull()
  })

  it('orders by an unsorted column ascending, then flips it, and Display options follows', () => {
    render(<SortableList />)
    fireEvent.click(within(header('Nodes')).getByRole('button'))
    expect(header('Nodes')).toHaveAttribute('aria-sort', 'ascending')
    expect(header('Name')).toHaveAttribute('aria-sort', 'none')
    expect(names()).toEqual(['beta', 'gamma', 'alpha'])

    fireEvent.click(within(header('Nodes')).getByRole('button'))
    expect(header('Nodes')).toHaveAttribute('aria-sort', 'descending')
    expect(names()).toEqual(['alpha', 'gamma', 'beta'])

    openDisplay()
    expect(screen.getByRole('combobox', { name: 'Ordering' })).toHaveTextContent('Nodes')
    expect(screen.getByRole('button', { name: 'Descending' })).toBeInTheDocument()
  })

  it('a third click flips it back rather than dropping the order', () => {
    render(<SortableList />)
    const nodes = () => within(header('Nodes')).getByRole('button')
    fireEvent.click(nodes())
    fireEvent.click(nodes())
    fireEvent.click(nodes())
    expect(header('Nodes')).toHaveAttribute('aria-sort', 'ascending')
  })

  it('follows Display options', async () => {
    render(<SortableList />)
    openDisplay()
    fireEvent.click(screen.getByRole('button', { name: 'Ascending' }))
    expect(header('Name')).toHaveAttribute('aria-sort', 'descending')
    expect(names()).toEqual(['gamma', 'beta', 'alpha'])

    fireEvent.click(screen.getByRole('combobox', { name: 'Ordering' }))
    const nodes = await screen.findByRole('option', { name: 'Nodes' })
    // Base UI commits a mouse click only when the press started on the option.
    fireEvent.pointerDown(nodes)
    fireEvent.click(nodes)
    await waitFor(() => expect(header('Nodes')).toHaveAttribute('aria-sort', 'descending'))
    expect(header('Name')).toHaveAttribute('aria-sort', 'none')
  })

  it('persists the order a header picks', () => {
    const { unmount } = render(<SortableList />)
    fireEvent.click(within(header('Nodes')).getByRole('button'))
    unmount()
    render(<SortableList />)
    expect(header('Nodes')).toHaveAttribute('aria-sort', 'ascending')
  })

  it('shows no column as sorted under the built-in default order', () => {
    render(<SortableList favorites />)
    expect(header('Name')).toHaveAttribute('aria-sort', 'none')
    expect(header('Nodes')).toHaveAttribute('aria-sort', 'none')
    fireEvent.click(within(header('Name')).getByRole('button'))
    expect(header('Name')).toHaveAttribute('aria-sort', 'ascending')
  })

  it('keeps the header row in view as the rows scroll', () => {
    render(<SortableList />)
    const thead = screen.getAllByRole('rowgroup')[0]
    expect(thead?.tagName).toBe('THEAD')
    expect(thead).toHaveClass('sticky', 'z-(--layer-sticky)')
    // Nothing else is pinned in the list's scroller, so it pins at the top.
    expect(thead).toHaveStyle({ top: '0px' })
  })
})

describe('ListColumns with headers off', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', { value: memoryStorage(), configurable: true })
  })

  it('collapses the header row when Display options turns headers off, keeping its cells', () => {
    render(<SortableList />)
    const thead = screen.getAllByRole('rowgroup')[0] as HTMLElement
    // The list's own thead class collapses the row once a cell carries the marker.
    expect(thead).toHaveClass('has-[.list-headers-off]:collapse')
    expect(thead.querySelector(`.${HEADERS_OFF}`)).toBeNull()

    openDisplay()
    fireEvent.click(screen.getByRole('switch', { name: 'Show column headers' }))
    // The columns' cells stay to size the columns; the actions header rides along.
    expect(thead.querySelectorAll(`th.${HEADERS_OFF}`)).toHaveLength(3)
  })
})

describe('ListSelectAllHeader', () => {
  const renderHeader = (selected: number, total: number, onToggle = () => {}) =>
    render(
      <Table>
        <ListSelectAllHeader selected={selected} total={total} onToggle={onToggle} />
      </Table>,
    )
  const box = () => screen.getByRole('checkbox', { name: 'Select all' })

  it('sits in the header row', () => {
    renderHeader(0, 3)
    expect(box().closest('thead')).not.toBeNull()
  })

  it('is clear with nothing selected, mixed with some, and ticked with all', () => {
    const { unmount } = renderHeader(0, 3)
    expect(box()).toHaveAttribute('aria-checked', 'false')
    unmount()
    const some = renderHeader(1, 3)
    expect(box()).toHaveAttribute('aria-checked', 'mixed')
    some.unmount()
    renderHeader(3, 3)
    expect(box()).toHaveAttribute('aria-checked', 'true')
  })

  it('toggles on press, and is off with no rows', () => {
    const onToggle = vi.fn()
    const { unmount } = renderHeader(1, 3, onToggle)
    fireEvent.click(box())
    expect(onToggle).toHaveBeenCalledOnce()
    unmount()
    renderHeader(0, 0)
    expect(box()).toHaveAttribute('aria-disabled', 'true')
  })
})

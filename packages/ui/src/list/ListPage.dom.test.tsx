// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { UIProvider } from '../components/Provider'
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
    expect(stacked?.closest('[data-stacked-line]')).toHaveClass('@[36rem]:hidden')
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

  it('styles and stacks cells a component of the host’s renders, as it does cells given straight', () => {
    // Cells as a host wraps them: each its own component, rendering a Table.Item.
    const NameText = ({ name }: { name: string }) => (
      <Table.Item className="py-2.5">{name}</Table.Item>
    )
    const TextCell = ({ value }: { value?: string }) => (
      <Table.Item className="py-2.5">{value ? <span>{value}</span> : null}</Table.Item>
    )
    render(
      <ListRowActionsProvider view={view}>
        <table>
          <tbody>
            <ListRow href={null} items={[]} goTo={() => {}} openMenu={() => {}}>
              <NameText name="gpu-trainer" />
              <TextCell value="us-east-1" />
              <TextCell value="Running" />
            </ListRow>
            <ListRow href={null} items={[]} goTo={() => {}} openMenu={() => {}}>
              <NameText name="scratch" />
              <TextCell value="us-west-2" />
              <TextCell />
            </ListRow>
          </tbody>
        </table>
      </ListRowActionsProvider>,
    )
    const [first, other] = screen.getAllByRole('row')
    const cells = within(first as HTMLElement).getAllByRole('cell')
    expect(cells[0]?.querySelector('[data-stacked]')).toHaveTextContent('Running')
    expect(cells[0]?.querySelector('[data-stacked-line]')).toHaveClass('@[36rem]:hidden')
    // Each keeps its own classes and takes its column's.
    expect(cells[1]).toHaveClass('py-2.5', 'hidden', '@[36rem]:table-cell')
    expect(cells[2]).toHaveClass('hidden', '@[36rem]:table-cell')
    // A stacked cell is a line, not a cell inside a cell.
    expect(cells[0]?.querySelector('td')).toBeNull()
    // A wrapped cell with nothing in it adds no line.
    const second = within(other as HTMLElement).getAllByRole('cell')
    expect(second[0]?.querySelector('[data-stacked]')).toBeNull()
  })

  it('stacks a wrapped cell under a NameCell, past its icon', () => {
    const TextCell = ({ value }: { value: string }) => <Table.Item>{value}</Table.Item>
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
              <TextCell value="Running" />
            </ListRow>
          </tbody>
        </table>
      </ListRowActionsProvider>,
    )
    const stacked = screen.getAllByRole('cell')[0]?.querySelector('[data-stacked]')
    expect(stacked).toHaveTextContent('Running')
    // Under the name's column of the grid, not after it.
    expect(stacked?.closest('[data-stacked-line]')?.parentElement).toHaveClass('col-start-2')
  })

  it('flows several stacked values inline on one line that wraps between them', () => {
    render(
      <ListRowActionsProvider
        view={{
          ...view,
          columnClasses: ['', ...Array(3).fill('hidden @[36rem]:table-cell')],
          columnStacks: [false, true, true, true],
        }}
      >
        <table>
          <tbody>
            <ListRow href={null} items={[]} goTo={() => {}} openMenu={() => {}}>
              <NameCell icon={<span />} name="gpu-trainer" href={null} />
              <Table.Item>Instance</Table.Item>
              <Table.Item>
                <span>Running</span>
              </Table.Item>
              <td>us-west-2</td>
            </ListRow>
          </tbody>
        </table>
      </ListRowActionsProvider>,
    )
    const first = screen.getAllByRole('cell')[0]
    const lines = first?.querySelectorAll('[data-stacked-line]') ?? []
    expect(lines).toHaveLength(1)
    expect(lines[0]).toHaveClass('flex-wrap')
    const items = Array.from(lines[0]?.querySelectorAll('[data-stacked]') ?? [])
    expect(items.map((item) => item.textContent)).toEqual(['Instance', 'Running', 'us-west-2'])
    // A value never breaks inside itself.
    for (const item of items) {
      expect(item).toHaveClass('whitespace-nowrap')
    }
  })

  it('puts a stacked value on a line of its own, or joins it to the one before after a dot', () => {
    render(
      <ListRowActionsProvider
        view={{
          ...view,
          columnClasses: ['', ...Array(4).fill('hidden @[36rem]:table-cell')],
          columnStacks: [false, true, true, true, true],
          columnStackLines: [undefined, 'own', 'own', 'own', 'join'],
        }}
      >
        <table>
          <tbody>
            <ListRow href={null} items={[]} goTo={() => {}} openMenu={() => {}}>
              <NameCell icon={<span />} name="wrf-forecast" href={null} />
              <Table.Item>Running</Table.Item>
              <Table.Item>maya</Table.Item>
              <Table.Item>compute</Table.Item>
              <Table.Item>compute-[01-04]</Table.Item>
            </ListRow>
          </tbody>
        </table>
      </ListRowActionsProvider>,
    )
    const first = screen.getAllByRole('cell')[0]
    const group = first?.querySelector('[data-stacked-lines]')
    expect(group).toHaveClass('@[36rem]:hidden')
    const lines = Array.from(first?.querySelectorAll('[data-stacked-line]') ?? [])
    expect(lines.map((line) => line.textContent)).toEqual([
      'Running',
      'maya',
      'computecompute-[01-04]',
    ])
    // The joined value brings its own dot, drawn before it, so it is only seen.
    const [partition, nodes] = Array.from(lines[2]?.querySelectorAll('[data-stacked]') ?? [])
    expect(partition).not.toHaveClass("before:content-['·']")
    expect(nodes).toHaveClass("before:content-['·']")
  })

  it('leaves no dot where a joined value is empty, as a job not yet placed has no nodes', () => {
    render(
      <ListRowActionsProvider
        view={{
          ...view,
          columnClasses: ['', 'hidden @[36rem]:table-cell', 'hidden @[36rem]:table-cell'],
          columnStacks: [false, true, true],
          columnStackLines: [undefined, 'own', 'join'],
        }}
      >
        <table>
          <tbody>
            <ListRow href={null} items={[]} goTo={() => {}} openMenu={() => {}}>
              <Table.Item>lammps-md</Table.Item>
              <Table.Item>compute</Table.Item>
              <Table.Item>{''}</Table.Item>
            </ListRow>
          </tbody>
        </table>
      </ListRowActionsProvider>,
    )
    const items = screen.getAllByRole('cell')[0]?.querySelectorAll('[data-stacked]') ?? []
    expect(Array.from(items).map((item) => item.textContent)).toEqual(['compute'])
  })

  it('collapses a stacked value whose host component renders nothing, so the next starts the line', () => {
    // A status only some rows have, rendered by the host's own component inside the cell.
    const NoStatus = () => null
    render(
      <ListRowActionsProvider
        view={{
          ...view,
          columnClasses: ['', ...Array(2).fill('hidden @[36rem]:table-cell')],
          columnStacks: [false, true, true],
        }}
      >
        <table>
          <tbody>
            <ListRow href={null} items={[]} goTo={() => {}} openMenu={() => {}}>
              <NameCell icon={<span />} name="job-48210-scratch" href={null} />
              <Table.Item>
                <NoStatus />
              </Table.Item>
              <Table.Item>maya</Table.Item>
            </ListRow>
          </tbody>
        </table>
      </ListRowActionsProvider>,
    )
    const line = screen.getAllByRole('cell')[0]?.querySelector('[data-stacked-line]')
    const [status, owner] = Array.from(line?.querySelectorAll('[data-stacked]') ?? [])
    // Hidden while empty, so it leaves no gap before the owner.
    expect(status).toBeEmptyDOMElement()
    expect(status).toHaveClass('empty:hidden')
    expect(owner).toHaveTextContent('maya')
    // And a line of nothing but such values is gone with them.
    expect(line).toHaveClass('not-has-[>:not(:empty)]:hidden')
  })

  it('reads stacked values as secondary text, the size of a subtitle', () => {
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
    const line = screen.getAllByRole('cell')[0]?.querySelector('[data-stacked-line]')
    expect(line).toHaveClass('text-xs')
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
  it("announces the failure and names what failed, never in the server's words", () => {
    render(<ListError error={new Error('upstream timed out')} noun="clusters" />)
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent("Couldn't load clusters")
    expect(alert).toHaveTextContent('Something went wrong. Try again in a moment.')
    expect(alert).not.toHaveTextContent('upstream timed out')
  })

  it("says what went wrong in the host's words, or the provider's", () => {
    const { unmount } = render(
      <ListError error={new Error('503')} noun="clusters" message="The service is down." />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('The service is down.')
    unmount()
    render(
      <UIProvider strings={{ list: { couldNotLoadHint: 'Inténtalo de nuevo.' } }}>
        <ListError error={new Error('503')} />
      </UIProvider>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Inténtalo de nuevo.')
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

// The name's header also holds the phone's sort menu, which jsdom doesn't hide, so it names
// the column first.
const header = (name: string) => screen.getByRole('columnheader', { name: new RegExp(`^${name}`) })
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
    fireEvent.click(within(header('Name')).getByRole('button', { name: 'Name' }))
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

describe('ListColumns on a phone', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', { value: memoryStorage(), configurable: true })
  })

  const sortMenu = () => screen.getByRole('button', { name: /^Sorted by/ })

  it('says what the list is sorted by and which way in the name’s header', () => {
    render(<SortableList />)
    fireEvent.click(within(header('Nodes')).getByRole('button'))
    fireEvent.click(within(header('Nodes')).getByRole('button'))
    // Its own header gives way below the medium width; the name's then names the order.
    expect(header('Nodes')).toHaveClass('hidden', '@[36rem]:table-cell')
    expect(within(header('Name')).getByRole('button', { name: 'Name' })).toHaveClass(
      'hidden',
      '@[36rem]:inline-flex',
    )
    expect(sortMenu()).toHaveAccessibleName('Sorted by Nodes, descending')
    expect(sortMenu()).toHaveClass('@[36rem]:hidden')
    expect(header('Name')).toContainElement(sortMenu())
  })

  it('changes the order and its direction, and Display options follows', async () => {
    render(<SortableList />)
    fireEvent.click(sortMenu())
    fireEvent.click(await screen.findByRole('menuitemradio', { name: 'Nodes' }))
    await waitFor(() => expect(header('Nodes')).toHaveAttribute('aria-sort', 'ascending'))
    expect(names()).toEqual(['beta', 'gamma', 'alpha'])

    fireEvent.click(sortMenu())
    const descending = await screen.findByRole('menuitemradio', { name: 'Descending' })
    expect(screen.getByRole('menuitemradio', { name: 'Nodes' })).toBeChecked()
    fireEvent.click(descending)
    await waitFor(() => expect(header('Nodes')).toHaveAttribute('aria-sort', 'descending'))
    expect(names()).toEqual(['alpha', 'gamma', 'beta'])
    expect(sortMenu()).toHaveAccessibleName('Sorted by Nodes, descending')

    openDisplay()
    expect(screen.getByRole('combobox', { name: 'Ordering' })).toHaveTextContent('Nodes')
  })

  it('names the built-in default order as a phrase of its own', () => {
    render(<SortableList favorites />)
    const menu = screen.getByRole('button', { name: 'Default order, ascending' })
    expect(menu).toHaveTextContent('Default order')
  })

  it('takes the default order’s phrase from the host, not its label set into "Sorted by"', () => {
    render(
      <UIProvider
        strings={{
          list: {
            sortedBy: (order) => `Ordenado por ${order}`,
            orderDefault: 'Predeterminado',
            sortedByDefault: () => 'Orden predeterminado',
          },
        }}
      >
        <SortableList favorites />
      </UIProvider>,
    )
    expect(screen.getByRole('button', { name: 'Orden predeterminado' })).toHaveTextContent(
      'Orden predeterminado',
    )
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

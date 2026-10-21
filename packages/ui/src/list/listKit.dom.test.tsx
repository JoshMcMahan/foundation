// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { UIProvider } from '../components/Provider'
import { Table } from '../components/Table'
import { memoryStorage } from '../test/storage'
import { GroupRow, ListColumns, ListPage, ListRow, ListRowActionsProvider } from './ListPage'
import {
  actionsColumnWidth,
  ListActionsHeader,
  ListCellText,
  listTableProps,
  NameCell,
} from './ListTable'
import { ListToolbar } from './ListToolbar'
import { useListSearch } from './listSearch'
import { useListView } from './listView'

beforeEach(() => {
  Object.defineProperty(window, 'localStorage', { value: memoryStorage(), configurable: true })
})

const toolbar = <div>toolbar</div>
const rows = <div>rows</div>

describe('ListPage states', () => {
  it('sketches rows while loading, with the toolbar held back', () => {
    render(
      <ListPage toolbar={toolbar} loading total={0}>
        {rows}
      </ListPage>,
    )
    expect(screen.getByRole('status', { name: 'Loading…' })).toBeInTheDocument()
    expect(screen.queryByText('toolbar')).toBeNull()
    expect(screen.queryByText('rows')).toBeNull()
  })

  it('shows why the list failed while it has nothing from before', () => {
    const { rerender } = render(
      <ListPage error={new Error('timed out')} errorNoun="buckets" total={0}>
        {rows}
      </ListPage>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load buckets")
    // A failed refresh keeps the rows it has.
    rerender(
      <ListPage error={new Error('timed out')} errorNoun="buckets" total={3}>
        {rows}
      </ListPage>,
    )
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByText('rows')).toBeInTheDocument()
  })

  it('shows the empty state with no toolbar while the list is empty', () => {
    render(
      <ListPage
        toolbar={toolbar}
        total={0}
        empty={{ title: 'No buckets yet', description: 'Buckets you create show here.' }}
      >
        {rows}
      </ListPage>,
    )
    expect(screen.getByText('No buckets yet')).toBeVisible()
    expect(screen.getByText('Buckets you create show here.')).toBeVisible()
    expect(screen.queryByText('toolbar')).toBeNull()
    expect(screen.queryByText('rows')).toBeNull()
  })

  it('keeps the toolbar while empty when asked', () => {
    render(
      <ListPage toolbar={toolbar} total={0} toolbarWhenEmpty empty={{ title: 'No buckets yet' }}>
        {rows}
      </ListPage>,
    )
    expect(screen.getByText('toolbar')).toBeInTheDocument()
  })

  it('says nothing matches, with the toolbar there to change the search', () => {
    render(
      <ListPage toolbar={toolbar} total={4} matches={0} noMatches="No buckets match">
        {rows}
      </ListPage>,
    )
    expect(screen.getByText('No buckets match')).toBeVisible()
    expect(screen.getByText('toolbar')).toBeInTheDocument()
    expect(screen.queryByText('rows')).toBeNull()
  })

  it('shows the rows and toolbar once there are matches', () => {
    render(
      <ListPage toolbar={toolbar} total={4} matches={2} noMatches="No buckets match">
        {rows}
      </ListPage>,
    )
    expect(screen.getByText('rows')).toBeInTheDocument()
    expect(screen.getByText('toolbar')).toBeInTheDocument()
  })
})

function Toolbar({ total, matches }: { total: number; matches: number }) {
  const search = useListSearch(false)
  const view = useListView<unknown>({
    storageKey: 'toolbar',
    columns: [{ key: 'name', label: 'Name', alwaysVisible: true }],
  })
  return (
    <ListToolbar
      count={{ total, matches, noun: 'bucket', nounPlural: 'buckets' }}
      view={view}
      search={search}
      searchLabel="Search buckets"
      action={<button type="button">Export</button>}
    />
  )
}

describe('ListToolbar', () => {
  it('counts the list and lays out its controls, the action last', () => {
    render(<Toolbar total={12} matches={12} />)
    expect(screen.getByRole('status')).toHaveTextContent('12 buckets')
    const buttons = screen
      .getAllByRole('button')
      .map((b) => b.getAttribute('aria-label') ?? b.textContent)
    expect(buttons).toEqual(['Display options', 'Search buckets', 'Export'])
  })

  it('counts matches when the host says a filter is on', () => {
    render(
      <ListToolbar
        count={{ total: 12, matches: 3, filterActive: true, noun: 'bucket', nounPlural: 'buckets' }}
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent('3 of 12 buckets')
  })
})

function AlignedList() {
  const view = useListView<unknown>({
    storageKey: 'aligned',
    columns: [
      { key: 'name', label: 'Name', alwaysVisible: true },
      { key: 'size', label: 'Size', align: 'end' },
    ],
    defaultShowActions: false,
  })
  return (
    <ListRowActionsProvider view={view}>
      <Table {...listTableProps}>
        <ListColumns view={view} />
        <ListRow href={null} items={[]} goTo={() => {}} openMenu={() => {}}>
          <NameCell icon={<svg data-testid="icon" />} iconTile name="logs" href={null} />
          <Table.Item>
            <ListCellText mono>12 GB</ListCellText>
          </Table.Item>
        </ListRow>
      </Table>
    </ListRowActionsProvider>
  )
}

describe('list columns and cells', () => {
  it('sets an end-aligned column against its far edge, header and cells', () => {
    render(<AlignedList />)
    expect(screen.getByRole('columnheader', { name: 'Size' })).toHaveClass('text-right')
    // Its own cell, after the copy that stacks under the name on a narrow list.
    const size = screen.getAllByText('12 GB').at(-1)
    expect(size?.closest('td')).toHaveClass('text-right')
    expect(size).toHaveClass('font-mono', 'text-xs')
  })

  it('sets a row’s icon in a tile, and stacks content under the name past it', () => {
    render(
      <table>
        <tbody>
          <tr>
            <NameCell
              icon={<svg data-testid="icon" />}
              iconTile
              name="logs"
              subtitle="12 GB"
              href={null}
            >
              <span>stacked</span>
            </NameCell>
          </tr>
        </tbody>
      </table>,
    )
    expect(screen.getByTestId('icon').parentElement).toHaveClass('size-7', 'border')
    expect(screen.getByText('stacked').parentElement).toHaveClass('col-start-2')
  })

  it('keeps a one-line row’s icon bare, in the tile’s width', () => {
    render(
      <table>
        <tbody>
          <tr>
            <NameCell icon={<svg data-testid="icon" />} iconTile name="logs" href={null} />
          </tr>
        </tbody>
      </table>,
    )
    const slot = screen.getByTestId('icon').parentElement
    expect(slot).toHaveClass('w-7')
    expect(slot).not.toHaveClass('size-7', 'border')
  })
})

describe('Row actions lane', () => {
  const header = (alwaysShowActions: boolean, pinned = 0) => {
    render(
      <Table>
        <ListActionsHeader
          view={{ showActions: true, alwaysShowActions, actionsWidth: actionsColumnWidth(pinned) }}
        />
      </Table>,
    )
    return screen.getByRole('columnheader')
  }

  it('claims no width with a mouse when its only action is a menu shown on hover', () => {
    expect(header(false)).toHaveClass('pointer-fine:w-0!')
  })

  it('keeps its width when the actions always show', () => {
    expect(header(true)).not.toHaveClass('pointer-fine:w-0!')
  })

  it('keeps its width for pinned buttons', () => {
    expect(header(false, 2)).not.toHaveClass('pointer-fine:w-0!')
  })

  it('floats the hover menu over the row end, shown while hovered', () => {
    render(
      <Table>
        <tbody>
          <ListRow
            href={null}
            items={[{ label: 'Revoke', onClick: () => {} }]}
            goTo={() => {}}
            openMenu={() => {}}
          >
            <Table.Item>Name</Table.Item>
          </ListRow>
        </tbody>
      </Table>,
    )
    const menu = screen.getByRole('button', { name: 'More actions' })
    expect(menu.closest('td')).toHaveClass('pointer-fine:w-0!')
    expect(menu.parentElement).toHaveClass(
      'pointer-fine:opacity-0',
      'pointer-fine:group-hover:opacity-100',
    )
  })
})

describe('Counts in the host locale', () => {
  it('groups the toolbar count as the host does', () => {
    function Bar() {
      return (
        <ListToolbar count={{ total: 1204, matches: 1204, noun: 'token', nounPlural: 'tokens' }} />
      )
    }
    render(
      <UIProvider locale="de-DE">
        <Bar />
      </UIProvider>,
    )
    expect(screen.getByRole('status')).toHaveTextContent('1.204 tokens')
  })
})

function GroupedList({
  leading = false,
  actions = true,
}: {
  leading?: boolean
  actions?: boolean
}) {
  const view = useListView<unknown>({
    storageKey: `grouped${leading ? ':leading' : ''}${actions ? '' : ':no-actions'}`,
    columns: [
      { key: 'name', label: 'Name', alwaysVisible: true },
      { key: 'type', label: 'Type' },
      { key: 'zone', label: 'Zone', priority: 'low' },
      { key: 'seen', label: 'Last seen', priority: 'medium' },
      { key: 'total', label: 'Total', stack: false },
    ],
    defaultShowActions: actions,
  })
  return (
    <ListRowActionsProvider view={view}>
      <Table {...listTableProps}>
        {leading && <Table.Header>Select</Table.Header>}
        <ListColumns view={view} />
        <GroupRow
          label={<span>gpu-training</span>}
          count={3}
          trailing="2/3 running"
          leading={leading ? 1 : 0}
        />
      </Table>
    </ListRowActionsProvider>
  )
}

describe('GroupRow', () => {
  const groupCells = () =>
    Array.from(screen.getByText('gpu-training').closest('tr')?.querySelectorAll('td') ?? [])

  it('has a cell per column, each hiding with its column, and one for the actions', () => {
    render(<GroupedList />)
    const headers = screen.getAllByRole('columnheader')
    const cells = groupCells()
    expect(cells).toHaveLength(headers.length)
    // Type stacks on a phone, Zone drops below 52rem and Last seen below 36rem.
    expect(cells[1]).toHaveClass('hidden', '@[36rem]:table-cell')
    expect(cells[2]).toHaveClass('hidden', '@[52rem]:table-cell')
    expect(cells[3]).toHaveClass('hidden', '@[36rem]:table-cell')
    // A column that stays a column, and the name and actions, never hide.
    for (const i of [0, 4, 5]) {
      expect(cells[i]).not.toHaveClass('hidden')
    }
  })

  it('holds the whole header in its first cell: label, count and what sums it up', () => {
    render(<GroupedList />)
    const [first, ...rest] = groupCells()
    expect(first).toHaveTextContent('gpu-training·32/3 running')
    for (const cell of rest) {
      expect(cell).toBeEmptyDOMElement()
    }
  })

  it('leaves a cell for each leading column, and none for actions that are off', () => {
    render(<GroupedList leading actions={false} />)
    const cells = groupCells()
    expect(cells).toHaveLength(screen.getAllByRole('columnheader').length)
    expect(cells[0]).toHaveTextContent('gpu-training')
    // The columns' classes start after the leading cell.
    expect(cells[0]).not.toHaveClass('hidden')
    expect(cells[2]).toHaveClass('@[36rem]:table-cell')
    expect(cells[3]).toHaveClass('@[52rem]:table-cell')
  })

  it('spans colSpan columns in one cell outside a list view', () => {
    render(
      <table>
        <tbody>
          <GroupRow label="Connected resources" count={2} colSpan={3} />
        </tbody>
      </table>,
    )
    const cells = Array.from(screen.getByText('Connected resources').closest('tr')?.cells ?? [])
    expect(cells).toHaveLength(1)
    expect(cells[0]).toHaveAttribute('colspan', '3')
  })
})

describe('cells keep to their column', () => {
  it('cuts a long value off inside its own cell, and shows it whole in a tooltip', () => {
    render(
      <UIProvider>
        <table style={{ tableLayout: 'fixed', width: 200 }}>
          <tbody>
            <tr>
              <Table.Item style={{ width: 40 }}>
                <ListCellText>Network interface with a very long name</ListCellText>
              </Table.Item>
              <Table.Item>pending</Table.Item>
            </tr>
          </tbody>
        </table>
      </UIProvider>,
    )
    const text = screen.getByText('Network interface with a very long name')
    // The cell clips what it holds, and the text ends in an ellipsis rather than running on.
    expect(text.closest('td')).toHaveClass('overflow-clip', 'text-ellipsis', 'whitespace-nowrap')
    expect(text).toHaveClass('block', 'min-w-0', 'truncate')
    // Its tooltip opens only while the text is cut off.
    expect(text).toHaveAttribute('data-overflow-only')
  })

  it('lets the actions lane reach past its cell, where a floating ⋯ sits over the last column', () => {
    render(
      <table>
        <tbody>
          <ListRow href={null} items={[]} goTo={() => {}} openMenu={() => {}}>
            <Table.Item>logs</Table.Item>
          </ListRow>
        </tbody>
      </table>,
    )
    const cells = screen.getAllByRole('cell')
    expect(cells[0]).toHaveClass('overflow-clip')
    expect(cells.at(-1)).toHaveClass('overflow-visible')
    expect(cells.at(-1)).not.toHaveClass('overflow-clip')
  })
})

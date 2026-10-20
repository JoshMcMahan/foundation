// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { UIProvider } from '../components/Provider'
import { Table } from '../components/Table'
import { memoryStorage } from '../test/storage'
import { ListColumns, ListPage, ListRow, ListRowActionsProvider } from './ListPage'
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
            <NameCell icon={<svg data-testid="icon" />} iconTile name="logs" href={null}>
              <span>stacked</span>
            </NameCell>
          </tr>
        </tbody>
      </table>,
    )
    expect(screen.getByTestId('icon').parentElement).toHaveClass('size-7', 'border')
    expect(screen.getByText('stacked').parentElement).toHaveClass('col-start-2')
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

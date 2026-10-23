// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { UIProvider } from '../components/Provider'
import { Table } from '../components/Table'
import { memoryStorage } from '../test/storage'
import { ListFilterBar } from './ListFilterBar'
import { GroupRow, ListColumns, ListPage, ListRow, ListRowActionsProvider } from './ListPage'
import {
  actionsColumnWidth,
  ListActionsHeader,
  ListCellText,
  listTableFixedProps,
  listTableProps,
  NAME_MIN_WIDTH_PX,
  NameCell,
} from './ListTable'
import { ListToolbar } from './ListToolbar'
import { ListDisplayMenu } from './ListViewControls'
import { ListCount, useListSearch } from './listSearch'
import { useListView } from './listView'
import { useListFilters } from './useListFilters'

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

const NOUNS = { noun: 'bucket', nounPlural: 'buckets' }

describe('ListPage count', () => {
  it('shows the count under the last row, not in the toolbar', () => {
    render(
      <ListPage total={7} count={NOUNS} toolbar={<div data-testid="toolbar">tools</div>}>
        <table>
          <tbody>
            <tr>
              <td>last row</td>
            </tr>
          </tbody>
        </table>
      </ListPage>,
    )
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('7 buckets')
    expect(screen.getByTestId('toolbar')).not.toContainElement(status)
    const row = screen.getByText('last row')
    expect(row.compareDocumentPosition(status) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('says how many match while a filter narrows the list', () => {
    render(
      <ListPage total={7} matches={2} count={NOUNS}>
        rows
      </ListPage>,
    )
    expect(screen.getByRole('status')).toHaveTextContent('2 of 7 buckets')
  })

  it('shows no count with the empty or no-matches state, or while loading', () => {
    const { rerender } = render(
      <ListPage total={0} count={NOUNS} empty={{ title: 'No buckets yet' }}>
        rows
      </ListPage>,
    )
    expect(screen.getByText('No buckets yet')).toBeInTheDocument()
    expect(screen.queryByRole('status')).toBeNull()
    rerender(
      <ListPage total={7} matches={0} count={NOUNS} noMatches="No buckets match">
        rows
      </ListPage>,
    )
    expect(screen.getByText('No buckets match')).toBeInTheDocument()
    expect(screen.queryByRole('status')).toBeNull()
    rerender(
      <ListPage loading total={7} count={NOUNS}>
        rows
      </ListPage>,
    )
    expect(screen.queryByText('7 buckets')).toBeNull()
  })

  it('puts the count and the pager on one line', () => {
    render(
      <ListPage total={7} count={NOUNS} pager={<button type="button">Load more</button>}>
        rows
      </ListPage>,
    )
    const status = screen.getByRole('status')
    expect(status.parentElement).toContainElement(screen.getByRole('button', { name: 'Load more' }))
  })

  it('leaves out the line when there is neither a count nor a pager to show', () => {
    const { container } = render(
      <ListPage total={7} pager={null}>
        rows
      </ListPage>,
    )
    expect(container.querySelector('.min-h-10')).toBeNull()
  })

  it("moves a ListToolbar's count under the rows, once", () => {
    render(
      <ListPage
        total={12}
        matches={3}
        toolbar={
          <ListToolbar
            count={{ total: 12, matches: 3, filterActive: true, ...NOUNS }}
            action={<button type="button">Export</button>}
          />
        }
      >
        rows
      </ListPage>,
    )
    const [status, ...more] = screen.getAllByRole('status')
    expect(more).toHaveLength(0)
    expect(status).toHaveTextContent('3 of 12 buckets')
    expect(status?.closest('.overflow-auto')).not.toBeNull()
  })

  it("sets the toolbar at the end of the chips' line, and on a line alone with no chips", () => {
    function Filtered({ on }: { on: boolean }) {
      const filters = useListFilters({
        storageKey: 'shared-line',
        fields: [
          {
            key: 'status',
            label: 'Status',
            kind: 'enum',
            options: [{ value: 'running', label: 'Running' }],
          },
        ],
        remember: false,
        store: {
          value: on ? [{ field: 'status', op: 'is', values: ['running'] }] : [],
          onChange: () => {},
        },
      })
      return (
        <ListPage
          total={7}
          count={NOUNS}
          toolbar={<ListToolbar action={<button type="button">Export</button>} />}
          filterBar={
            <ListFilterBar filters={filters} trailing={<button type="button">Save view</button>} />
          }
        >
          rows
        </ListPage>
      )
    }
    const { rerender } = render(<Filtered on />)
    const chip = document.querySelector('[data-filter-chip]')
    expect(chip).not.toBeNull()
    // One line holds the chips and, at its end, the toolbar.
    const line = chip?.closest('.items-start')
    expect(line).toContainElement(screen.getByRole('button', { name: 'Export' }))
    // A trailing action joins the toolbar at the line's end.
    expect(screen.getByRole('button', { name: 'Save view' }).parentElement).toContainElement(
      screen.getByRole('button', { name: 'Export' }),
    )
    rerender(<Filtered on={false} />)
    expect(screen.queryByRole('button', { name: 'Save view' })).toBeNull()
    expect(document.querySelector('[data-filter-chip]')).toBeNull()
    expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Export' })).toHaveLength(1)
  })

  it('hides a count placed by hand while the page shows its own', () => {
    render(
      <ListPage
        total={7}
        count={NOUNS}
        toolbar={<ListCount total={7} matches={7} filterActive={false} {...NOUNS} />}
      >
        rows
      </ListPage>,
    )
    expect(screen.getAllByRole('status')).toHaveLength(1)
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

function SharedWidths() {
  const view = useListView<unknown>({
    storageKey: 'shares',
    columns: [
      { key: 'name', label: 'Name', alwaysVisible: true },
      { key: 'type', label: 'Type', width: '20%' },
      { key: 'zone', label: 'Zone', width: '20%', priority: 'low' },
      { key: 'seen', label: 'Seen', width: '10%', priority: 'medium' },
      { key: 'delete', label: 'Delete', locked: true, stack: false, width: 40 },
    ],
    defaultShowActions: false,
  })
  return (
    <ListRowActionsProvider view={view}>
      <Table {...listTableFixedProps}>
        <ListColumns view={view} />
      </Table>
      <ListDisplayMenu view={view} />
    </ListRowActionsProvider>
  )
}

describe('column widths', () => {
  const header = (name: string) => screen.getByRole('columnheader', { name })

  it('shares out the widths of the columns a narrower list drops among those left', () => {
    render(
      <UIProvider>
        <SharedWidths />
      </UIProvider>,
    )
    const type = header('Type')
    // Every column shows: its own 20%.
    expect(type.style.getPropertyValue('--share-wide')).toBe('20%')
    // Below 52rem Zone's 20% goes to the rest, the name's 50% among them: 20 / 80.
    expect(type.style.getPropertyValue('--share-medium')).toBe('25%')
    // Below 36rem Seen and Type drop too (Type stacks), leaving the name all of the list's share.
    expect(header('Seen').style.getPropertyValue('--share-medium')).toBe('12.5%')
    expect(type).toHaveClass('@[52rem]:w-(--share-wide)', '@[36rem]:w-(--share-medium)')
  })

  it('gives the name the whole row on a phone where the columns left beside it all stack', () => {
    function NamedShare() {
      const view = useListView<unknown>({
        storageKey: 'name-share',
        columns: [
          { key: 'name', label: 'Name', alwaysVisible: true, width: '28%' },
          { key: 'state', label: 'State' },
          { key: 'user', label: 'User' },
          { key: 'runtime', label: 'Runtime', priority: 'medium' },
        ],
      })
      return (
        <ListRowActionsProvider view={view}>
          <Table {...listTableProps}>
            <ListColumns view={view} />
          </Table>
        </ListRowActionsProvider>
      )
    }
    render(
      <UIProvider>
        <NamedShare />
      </UIProvider>,
    )
    const name = header('Name')
    // Beside the other columns it keeps its own share.
    expect(name.style.getPropertyValue('--share-wide')).toBe('28%')
    expect(name.style.getPropertyValue('--share-medium')).toBe('28%')
    // On a phone the rest stack under it or drop, so it takes the row rather than leaving the spare
    // width to the row's actions.
    expect(name.style.getPropertyValue('--share-narrow')).toBe('100%')
  })

  it('keeps a locked column out of the picker at its own width, and only the name at a minimum', () => {
    render(
      <UIProvider>
        <SharedWidths />
      </UIProvider>,
    )
    const del = header('Delete')
    expect(del.style.width).toBe('40px')
    expect(del.style.minWidth).toBe('')
    expect(header('Name').style.minWidth).toBe(`min(${NAME_MIN_WIDTH_PX}px, 50cqw)`)
    fireEvent.click(screen.getByRole('button', { name: 'Display options' }))
    const picker = screen.getByRole('dialog')
    expect(within(picker).getByText('Type')).toBeInTheDocument()
    expect(within(picker).queryByText('Delete')).toBeNull()
  })
})

describe('GroupRow detail', () => {
  it('shows a secondary detail only where the list has room, giving way before the label', () => {
    render(
      <table>
        <tbody>
          <GroupRow label="cfd-burst" detail="dep-7f3a91c2" colSpan={2} />
        </tbody>
      </table>,
    )
    const detail = screen.getByText('dep-7f3a91c2')
    expect(detail).toHaveClass('hidden', '@[36rem]:block', 'truncate', 'shrink-[100]')
  })
})

describe('trailing controls with a locked last column', () => {
  function LockedLast() {
    const view = useListView<unknown>({
      storageKey: 'locked-last',
      columns: [
        { key: 'name', label: 'Name', alwaysVisible: true },
        { key: 'type', label: 'Type' },
        { key: 'delete', label: 'Delete', locked: true, stack: false, width: 40 },
      ],
    })
    return (
      <ListRowActionsProvider view={view}>
        <Table {...listTableFixedProps}>
          <ListColumns view={view} />
          <ListRow href={null} items={[]} goTo={() => {}} openMenu={() => {}}>
            <NameCell icon={null} name="gpu-trainer" href={null} />
            <Table.Item>Instance</Table.Item>
            <Table.Item>
              <button type="button">Delete gpu-trainer</button>
            </Table.Item>
          </ListRow>
        </Table>
      </ListRowActionsProvider>
    )
  }

  it('keeps the ⋯ in a lane of its own after a locked column, never floating over it', () => {
    render(
      <UIProvider>
        <LockedLast />
      </UIProvider>,
    )
    const lane = screen.getAllByRole('cell').at(-1)
    expect(lane).not.toHaveClass('pointer-fine:w-0!')
    expect(screen.getAllByRole('columnheader').at(-1)).not.toHaveClass('pointer-fine:w-0!')
  })

  it('lines the ⋯ up at the top of a stacked row, with the controls that stay beside the stack', () => {
    render(
      <UIProvider>
        <LockedLast />
      </UIProvider>,
    )
    const cells = screen.getAllByRole('cell')
    // The delete column stays a column and sits at the row's top where Type stacks.
    expect(cells.at(-2)).toHaveClass('@max-[36rem]:align-top', '@max-[36rem]:pt-2.5')
    const menu = screen.getByRole('button', { name: /more actions/i }).parentElement
    expect(menu).toHaveClass('@max-[36rem]:items-start', '@max-[36rem]:pt-2')
  })
})

describe('trailing controls by the last column’s alignment', () => {
  function LastColumn({ align }: { align?: 'end' }) {
    const view = useListView<unknown>({
      storageKey: `last-${align ?? 'start'}`,
      columns: [
        { key: 'run', label: 'Run', alwaysVisible: true },
        { key: 'submitted', label: 'Submitted', stack: false },
        { key: 'runtime', label: 'Runtime', stack: false, ...(align ? { align } : {}) },
      ],
    })
    return (
      <ListRowActionsProvider view={view}>
        <Table {...listTableProps}>
          <ListColumns view={view} />
          <ListRow href={null} items={[]} goTo={() => {}} openMenu={() => {}}>
            <NameCell icon={null} name="#44" href={null} />
            <Table.Item>2 min ago</Table.Item>
            <Table.Item>1m 52s</Table.Item>
          </ListRow>
        </Table>
      </ListRowActionsProvider>
    )
  }

  it('keeps the ⋯ in a lane of its own after an end-aligned column, whose value it would cover', () => {
    render(
      <UIProvider>
        <LastColumn align="end" />
      </UIProvider>,
    )
    expect(screen.getAllByRole('cell').at(-1)).not.toHaveClass('pointer-fine:w-0!')
    expect(screen.getAllByRole('columnheader').at(-1)).not.toHaveClass('pointer-fine:w-0!')
  })

  it('floats the ⋯ over a text column’s blank end', () => {
    render(
      <UIProvider>
        <LastColumn />
      </UIProvider>,
    )
    expect(screen.getAllByRole('cell').at(-1)).toHaveClass('pointer-fine:w-0!')
    expect(screen.getAllByRole('columnheader').at(-1)).toHaveClass('pointer-fine:w-0!')
  })
})

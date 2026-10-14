import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ReactNode } from 'react'
import { useCallback, useMemo, useState } from 'react'
import { expect, screen, userEvent, within } from 'storybook/test'
import { useContextMenu } from '../components/ContextMenu'
import { keyedByContent } from '../components/keys'
import type { MenuEntry } from '../components/MenuEntries'
import { PageHeader, PageHeaderBar, PageHeaderProvider } from '../components/PageHeader'
import {
  PageHeaderAction,
  PageHeaderAddButton,
  PageHeaderMenu,
} from '../components/PageHeaderAction'
import { type UILinkComponent, UIProvider, useNavigation } from '../components/Provider'
import { StatusBadge } from '../components/StatusBadge'
import { Table } from '../components/Table'
import { cx } from '../cx'
import {
  ClusterIcon,
  EditIcon,
  PowerIcon,
  RefreshIcon,
  SnapshotIcon,
  StopIcon,
  TerminalIcon,
  TrashIcon,
} from '../icons'
import { ActionToolbar, type ToolbarItem } from './ActionToolbar'
import { ListColumns, ListPage, ListRow, useListNavigate } from './ListPage'
import {
  GroupRow,
  ListError,
  ListSkeleton,
  listTableProps,
  NameCell,
  RowSelectCheckbox,
} from './ListTable'
import { ListDisplayMenu, ListFilterMenu } from './ListViewControls'
import { ListCount, ListSearchControl, useListSearch } from './listSearch'
import { useListView } from './listView'
import { type RowAction, useCopySubmenu } from './rowMenu'

type RowStatus = 'running' | 'stopped' | 'error'

interface ShellRow {
  id: string
  name: string
  location: string
  status: RowStatus
  owner: string
  nodes: number
  favorite: boolean
}

const NAMES = [
  'gpu-trainer',
  'genomics-batch',
  'cfd-solver',
  'render-farm',
  'ml-inference',
  'dev-sandbox',
  'nightly-etl',
  'seismic-proc',
]
const LOCATIONS = ['aws · us-east-1', 'gcp · us-central1', 'azure · eastus']
const OWNERS = ['alice', 'bob', 'qa-bot']
const STATUSES: RowStatus[] = ['running', 'stopped', 'error']

function makeRows(count: number): ShellRow[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `row-${i}`,
    name: `${NAMES[i % NAMES.length] ?? 'cluster'}-${String(i + 1).padStart(2, '0')}`,
    location: LOCATIONS[i % LOCATIONS.length] ?? LOCATIONS[0] ?? '',
    status: STATUSES[i % STATUSES.length] ?? 'running',
    owner: OWNERS[i % OWNERS.length] ?? OWNERS[0] ?? '',
    nodes: 2 + (i % 5) * 4,
    favorite: i % 4 === 0,
  }))
}

const STATUS_VARIANT: Record<RowStatus, 'success' | 'muted' | 'error'> = {
  running: 'success',
  stopped: 'muted',
  error: 'error',
}

const MockLink: UILinkComponent = ({ href, onClick, ...rest }) => {
  const { goTo } = useNavigation()
  return (
    <a
      {...rest}
      href={href}
      onClick={(e) => {
        e.preventDefault()
        onClick?.(e)
        goTo(href)
      }}
    />
  )
}

/** Everything a host binds, in one place — the story doubles as the integration checklist. */
function useMockHost() {
  const [events, setEvents] = useState<string[]>([])
  const record = useCallback((line: string) => {
    setEvents((prev) => [line, ...prev].slice(0, 6))
  }, [])

  const navigation = useMemo(
    () => ({
      goTo: (to: string) => record(`navigation.goTo — ${to}`),
      openExternal: (href: string) => record(`navigation.openExternal — ${href}`),
    }),
    [record],
  )

  const strings = useMemo(
    () => ({
      list: { couldNotLoad: (noun: string) => `We couldn't load your ${noun}` },
    }),
    [],
  )

  const slots = useMemo(() => ({ link: MockLink }), [])

  return { events, navigation, strings, slots }
}

function HostBindingLog({ events }: { events: string[] }) {
  return (
    <div className="border-t border-(--theme-border) px-4 py-3 text-[12px]">
      <p className="m-0 font-medium text-(--theme-app)">Host bindings</p>
      {events.length === 0 ? (
        <p className="m-0 mt-1 text-(--theme-muted-text-color)">
          Click a row, a breadcrumb, or a menu action — every call the package makes into the host
          lands here.
        </p>
      ) : (
        <ul className="m-0 mt-1 list-none space-y-0.5 p-0 text-(--theme-muted-text-color)">
          {keyedByContent(events, (e) => e).map(({ key, item: event }) => (
            <li key={key}>{event}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

function MockHost({ children }: { children: (host: ReturnType<typeof useMockHost>) => ReactNode }) {
  const host = useMockHost()
  return (
    <UIProvider navigation={host.navigation} strings={host.strings} slots={host.slots}>
      <PageHeaderProvider>{children(host)}</PageHeaderProvider>
    </UIProvider>
  )
}

/** Storybook renders in a short frame; the shell fills its host, so give it one. */
function Viewport({ children, narrow }: { children: ReactNode; narrow?: boolean | undefined }) {
  return (
    // Sizes are inline: the package's stylesheet doesn't scan stories.
    <div
      className="overflow-hidden rounded-md border border-(--theme-border) bg-(--theme-app-bg)"
      style={{ height: '32rem', maxWidth: narrow ? '24rem' : undefined }}
    >
      {children}
    </div>
  )
}

interface ShellArgs {
  state: 'ready' | 'loading' | 'empty' | 'error'
  rowCount: number
  /** A phone-width frame, where Location and Owner drop and Status stacks under the name. */
  narrow?: boolean
  /** Only clusters that need a look show a status, so some rows' Status cells are empty. */
  sparseStatus?: boolean
  /** Rows carry a checkbox, and two start selected. */
  selectable?: boolean
  /** The column-header row shows until the user turns it off in Display options. */
  columnHeaders?: boolean
  /** Rows start grouped by status, under a row per group. */
  grouped?: boolean
}

function ClustersPage({
  state,
  rowCount,
  sparseStatus,
  selectable,
  columnHeaders = true,
  grouped = false,
}: ShellArgs) {
  const copySubmenu = useCopySubmenu()
  const goTo = useListNavigate()
  const { openMenu, contextMenu } = useContextMenu()
  const search = useListSearch()
  const [favorites, setFavorites] = useState<Record<string, boolean>>({})
  const [checked, setChecked] = useState<ReadonlySet<string>>(
    () => new Set(selectable ? ['row-1', 'row-2'] : []),
  )
  const toggleChecked = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) {
        next.add(id)
      }
      return next
    })

  const all = useMemo(() => (state === 'empty' ? [] : makeRows(rowCount)), [state, rowCount])

  const view = useListView<ShellRow>({
    // A key per starting display, so changing those controls starts the view
    // over rather than keeping what an earlier story left in storage.
    storageKey: `workshop-app-shell-clusters${columnHeaders ? '' : ':no-headers'}${grouped ? ':grouped' : ''}`,
    // Each column sorts by the order of the same name; Nodes sorts only from
    // Display options, as it has no column.
    columns: [
      { key: 'name', label: 'Name', alwaysVisible: true, orderBy: 'name' },
      { key: 'location', label: 'Location', priority: 'medium', orderBy: 'location' },
      // No priority: on a phone it moves under the name rather than dropping.
      { key: 'status', label: 'Status', orderBy: 'status' },
      { key: 'owner', label: 'Owner', priority: 'low', orderBy: 'owner' },
    ],
    orderBys: [
      { value: 'name', label: 'Name', compare: (a, b) => a.name.localeCompare(b.name) },
      {
        value: 'location',
        label: 'Location',
        compare: (a, b) => a.location.localeCompare(b.location),
      },
      { value: 'status', label: 'Status', compare: (a, b) => a.status.localeCompare(b.status) },
      { value: 'owner', label: 'Owner', compare: (a, b) => a.owner.localeCompare(b.owner) },
      { value: 'nodes', label: 'Nodes', compare: (a, b) => a.nodes - b.nodes },
    ],
    groupBys: [
      { value: 'none', label: 'None' },
      { value: 'status', label: 'Status' },
    ],
    defaultGroupBy: grouped ? 'status' : 'none',
    defaultShowColumnHeaders: columnHeaders,
    facets: [
      {
        key: 'status',
        label: 'Status',
        options: [
          { value: 'running', label: 'Running' },
          { value: 'stopped', label: 'Stopped' },
          { value: 'error', label: 'Error' },
        ],
        matches: (row, selected) => selected.includes(row.status),
      },
    ],
    actions: [
      { key: 'power', label: 'Start or stop', defaultPinned: true },
      { key: 'snapshot', label: 'Snapshot' },
      { key: 'delete', label: 'Delete' },
    ],
    isFavorite: (row) => favorites[row.id] ?? row.favorite,
  })

  const query = search.filter.trim().toLowerCase()
  const rows = useMemo(() => {
    const matched = query
      ? all.filter(
          (row) =>
            row.name.toLowerCase().includes(query) || row.owner.toLowerCase().includes(query),
        )
      : all
    return view.applyOrder(view.applyFilters(matched))
  }, [all, query, view])

  const menuItems = (row: ShellRow): MenuEntry[] => [
    {
      label: 'Open',
      href: `/clusters/${row.name}`,
      icon: <ClusterIcon />,
    },
    {
      label: row.status === 'running' ? 'Stop' : 'Start',
      icon: row.status === 'running' ? <StopIcon /> : <PowerIcon />,
      onClick: () => {},
    },
    {
      label: 'Snapshot',
      icon: <SnapshotIcon />,
      onClick: () => {},
    },
    copySubmenu({ name: row.name, id: row.id }),
    {
      label: 'Delete',
      icon: <TrashIcon />,
      destructive: true,
      onClick: () => {},
    },
  ]

  const pinnedActions = (row: ShellRow): RowAction[] =>
    view.isPinned('power')
      ? [
          {
            key: 'power',
            label: row.status === 'running' ? 'Stop' : 'Start',
            icon: row.status === 'running' ? <StopIcon /> : <PowerIcon />,
            onClick: () => setFavorites((prev) => ({ ...prev, [row.id]: !prev[row.id] })),
          },
        ]
      : []

  const renderRow = (row: ShellRow) => (
    <ListRow
      key={row.id}
      selected={checked.has(row.id)}
      selectionActive={checked.size > 0}
      onRowSelect={() => toggleChecked(row.id)}
      leading={
        selectable && (
          <Table.Item className="w-10 py-2.5">
            <RowSelectCheckbox
              checked={checked.has(row.id)}
              label={`Select ${row.name}`}
              onToggle={() => toggleChecked(row.id)}
            />
          </Table.Item>
        )
      }
      href={`/clusters/${row.name}`}
      items={menuItems(row)}
      goTo={goTo}
      openMenu={openMenu}
      pinnedActions={pinnedActions(row)}
    >
      <NameCell
        icon={<ClusterIcon className="h-5 w-5 shrink-0 text-(--theme-muted-text-color)" />}
        name={row.name}
        subtitle={`${row.nodes} nodes`}
        href={`/clusters/${row.name}`}
      />
      {view.isVisible('location') && (
        <Table.Item className="py-2.5 text-[13px] text-(--theme-muted-text-color)">
          {row.location}
        </Table.Item>
      )}
      {view.isVisible('status') && (
        <Table.Item className="py-2.5">
          {(!sparseStatus || row.status !== 'stopped') && (
            <StatusBadge variant={STATUS_VARIANT[row.status]}>{row.status}</StatusBadge>
          )}
        </Table.Item>
      )}
      {view.isVisible('owner') && (
        <Table.Item className="py-2.5 text-[13px] text-(--theme-muted-text-color)">
          {row.owner}
        </Table.Item>
      )}
    </ListRow>
  )

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Compute', href: '/compute' }, { label: 'Clusters' }]}
        titleActions={
          <PageHeaderAction
            icon={EditIcon}
            iconOnly
            label="Cluster settings"
            href="/clusters/settings"
          />
        }
        actions={<PageHeaderAddButton label="New cluster" word="create" href="/clusters/new" />}
      />
      <ListPage
        view={view}
        toolbar={
          <div className="flex items-center justify-between gap-3 py-1.5">
            {state === 'ready' && (
              <ListCount
                total={all.length}
                matches={rows.length}
                filterActive={query.length > 0 || view.activeFilterCount > 0}
                noun="cluster"
                nounPlural="clusters"
              />
            )}
            <div className="ml-auto flex items-center gap-2">
              <ListSearchControl search={search} placeholder="Search clusters" />
              <ListFilterMenu view={view} />
              <ListDisplayMenu view={view} />
            </div>
          </div>
        }
      >
        {state === 'loading' ? (
          <ListSkeleton />
        ) : state === 'error' ? (
          <ListError error={new Error('upstream timed out')} noun="clusters" />
        ) : all.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <ClusterIcon className="h-8 w-8 text-(--theme-muted-text-color)" />
            <p className="mt-3 max-w-sm text-sm text-(--theme-muted-text-color)">
              No clusters yet. Create one to get started.
            </p>
          </div>
        ) : (
          <Table
            {...listTableProps}
            // Collapsed rather than left out, so the columns keep their widths.
            theadClassName={cx(
              listTableProps.theadClassName,
              !view.showColumnHeaders && 'collapse',
            )}
          >
            {selectable && (
              <Table.Header caps={false} className="w-10">
                <span className="sr-only">Select</span>
              </Table.Header>
            )}
            <ListColumns view={view} />
            {view.groupBy === 'status'
              ? STATUSES.flatMap((status) => {
                  const group = rows.filter((row) => row.status === status)
                  return group.length === 0
                    ? []
                    : [
                        <GroupRow
                          key={status}
                          label={status}
                          count={group.length}
                          colSpan={
                            (selectable ? 1 : 0) +
                            view.visibleColumns.length +
                            (view.showActions ? 1 : 0)
                          }
                        />,
                        ...group.map(renderRow),
                      ]
                })
              : rows.map(renderRow)}
          </Table>
        )}
        {contextMenu}
      </ListPage>
    </>
  )
}

const meta: Meta<ShellArgs> = {
  title: 'UI/App Shell',
  args: { state: 'ready', rowCount: 8, columnHeaders: true, grouped: false },
  argTypes: {
    state: {
      control: 'inline-radio',
      options: ['ready', 'loading', 'empty', 'error'],
    },
    rowCount: { control: { type: 'range', min: 1, max: 60, step: 1 } },
    narrow: { control: 'boolean' },
    sparseStatus: { control: 'boolean' },
    selectable: { control: 'boolean' },
    columnHeaders: { control: 'boolean' },
    grouped: { control: 'boolean' },
  },
  render: (args) => (
    <MockHost>
      {(host) => (
        <Viewport narrow={args.narrow}>
          <div className="flex h-full flex-col">
            <PageHeaderBar />
            <div className="min-h-0 flex-1">
              <ClustersPage {...args} />
            </div>
            <HostBindingLog events={host.events} />
          </div>
        </Viewport>
      )}
    </MockHost>
  ),
}
export default meta

type Story = StoryObj<ShellArgs>

export const ListPageShell: Story = {}

/** A long list scrolls under its header row, which stays put below the page
 *  header and the toolbar. Each column's header sorts by it, and Display
 *  options' Ordering shows the same order; the default order sorts by no
 *  column, so no header shows a direction until one is clicked. */
export const ScrollingSortableHeaders: Story = { args: { rowCount: 40 } }

/** Group rows and the selection column scroll under the stuck header too. */
export const ScrollingGroupedAndSelected: Story = {
  args: { rowCount: 40, grouped: true, selectable: true },
}

/** Display options can hide the header row; the columns keep their widths. */
export const ColumnHeadersOff: Story = { args: { columnHeaders: false } }

export const Loading: Story = { args: { state: 'loading' } }

export const Empty: Story = { args: { state: 'empty' } }

export const LoadFailed: Story = { args: { state: 'error' } }

/** Checked rows take the accent's tint; while any is checked, a row click toggles it. */
export const SelectedRows: Story = { args: { selectable: true } }

/** At phone width the Status column gives way and each status sits under its row's name. */
export const NarrowStacksStatus: Story = { args: { narrow: true } }

/** Rows whose Status is empty add nothing under the name. */
export const NarrowWithSomeStatusesEmpty: Story = { args: { narrow: true, sparseStatus: true } }

export const RowMenuOpen: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const buttons = await canvas.findAllByRole('button', {
      name: /more actions/i,
    })
    await userEvent.click(buttons[0] as HTMLElement)
    await expect(await screen.findByRole('menu')).toBeVisible()
  },
}

// The log panel's own controls: toggles for how it follows, and its refresh.
const LOG_GROUPS: ToolbarItem[][] = [
  [
    {
      key: 'auto-refresh',
      label: 'Auto refresh',
      icon: <RefreshIcon />,
      onClick: () => {},
      checked: true,
    },
    { key: 'follow', label: 'Follow', icon: <TerminalIcon />, onClick: () => {}, checked: false },
  ],
]

const LOG_RIGHT: ToolbarItem[] = [
  { key: 'refresh', label: 'Refresh', icon: <RefreshIcon />, onClick: () => {} },
  { key: 'snapshot', label: 'Snapshot', icon: <SnapshotIcon />, onClick: () => {} },
]

/** A detail page: its commands sit at the end of the bar and its menu beside
 *  the title; `ActionToolbar` holds the controls of a panel on the page. */
export const DetailPageShell: StoryObj = {
  render: () => (
    <MockHost>
      {(host) => (
        <Viewport>
          <div className="flex h-full flex-col">
            <PageHeaderBar />
            <div className="min-h-0 flex-1 overflow-auto">
              <PageHeader
                breadcrumbs={[
                  { label: 'Compute', href: '/compute' },
                  { label: 'Clusters', href: '/clusters' },
                  { label: 'gpu-trainer-01' },
                ]}
                titleActions={
                  <>
                    <PageHeaderAction
                      icon={EditIcon}
                      iconOnly
                      label="Edit"
                      href="/clusters/gpu-trainer-01/edit"
                    />
                    <PageHeaderMenu
                      label="Cluster actions"
                      items={[
                        { label: 'Snapshot', icon: <SnapshotIcon />, onClick: () => {} },
                        {
                          label: 'Delete',
                          icon: <TrashIcon />,
                          destructive: true,
                          onClick: () => {},
                          disabled: true,
                          disabledReason: 'Stop the cluster before deleting it',
                        },
                      ]}
                    />
                  </>
                }
                actions={
                  <>
                    <PageHeaderAction
                      icon={TerminalIcon}
                      label="Terminal"
                      href="/clusters/gpu-trainer-01/terminal"
                    />
                    <PageHeaderAction icon={StopIcon} label="Stop" onClick={() => {}} />
                    <PageHeaderAddButton label="Add node" onClick={() => {}} />
                  </>
                }
              />
              <section className="space-y-2 p-4">
                <h2 className="m-0 text-sm font-medium text-(--theme-app)">Logs</h2>
                <ActionToolbar groups={LOG_GROUPS} right={LOG_RIGHT} />
                <pre className="m-0 rounded-md border border-(--theme-border) p-3 text-xs text-(--theme-muted-text-color)">
                  {'node-0  ready\nnode-1  ready\nscheduler  accepting jobs'}
                </pre>
              </section>
            </div>
            <HostBindingLog events={host.events} />
          </div>
        </Viewport>
      )}
    </MockHost>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const stop = canvas.getByRole('button', { name: 'Stop' })
    const autoRefresh = canvas.getByRole('button', { name: 'Auto refresh' })
    // The page's commands come before the panel's controls: they sit in the bar.
    await expect(
      stop.compareDocumentPosition(autoRefresh) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    await expect(autoRefresh).toHaveAttribute('aria-pressed', 'true')
  },
}

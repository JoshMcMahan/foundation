import type { Meta, StoryObj } from '@storybook/react-vite'
import cx from 'classnames'
import type { ReactNode } from 'react'
import { useCallback, useMemo, useState } from 'react'
import { expect, screen, userEvent, within } from 'storybook/test'
import { BreadcrumbProvider } from '../components/Breadcrumbs'
import { keyedByContent } from '../components/keys'
import { HeaderAddButton, HeaderEditButton, PageHeader } from '../components/PageHeader'
import { type UILinkComponent, UIProvider, useNavigation } from '../components/Provider'
import { StatusBadge } from '../components/StatusBadge'
import { Table } from '../components/Table'
import {
  AddIcon,
  ClusterIcon,
  PowerIcon,
  RefreshIcon,
  SnapshotIcon,
  StopIcon,
  TerminalIcon,
  TrashIcon,
} from '../icons'
import { ActionToolbar, type ToolbarItem } from './ActionToolbar'
import { ListColumns, ListPage, ListRow, type PinnedRowAction, useListNavigate } from './ListPage'
import { ListError, ListSkeleton, listTableProps, NameCell } from './ListTable'
import { ListDisplayMenu, ListFilterMenu } from './ListViewControls'
import { ListCount, ListSearchControl, useListSearch } from './listSearch'
import { useListView } from './listView'
import { type RowMenuItem, useCopySubmenu, useRowMenu } from './RowContextMenu'

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

const MockLink: UILinkComponent = ({ to, onClick, className, children, ...rest }) => {
  const { goTo } = useNavigation()
  return (
    <a
      href={to}
      className={className}
      onClick={(e) => {
        e.preventDefault()
        onClick?.()
        goTo(to)
      }}
      {...rest}
    >
      {children}
    </a>
  )
}

/** Everything a host binds, in one place — the story doubles as the integration checklist. */
function useMockHost() {
  const [events, setEvents] = useState<string[]>([])
  const record = useCallback((line: string) => {
    setEvents((prev) => [line, ...prev].slice(0, 6))
  }, [])

  const notify = useMemo(
    () => ({
      info: (message: string) => record(`notify.info — ${message}`),
      success: (message: string) => record(`notify.success — ${message}`),
      warning: (message: string) => record(`notify.warning — ${message}`),
      error: (message: string) => record(`notify.error — ${message}`),
    }),
    [record],
  )

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

  return { events, notify, navigation, strings, slots }
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
    <UIProvider
      notify={host.notify}
      navigation={host.navigation}
      strings={host.strings}
      slots={host.slots}
    >
      <BreadcrumbProvider>{children(host)}</BreadcrumbProvider>
    </UIProvider>
  )
}

/** Storybook renders in a short frame; the shell fills its host, so give it one. */
function Viewport({ children, narrow }: { children: ReactNode; narrow?: boolean | undefined }) {
  return (
    <div
      className={cx(
        'h-[32rem] overflow-hidden rounded-md border border-(--theme-border) bg-(--theme-app-bg)',
        narrow && 'max-w-[24rem]',
      )}
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
}

function ClustersPage({ state, rowCount, sparseStatus }: ShellArgs) {
  const copySubmenu = useCopySubmenu()
  const goTo = useListNavigate()
  const { openMenu, contextMenu } = useRowMenu()
  const search = useListSearch()
  const [favorites, setFavorites] = useState<Record<string, boolean>>({})

  const all = useMemo(() => (state === 'empty' ? [] : makeRows(rowCount)), [state, rowCount])

  const view = useListView<ShellRow>({
    storageKey: 'workshop-app-shell-clusters',
    columns: [
      { key: 'name', label: 'Name', alwaysVisible: true },
      { key: 'location', label: 'Location', priority: 'medium' },
      // No priority: on a phone it moves under the name rather than dropping.
      { key: 'status', label: 'Status' },
      { key: 'owner', label: 'Owner', priority: 'low' },
    ],
    orderBys: [
      {
        value: 'name',
        label: 'Name',
        compare: (a, b) => a.name.localeCompare(b.name),
      },
      {
        value: 'nodes',
        label: 'Nodes',
        compare: (a, b) => a.nodes - b.nodes,
      },
    ],
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

  const menuItems = (row: ShellRow): RowMenuItem[] => [
    {
      kind: 'link',
      label: 'Open',
      to: `/clusters/${row.name}`,
      icon: <ClusterIcon />,
    },
    {
      kind: 'action',
      label: row.status === 'running' ? 'Stop' : 'Start',
      icon: row.status === 'running' ? <StopIcon /> : <PowerIcon />,
      onSelect: () => {},
    },
    {
      kind: 'action',
      label: 'Snapshot',
      icon: <SnapshotIcon />,
      onSelect: () => {},
    },
    copySubmenu({ name: row.name, id: row.id }),
    {
      kind: 'action',
      label: 'Delete',
      icon: <TrashIcon />,
      destructive: true,
      onSelect: () => {},
    },
  ]

  const pinnedActions = (row: ShellRow): PinnedRowAction[] =>
    view.isPinned('power')
      ? [
          {
            key: 'power',
            label: row.status === 'running' ? 'Stop' : 'Start',
            icon: row.status === 'running' ? <StopIcon /> : <PowerIcon />,
            onSelect: () => setFavorites((prev) => ({ ...prev, [row.id]: !prev[row.id] })),
          },
        ]
      : []

  return (
    <ListPage
      breadcrumbs={[{ label: 'Compute', href: '/compute' }]}
      title="Clusters"
      titleAction={<HeaderEditButton to="/clusters/settings" />}
      actions={<HeaderAddButton label="New cluster" word="create" to="/clusters/new" />}
      view={view}
      toolbar={
        <div className="flex items-center justify-between gap-3 py-1.5">
          <ListCount
            total={all.length}
            matches={rows.length}
            filterActive={query.length > 0 || view.activeFilterCount > 0}
            noun="cluster"
            nounPlural="clusters"
          />
          <div className="flex items-center gap-2">
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
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <ClusterIcon className="h-8 w-8 text-(--theme-muted-text-color)" />
          <p className="mt-3 max-w-sm text-sm text-(--theme-muted-text-color)">
            No clusters yet. Create one to get started.
          </p>
        </div>
      ) : (
        <Table {...listTableProps}>
          <ListColumns view={view} />
          {rows.map((row) => (
            <ListRow
              key={row.id}
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
          ))}
        </Table>
      )}
      {contextMenu}
    </ListPage>
  )
}

const meta: Meta<ShellArgs> = {
  title: 'UI/App Shell',
  args: { state: 'ready', rowCount: 8 },
  argTypes: {
    state: {
      control: 'inline-radio',
      options: ['ready', 'loading', 'empty', 'error'],
    },
    rowCount: { control: { type: 'range', min: 1, max: 40, step: 1 } },
    narrow: { control: 'boolean' },
    sparseStatus: { control: 'boolean' },
  },
  render: (args) => (
    <MockHost>
      {(host) => (
        <Viewport narrow={args.narrow}>
          <div className="flex h-full flex-col">
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

export const Loading: Story = { args: { state: 'loading' } }

export const Empty: Story = { args: { state: 'empty' } }

export const LoadFailed: Story = { args: { state: 'error' } }

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

const DETAIL_GROUPS: ToolbarItem[][] = [
  [
    {
      key: 'terminal',
      label: 'Terminal',
      icon: TerminalIcon,
      href: '/clusters/gpu-trainer-01/terminal',
    },
    { key: 'stop', label: 'Stop', icon: StopIcon, onClick: () => {} },
  ],
  [
    {
      key: 'snapshot',
      label: 'Snapshot',
      icon: SnapshotIcon,
      onClick: () => {},
    },
  ],
  [
    {
      key: 'auto-refresh',
      label: 'Auto refresh',
      icon: RefreshIcon,
      onClick: () => {},
      active: true,
    },
    { key: 'follow', label: 'Follow', icon: TerminalIcon, onClick: () => {}, active: false },
  ],
]

const DETAIL_RIGHT: ToolbarItem[] = [
  { key: 'refresh', label: 'Refresh', icon: RefreshIcon, onClick: () => {} },
  { key: 'add-node', label: 'Add node', icon: AddIcon, onClick: () => {} },
  {
    key: 'delete',
    label: 'Delete',
    icon: TrashIcon,
    onClick: () => {},
    disabled: true,
    disabledTooltip: 'Stop the cluster before deleting it',
  },
]

/** ActionToolbar's real habitat is a detail page, not a list — list pages put
 * search and view controls in the header's toolbar slot instead. */
export const DetailPageShell: StoryObj = {
  render: () => (
    <MockHost>
      {(host) => (
        <Viewport>
          <div className="flex h-full flex-col">
            <div className="min-h-0 flex-1 overflow-auto">
              <PageHeader
                breadcrumbs={[
                  { label: 'Compute', href: '/compute' },
                  { label: 'Clusters', href: '/clusters' },
                ]}
                title="gpu-trainer-01"
                titleAction={<HeaderEditButton to="/clusters/gpu-trainer-01/edit" />}
              />
              <div className="px-4">
                <ActionToolbar groups={DETAIL_GROUPS} right={DETAIL_RIGHT} sticky />
                <div className="py-6 text-sm text-(--theme-muted-text-color)">
                  Narrow the Storybook canvas to watch the right-hand actions collapse into the ⋯
                  menu.
                </div>
              </div>
            </div>
            <HostBindingLog events={host.events} />
          </div>
        </Viewport>
      )}
    </MockHost>
  ),
}

import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect, useState } from 'react'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { Avatar } from '../components/Avatar'
import { Button } from '../components/Button'
import { useContextMenu } from '../components/ContextMenu'
import { PageHeader, PageHeaderBar, PageHeaderProvider } from '../components/PageHeader'
import { PageHeaderAction, PageHeaderAddButton } from '../components/PageHeaderAction'
import { Pagination } from '../components/Pagination'
import { type UILinkComponent, UIProvider } from '../components/Provider'
import { StatusLabel } from '../components/StatusLabel'
import { Table } from '../components/Table'
import {
  AllocationIcon,
  ComputeIcon,
  KeyIcon,
  RefreshIcon,
  SidebarOpenIcon,
  StorageIcon,
} from '../icons'
import { ActionToolbar } from './ActionToolbar'
import { ListColumns, ListPage, ListRow, useListNavigate } from './ListPage'
import { ListCellText, listTableProps, NameCell } from './ListTable'
import { ListToolbar } from './ListToolbar'
import { useListSearch } from './listSearch'
import { useListView } from './listView'

type State = 'rows' | 'loading' | 'error' | 'empty' | 'noMatches'

interface Args {
  state: State
  iconTile: boolean
  subtitles: boolean
  toolbarWhenEmpty: boolean
}

const meta: Meta<Args> = {
  title: 'UI/List/Page',
  args: { state: 'rows', iconTile: true, subtitles: true, toolbarWhenEmpty: false },
  argTypes: {
    state: {
      control: 'inline-radio',
      options: ['rows', 'loading', 'error', 'empty', 'noMatches'],
      description: 'Which state the list is in: ListPage picks the body from it.',
    },
    iconTile: {
      description:
        'NameCell: the icon in a bordered tile beside a subtitle; a one-line row keeps it bare in the same width.',
    },
    subtitles: { description: 'NameCell: a second line under each name.' },
    toolbarWhenEmpty: { description: 'ListPage: keep the toolbar while the list is empty.' },
  },
}
export default meta

interface Token {
  name: string
  scope: string
  prefix: string
  uses: number
}

const TOKENS: Token[] = [
  { name: 'ci-deploy', scope: 'Deploy', prefix: 'tk_8f3c2a', uses: 1204 },
  { name: 'nightly-sync', scope: 'Read only', prefix: 'tk_91b7d4', uses: 88 },
  { name: 'laptop', scope: 'Full access', prefix: 'tk_e6f0aa', uses: 3 },
]

function TokensPage({ state, iconTile, subtitles, toolbarWhenEmpty }: Args) {
  const search = useListSearch(true)
  const view = useListView<Token>({
    storageKey: 'story-tokens',
    columns: [
      { key: 'name', label: 'Name', alwaysVisible: true },
      { key: 'prefix', label: 'Prefix' },
      { key: 'uses', label: 'Uses', align: 'end', stack: false },
    ],
  })
  const { openMenu, contextMenu } = useContextMenu()
  const goTo = useListNavigate()
  const rows = state === 'empty' ? [] : TOKENS
  const { setFilter, openSearch } = search
  // No matches shows a search that finds nothing, typed in the open field.
  useEffect(() => {
    if (state === 'noMatches') {
      setFilter('quota')
      openSearch()
    }
  }, [state, setFilter, openSearch])
  const query = search.filter.trim()
  const shown = rows.filter((row) => row.name.includes(query))
  return (
    <PageHeaderProvider>
      {/* Sizes are inline: the package's stylesheet doesn't scan stories. */}
      {/* A card that ends at its last row, as a settings list does. */}
      <div className="flex flex-col overflow-hidden rounded-md border border-(--theme-border) bg-(--theme-app-bg)">
        <PageHeaderBar />
        <PageHeader
          breadcrumbs={[{ label: 'Settings', href: '/settings' }, { label: 'API tokens' }]}
          actions={<PageHeaderAddButton label="New token" onClick={() => {}} />}
        />
        <div>
          <ListPage
            view={view}
            loading={state === 'loading'}
            error={state === 'error' ? new Error('The server took too long to answer.') : undefined}
            errorNoun="tokens"
            total={state === 'error' ? 0 : rows.length}
            matches={shown.length}
            toolbarWhenEmpty={toolbarWhenEmpty}
            empty={{
              icon: <KeyIcon />,
              title: 'No API tokens yet',
              description: 'Tokens let scripts and CI act as you. Create one from the header.',
            }}
            noMatches="No tokens match"
            toolbar={
              <ListToolbar
                count={{
                  total: rows.length,
                  matches: shown.length,
                  filterActive: query !== '',
                  noun: 'token',
                  nounPlural: 'tokens',
                }}
                view={view}
                search={search}
                searchLabel="Search tokens"
              />
            }
          >
            {/* In a card, its border ends the rows, so they need no rule of their own after the last. */}
            <Table {...listTableProps} tbodyClassName="divide-y divide-(--theme-border)">
              <ListColumns view={view} />
              {shown.map((token) => (
                <ListRow
                  key={token.name}
                  href={null}
                  items={[{ label: 'Revoke', destructive: true, onClick: () => {} }]}
                  goTo={goTo}
                  openMenu={openMenu}
                >
                  <NameCell
                    icon={<KeyIcon />}
                    iconTile={iconTile}
                    name={token.name}
                    subtitle={subtitles ? token.scope : undefined}
                    href={null}
                  />
                  <Table.Item>
                    <ListCellText mono>{token.prefix}</ListCellText>
                  </Table.Item>
                  <Table.Item>
                    <ListCellText className="tabular-nums">{token.uses}</ListCellText>
                  </Table.Item>
                </ListRow>
              ))}
            </Table>
          </ListPage>
        </div>
      </div>
      {contextMenu}
    </PageHeaderProvider>
  )
}

/** A settings list in the shared look: "+ Add" in the page header, display
 *  options and search at the toolbar's end, rows whose icons sit in a tile,
 *  muted cell text and a figure column set against its right edge, and the
 *  count under the last row. Switch the state to see loading, an error, the
 *  empty list (no toolbar, no count) and no matches (no count). */
export const States: StoryObj<Args> = {
  render: (args) => <TokensPage {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    if (args.state === 'rows') {
      await expect(canvas.getByRole('columnheader', { name: 'Uses' })).toHaveClass('text-right')
      // The count sits under the last row, not in the toolbar.
      const status = canvas.getByRole('status')
      await expect(status).toHaveTextContent('3 tokens')
      const lastRow = canvas.getByText('laptop').closest('tr') as HTMLElement
      await expect(
        lastRow.compareDocumentPosition(status) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy()
    }
    if (args.state === 'empty' || args.state === 'noMatches') {
      await expect(canvas.queryByRole('status')).toBeNull()
    }
    if (args.state === 'empty') {
      await expect(canvas.getByText('No API tokens yet')).toBeVisible()
      await expect(canvas.queryByRole('button', { name: 'Display options' })).toBeNull()
    }
  },
}

/** Rows with one line each, such as teams or labels: the icon stays bare in
 *  the tile's width, so a row is as short as its name and the names line up
 *  as they would beside tiles. */
export const OneLineRows: StoryObj<Args> = {
  args: { subtitles: false },
  render: (args) => <TokensPage {...args} />,
}

/** The empty list: the empty state in the body and no toolbar, with "+ Add" in
 *  the header. */
export const Empty: StoryObj<Args> = {
  args: { state: 'empty' },
  render: (args) => <TokensPage {...args} />,
}

/** A search that leaves nothing keeps the toolbar, so it can be changed; the
 *  no-matches state says what the count would. */
export const NoMatches: StoryObj<Args> = {
  args: { state: 'noMatches' },
  render: (args) => <TokensPage {...args} />,
}

type PagerKind = 'pages' | 'loadMore'

const PAGE_SIZE = 5
const MANY_TOKENS: Token[] = Array.from({ length: 23 }, (_, i) => ({
  name: `deploy-key-${String(i + 1).padStart(2, '0')}`,
  scope: i % 3 === 0 ? 'Read only' : 'Deploy',
  prefix: `tk_${(0x3a91f0 + i * 7919).toString(16)}`,
  uses: (i * 37) % 400,
}))

function PagedTokens({ pager }: { pager: PagerKind }) {
  const view = useListView<Token>({
    storageKey: 'story-paged-tokens',
    columns: [
      { key: 'name', label: 'Name', alwaysVisible: true },
      { key: 'prefix', label: 'Prefix' },
      { key: 'uses', label: 'Uses', align: 'end', stack: false },
    ],
  })
  const { openMenu, contextMenu } = useContextMenu()
  const goTo = useListNavigate()
  const [page, setPage] = useState(0)
  const [loaded, setLoaded] = useState(PAGE_SIZE)
  const shown =
    pager === 'pages'
      ? MANY_TOKENS.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
      : MANY_TOKENS.slice(0, loaded)
  return (
    <PageHeaderProvider>
      <div className="flex flex-col overflow-hidden rounded-md border border-(--theme-border) bg-(--theme-app-bg)">
        <PageHeader
          breadcrumbs={[{ label: 'Settings', href: '/settings' }, { label: 'Deploy keys' }]}
        />
        <ListPage
          view={view}
          total={MANY_TOKENS.length}
          count={{ noun: 'key', nounPlural: 'keys' }}
          toolbar={<ListToolbar view={view} />}
          pager={
            pager === 'pages' ? (
              <Pagination
                page={page}
                pageSize={PAGE_SIZE}
                total={MANY_TOKENS.length}
                onPageChange={setPage}
              />
            ) : (
              loaded < MANY_TOKENS.length && (
                <Button variant="outline" size="sm" onClick={() => setLoaded((n) => n + PAGE_SIZE)}>
                  Load more
                </Button>
              )
            )
          }
        >
          <Table {...listTableProps} tbodyClassName="divide-y divide-(--theme-border)">
            <ListColumns view={view} />
            {shown.map((token) => (
              <ListRow
                key={token.name}
                href={null}
                items={[{ label: 'Revoke', destructive: true, onClick: () => {} }]}
                goTo={goTo}
                openMenu={openMenu}
              >
                <NameCell icon={<KeyIcon />} name={token.name} subtitle={token.scope} href={null} />
                <Table.Item>
                  <ListCellText mono>{token.prefix}</ListCellText>
                </Table.Item>
                <Table.Item>
                  <ListCellText className="tabular-nums">{token.uses}</ListCellText>
                </Table.Item>
              </ListRow>
            ))}
          </Table>
        </ListPage>
      </div>
      {contextMenu}
    </PageHeaderProvider>
  )
}

/** A list read a page at a time: the count and the pager share one line under
 *  the last row, the count at the rows' start and the pager at their end. */
export const Paged: StoryObj<{ pager: PagerKind }> = {
  args: { pager: 'pages' },
  argTypes: {
    pager: {
      control: 'inline-radio',
      options: ['pages', 'loadMore'],
      description: 'ListPage pager: a Pagination, or a "Load more" button.',
    },
  },
  render: (args) => <PagedTokens pager={args.pager} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('status')).toHaveTextContent('23 keys')
  },
}

/** A list that loads more rows as asked: "Load more" takes the pager's place
 *  beside the count. */
export const LoadMore: StoryObj<{ pager: PagerKind }> = {
  ...Paged,
  args: { pager: 'loadMore' },
}

/** A toolbar action busy with what it started: the spinner takes its icon's
 *  place and it can't be pressed again until done. */
export const BusyToolbarAction: StoryObj<{ loading: boolean; onRefresh: () => void }> = {
  args: { loading: true, onRefresh: fn() },
  argTypes: {
    loading: { description: 'ToolbarAction: busy' },
    onRefresh: { table: { disable: true } },
  },
  render: ({ loading, onRefresh }) => (
    <ActionToolbar
      label="Bucket controls"
      groups={[
        [
          { key: 'refresh', label: 'Refresh', icon: <RefreshIcon />, loading, onClick: onRefresh },
          { key: 'browse', label: 'Browse', icon: <StorageIcon />, href: '/buckets' },
        ],
      ]}
    />
  ),
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Refresh' }))
    await waitFor(() => expect(args.onRefresh).toHaveBeenCalledTimes(args.loading ? 0 : 1))
  },
}

interface Resource {
  name: string
  id: string
  state: 'running' | 'stopped'
  region: string
  type: string
  machine: string
  started: string
}

const RESOURCES: Resource[] = [
  {
    name: 'gpu-east-head',
    id: 'i-0a91f3c2',
    state: 'running',
    region: 'us-east-1',
    type: 'Instance',
    machine: 'p4d.24xlarge',
    started: '3 hours ago',
  },
  {
    name: 'gpu-east-worker-1',
    id: 'i-07b2d9e4',
    state: 'running',
    region: 'us-east-1',
    type: 'Instance',
    machine: 'p4d.24xlarge',
    started: '3 hours ago',
  },
  {
    name: 'gpu-east-scratch',
    id: 'vol-0c55e1a8',
    state: 'stopped',
    region: 'us-east-1',
    type: 'Disk',
    machine: 'gp3',
    started: '2 days ago',
  },
]

// Cells as a host writes them: each column its own component, rendering a Table.Item.
function ResourceName({ resource }: { resource: Resource }) {
  return (
    <Table.Item className="max-w-[22rem] py-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <ComputeIcon className="size-5 shrink-0 text-(--theme-muted-text-color)" />
        <div className="min-w-0">
          <div className="truncate text-[13px] font-medium">{resource.name}</div>
          <div className="truncate font-mono text-xs text-(--theme-muted-text-color)">
            {resource.id}
          </div>
        </div>
      </div>
    </Table.Item>
  )
}

function StateCell({ state }: { state: Resource['state'] }) {
  // A status: a lamp and its name, unlit for a resource that's off.
  return (
    <Table.Item className="py-2.5 text-[13px]">
      <StatusLabel variant={state === 'running' ? 'success' : 'muted'} off={state !== 'running'}>
        {state === 'running' ? 'Running' : 'Stopped'}
      </StatusLabel>
    </Table.Item>
  )
}

function TextCell({ value, mono = false }: { value: string; mono?: boolean }) {
  return (
    <Table.Item className="max-w-[16rem] truncate py-2.5">
      <ListCellText mono={mono}>{value}</ListCellText>
    </Table.Item>
  )
}

function ResourcesList() {
  const view = useListView<Resource>({
    storageKey: 'story-resources',
    columns: [
      { key: 'name', label: 'Name', alwaysVisible: true },
      { key: 'state', label: 'State' },
      { key: 'region', label: 'Region' },
      { key: 'type', label: 'Type', priority: 'medium' },
      { key: 'machine', label: 'Machine type', priority: 'low' },
      { key: 'started', label: 'Started', priority: 'low' },
    ],
  })
  const { openMenu, contextMenu } = useContextMenu()
  const goTo = useListNavigate()
  return (
    <PageHeaderProvider>
      <div className="flex flex-col overflow-hidden rounded-md border border-(--theme-border) bg-(--theme-app-bg)">
        <PageHeader breadcrumbs={[{ label: 'Admin', href: '/admin' }, { label: 'Resources' }]} />
        <ListPage view={view} total={RESOURCES.length} matches={RESOURCES.length}>
          <Table {...listTableProps} tbodyClassName="divide-y divide-(--theme-border)">
            <ListColumns view={view} />
            {RESOURCES.map((resource) => (
              <ListRow
                key={resource.id}
                href={null}
                onActivate={() => {}}
                items={[{ label: 'Details', onClick: () => {} }]}
                goTo={goTo}
                openMenu={openMenu}
              >
                <ResourceName resource={resource} />
                <StateCell state={resource.state} />
                <TextCell value={resource.region} />
                <TextCell value={resource.type} />
                <TextCell value={resource.machine} mono />
                <TextCell value={resource.started} />
              </ListRow>
            ))}
          </Table>
        </ListPage>
      </div>
      {contextMenu}
    </PageHeaderProvider>
  )
}

/** Rows whose cells are the host's own components, each rendering a `Table.Item`, as a
 *  resources list writes them. They take their columns' classes as cells given straight do: on a
 *  phone the state and region stack under the name and the rest give way, rather than every
 *  column squeezing to a letter. */
export const CellsInHostComponents: StoryObj = {
  render: () => <ResourcesList />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const row = canvas.getByText('gpu-east-head').closest('tr') as HTMLElement
    const [name, state] = within(row).getAllByRole('cell')
    await expect(name?.querySelector('[data-stacked]')).toHaveTextContent('Running')
    await expect(state).toHaveClass('@[36rem]:table-cell')
  },
}

interface Volume {
  name: string
  type: string
  ephemeral: boolean
  owner: string
  size: string
}

const VOLUMES: Volume[] = [
  {
    name: 'scratch-lustre',
    type: 'Managed Lustre',
    ephemeral: false,
    owner: 'maya',
    size: '4,800',
  },
  {
    name: 'job-48210-scratch',
    type: 'Ephemeral Managed Lustre',
    ephemeral: true,
    owner: 'maya',
    size: '1,200',
  },
  { name: 'datasets', type: 'Bucket', ephemeral: false, owner: 'omar', size: '—' },
]

// A status only some rows have: a volume made for one job and gone after it has none, so the
// host's component renders nothing inside the cell it was given.
function VolumeStatus({ volume }: { volume: Volume }) {
  if (volume.ephemeral) {
    return null
  }
  return <StatusLabel variant="success">Provisioned</StatusLabel>
}

function VolumesList() {
  const view = useListView<Volume>({
    storageKey: 'story-volumes',
    columns: [
      { key: 'name', label: 'Name', alwaysVisible: true },
      { key: 'status', label: 'Status' },
      { key: 'owner', label: 'Owner' },
      { key: 'size', label: 'Size (GB)' },
    ],
  })
  const { openMenu, contextMenu } = useContextMenu()
  const goTo = useListNavigate()
  return (
    <PageHeaderProvider>
      <div className="flex flex-col overflow-hidden rounded-md border border-(--theme-border) bg-(--theme-app-bg)">
        <PageHeader breadcrumbs={[{ label: 'Storage' }]} />
        <ListPage view={view} total={VOLUMES.length} matches={VOLUMES.length}>
          <Table {...listTableProps} tbodyClassName="divide-y divide-(--theme-border)">
            <ListColumns view={view} />
            {VOLUMES.map((volume) => (
              <ListRow
                key={volume.name}
                href={null}
                onActivate={() => {}}
                items={[{ label: 'Details', onClick: () => {} }]}
                goTo={goTo}
                openMenu={openMenu}
              >
                <NameCell
                  icon={<StorageIcon />}
                  iconTile
                  name={volume.name}
                  subtitle={volume.type}
                  href={null}
                />
                <Table.Item className="py-2.5 text-[13px]">
                  <VolumeStatus volume={volume} />
                </Table.Item>
                <Table.Item className="py-2.5">
                  <div className="flex min-w-0 items-center gap-2 text-[13px] text-(--theme-muted-text-color)">
                    <Avatar name={volume.owner} size="sm" className="shrink-0" />
                    <span className="truncate">{volume.owner}</span>
                  </div>
                </Table.Item>
                <Table.Item className="py-2.5 text-[13px] text-(--theme-muted-text-color)">
                  {volume.size}
                </Table.Item>
              </ListRow>
            ))}
          </Table>
        </ListPage>
      </div>
      {contextMenu}
    </PageHeaderProvider>
  )
}

/** A storage list, where a volume made for one job has no status: on a phone, where the status,
 *  owner and size stack under the name, the missing status takes no room, so the owner starts the
 *  line under the name as it does on every other row. */
export const EmptyCellsOnAPhone: StoryObj = {
  render: () => <VolumesList />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const lines = ['scratch-lustre', 'job-48210-scratch'].map(
      (name) =>
        (canvas.getByText(name).closest('td') as HTMLElement).querySelector(
          '[data-stacked-line]',
        ) as HTMLElement,
    )
    // Where the line shows, the owner starts it on the row without a status as the status does
    // on the row with one.
    if (lines[1]?.checkVisibility()) {
      const start = (line: HTMLElement | undefined) =>
        [...(line?.children ?? [])].find((item) => item.checkVisibility())?.getBoundingClientRect()
          .left
      await expect(start(lines[1])).toBe(start(lines[0]))
    }
    // A status lamp's glow, 3px about it, shows whole: no box that clips it, up to its row,
    // clips nearer to it than that, whether the status is its own cell or on the line.
    for (const name of canvas.getAllByText('Provisioned')) {
      const lamp = name.previousElementSibling as HTMLElement
      if (!lamp.checkVisibility()) {
        continue
      }
      const dot = lamp.getBoundingClientRect()
      for (let box = lamp.parentElement; box && box.tagName !== 'TR'; box = box.parentElement) {
        const style = getComputedStyle(box)
        if (style.overflowX === 'visible' && style.overflowY === 'visible') {
          continue
        }
        const margin =
          style.overflowX === 'clip' ? Number.parseFloat(style.overflowClipMargin) || 0 : 0
        const edge = box.getBoundingClientRect()
        const room = Math.min(
          dot.left - edge.left,
          edge.right - dot.right,
          dot.top - edge.top,
          edge.bottom - dot.bottom,
        )
        await expect(room + margin).toBeGreaterThanOrEqual(3)
      }
    }
  },
}

interface Job {
  name: string
  id: string
  state: 'running' | 'pending'
  user: string
  partition: string
  nodes: string
}

const JOBS: Job[] = [
  {
    name: 'wrf-forecast',
    id: '48210',
    state: 'running',
    user: 'maya',
    partition: 'compute',
    nodes: 'compute-[01-04]',
  },
  {
    name: 'bwa-align',
    id: '48211',
    state: 'running',
    user: 'jo',
    partition: 'gpu',
    nodes: 'gpu-01',
  },
  {
    name: 'lammps-md',
    id: '48212',
    state: 'pending',
    user: 'priya',
    partition: 'compute',
    nodes: '',
  },
]

function JobsList() {
  const view = useListView<Job>({
    storageKey: 'story-stacked-lines',
    columns: [
      { key: 'name', label: 'Job', alwaysVisible: true },
      { key: 'state', label: 'State', stackLine: 'own' },
      { key: 'user', label: 'User', stackLine: 'own' },
      { key: 'partition', label: 'Partition', stackLine: 'own' },
      { key: 'nodes', label: 'Nodes', stackLine: 'join' },
    ],
  })
  const { openMenu, contextMenu } = useContextMenu()
  const goTo = useListNavigate()
  return (
    <PageHeaderProvider>
      <div className="flex flex-col overflow-hidden rounded-md border border-(--theme-border) bg-(--theme-app-bg)">
        <PageHeader breadcrumbs={[{ label: 'Jobs' }]} />
        <ListPage view={view} total={JOBS.length} matches={JOBS.length}>
          <Table {...listTableProps} tbodyClassName="divide-y divide-(--theme-border)">
            <ListColumns view={view} />
            {JOBS.map((job) => (
              <ListRow
                key={job.id}
                href={null}
                onActivate={() => {}}
                items={[{ label: 'Details', onClick: () => {} }]}
                goTo={goTo}
                openMenu={openMenu}
              >
                <NameCell
                  icon={<ComputeIcon />}
                  name={job.name}
                  subtitle={`#${job.id}`}
                  href={null}
                />
                <Table.Item className="py-2.5 text-[13px]">
                  <StatusLabel variant="info" off={job.state === 'pending'}>
                    {job.state === 'running' ? 'Running' : 'Pending'}
                  </StatusLabel>
                </Table.Item>
                <TextCell value={job.user} />
                <TextCell value={job.partition} mono />
                <Table.Item className="max-w-[16rem] truncate py-2.5">
                  {job.nodes && <ListCellText mono>{job.nodes}</ListCellText>}
                </Table.Item>
              </ListRow>
            ))}
          </Table>
        </ListPage>
      </div>
      {contextMenu}
    </PageHeaderProvider>
  )
}

/** On a phone, stacked values can each take a line, or join the one before after a dot, so every
 *  row reads alike however long its values are: the state, then who ran it, then where. They read
 *  as secondary text, the size of a subtitle. A job not yet placed has no nodes, and its line ends
 *  at the partition. */
export const StackedOnLines: StoryObj = {
  render: () => <JobsList />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const row = canvas.getByText('wrf-forecast').closest('tr') as HTMLElement
    const lines = Array.from(row.querySelectorAll('[data-stacked-line]'))
    await expect(lines.map((line) => line.textContent)).toEqual([
      'Running',
      'maya',
      'computecompute-[01-04]',
    ])
  },
}

interface Allocation {
  team: string
  lead: string
  budget: string
  used: string
}

const ALLOCATIONS: Allocation[] = [
  { team: 'Climate modeling', lead: 'maya', budget: '$42,000', used: '68%' },
  { team: 'Genomics pipeline', lead: 'arjun', budget: '$18,500', used: '91%' },
  { team: 'Materials simulation', lead: 'lena', budget: '$27,000', used: '34%' },
  { team: 'Wind tunnel CFD', lead: 'tomas', budget: '$12,750', used: '12%' },
]

// Links render as anchors that go nowhere, as the workshop's own do.
const StoryLink: UILinkComponent = ({ href, onClick, children, ...rest }) => (
  <a
    href={href}
    {...rest}
    onClick={(e) => {
      e.preventDefault()
      onClick?.(e)
    }}
  >
    {children}
  </a>
)

// The host's navigation toggle, where an app frame puts it: first in the bar.
const headerSlots = {
  link: StoryLink,
  navToggle: () => (
    <button
      type="button"
      aria-label="Open navigation"
      className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-(--theme-muted-text-color) hover:bg-(--theme-muted-panel-bg)"
    >
      <SidebarOpenIcon />
    </button>
  ),
}

function AllocationsPage({ searching }: { searching: boolean }) {
  const search = useListSearch(true)
  const view = useListView<Allocation>({
    storageKey: 'story-header-allocations',
    columns: [
      { key: 'team', label: 'Team', alwaysVisible: true },
      { key: 'budget', label: 'Budget', align: 'end' },
      { key: 'used', label: 'Used', align: 'end', stack: false },
    ],
    facets: [
      {
        key: 'lead',
        label: 'Lead',
        options: ALLOCATIONS.map((row) => ({ value: row.lead, label: row.lead })),
        matches: (row, selected) => selected.includes(row.lead),
      },
    ],
  })
  const { openMenu, contextMenu } = useContextMenu()
  const goTo = useListNavigate()
  const { setFilter, openSearch } = search
  useEffect(() => {
    if (searching) {
      openSearch()
      setFilter('sim')
    }
  }, [searching, setFilter, openSearch])
  const query = search.filter.trim().toLowerCase()
  const shown = view.applyFilters(
    ALLOCATIONS.filter((row) => row.team.toLowerCase().includes(query)),
  )
  return (
    <UIProvider slots={headerSlots}>
      <PageHeaderProvider>
        <div className="flex min-h-screen flex-col bg-(--theme-app-bg)">
          <PageHeaderBar />
          <PageHeader
            breadcrumbs={[
              { label: 'Billing', href: '/billing' },
              { label: 'Budgets', href: '/billing/budgets' },
              { label: 'Research computing' },
            ]}
            actions={
              <>
                <ListToolbar view={view} search={search} searchLabel="Search allocations" />
                <PageHeaderAction
                  icon={AllocationIcon}
                  label="Edit allocations"
                  onClick={() => {}}
                />
                <PageHeaderAddButton label="New allocation" onClick={() => {}} />
              </>
            }
          />
          <ListPage
            view={view}
            total={ALLOCATIONS.length}
            matches={shown.length}
            count={{
              noun: 'allocation',
              nounPlural: 'allocations',
              filterActive: query !== '' || view.activeFilterCount > 0,
            }}
            noMatches="No allocations match"
          >
            <Table {...listTableProps}>
              <ListColumns view={view} />
              {shown.map((row) => (
                <ListRow
                  key={row.team}
                  href={null}
                  items={[{ label: 'Edit', onClick: () => {} }]}
                  goTo={goTo}
                  openMenu={openMenu}
                >
                  <NameCell
                    icon={<AllocationIcon />}
                    name={row.team}
                    subtitle={`Led by ${row.lead}`}
                    href={null}
                  />
                  <Table.Item>
                    <ListCellText className="tabular-nums">{row.budget}</ListCellText>
                  </Table.Item>
                  <Table.Item>
                    <ListCellText className="tabular-nums">{row.used}</ListCellText>
                  </Table.Item>
                </ListRow>
              ))}
            </Table>
          </ListPage>
          {contextMenu}
        </div>
      </PageHeaderProvider>
    </UIProvider>
  )
}

/** A list whose controls sit in the page header, so its count can sit under its rows: the
 *  filter, display options and search, then the page's own actions. On a phone the header folds
 *  its actions into "…" and the trail to the current page before anything overlaps. */
export const ControlsInTheHeader: StoryObj = {
  parameters: { layout: 'fullscreen' },
  render: () => <AllocationsPage searching={false} />,
}

/** The search open with a query typed. Where the field fits beside the trail it opens in place;
 *  on a narrower header it takes the whole bar until it closes. */
export const ControlsInTheHeaderSearching: StoryObj = {
  parameters: { layout: 'fullscreen' },
  render: () => <AllocationsPage searching />,
}

// Whether the story's frame is phone width, as the field's own rule reads it.
function usePhoneWidth() {
  const query = '(max-width: 639.98px)'
  const [phone, setPhone] = useState(() => !!window.matchMedia?.(query).matches)
  useEffect(() => {
    if (!window.matchMedia) {
      return
    }
    const media = window.matchMedia(query)
    const change = () => setPhone(media.matches)
    media.addEventListener('change', change)
    return () => media.removeEventListener('change', change)
  }, [])
  return phone
}

function SettingsTokensPage({ searching }: { searching: boolean }) {
  const search = useListSearch(true)
  const view = useListView<Token>({
    storageKey: 'story-settings-tokens',
    columns: [
      { key: 'name', label: 'Name', alwaysVisible: true },
      { key: 'prefix', label: 'Prefix' },
      { key: 'uses', label: 'Uses', align: 'end', stack: false },
    ],
  })
  const { openMenu, contextMenu } = useContextMenu()
  const goTo = useListNavigate()
  const phone = usePhoneWidth()
  const { openSearch } = search
  useEffect(() => {
    if (searching) {
      openSearch()
    }
  }, [searching, openSearch])
  const query = search.filter.trim()
  const shown = TOKENS.filter((row) => row.name.includes(query))
  const toolbar = <ListToolbar view={view} search={search} searchLabel="Search tokens" />
  // On a phone, an open search gets a line of its own under the page's description, directly
  // above the rows it narrows; closed, its button stays at the end of the title's line.
  const ownLine = phone && (search.searchOpen || search.terms.length > 0)
  return (
    <PageHeaderProvider>
      {/* Sizes are inline: the package's stylesheet doesn't scan stories. */}
      <div className="flex flex-col bg-(--theme-app-bg)">
        <PageHeaderBar />
        <PageHeader
          breadcrumbs={[{ label: 'Settings', href: '/settings' }, { label: 'API tokens' }]}
          heading={false}
          actions={<PageHeaderAddButton label="New token" onClick={() => {}} />}
        />
        <header style={{ padding: '24px 16px 0' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <h1 style={{ flex: 1, minWidth: 0, margin: 0, fontSize: 20, fontWeight: 600 }}>
              API tokens
            </h1>
            {!ownLine && <div style={{ margin: '-6px 0' }}>{toolbar}</div>}
          </div>
          <p
            style={{ margin: '4px 0 0', fontSize: 14 }}
            className="text-(--theme-muted-text-color)"
          >
            Tokens act as you, within the access you give them. Create one for a script or an
            integration. Unused tokens expire after 90 days.
          </p>
          {ownLine && <div style={{ marginTop: 12 }}>{toolbar}</div>}
        </header>
        <div style={{ marginTop: ownLine ? 8 : 24 }} className="border-t border-(--theme-border)">
          <ListPage
            view={view}
            total={TOKENS.length}
            matches={shown.length}
            count={{ noun: 'token', nounPlural: 'tokens', filterActive: query !== '' }}
            noMatches="No tokens match"
          >
            <Table {...listTableProps}>
              <ListColumns view={view} />
              {shown.map((token) => (
                <ListRow
                  key={token.name}
                  href={null}
                  items={[{ label: 'Revoke', destructive: true, onClick: () => {} }]}
                  goTo={goTo}
                  openMenu={openMenu}
                >
                  <NameCell
                    icon={<KeyIcon />}
                    iconTile
                    name={token.name}
                    subtitle={token.scope}
                    href={null}
                  />
                  <Table.Item>
                    <ListCellText mono>{token.prefix}</ListCellText>
                  </Table.Item>
                  <Table.Item>
                    <ListCellText className="tabular-nums">{token.uses}</ListCellText>
                  </Table.Item>
                </ListRow>
              ))}
            </Table>
          </ListPage>
        </div>
      </div>
      {contextMenu}
    </PageHeaderProvider>
  )
}

/** A settings list whose toolbar sits at the end of its title's line, as a page with a title and
 *  a description lays it out. On a phone, the open search takes a line of its own under the
 *  description, directly above the rows, and fills it beside the display options; closed, the
 *  buttons go back to the title's end. On a desktop the field keeps its width beside the title. */
export const SearchOnAPhone: StoryObj = {
  parameters: { layout: 'fullscreen' },
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  render: () => <SettingsTokensPage searching />,
  play: async ({ canvasElement }) => {
    const field = await within(canvasElement).findByRole('textbox', { name: 'Search tokens' })
    const line = field.closest('header')?.getBoundingClientRect().width ?? 0
    const box = field.parentElement?.getBoundingClientRect().width ?? 0
    // The field takes the line beside the display options' button, not a fixed share of it.
    await expect(box).toBeGreaterThan(line * 0.7)
  },
}

/** The same page with the search closed: its button stays at the end of the title's line. */
export const SearchClosedOnAPhone: StoryObj = {
  parameters: { layout: 'fullscreen' },
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  render: () => <SettingsTokensPage searching={false} />,
}

import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, within } from 'storybook/test'
import { useContextMenu } from '../components/ContextMenu'
import { IconButton } from '../components/IconButton'
import { StatusBadge } from '../components/StatusBadge'
import { StatusLabel } from '../components/StatusLabel'
import { Table } from '../components/Table'
import { Tooltip } from '../components/Tooltip'
import {
  CloudIcon,
  DiskIcon,
  ExternalLinkIcon,
  GearsIcon,
  InstanceIcon,
  LinkIcon,
  NetworkInterfaceIcon,
  TrashIcon,
} from '../icons'
import { GroupRow, ListColumns, ListPage, ListRow, useListNavigate } from './ListPage'
import {
  ListCellText,
  ListSelectAllHeader,
  listTableFixedProps,
  listTableProps,
  NameCell,
  RowSelectCheckbox,
} from './ListTable'
import { type ColumnDef, useListView } from './listView'

const meta: Meta = {
  title: 'UI/List/Group rows',
  parameters: { layout: 'fullscreen' },
}
export default meta

interface Resource {
  id: string
  name: string
  cspId: string
  type: 'Instance' | 'Disk' | 'Network interface'
  state: 'running' | 'stopped' | 'pending'
  account: string
  region: string
  zone: string
  started: string
  lastSeen: string
}

interface Cluster {
  key: string
  name: string
  owner: string
  orphaned?: boolean
  /** The deployment that made it, shown where there is room. */
  deployment?: string
  deleting?: boolean
  resources: Resource[]
}

const resource = (
  id: string,
  name: string,
  type: Resource['type'],
  state: Resource['state'],
  zone: string,
): Resource => ({
  id,
  name,
  cspId: `i-0${id}7c3e91a2f4`,
  type,
  state,
  account: 'research-prod',
  region: zone.slice(0, -1),
  zone,
  started: 'Oct 14, 09:12',
  lastSeen: '2 min ago',
})

const CLUSTERS: Cluster[] = [
  {
    key: 'gpu-training',
    name: 'gpu-training-a100-west-cluster',
    owner: 'mlopez',
    resources: [
      resource('1', 'gpu-training-controller', 'Instance', 'running', 'us-west-2a'),
      resource('2', 'gpu-training-worker-0', 'Instance', 'running', 'us-west-2a'),
      resource('3', 'gpu-training-worker-1', 'Instance', 'stopped', 'us-west-2b'),
    ],
  },
  {
    key: 'cfd-burst',
    name: 'cfd-burst',
    owner: 'akhan',
    orphaned: true,
    deleting: true,
    deployment: 'dep-7f3a91c2e4b8d605',
    resources: [
      resource('4', 'cfd-burst-scratch', 'Disk', 'running', 'us-east-1c'),
      resource('5', 'cfd-burst-eni', 'Network interface', 'pending', 'us-east-1c'),
    ],
  },
]

const TYPE_ICON = {
  Instance: InstanceIcon,
  Disk: DiskIcon,
  'Network interface': NetworkInterfaceIcon,
} as const

const STATE_VARIANT = { running: 'success', stopped: 'muted', pending: 'warning' } as const

/** The columns of an inventory's Cluster tab. With `priorities`, as a host
 *  would set them, the type, state and region stack under the name on a phone,
 *  and the account, zone and start time drop below 52rem and the last-seen time
 *  below 36rem.
 *  Without, every column stacks. */
function columns(priorities: boolean): ColumnDef[] {
  const low = priorities ? ({ priority: 'low' } as const) : {}
  const medium = priorities ? ({ priority: 'medium' } as const) : {}
  // Widths only with priorities: without, every column shows down to 36rem, and
  // their widths together would leave the name none.
  const width = (w: string) => (priorities ? { width: w } : {})
  // Each column but the name takes a share of the list, and the name what they
  // leave; as columns drop, their shares go to the ones left. Without widths,
  // every column takes an equal share.
  return [
    { key: 'name', label: 'Name', alwaysVisible: true, headerClassName: 'truncate' },
    { key: 'type', label: 'Type', headerClassName: 'truncate', ...width('11%') },
    { key: 'state', label: 'State', headerClassName: 'truncate', ...width('10%') },
    {
      key: 'account',
      label: 'Cloud account',
      headerClassName: 'truncate',
      ...width('12%'),
      ...low,
    },
    { key: 'region', label: 'Region', headerClassName: 'truncate', ...width('10%') },
    { key: 'zone', label: 'Zone', headerClassName: 'truncate', ...width('9%'), ...low },
    { key: 'started', label: 'Started', headerClassName: 'truncate', ...width('10%'), ...low },
    {
      key: 'lastSeen',
      label: 'Last seen',
      headerClassName: 'truncate',
      ...width('9%'),
      ...medium,
    },
    // A delete button's column: always shown, never in the picker, at its own 40px.
    { key: 'delete', label: '', locked: true, stack: false, width: 40 },
  ]
}

function ClusterGroup({ cluster }: { cluster: Cluster }) {
  const running = cluster.resources.filter((r) => r.state === 'running').length
  return (
    <GroupRow
      label={
        <>
          <CloudIcon
            aria-hidden="true"
            className="size-4 shrink-0 text-(--theme-muted-text-color)"
          />
          <Tooltip content={cluster.key}>
            <span className="truncate text-[13px] font-semibold">{cluster.name}</span>
          </Tooltip>
          <span className="shrink-0 font-normal text-(--theme-muted-text-color)">
            · {cluster.owner}
          </span>
          {cluster.orphaned && <StatusBadge variant="warning">Orphan</StatusBadge>}
          {cluster.deleting && <StatusBadge variant="error">Deleting</StatusBadge>}
        </>
      }
      detail={
        cluster.deployment && (
          <Tooltip content={cluster.deployment}>
            <span className="font-mono text-[11px] font-normal">{cluster.deployment}</span>
          </Tooltip>
        )
      }
      trailing={`${running}/${cluster.resources.length} running`}
    />
  )
}

function ClusterTab({ priorities }: { priorities: boolean }) {
  const goTo = useListNavigate()
  const { openMenu, contextMenu } = useContextMenu()
  const view = useListView<Resource>({
    storageKey: `workshop-group-rows${priorities ? ':priorities' : ''}`,
    columns: columns(priorities),
    defaultShowColumnHeaders: true,
  })
  const cell = (key: string, r: Resource) => {
    switch (key) {
      case 'type':
        return <ListCellText>{r.type}</ListCellText>
      case 'state':
        return <StatusBadge variant={STATE_VARIANT[r.state]}>{r.state}</StatusBadge>
      case 'account':
        return <ListCellText>{r.account}</ListCellText>
      case 'region':
        return <ListCellText mono>{r.region}</ListCellText>
      case 'zone':
        return <ListCellText mono>{r.zone}</ListCellText>
      case 'started':
        return <ListCellText>{r.started}</ListCellText>
      case 'delete':
        return (
          <IconButton
            label={`Delete ${r.name}`}
            icon={<TrashIcon />}
            size="xs"
            onClick={(e) => e.stopPropagation()}
          />
        )
      default:
        return <ListCellText>{r.lastSeen}</ListCellText>
    }
  }
  return (
    <ListPage view={view}>
      <Table {...listTableFixedProps}>
        <ListColumns view={view} />
        {CLUSTERS.flatMap((cluster) => [
          <ClusterGroup key={cluster.key} cluster={cluster} />,
          ...cluster.resources.map((r) => {
            const Icon = TYPE_ICON[r.type]
            return (
              <ListRow
                key={r.id}
                href={null}
                onActivate={() => {}}
                items={[{ label: 'Details', onClick: () => {} }]}
                goTo={goTo}
                openMenu={openMenu}
              >
                <NameCell
                  icon={<Icon className="size-4" />}
                  iconTile
                  name={r.name}
                  subtitle={r.cspId}
                  href={null}
                />
                {view.visibleColumns.slice(1).map((col) => (
                  <Table.Item
                    key={col.key}
                    // The button's own 24px, and 8px either side, fill the delete column's 40px.
                    className={col.key === 'delete' ? 'px-2 py-2.5' : 'py-2.5'}
                  >
                    {cell(col.key, r)}
                  </Table.Item>
                ))}
              </ListRow>
            )
          }),
        ])}
      </Table>
      {contextMenu}
    </ListPage>
  )
}

/** An inventory's Cluster tab: each cluster's header row holds its provider's
 *  icon, its name with a tooltip, its owner, its badges, the deployment that made
 *  it where there is room and, against the far end, how many of its resources
 *  run. The columns take shares of the list, which the ones left share out as
 *  others drop, and a delete button's column keeps its own 40px. The header has a cell per column, so
 *  as columns drop, the group rows' cells drop with them. On a phone the type,
 *  state and region share one line under each name. */
export const ClusterTabGroups: StoryObj = {
  render: () => <ClusterTab priorities />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText('2/3 running')).toBeVisible()
    await expect(canvas.getByText('Orphan')).toBeVisible()
    const nameHeader = canvas.getByRole('columnheader', { name: 'Name' })
    // The name column keeps at least a fifth of the list, whatever the group rows hold.
    await expect(nameHeader.getBoundingClientRect().width).toBeGreaterThan(
      canvasElement.getBoundingClientRect().width / 5,
    )
  },
}

/** The same tab with no priorities: on a phone all seven columns stack, and
 *  share a line under the name that wraps between values. */
export const ClusterTabWithoutPriorities: StoryObj = {
  render: () => <ClusterTab priorities={false} />,
}

interface Session {
  id: string
  name: string
  type: 'desktop' | 'tunnel'
  state: 'running' | 'starting'
  owner: string
}

const SESSIONS: Session[] = [
  { id: 's-1', name: 'vscode-gpu-dev', type: 'desktop', state: 'running', owner: 'maya' },
  { id: 's-2', name: 'jupyter-tunnel', type: 'tunnel', state: 'running', owner: 'maya' },
  { id: 's-3', name: 'tensorboard', type: 'tunnel', state: 'running', owner: 'maya' },
  { id: 's-4', name: 'mlflow-ui', type: 'tunnel', state: 'starting', owner: 'jonas' },
  { id: 's-5', name: 'grafana-cluster', type: 'tunnel', state: 'running', owner: 'maya' },
]

const SESSION_GROUPS = [
  { id: 'desktop', label: 'VS Code and desktops' },
  { id: 'tunnel', label: 'Tunnels' },
] as const

/** A sessions list grouped by type: a selection checkbox before the columns, the columns, and
 *  the rows' actions, with a group header over each type. */
function SessionsByTypeDemo() {
  const goTo = useListNavigate()
  const { openMenu, contextMenu } = useContextMenu()
  const view = useListView<Session>({
    storageKey: 'workshop-sessions-by-type',
    columns: [
      {
        key: 'name',
        label: 'Name',
        headerClassName: 'py-2 w-[55%]',
        alwaysVisible: true,
        orderBy: 'name',
      },
      { key: 'icon', label: 'Icon', inline: true },
      { key: 'status', label: 'Status', headerClassName: 'py-2', orderBy: 'status' },
      { key: 'id', label: 'ID', headerClassName: 'py-2', defaultHidden: true },
    ],
    orderBys: [
      { value: 'name', label: 'Name', compare: (a, b) => a.name.localeCompare(b.name) },
      { value: 'status', label: 'Status', compare: (a, b) => a.state.localeCompare(b.state) },
    ],
    isFavorite: () => false,
    actions: [
      { key: 'open', label: 'Open in new window', defaultPinned: true },
      { key: 'details', label: 'Details', defaultPinned: true },
      { key: 'delete', label: 'Delete' },
    ],
  })
  const [selected, setSelected] = useState<Set<string>>(() => new Set(['s-2']))
  const toggle = (id: string) =>
    setSelected((was) => {
      const next = new Set(was)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  return (
    <ListPage view={view}>
      <Table {...listTableProps}>
        <ListSelectAllHeader
          selected={selected.size}
          total={SESSIONS.length}
          onToggle={() =>
            setSelected(
              selected.size === SESSIONS.length ? new Set() : new Set(SESSIONS.map((x) => x.id)),
            )
          }
        />
        <ListColumns view={view} />
        {SESSION_GROUPS.flatMap((group) => {
          const rows = SESSIONS.filter((x) => x.type === group.id)
          return [
            // As a host writes it: the columns it spans, without counting the checkbox's.
            <GroupRow
              key={`group-${group.id}`}
              label={group.label}
              count={rows.length}
              colSpan={view.visibleColumns.length + 2}
            />,
            ...rows.map((x) => (
              <ListRow
                key={x.id}
                href={null}
                onActivate={() => {}}
                items={[{ label: 'Delete', onClick: () => {} }]}
                goTo={goTo}
                openMenu={openMenu}
                selected={selected.has(x.id)}
                pinnedActions={[
                  {
                    key: 'open',
                    label: 'Open in new window',
                    icon: <ExternalLinkIcon />,
                    onClick: () => {},
                  },
                ]}
                leading={
                  <Table.Item className="py-2.5">
                    <RowSelectCheckbox
                      checked={selected.has(x.id)}
                      label={`Select ${x.name}`}
                      onToggle={() => toggle(x.id)}
                    />
                  </Table.Item>
                }
              >
                <NameCell
                  icon={<InstanceIcon className="size-4" />}
                  iconTile
                  name={x.name}
                  subtitle={x.owner}
                  href={null}
                />
                {view.isVisible('status') && (
                  <Table.Item className="py-2.5">
                    <StatusLabel
                      variant={x.state === 'running' ? 'success' : 'info'}
                      pulse={x.state === 'starting'}
                    >
                      {x.state === 'running' ? 'Running' : 'Starting'}
                    </StatusLabel>
                  </Table.Item>
                )}
                {view.isVisible('id') && (
                  <Table.Item className="py-2.5">
                    <ListCellText mono>{x.id}</ListCellText>
                  </Table.Item>
                )}
              </ListRow>
            )),
          ]
        })}
      </Table>
      {contextMenu}
    </ListPage>
  )
}

/** A sessions list grouped by type, with a selection checkbox before its columns and the rows'
 *  actions after them. Each group's band spans the whole row, as the rows under it do, at any
 *  width: the header row takes a cell for each of the table's columns, the checkbox's too. */
export const SessionsByType: StoryObj = {
  render: () => <SessionsByTypeDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const band = canvas.getByText('Tunnels').closest('tr') as HTMLElement
    const row = canvas.getByText('jupyter-tunnel').closest('tr') as HTMLElement
    const span = (tr: HTMLElement) => {
      const cells = [...tr.querySelectorAll(':scope > td')].filter(
        (c) => c.getClientRects().length > 0,
      )
      return [cells[0]?.getBoundingClientRect().left, cells.at(-1)?.getBoundingClientRect().right]
    }
    // The band reaches both edges the row under it reaches.
    await expect(span(band)).toEqual(span(row))
  },
}

interface HostSession {
  id: string
  name: string
  type: 'tunnel' | 'link'
  state: 'running' | 'error'
  target?: string
  port?: number
  /** Where an external session's link goes. */
  url?: string
  error?: string
}

const HOST_SESSIONS: HostSession[] = [
  {
    id: 'ss-1',
    name: 'devadmin/jupyter-lab',
    type: 'tunnel',
    state: 'error',
    target: 'devadmin/gputrainer',
    port: 8888,
    error:
      "Resource's agent is not connected. The session can't start until the agent on devadmin/gputrainer reconnects.",
  },
  {
    id: 'ss-2',
    name: 'devadmin/tensorboard',
    type: 'tunnel',
    state: 'error',
    target: 'devadmin/gputrainer',
    port: 6006,
    error:
      "Resource's agent is not connected. The session can't start until the agent on devadmin/gputrainer reconnects.",
  },
  {
    id: 'ss-3',
    name: 'devadmin/lab-wiki',
    type: 'link',
    state: 'running',
    url: 'wiki.example.com',
  },
  {
    id: 'ss-4',
    name: 'devadmin/grafana',
    type: 'link',
    state: 'running',
    url: 'grafana.example.com/d/gpu',
  },
]

const HOST_SESSION_GROUPS = [
  { id: 'tunnel', label: 'Tunnels' },
  { id: 'link', label: 'External' },
] as const

/** A sessions list: a checkbox before the columns, each session's icon in a tile beside its
 *  name and the host's own link for the name, a subtitle naming the resource it runs on with a link to it, a
 *  failed session's error under that, and the status as a column of its own that stacks under the
 *  name on a phone. */
function HostSessionsDemo() {
  const goTo = useListNavigate()
  const { openMenu, contextMenu } = useContextMenu()
  const view = useListView<HostSession>({
    storageKey: 'workshop-host-sessions',
    columns: [
      {
        key: 'name',
        label: 'Name',
        headerClassName: 'py-2 w-[55%]',
        alwaysVisible: true,
        orderBy: 'name',
      },
      { key: 'icon', label: 'Icon', inline: true },
      { key: 'status', label: 'Status', headerClassName: 'py-2', orderBy: 'status' },
      { key: 'id', label: 'ID', headerClassName: 'py-2', defaultHidden: true },
    ],
    orderBys: [
      { value: 'name', label: 'Name', compare: (a, b) => a.name.localeCompare(b.name) },
      { value: 'status', label: 'Status', compare: (a, b) => a.state.localeCompare(b.state) },
    ],
    isFavorite: () => false,
    actions: [
      { key: 'open', label: 'Open in new window', defaultPinned: true },
      { key: 'delete', label: 'Delete' },
    ],
  })
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const toggle = (id: string) =>
    setSelected((was) => {
      const next = new Set(was)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  return (
    <ListPage view={view} total={HOST_SESSIONS.length} matches={HOST_SESSIONS.length}>
      <Table {...listTableProps}>
        <ListSelectAllHeader
          selected={selected.size}
          total={HOST_SESSIONS.length}
          onToggle={() =>
            setSelected(
              selected.size === HOST_SESSIONS.length
                ? new Set()
                : new Set(HOST_SESSIONS.map((x) => x.id)),
            )
          }
        />
        <ListColumns view={view} />
        {HOST_SESSION_GROUPS.flatMap((group) => {
          const rows = HOST_SESSIONS.filter((x) => x.type === group.id)
          return [
            <GroupRow
              key={`group-${group.id}`}
              label={group.label}
              count={rows.length}
              colSpan={view.visibleColumns.length + 2}
            />,
            ...rows.map((x) => (
              <ListRow
                key={x.id}
                href={null}
                onActivate={() => {}}
                items={[{ label: 'Delete', onClick: () => {} }]}
                goTo={goTo}
                openMenu={openMenu}
                selected={selected.has(x.id)}
                pinnedActions={[
                  {
                    key: 'open',
                    label: 'Open in new window',
                    icon: <ExternalLinkIcon />,
                    onClick: () => {},
                  },
                ]}
                leading={
                  <Table.Item className="py-2.5">
                    <RowSelectCheckbox
                      checked={selected.has(x.id)}
                      label={`Select ${x.name}`}
                      onToggle={() => toggle(x.id)}
                    />
                  </Table.Item>
                }
              >
                <NameCell
                  icon={
                    view.isVisible('icon') && (x.type === 'tunnel' ? <CloudIcon /> : <LinkIcon />)
                  }
                  iconTile
                  // The host's own link, which opens the session in a new tab, and is dimmed
                  // while it can't.
                  name={
                    <a
                      href="#session"
                      className={x.state === 'error' ? 'opacity-50' : undefined}
                      aria-disabled={x.state === 'error' || undefined}
                    >
                      {x.name}
                    </a>
                  }
                  // Every session has a second line, so every row's icon has its tile.
                  subtitle={
                    x.url ??
                    (x.target && (
                      <span className="inline-flex items-center gap-1">
                        on
                        <GearsIcon className="size-3.5 shrink-0" />
                        <a href="#resource" className="hover:underline">
                          {x.target}
                        </a>
                        <span>{x.port}</span>
                      </span>
                    ))
                  }
                  description={x.error}
                  descriptionTone="error"
                  href={null}
                />
                {view.isVisible('status') && (
                  <Table.Item className="py-2.5">
                    <StatusLabel
                      className="text-[13px]"
                      variant={x.state === 'running' ? 'success' : 'error'}
                    >
                      {x.state === 'running' ? 'Running' : 'Error'}
                    </StatusLabel>
                  </Table.Item>
                )}
                {view.isVisible('id') && (
                  <Table.Item className="py-2.5">
                    <ListCellText mono>{x.id}</ListCellText>
                  </Table.Item>
                )}
              </ListRow>
            )),
          ]
        })}
      </Table>
      {contextMenu}
    </ListPage>
  )
}

/** A sessions list where two sessions failed. The error under the name wraps inside the name's
 *  column for two lines at most, so on a phone it never runs past the row, and the status that
 *  stacks under it starts at the name's edge, past the glyph, as the name and subtitle do. */
export const SessionsWithErrors: StoryObj = {
  render: () => <HostSessionsDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const name = canvas.getByText('devadmin/jupyter-lab')
    const row = name.closest('tr') as HTMLElement
    const error = within(row).getByText(/agent is not connected/)
    // The error ends inside its row, however long it is.
    await expect(error.getBoundingClientRect().right).toBeLessThanOrEqual(
      row.getBoundingClientRect().right,
    )
    const line = row.querySelector('[data-stacked-line]') as HTMLElement
    // Where the status stacks under the name, it starts where the name does, and the row's
    // checkbox sits at its top, centered on the icon's tile and as far from it as the tile is from
    // the name, rather than in the middle of the lines under them.
    if (line.checkVisibility()) {
      const box = within(row).getByRole('checkbox').getBoundingClientRect()
      const tile = (row.querySelector('td .rounded-md') as HTMLElement).getBoundingClientRect()
      const middle = (r: DOMRect) => r.top + r.height / 2
      await expect(Math.abs(middle(box) - middle(tile))).toBeLessThan(1)
      await expect(Math.round(tile.left - box.right)).toBe(
        Math.round(error.getBoundingClientRect().left - tile.right),
      )
      await expect(line.getBoundingClientRect().left).toBe(error.getBoundingClientRect().left)
    }
  },
}

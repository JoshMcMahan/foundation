import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ReactNode } from 'react'
import { expect, userEvent, within } from 'storybook/test'
import { AppLink } from '../components/AppLink'
import { useContextMenu } from '../components/ContextMenu'
import { ProgressBar } from '../components/Meter'
import { StatusLabel } from '../components/StatusLabel'
import { Table } from '../components/Table'
import { ClusterIcon, QueueIcon } from '../icons'
import { GroupRow, ListColumns, ListGroup, ListPage, ListRow, useListNavigate } from './ListPage'
import { ListCellText, listTableProps, NameCell } from './ListTable'
import { ListToolbar } from './ListToolbar'
import { type ColumnDef, useListView } from './listView'

const meta: Meta = {
  title: 'UI/List/Collapsible groups',
  parameters: { layout: 'fullscreen' },
}
export default meta

interface Queue {
  name: string
  state: 'up' | 'drain' | 'down' | 'inactive'
  nodes: string
  timeLimit: string
  jobs: number
}

interface Cluster {
  key: string
  name: string
  scheduler: string
  /** Nodes running work, healthy. */
  allocated: number
  /** Nodes partly in use. */
  mixed: number
  down: number
  idle: number
  total: number
  queues: Queue[]
}

const CLUSTERS: Cluster[] = [
  {
    key: 'gpu-west',
    name: 'gpu-west',
    scheduler: 'slurm 24.05',
    allocated: 22,
    mixed: 2,
    down: 2,
    idle: 6,
    total: 32,
    queues: [
      { name: 'gpu', state: 'up', nodes: '24 nodes', timeLimit: '2 days', jobs: 41 },
      { name: 'gpu-debug', state: 'up', nodes: '4 nodes', timeLimit: '1 hour', jobs: 3 },
      { name: 'gpu-long', state: 'drain', nodes: '4 nodes', timeLimit: '7 days', jobs: 8 },
    ],
  },
  {
    key: 'cpu-east',
    name: 'cpu-east',
    scheduler: 'pbs 2024.1',
    allocated: 16,
    mixed: 0,
    down: 0,
    idle: 112,
    total: 128,
    queues: [
      { name: 'batch', state: 'up', nodes: '96 nodes', timeLimit: '1 day', jobs: 120 },
      { name: 'interactive', state: 'up', nodes: '16 nodes', timeLimit: '8 hours', jobs: 12 },
      { name: 'legacy', state: 'inactive', nodes: '0 nodes', timeLimit: '1 day', jobs: 0 },
    ],
  },
  {
    key: 'burst-cloud',
    name: 'burst-cloud',
    scheduler: 'slurm 23.11',
    allocated: 0,
    mixed: 0,
    down: 8,
    idle: 0,
    total: 8,
    queues: [{ name: 'spot', state: 'down', nodes: '8 nodes', timeLimit: '4 hours', jobs: 0 }],
  },
]

// Each state's name and lamp, by what it means: up is healthy, draining needs a look, down
// failed, and an inactive queue is off.
const STATE_LOOK = {
  up: { label: 'Up', variant: 'success', off: false },
  drain: { label: 'Drain', variant: 'warning', off: false },
  down: { label: 'Down', variant: 'error', off: false },
  inactive: { label: 'Inactive', variant: 'muted', off: true },
} as const

const COLUMNS: ColumnDef[] = [
  { key: 'name', label: 'Queue', alwaysVisible: true },
  { key: 'state', label: 'State', width: '14%', stackLine: 'own' },
  { key: 'nodes', label: 'Nodes', width: '14%' },
  { key: 'timeLimit', label: 'Time limit', width: '14%' },
  { key: 'jobs', label: 'Jobs', width: '10%', align: 'end', stack: false },
]

/** A cluster's header: its name, which leads to it, its scheduler where there is room, how
 *  many queues it holds and, against the far end, how much of it is free. */
function ClusterHeader({ cluster }: { cluster: Cluster }) {
  return (
    <GroupRow
      label={
        <>
          <ClusterIcon
            aria-hidden="true"
            className="size-4 shrink-0 text-(--theme-muted-text-color)"
          />
          <AppLink href={`#/clusters/${cluster.key}`} className="truncate hover:underline">
            {cluster.name}
          </AppLink>
        </>
      }
      detail={cluster.scheduler}
      count={cluster.queues.length}
      trailing={
        <>
          <span className="hidden w-24 @[36rem]:block">
            {/* Nodes in use are healthy green, partly used ones blue and down ones red; the
                idle ones are the empty track. */}
            <ProgressBar
              value={cluster.allocated}
              max={cluster.total}
              tone="success"
              segments={[
                { value: cluster.mixed, tone: 'info' },
                { value: cluster.down, tone: 'error' },
              ]}
              showValue="none"
              size="sm"
              aria-label={`${cluster.name} nodes in use`}
            />
          </span>
          <span>
            {cluster.idle}/{cluster.total} free
          </span>
        </>
      }
    />
  )
}

function Frame({ width, children }: { width?: number | undefined; children: ReactNode }) {
  return (
    <div className="flex justify-center bg-(--theme-app-bg) p-4" style={{ height: 720 }}>
      <div
        className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-(--theme-border) bg-(--theme-panel-bg)"
        style={width ? { maxWidth: width } : undefined}
      >
        {children}
      </div>
    </div>
  )
}

function Queues({
  storageKey,
  width,
  collapsed = [],
}: {
  storageKey: string
  width?: number | undefined
  /** Groups closed the first time they show. */
  collapsed?: string[]
}) {
  const goTo = useListNavigate()
  const { openMenu, contextMenu } = useContextMenu()
  const view = useListView<Queue>({ storageKey, columns: COLUMNS })
  const total = CLUSTERS.reduce((sum, c) => sum + c.queues.length, 0)
  const cell = (key: string, q: Queue) => {
    switch (key) {
      case 'state':
        return (
          // A status label takes the size of the text around it: the cells' 13px.
          <StatusLabel
            variant={STATE_LOOK[q.state].variant}
            off={STATE_LOOK[q.state].off}
            className="text-[13px]"
          >
            {STATE_LOOK[q.state].label}
          </StatusLabel>
        )
      case 'nodes':
        return <ListCellText>{q.nodes}</ListCellText>
      case 'timeLimit':
        return <ListCellText>{q.timeLimit}</ListCellText>
      default:
        return <span className="tabular-nums">{q.jobs}</span>
    }
  }
  return (
    <Frame width={width}>
      <ListPage
        view={view}
        toolbar={<ListToolbar view={view} />}
        total={total}
        count={{ noun: 'queue', nounPlural: 'queues' }}
      >
        <Table {...listTableProps}>
          <ListColumns view={view} />
          {CLUSTERS.map((cluster) => (
            <ListGroup
              key={cluster.key}
              groupKey={cluster.key}
              defaultCollapsed={collapsed.includes(cluster.key)}
              header={<ClusterHeader cluster={cluster} />}
            >
              {cluster.queues.map((q) => (
                <ListRow
                  key={q.name}
                  href={`#/clusters/${cluster.key}/queues/${q.name}`}
                  items={[{ label: 'Open', href: `#/clusters/${cluster.key}/queues/${q.name}` }]}
                  goTo={goTo}
                  openMenu={openMenu}
                >
                  <NameCell
                    icon={<QueueIcon className="size-4" />}
                    name={q.name}
                    href={`#/clusters/${cluster.key}/queues/${q.name}`}
                    subtitle={`${q.jobs} jobs`}
                  />
                  {view.visibleColumns.slice(1).map((col) => (
                    <Table.Item key={col.key} className="py-2.5">
                      {cell(col.key, q)}
                    </Table.Item>
                  ))}
                </ListRow>
              ))}
            </ListGroup>
          ))}
        </Table>
      </ListPage>
      {contextMenu}
    </Frame>
  )
}

/** Queues under a header for each cluster. A click on a header, other than on the cluster's
 *  name, which leads to it, folds its queues away; Tab reaches the chevron's button, which
 *  Enter and Space press. A folded cluster still shows how many queues it holds, and the
 *  count under the list still counts them all. Display options collapse or expand them all. */
export const Collapsible: StoryObj = {
  render: () => <Queues storageKey="story-collapsible-groups" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const toggle = await canvas.findByRole('button', { name: 'cpu-east' })
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await userEvent.click(toggle)
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(canvas.queryByText('interactive')).toBeNull()
    await expect(canvas.getByRole('status')).toHaveTextContent('7 queues')
    await userEvent.click(toggle)
    await expect(canvas.getByText('interactive')).toBeVisible()
  },
}

/** Two clusters folded: their headers keep their counts and usage, with no rule or gap left
 *  where the queues were, the last one's rule the list's last divider. Which are folded is
 *  remembered with the list's view, so they stay folded after a reload. */
export const Collapsed: StoryObj = {
  render: () => (
    <Queues storageKey="story-collapsed-groups" collapsed={['gpu-west', 'burst-cloud']} />
  ),
}

/** At phone width the state takes a line of its own under each queue's name and the nodes
 *  and time limit share the next; the headers keep their chevrons, names and counts. */
export const Phone: StoryObj = {
  render: () => <Queues storageKey="story-phone-groups" width={390} collapsed={['cpu-east']} />,
}

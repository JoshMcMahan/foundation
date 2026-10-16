import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ReactNode } from 'react'
import { expect, waitFor, within } from 'storybook/test'
import { PageHeader } from '../components/PageHeader'
import { StatusBadge } from '../components/StatusBadge'
import { Table } from '../components/Table'
import { Tabs } from '../components/Tabs'
import { cx } from '../cx'
import { RefreshIcon, SnapshotIcon, StopIcon, TerminalIcon } from '../icons'
import { ActionToolbar, stickyToolbarClasses, type ToolbarItem } from './ActionToolbar'
import { ListPage } from './ListPage'
import { listTableProps } from './ListTable'

// A detail page in a shell that pins its chrome inside the page's scroller:
// the page header at the top, the page's toolbar under it and its tabs under
// that. Each sets its own `top`, the way a host stacks them. A table's header
// finds where they end by itself. Sizes are inline: the package's stylesheet
// doesn't scan stories.
const HEADER = 44
const TOOLBAR = 40
const TABS = HEADER + TOOLBAR

const meta: Meta = {
  title: 'UI/Sticky table headers',
  parameters: { layout: 'padded' },
}
export default meta

const STATUSES = ['running', 'stopped', 'error'] as const
const VARIANT = { running: 'success', stopped: 'muted', error: 'error' } as const

function NodeRows({ count, prefix = 'node' }: { count: number; prefix?: string }) {
  return Array.from({ length: count }, (_, i) => {
    const status = STATUSES[i % STATUSES.length] ?? 'running'
    const name = `${prefix}-${String(i + 1).padStart(2, '0')}`
    return (
      <tr key={name}>
        <Table.Item className="text-[13px] font-medium">{name}</Table.Item>
        <Table.Item>
          <StatusBadge variant={VARIANT[status]}>{status}</StatusBadge>
        </Table.Item>
        <Table.Item className="text-[13px] text-(--theme-muted-text-color)">
          10.0.{Math.floor(i / 8)}.{(i % 250) + 2}
        </Table.Item>
        <Table.Item className="text-right text-[13px] tabular-nums">{4 + (i % 4) * 8}</Table.Item>
      </tr>
    )
  })
}

function NodesTable({ count, label }: { count: number; label: string }) {
  return (
    <Table {...listTableProps} tableProps={{ 'aria-label': label }}>
      <Table.Header>Name</Table.Header>
      <Table.Header>Status</Table.Header>
      <Table.Header>Address</Table.Header>
      <Table.Header className="text-right">Cores</Table.Header>
      <NodeRows count={count} />
    </Table>
  )
}

const TOOLBAR_GROUPS: ToolbarItem[][] = [
  [
    { key: 'terminal', label: 'Terminal', icon: <TerminalIcon />, href: '/terminal' },
    { key: 'stop', label: 'Stop', icon: <StopIcon />, onClick: () => {} },
  ],
  [{ key: 'snapshot', label: 'Snapshot', icon: <SnapshotIcon />, onClick: () => {} }],
]
const TOOLBAR_RIGHT: ToolbarItem[] = [
  { key: 'refresh', label: 'Refresh', icon: <RefreshIcon />, onClick: () => {} },
]

const TAB_ITEMS = [
  { value: 'overview', label: 'Overview', href: '#overview' },
  { value: 'nodes', label: 'Nodes', href: '#nodes' },
  { value: 'storage', label: 'Storage', href: '#storage' },
  { value: 'events', label: 'Events', href: '#events' },
]

function Filler({ lines }: { lines: number }) {
  return (
    <dl
      className="m-0 grid gap-x-6 gap-y-2 text-sm"
      style={{ gridTemplateColumns: 'max-content 1fr' }}
    >
      {Array.from({ length: lines }, (_, i) => `setting-${i + 1}`).map((setting) => (
        <div key={setting} className="contents">
          <dt className="text-(--theme-muted-text-color)">{setting}</dt>
          <dd className="m-0">{setting.replace('setting', 'value')}</dd>
        </div>
      ))}
    </dl>
  )
}

/** The shell: a frame whose page scrolls under the pinned page header. */
function DetailShell({
  width,
  toolbar,
  children,
}: {
  width?: number | undefined
  toolbar?: ReactNode
  children: ReactNode
}) {
  return (
    <div
      className="overflow-hidden rounded-md border border-(--theme-border) bg-(--theme-app-bg)"
      style={{ height: '34rem', maxWidth: width }}
    >
      <div data-testid="page" className="h-full overflow-auto">
        <div className={stickyToolbarClasses}>
          <PageHeader
            breadcrumbs={[
              { label: 'Compute', href: '/compute' },
              { label: 'Clusters', href: '/clusters' },
              { label: 'gpu-trainer-01' },
            ]}
          />
        </div>
        {toolbar ?? (
          <div className={cx('px-4 py-1.5', stickyToolbarClasses)} style={{ top: HEADER }}>
            <ActionToolbar label="Cluster controls" groups={TOOLBAR_GROUPS} right={TOOLBAR_RIGHT} />
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

function PageTabs({ top }: { top: number }) {
  return (
    // Pinned by a wrapper, so the story can give it an inline `top`.
    <div
      className="z-(--layer-sticky) bg-(--theme-app-bg) px-4"
      style={{ position: 'sticky', top }}
    >
      <Tabs label="gpu-trainer-01" value="nodes" items={TAB_ITEMS} />
    </div>
  )
}

const section = 'space-y-2 px-4 py-4'
const heading = 'm-0 text-sm font-medium text-(--theme-app)'

/** The gap between the bottom of what the page pins and the stuck header's
 *  top, once the page has scrolled the table's top out of view. */
async function expectPinnedBelow(canvasElement: HTMLElement, table: string, chromeBottom: number) {
  const canvas = within(canvasElement)
  const page = canvas.getByTestId('page')
  const thead = canvas.getByRole('table', { name: table }).querySelector('thead') as HTMLElement
  page.scrollTo({ top: thead.getBoundingClientRect().top - page.getBoundingClientRect().top + 300 })
  await waitFor(() =>
    expect(thead.getBoundingClientRect().top - page.getBoundingClientRect().top).toBe(chromeBottom),
  )
}

type DetailArgs = { rows: number; width: number }

/** A long detail page whose Nodes table scrolls with the page, under the
 *  pinned page header, toolbar and tabs. As the table passes, its column
 *  header stops just below the tabs, never behind them. */
export const DetailPageEmbeddedTable: StoryObj<DetailArgs> = {
  name: 'Detail page with an embedded table',
  args: { rows: 30, width: 900 },
  argTypes: {
    rows: { control: { type: 'range', min: 3, max: 60, step: 1 } },
    width: { control: { type: 'range', min: 320, max: 1200, step: 10 } },
  },
  render: ({ rows, width }) => (
    <DetailShell width={width}>
      <PageTabs top={TABS} />
      <section className={section}>
        <h2 className={heading}>Overview</h2>
        <Filler lines={8} />
      </section>
      <section className={section}>
        <h2 className={heading}>Nodes</h2>
        <NodesTable count={rows} label="Nodes" />
      </section>
      <section className={section}>
        <h2 className={heading}>Settings</h2>
        <Filler lines={20} />
      </section>
    </DetailShell>
  ),
  play: async ({ canvasElement }) => {
    const tabs = within(canvasElement).getByRole('tablist').closest('[style]') as HTMLElement
    await expectPinnedBelow(canvasElement, 'Nodes', TABS + tabs.getBoundingClientRect().height)
  },
}

/** A section's own heading pins under the page's tabs while the section is in
 *  view; the table in that section pins under the heading in turn. */
export const NestedStickyHeading: StoryObj<DetailArgs> = {
  name: 'Under a pinned section heading',
  args: { rows: 30, width: 900 },
  render: ({ rows, width }) => (
    <DetailShell width={width}>
      <PageTabs top={TABS} />
      <section className={section}>
        <h2 className={heading}>Overview</h2>
        <Filler lines={8} />
      </section>
      <section className="px-4 pb-4">
        <h2
          className={cx(heading, 'z-(--layer-sticky) border-b border-(--theme-border) py-2')}
          // Below the tabs, which are 37px tall.
          style={{ position: 'sticky', top: TABS + 37, background: 'var(--theme-app-bg)' }}
        >
          Nodes
        </h2>
        <NodesTable count={rows} label="Nodes" />
      </section>
      <section className={section}>
        <h2 className={heading}>Settings</h2>
        <Filler lines={20} />
      </section>
    </DetailShell>
  ),
  play: async ({ canvasElement }) => {
    const heading = within(canvasElement).getByRole('heading', { name: 'Nodes' })
    const bottom = Number.parseFloat(heading.style.top) + heading.getBoundingClientRect().height
    await expectPinnedBelow(canvasElement, 'Nodes', bottom)
  },
}

/** A table in a panel that scrolls on its own, on the same page: its header
 *  pins at the top of the panel, whatever the page pins above it. */
export const OwnScrollBox: StoryObj<DetailArgs> = {
  name: 'In a box that scrolls on its own',
  args: { rows: 30, width: 900 },
  render: ({ rows, width }) => (
    <DetailShell width={width}>
      <PageTabs top={TABS} />
      <section className={section}>
        <h2 className={heading}>Events</h2>
        <div
          data-testid="panel"
          className="overflow-auto rounded-md border border-(--theme-border)"
          style={{ height: 240 }}
        >
          <NodesTable count={rows} label="Events" />
        </div>
      </section>
      <section className={section}>
        <h2 className={heading}>Settings</h2>
        <Filler lines={20} />
      </section>
    </DetailShell>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const panel = canvas.getByTestId('panel')
    const thead = canvas
      .getByRole('table', { name: 'Events' })
      .querySelector('thead') as HTMLElement
    panel.scrollTo({ top: 300 })
    await waitFor(() => expect(panel.scrollTop).toBeGreaterThan(100))
    await expect(thead.getBoundingClientRect().top - panel.getBoundingClientRect().top).toBe(1)
  },
}

/** A toolbar that wraps onto a second row on a narrow page: the header moves
 *  down with it, in the same frame. Drag the width to wrap it. */
export const WrappingToolbar: StoryObj<DetailArgs> = {
  name: 'Under a toolbar that wraps',
  args: { rows: 30, width: 420 },
  argTypes: { width: { control: { type: 'range', min: 320, max: 1200, step: 10 } } },
  render: ({ rows, width }) => (
    <DetailShell
      width={width}
      toolbar={
        <div
          data-testid="filters"
          className={cx(
            'flex flex-wrap items-center gap-2 border-b border-(--theme-border) px-4 py-2 text-xs',
            stickyToolbarClasses,
          )}
          style={{ top: HEADER }}
        >
          {[
            'Status: any',
            'Zone: us-east-1a',
            'Instance: g5.xlarge',
            'Owner: alice',
            'Tag: gpu',
          ].map((filter) => (
            <span
              key={filter}
              className="rounded-full border border-(--theme-border) px-2 py-0.5 whitespace-nowrap"
            >
              {filter}
            </span>
          ))}
        </div>
      }
    >
      <section className={section}>
        <h2 className={heading}>Overview</h2>
        <Filler lines={8} />
      </section>
      <section className={section}>
        <h2 className={heading}>Nodes</h2>
        <NodesTable count={rows} label="Nodes" />
      </section>
      <section className={section}>
        <Filler lines={20} />
      </section>
    </DetailShell>
  ),
  play: async ({ canvasElement }) => {
    const filters = within(canvasElement).getByTestId('filters')
    await expectPinnedBelow(canvasElement, 'Nodes', HEADER + filters.getBoundingClientRect().height)
  },
}

/** A list page under the shell's header and the page's tabs: the list's body
 *  scrolls on its own, below its toolbar, so its header pins at the body's top. */
export const ListPageUnderTabs: StoryObj<DetailArgs> = {
  name: 'List page under tabs',
  args: { rows: 40, width: 900 },
  render: ({ rows, width }) => (
    <div
      className="flex flex-col overflow-hidden rounded-md border border-(--theme-border) bg-(--theme-app-bg)"
      style={{ height: '34rem', maxWidth: width }}
    >
      <PageHeader breadcrumbs={[{ label: 'Compute', href: '/compute' }, { label: 'Clusters' }]} />
      <div className="px-4">
        <Tabs label="Clusters" value="nodes" items={TAB_ITEMS} />
      </div>
      <div data-testid="page" className="min-h-0 flex-1">
        <ListPage
          toolbar={
            <div className="py-1.5">
              <ActionToolbar label="List controls" groups={TOOLBAR_GROUPS} right={TOOLBAR_RIGHT} />
            </div>
          }
        >
          <NodesTable count={rows} label="Nodes" />
        </ListPage>
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const thead = canvas.getByRole('table', { name: 'Nodes' }).querySelector('thead') as HTMLElement
    const body = thead.closest('.overflow-auto') as HTMLElement
    body.scrollTo({ top: 400 })
    await waitFor(() => expect(body.scrollTop).toBeGreaterThan(100))
    await expect(thead.getBoundingClientRect().top).toBe(body.getBoundingClientRect().top)
  },
}

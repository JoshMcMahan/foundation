import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ReactNode } from 'react'
import { expect, waitFor, within } from 'storybook/test'
import { PageHeader } from '../components/PageHeader'
import { StatusBadge } from '../components/StatusBadge'
import { StickyBar } from '../components/StickyBar'
import { Table } from '../components/Table'
import { Tabs } from '../components/Tabs'
import { RefreshIcon, SnapshotIcon, StopIcon, TerminalIcon } from '../icons'
import { ActionToolbar, type ToolbarItem } from './ActionToolbar'
import { ListPage } from './ListPage'
import { listTableProps } from './ListTable'

// A detail page in a shell that pins its chrome inside the page's scroller:
// the host's page header at the top, the page's toolbar under it and its tabs
// under that. Only the header says where it pins; the toolbar, the tabs and a
// table's header each find where the chrome above them ends. Sizes are inline:
// the package's stylesheet doesn't scan stories.
const HEADER = 44

const meta: Meta = {
  title: 'UI/Sticky page chrome',
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
        {/* The host's own header, pinned with `position: sticky` and a `top`
            as an earlier sibling of the page in the same scroller. */}
        <div
          data-testid="header"
          className="z-(--layer-header) bg-(--theme-app-bg)"
          style={{ position: 'sticky', top: 0, height: HEADER }}
        >
          <PageHeader
            breadcrumbs={[
              { label: 'Compute', href: '/compute' },
              { label: 'Clusters', href: '/clusters' },
              { label: 'gpu-trainer-01' },
            ]}
          />
        </div>
        {toolbar ?? (
          <StickyBar className="px-4 py-1.5">
            <ActionToolbar label="Cluster controls" groups={TOOLBAR_GROUPS} right={TOOLBAR_RIGHT} />
          </StickyBar>
        )}
        {children}
      </div>
    </div>
  )
}

function PageTabs() {
  return <Tabs label="gpu-trainer-01" value="nodes" sticky className="px-4" items={TAB_ITEMS} />
}

/** How far below the page's top `el` sits. */
function offset(canvasElement: HTMLElement, el: Element) {
  const page = within(canvasElement).getByTestId('page')
  return el.getBoundingClientRect().top - page.getBoundingClientRect().top
}

/** Where the tab row ends while it's pinned. */
function tabsBottom(canvasElement: HTMLElement) {
  const row = within(canvasElement).getByRole('tablist').parentElement as HTMLElement
  return Number.parseFloat(row.style.top) + row.getBoundingClientRect().height
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
      <PageTabs />
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
    await expectPinnedBelow(canvasElement, 'Nodes', tabsBottom(canvasElement))
  },
}

/** A section's own heading pins under the page's tabs while the section is in
 *  view; the table in that section pins under the heading in turn. */
export const NestedStickyHeading: StoryObj<DetailArgs> = {
  name: 'Under a pinned section heading',
  args: { rows: 30, width: 900 },
  render: ({ rows, width }) => (
    <DetailShell width={width}>
      <PageTabs />
      <section className={section}>
        <h2 className={heading}>Overview</h2>
        <Filler lines={8} />
      </section>
      <section className="px-4 pb-4">
        <StickyBar testId="section-heading" className="border-b border-(--theme-border) py-2">
          <h2 className={heading}>Nodes</h2>
        </StickyBar>
        <NodesTable count={rows} label="Nodes" />
      </section>
      <section className={section}>
        <h2 className={heading}>Settings</h2>
        <Filler lines={20} />
      </section>
    </DetailShell>
  ),
  play: async ({ canvasElement }) => {
    const heading = within(canvasElement).getByTestId('section-heading')
    await expect(Number.parseFloat(heading.style.top)).toBe(tabsBottom(canvasElement))
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
      <PageTabs />
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

const FILTERS = ['Status: any', 'Zone: us-east-1a', 'Instance: g5.xlarge', 'Owner: alice']

/** A page whose chrome stacks by itself: under the host's pinned header, a
 *  toolbar of actions and filters, then tabs, then the Nodes table's column
 *  titles. Narrow the width and the toolbar wraps onto a second row; the tabs
 *  and the column titles move down with it in the same frame, with no gap and
 *  no overlap. */
export const StackedChrome: StoryObj<DetailArgs> = {
  name: 'Header, toolbar, tabs and table',
  args: { rows: 30, width: 480 },
  argTypes: {
    rows: { control: { type: 'range', min: 3, max: 60, step: 1 } },
    width: { control: { type: 'range', min: 320, max: 1200, step: 10 } },
  },
  render: ({ rows, width }) => (
    <DetailShell
      width={width}
      toolbar={
        <StickyBar
          testId="toolbar"
          className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-(--theme-border) px-4 py-1.5"
        >
          <ActionToolbar label="Cluster controls" groups={TOOLBAR_GROUPS} />
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {FILTERS.map((filter) => (
              <span
                key={filter}
                className="whitespace-nowrap rounded-full border border-(--theme-border) px-2 py-0.5"
              >
                {filter}
              </span>
            ))}
          </div>
        </StickyBar>
      }
    >
      <PageTabs />
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
    const canvas = within(canvasElement)
    const toolbar = canvas.getByTestId('toolbar')
    const tabs = canvas.getByRole('tablist').parentElement as HTMLElement
    await expectPinnedBelow(canvasElement, 'Nodes', tabsBottom(canvasElement))
    await expect(offset(canvasElement, toolbar)).toBe(HEADER)
    await expect(offset(canvasElement, tabs)).toBe(HEADER + toolbar.getBoundingClientRect().height)
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

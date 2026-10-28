import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { AppLink } from '../components/AppLink'
import { Avatar, AvatarGroup } from '../components/Avatar'
import { useContextMenu } from '../components/ContextMenu'
import { IconButton } from '../components/IconButton'
import type { MenuEntry } from '../components/MenuEntries'
import { RunStatusIcon, type RunStatusIconStatus } from '../components/RunStatusIcon'
import { StatusBadge } from '../components/StatusBadge'
import { Table } from '../components/Table'
import { PowerIcon, TrashIcon, UsersIcon, WebhookIcon, WorkflowIcon } from '../icons'
import { ListColumns, ListRow, ListRowActionsProvider, useListNavigate } from './ListPage'
import { ListCellText, listTableProps, NameCell, STRETCHED_LINK } from './ListTable'
import { type ColumnDef, useListView } from './listView'

const meta: Meta = {
  title: 'UI/List/Action lane',
}
export default meta

interface Run {
  number: number
  workflow: string
  status: RunStatusIconStatus
  badge: 'info' | 'success' | 'error'
  statusName: string
  submitted: string
  runtime: string
  user: string
}

const RUNS: Run[] = [
  {
    number: 44,
    workflow: 'variant-calling',
    status: 'running',
    badge: 'info',
    statusName: 'Running',
    submitted: '2 min ago',
    runtime: '1m 52s',
    user: 'ada',
  },
  {
    number: 17,
    workflow: 'rnaseq-quant',
    status: 'completed',
    badge: 'success',
    statusName: 'Completed',
    submitted: '1 hr ago',
    runtime: '18m 4s',
    user: 'grace',
  },
  {
    number: 9,
    workflow: 'cfd-mesh-refine',
    status: 'error',
    badge: 'error',
    statusName: 'Failed',
    submitted: 'yesterday',
    runtime: '3h 12m',
    user: 'linus',
  },
  {
    number: 112,
    workflow: 'weather-ensemble',
    status: 'canceled',
    badge: 'info',
    statusName: 'Canceled',
    submitted: '3 days ago',
    runtime: '42s',
    user: 'ada',
  },
]

function runMenu(run: Run): MenuEntry[] {
  return [
    { label: 'Cancel run', onClick: () => {} },
    { label: 'Run again', onClick: () => {} },
    { label: 'Open workflow', icon: <WorkflowIcon />, href: `#workflows/${run.workflow}` },
  ]
}

const RUN_NAME = 'text-[13px] font-medium leading-tight tabular-nums text-(--theme-app)'

/** A dashboard module's latest runs, as a host lays them out: the status icon,
 *  the run's number and the workflow it ran, when it was submitted, and its
 *  runtime set against the right edge. Hover a row: the runtime keeps its
 *  place and the `⋯` takes a lane of its own after it. */
function RunsModule() {
  const goTo = useListNavigate()
  const { openMenu, contextMenu } = useContextMenu()
  const view = useListView<Run>({
    storageKey: 'story-action-lane-module',
    columns: [
      { key: 'run', label: 'Run', alwaysVisible: true },
      // A phone-narrow module has no room for when it was submitted.
      { key: 'submitted', label: 'Submitted', priority: 'medium' },
      { key: 'runtime', label: 'Runtime', align: 'end', stack: false },
    ],
  })
  return (
    <div className="@container max-w-xl rounded-xl border border-(--theme-border)">
      <ListRowActionsProvider view={view}>
        <Table {...listTableProps} density="compact">
          <Table.Header className="w-6 pr-0">
            <span className="sr-only">Status</span>
          </Table.Header>
          <ListColumns view={view} />
          {RUNS.map((run) => {
            const href = `#runs/${run.number}`
            return (
              <ListRow
                key={run.number}
                href={href}
                items={runMenu(run)}
                goTo={goTo}
                openMenu={openMenu}
                leading={
                  <Table.Item className="w-6 pr-0">
                    <span className="flex items-center">
                      <RunStatusIcon status={run.status} label={run.statusName} tooltip />
                    </span>
                  </Table.Item>
                }
              >
                <Table.Item>
                  <div className="flex min-w-0 items-center gap-2">
                    <AppLink
                      href={href}
                      data-row-link
                      aria-label={`Run #${run.number} of ${run.workflow}: ${run.statusName}`}
                      className={`shrink-0 ${RUN_NAME} ${STRETCHED_LINK}`}
                    >
                      #{run.number}
                    </AppLink>
                    <span className="min-w-0 truncate text-xs text-(--theme-muted-text-color)">
                      {run.workflow}
                    </span>
                  </div>
                </Table.Item>
                <Table.Item>
                  <ListCellText>{run.submitted}</ListCellText>
                </Table.Item>
                <Table.Item>
                  <ListCellText className="tabular-nums">{run.runtime}</ListCellText>
                </Table.Item>
              </ListRow>
            )
          })}
        </Table>
      </ListRowActionsProvider>
      {contextMenu}
    </div>
  )
}

type Last = 'user' | 'delete'

/** A runs page's rows, ending in a text column (who ran it) or a locked one (a
 *  delete button's). */
function RunsPage({ last }: { last: Last }) {
  const goTo = useListNavigate()
  const { openMenu, contextMenu } = useContextMenu()
  const columns: ColumnDef[] = [
    { key: 'run', label: 'Run', alwaysVisible: true },
    { key: 'status', label: 'Status' },
    { key: 'started', label: 'Started' },
    { key: 'runtime', label: 'Runtime', align: 'end' },
    last === 'user'
      ? { key: 'user', label: 'User' }
      : { key: 'delete', label: '', locked: true, stack: false, width: 40 },
  ]
  const view = useListView<Run>({ storageKey: `story-action-lane-${last}`, columns })
  return (
    <div className="@container">
      <ListRowActionsProvider view={view}>
        <Table {...listTableProps}>
          <ListColumns view={view} />
          {RUNS.map((run) => {
            const href = `#runs/${run.number}`
            return (
              <ListRow
                key={run.number}
                href={href}
                items={runMenu(run)}
                goTo={goTo}
                openMenu={openMenu}
              >
                <Table.Item className="py-2.5">
                  <div className="min-w-0">
                    <AppLink
                      href={href}
                      data-row-link
                      className={`block font-mono ${RUN_NAME} ${STRETCHED_LINK}`}
                    >
                      {run.workflow}-{run.number}
                    </AppLink>
                    <div className="truncate text-xs leading-tight text-(--theme-muted-text-color)">
                      {run.workflow}
                    </div>
                  </div>
                </Table.Item>
                <Table.Item className="py-2.5">
                  <StatusBadge variant={run.badge} size="sm">
                    {run.statusName}
                  </StatusBadge>
                </Table.Item>
                <Table.Item className="py-2.5">
                  <ListCellText>{run.submitted}</ListCellText>
                </Table.Item>
                <Table.Item className="py-2.5">
                  <ListCellText className="tabular-nums">{run.runtime}</ListCellText>
                </Table.Item>
                <Table.Item className="py-2.5">
                  {last === 'user' ? (
                    <ListCellText>{run.user}</ListCellText>
                  ) : (
                    <IconButton
                      label={`Delete run #${run.number}`}
                      icon={<TrashIcon />}
                      size="xs"
                      onClick={(e) => e.stopPropagation()}
                    />
                  )}
                </Table.Item>
              </ListRow>
            )
          })}
        </Table>
      </ListRowActionsProvider>
      {contextMenu}
    </div>
  )
}

const FLOATING = 'pointer-fine:w-10!'

/** An end-aligned last column, such as a runtime: its values sit where a
 *  floating `⋯` would, so the `⋯` keeps a lane of its own after the column
 *  and the runtime stays readable while the row is hovered. */
export const EndAlignedLastColumn: StoryObj = {
  render: () => <RunsModule />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByRole('columnheader').at(-1)).not.toHaveClass(FLOATING)
    await expect(canvas.getAllByRole('row').at(1)?.lastElementChild).not.toHaveClass(FLOATING)
    await expect(
      canvas.getByRole('link', { name: 'Run #44 of variant-calling: Running' }),
    ).toHaveAttribute('href', '#runs/44')
  },
}

/** The same, hovered with the row's menu open: the runtime stays beside the `⋯`. */
export const EndAlignedMenuOpen: StoryObj = {
  render: () => <RunsModule />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const row = canvas.getByRole('link', { name: /Run #17/ }).closest('tr')
    if (!row) {
      throw new Error('no row')
    }
    await userEvent.hover(row)
    await userEvent.click(within(row).getByRole('button', { name: /more actions/i }))
    await waitFor(() =>
      expect(within(document.body).getByRole('menuitem', { name: 'Open workflow' })).toBeVisible(),
    )
    await expect(within(row).getByText('18m 4s')).toBeVisible()
  },
}

/** A text last column, such as who ran it: the `⋯` shows on hover in a lane
 *  just its own width, so the column's text ends before it. */
export const TextLastColumn: StoryObj = {
  render: () => <RunsPage last="user" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByRole('columnheader').at(-1)).toHaveClass(FLOATING)
  },
}

/** A locked last column, such as a delete button's, keeps its lane as before. */
export const LockedLastColumn: StoryObj = {
  render: () => <RunsPage last="delete" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByRole('columnheader').at(-1)).not.toHaveClass(FLOATING)
  },
}

interface Group {
  name: string
  slug: string
  members: string[]
}

const GROUPS: Group[] = [
  {
    name: 'Platform infrastructure on-call and incident escalation',
    slug: 'platform-infrastructure-oncall-incident-escalation',
    members: ['Ada Lovelace', 'Grace Hopper', 'Linus Torvalds', 'Barbara Liskov'],
  },
  {
    name: 'Design reviewers',
    slug: 'design-reviewers-for-the-public-website-and-documentation',
    members: ['Margaret Hamilton', 'Alan Kay'],
  },
  { name: 'Security', slug: 'security', members: [] },
]

/** A settings page's groups, as a host lays them out: the name and its slug
 *  under it, who belongs, and the slug again as a column of its own, whose
 *  long values reach the end of the row. */
function GroupsSettings() {
  const goTo = useListNavigate()
  const { openMenu, contextMenu } = useContextMenu()
  const view = useListView<Group>({
    storageKey: 'story-action-lane-groups',
    defaultShowColumnHeaders: false,
    columns: [
      { key: 'name', label: 'Name', headerClassName: 'py-2 @[36rem]:w-[45%]', alwaysVisible: true },
      { key: 'members', label: 'Members', headerClassName: 'py-2' },
      { key: 'slug', label: 'Slug', headerClassName: 'py-2' },
    ],
  })
  return (
    <div className="@container max-w-3xl border-y border-(--theme-border)">
      <ListRowActionsProvider view={view}>
        <Table {...listTableProps}>
          <ListColumns view={view} />
          {GROUPS.map((g) => (
            <ListRow
              key={g.slug}
              href={null}
              onActivate={() => {}}
              items={[
                { label: 'Edit group', onClick: () => {} },
                { divider: true },
                { label: 'Delete group', destructive: true, onClick: () => {} },
              ]}
              goTo={goTo}
              openMenu={openMenu}
            >
              <NameCell icon={<UsersIcon />} iconTile name={g.name} subtitle={g.slug} href={null} />
              <Table.Item className="py-2.5">
                {g.members.length === 0 ? (
                  <ListCellText>No members</ListCellText>
                ) : (
                  <span className="flex items-center gap-2">
                    <AvatarGroup size="sm" max={5} showOverflow={false}>
                      {g.members.map((m) => (
                        <Avatar key={m} name={m} />
                      ))}
                    </AvatarGroup>
                    <ListCellText className="tabular-nums">{`${g.members.length} members`}</ListCellText>
                  </span>
                )}
              </Table.Item>
              <Table.Item className="py-2.5">
                <ListCellText mono>{g.slug}</ListCellText>
              </Table.Item>
            </ListRow>
          ))}
        </Table>
      </ListRowActionsProvider>
      {contextMenu}
    </div>
  )
}

interface Webhook {
  id: string
  url: string
  name: string
  event: string
  enabled: boolean
  created: string
}

const WEBHOOKS: Webhook[] = [
  {
    id: 'wh_01',
    url: 'https://hooks.example.com/services/T024BE7LD/B08QW3Y6Z/notify-run-finished',
    name: 'Run notifications',
    event: 'Run finished',
    enabled: true,
    created: 'Oct 2, 2026',
  },
  {
    id: 'wh_02',
    url: 'https://ci.example.org/api/v4/projects/1182/trigger/pipeline',
    name: 'Rebuild images',
    event: 'Image published to the shared registry',
    enabled: false,
    created: 'Sep 18, 2026',
  },
]

/** An admin page's webhooks: a pinned enable or disable button beside the
 *  `⋯`, and text columns up to them. */
function WebhooksAdmin() {
  const goTo = useListNavigate()
  const { openMenu, contextMenu } = useContextMenu()
  const view = useListView<Webhook>({
    storageKey: 'story-action-lane-webhooks',
    columns: [
      { key: 'name', label: 'URL', headerClassName: 'py-2 w-[34%]', alwaysVisible: true },
      { key: 'event', label: 'Event', headerClassName: 'py-2' },
      { key: 'enabled', label: 'Status', headerClassName: 'py-2' },
      { key: 'created', label: 'Created', headerClassName: 'py-2' },
    ],
    actions: [
      { key: 'toggle', label: 'Enable or disable', defaultPinned: true },
      { key: 'delete', label: 'Delete' },
    ],
  })
  return (
    <div className="@container border-y border-(--theme-border)">
      <ListRowActionsProvider view={view}>
        <Table {...listTableProps}>
          <ListColumns view={view} />
          {WEBHOOKS.map((w) => {
            const toggle = {
              key: 'toggle',
              label: w.enabled ? 'Disable' : 'Enable',
              icon: <PowerIcon />,
              onClick: () => {},
            }
            return (
              <ListRow
                key={w.id}
                href={null}
                items={[
                  { label: toggle.label, icon: <PowerIcon />, onClick: () => {} },
                  { label: 'Delete', icon: <TrashIcon />, destructive: true, onClick: () => {} },
                ]}
                goTo={goTo}
                openMenu={openMenu}
                pinnedActions={view.isPinned('toggle') ? [toggle] : []}
              >
                <NameCell
                  icon={<WebhookIcon />}
                  iconTile
                  name={w.url}
                  subtitle={w.name}
                  href={null}
                />
                <Table.Item className="py-2.5">
                  <ListCellText>{w.event}</ListCellText>
                </Table.Item>
                <Table.Item className="py-2.5">
                  <ListCellText>{w.enabled ? 'Enabled' : 'Disabled'}</ListCellText>
                </Table.Item>
                <Table.Item className="py-2.5">
                  <ListCellText>{w.created}</ListCellText>
                </Table.Item>
              </ListRow>
            )
          })}
        </Table>
      </ListRowActionsProvider>
      {contextMenu}
    </div>
  )
}

/** Hovers the row holding `text` and checks that its last column's text ends
 *  before the first of the row's action buttons begins. */
async function expectTextEndsBeforeActions(canvasElement: HTMLElement, text: string) {
  const canvas = within(canvasElement)
  const row = canvas.getAllByText(text)[0]?.closest('tr')
  if (!row) {
    throw new Error(`no row holds ${text}`)
  }
  await userEvent.hover(row)
  const cells = [...row.cells]
  const lastColumn = cells.at(-2)?.querySelector('span.truncate')
  const firstButton = within(row).getAllByRole('button').at(0)
  if (!lastColumn || !firstButton) {
    throw new Error('no last column or action')
  }
  await waitFor(() => expect(firstButton).toBeVisible())
  await expect(lastColumn.getBoundingClientRect().right).toBeLessThanOrEqual(
    firstButton.getBoundingClientRect().left,
  )
}

/** A settings list whose last column holds long text, such as a group's slug.
 *  Hover a row: the `⋯` has a lane of its own, so the slug is cut off before
 *  it rather than running under the button. */
export const LongTextBesideMore: StoryObj = {
  render: () => <GroupsSettings />,
  play: async ({ canvasElement }) => {
    await expectTextEndsBeforeActions(
      canvasElement,
      'design-reviewers-for-the-public-website-and-documentation',
    )
  },
}

/** A pinned button beside the `⋯`, as an admin page's webhooks show it: the
 *  lane fits both buttons, and the columns end before it. */
export const PinnedActionBesideMore: StoryObj = {
  render: () => <WebhooksAdmin />,
  play: async ({ canvasElement }) => {
    await expectTextEndsBeforeActions(canvasElement, 'Oct 2, 2026')
  },
}

import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { AppLink } from '../components/AppLink'
import { useContextMenu } from '../components/ContextMenu'
import { IconButton } from '../components/IconButton'
import type { MenuEntry } from '../components/MenuEntries'
import { RunStatusIcon, type RunStatusIconStatus } from '../components/RunStatusIcon'
import { StatusBadge } from '../components/StatusBadge'
import { Table } from '../components/Table'
import { TrashIcon, WorkflowIcon } from '../icons'
import { ListColumns, ListRow, ListRowActionsProvider, useListNavigate } from './ListPage'
import { ListCellText, listTableProps, STRETCHED_LINK } from './ListTable'
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

const FLOATING = 'pointer-fine:w-0!'

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

/** A text last column, such as who ran it: its end is usually blank, so the
 *  `⋯` floats over it on hover and the list keeps its width. */
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

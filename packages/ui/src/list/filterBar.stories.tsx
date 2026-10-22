import type { Meta, StoryObj } from '@storybook/react-vite'
import { type ReactNode, useMemo, useState } from 'react'
import { expect, screen, userEvent, within } from 'storybook/test'
import { Avatar } from '../components/Avatar'
import { buttonClasses } from '../components/buttonClasses'
import { UIProvider } from '../components/Provider'
import { StatusBadge, StatusDot } from '../components/StatusBadge'
import { Table } from '../components/Table'
import type { Tone } from '../components/tone'
import {
  AgentIcon,
  CalendarIcon,
  ClusterIcon,
  FilterIcon,
  OrganizationIcon,
  RefreshIcon,
  TagIcon,
  UserIcon,
} from '../icons'
import {
  type ActiveFilter,
  decodeFilters,
  encodeFilters,
  type FilterField,
  type FilterOption,
  toDay,
} from './filterModel'
import { ListFilterBar } from './ListFilterBar'
import { ListPage } from './ListPage'
import { listTableProps } from './ListTable'
import { ListDisplayMenu, ListFilterMenu } from './ListViewControls'
import { ListCount } from './listSearch'
import { useListView } from './listView'
import { useListFilters } from './useListFilters'

const meta: Meta = {
  title: 'UI/List/Filters',
  parameters: { layout: 'fullscreen' },
}
export default meta

// --- Issues ----------------------------------------------------------------

type Status = 'backlog' | 'todo' | 'started' | 'review' | 'done' | 'canceled'

interface Issue {
  id: string
  title: string
  status: Status
  priority: 'urgent' | 'high' | 'medium' | 'low'
  assignee: string | null
  labels: string[]
  project: string
  due: string | null
}

const STATUS: Record<Status, { label: string; tone: Tone }> = {
  backlog: { label: 'Backlog', tone: 'muted' },
  todo: { label: 'Todo', tone: 'default' },
  started: { label: 'In progress', tone: 'info' },
  review: { label: 'In review', tone: 'warning' },
  done: { label: 'Done', tone: 'success' },
  canceled: { label: 'Canceled', tone: 'muted' },
}

const PEOPLE = [
  { value: 'maya', label: 'Maya Okafor', group: 'People' },
  { value: 'jonas', label: 'Jonas Lindqvist', group: 'People' },
  { value: 'priya', label: 'Priya Raman', group: 'People' },
  { value: 'diego', label: 'Diego Alvarez', group: 'People' },
  { value: 'triage-agent', label: 'Triage agent', group: 'Agents' },
  { value: 'review-agent', label: 'Review agent', group: 'Agents' },
]

const LABELS = ['bug', 'feature', 'docs', 'performance', 'security', 'design']
const PROJECTS = ['Billing revamp', 'Search v2', 'Onboarding', 'Mobile web']

const TITLES = [
  'Invoice totals round the wrong way for some currencies',
  'Search results drop items with accented names',
  'Onboarding checklist forgets a dismissed step',
  'Settings page jumps when a toast appears',
  'Export to spreadsheet times out on large workspaces',
  'Due-date reminders arrive twice',
  'Keyboard shortcut sheet misses new commands',
  'Avatar initials clip in compact rows',
  'Saved view loses its sort after a reload',
  'Webhook retries ignore the backoff setting',
  'Dark theme borders too faint on panels',
  'Mention suggestions lag in long threads',
]

const today = new Date()
const dayOffset = (n: number) =>
  toDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() + n))

const ISSUES: Issue[] = TITLES.map((title, i) => ({
  id: `CORE-${120 + i}`,
  title,
  status:
    (['started', 'review', 'todo', 'backlog', 'done', 'started'] as Status[])[i % 6] ?? 'todo',
  priority: (['high', 'urgent', 'medium', 'low'] as const)[i % 4] ?? 'medium',
  assignee: i % 5 === 4 ? null : (PEOPLE[i % PEOPLE.length]?.value ?? null),
  labels: [
    ...new Set([LABELS[i % LABELS.length] ?? 'bug', ...(i % 3 === 0 ? ['performance'] : [])]),
  ],
  project: PROJECTS[i % PROJECTS.length] ?? 'Search v2',
  due: i % 4 === 3 ? null : dayOffset((i % 7) * 5 - 12),
}))

function person(value: string): FilterOption {
  const p = PEOPLE.find((x) => x.value === value)
  const agent = p?.group === 'Agents'
  return {
    value,
    label: p?.label ?? value,
    group: p?.group,
    icon: agent ? (
      <span className="flex size-4 items-center justify-center rounded-sm bg-(--theme-warning-muted) text-(--theme-warning-text)">
        <AgentIcon className="size-2.5" />
      </span>
    ) : (
      <Avatar name={p?.label ?? value} size="xs" />
    ),
  }
}

const count = (pred: (i: Issue) => boolean) => ISSUES.filter(pred).length

const ISSUE_FIELDS: FilterField<Issue>[] = [
  {
    key: 'status',
    label: 'Status',
    kind: 'enum',
    options: (Object.keys(STATUS) as Status[]).map((s) => ({
      value: s,
      label: STATUS[s].label,
      icon: <StatusDot variant={STATUS[s].tone} />,
      count: count((i) => i.status === s),
    })),
    value: (i) => i.status,
  },
  {
    key: 'assignee',
    label: 'Assignee',
    icon: <UserIcon />,
    kind: 'people',
    operators: ['is', 'isNot', 'isNotSet'],
    // Searchable as a long list of people would be: typing narrows it, Enter takes the first.
    searchable: true,
    options: PEOPLE.map((p) => person(p.value)),
    value: (i) => i.assignee,
  },
  {
    key: 'label',
    label: 'Label',
    icon: <TagIcon />,
    kind: 'enum',
    operators: ['is', 'isNot', 'includesAll'],
    options: LABELS.map((l) => ({ value: l, label: l, count: count((i) => i.labels.includes(l)) })),
    value: (i) => i.labels,
  },
  {
    key: 'priority',
    label: 'Priority',
    kind: 'enum',
    options: [
      { value: 'urgent', label: 'Urgent' },
      { value: 'high', label: 'High' },
      { value: 'medium', label: 'Medium' },
      { value: 'low', label: 'Low' },
    ],
    value: (i) => i.priority,
  },
  {
    key: 'project',
    label: 'Project',
    kind: 'enum',
    multiple: false,
    options: PROJECTS.map((p) => ({ value: p, label: p })),
    value: (i) => i.project,
  },
  {
    key: 'due',
    label: 'Due',
    icon: <CalendarIcon />,
    kind: 'date',
    operators: ['is', 'before', 'after', 'between', 'isSet', 'isNotSet'],
    value: (i) => i.due,
  },
  {
    key: 'overdue',
    label: 'Overdue',
    kind: 'boolean',
    value: (i) => i.due !== null && i.due < toDay(today) && i.status !== 'done',
  },
  {
    key: 'title',
    label: 'Title',
    kind: 'text',
    value: (i) => i.title,
  },
]

const ISSUE_LINK = '?status=started,review&assignee=maya,priya,triage-agent&label!=docs&due=-30d'

function Shell({ children, width }: { children: ReactNode; width?: number | undefined }) {
  return (
    <div className="flex justify-center bg-(--theme-app-bg) p-4" style={{ height: 640 }}>
      <div
        className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-(--theme-border) bg-(--theme-panel-bg)"
        style={width ? { maxWidth: width } : undefined}
      >
        {children}
      </div>
    </div>
  )
}

/** An issue list whose filters live in the URL, as a host router would hold them; the link
 *  shown under it updates as chips change, and a plain `?label=bug` link still reads. */
function IssuesDemo({ link, width }: { link: string; width?: number }) {
  const [search, setSearch] = useState(() => new URLSearchParams(link))
  const store = useMemo(
    () => ({
      value: decodeFilters(search, ISSUE_FIELDS),
      onChange: (next: ActiveFilter[]) => setSearch(new URLSearchParams(encodeFilters(next))),
    }),
    [search],
  )
  const filters = useListFilters<Issue>({
    storageKey: `story-issues-${link}`,
    fields: ISSUE_FIELDS,
    store,
    remember: false,
  })
  const rows = filters.apply(ISSUES)
  const url = decodeURIComponent(search.toString())
  return (
    <Shell width={width}>
      <div className="flex h-12 shrink-0 items-center border-b border-(--theme-border) px-4 text-[16px] font-semibold">
        Issues
      </div>
      <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-1.5">
        <ListCount
          total={ISSUES.length}
          matches={rows.length}
          filterActive={filters.count > 0}
          noun="issue"
          nounPlural="issues"
        />
        <ListFilterMenu filters={filters} />
      </div>
      <div className="shrink-0 px-4">
        <ListFilterBar
          filters={filters}
          trailing={
            filters.count > 0 && (
              <button type="button" className={buttonClasses({ variant: 'outline', size: 'sm' })}>
                Save view
              </button>
            )
          }
        />
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <Table {...listTableProps}>
          <Table.Header caps={false}>Issue</Table.Header>
          <Table.Header caps={false} className="hidden @[36rem]:table-cell">
            Assignee
          </Table.Header>
          <Table.Header caps={false}>Status</Table.Header>
          {rows.map((issue) => (
            <tr key={issue.id} className="hover:theme-hover">
              <Table.Item>
                <div
                  className="flex min-w-0 items-center gap-2"
                  style={{ maxWidth: 'min(40rem, calc(100vw - 14rem))' }}
                >
                  <span className="shrink-0 font-mono text-[11px] text-(--theme-muted-text-color)">
                    {issue.id}
                  </span>
                  <span className="truncate">{issue.title}</span>
                </div>
                <div className="mt-0.5 flex gap-1">
                  {issue.labels.map((l) => (
                    <span
                      key={l}
                      className="rounded-full border border-(--theme-border) px-1.5 text-[11px] text-(--theme-muted-text-color)"
                    >
                      {l}
                    </span>
                  ))}
                </div>
              </Table.Item>
              <Table.Item className="hidden whitespace-nowrap @[36rem]:table-cell">
                {issue.assignee ? person(issue.assignee).label : '—'}
              </Table.Item>
              <Table.Item>
                <StatusBadge variant={STATUS[issue.status].tone}>
                  {STATUS[issue.status].label}
                </StatusBadge>
              </Table.Item>
            </tr>
          ))}
        </Table>
      </div>
      <div
        className="shrink-0 truncate border-t border-(--theme-border) px-4 py-2 font-mono text-[11px] text-(--theme-muted-text-color)"
        style={{ fontVariantLigatures: 'none' }}
      >
        {url ? `?${url}` : '(no filter params)'}
      </div>
    </Shell>
  )
}

interface IssuesArgs {
  link: string
}

export const IssuesFromALink: StoryObj<IssuesArgs> = {
  args: { link: ISSUE_LINK },
  argTypes: { link: { control: 'text' } },
  render: (args) => <IssuesDemo link={args.link} />,
}

export const IssuesDark: StoryObj<IssuesArgs> = {
  ...IssuesFromALink,
  globals: { mode: 'dark' },
}

/** A link made before conditions existed: a plain value reads as "is". */
export const IssuesFromAnOldLink: StoryObj<IssuesArgs> = {
  ...IssuesFromALink,
  args: { link: '?label=bug' },
}

export const IssuesAtPhoneWidth: StoryObj<IssuesArgs> = {
  args: {
    link: '?status=started,review,todo,backlog&assignee=maya,priya,jonas,diego&label=bug,performance,feature,design&priority=urgent,high,medium&project=Search%20v2&due>=2026-09-01&due<=2026-12-31',
  },
  render: (args) => <IssuesDemo link={args.link} width={390} />,
}

export const IssuesAtPhoneWidthDark: StoryObj<IssuesArgs> = {
  ...IssuesAtPhoneWidth,
  globals: { mode: 'dark' },
}

/** A searchable value picker, as a long list of people's, opened from its chip on a phone:
 *  view it at 390px. */
export const PeoplePickerOnPhone: StoryObj<IssuesArgs> = {
  args: { link: '?assignee=maya,priya' },
  render: (args) => <IssuesDemo link={args.link} />,
  play: async ({ canvasElement }) => {
    const chip = canvasElement.querySelector('[data-filter-chip=assignee]')
    const value = chip && within(chip as HTMLElement).getByRole('combobox')
    if (value) {
      await userEvent.click(value)
      await expect(await screen.findByRole('listbox')).toBeInTheDocument()
    }
  },
}

/** "+ Filter", then a field: its chip appears and its value picker opens on it. */
export const AddAFilter: StoryObj<IssuesArgs> = {
  args: { link: '?status=started' },
  render: (args) => <IssuesDemo link={args.link} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: 'Filter' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Assignee' }))
    await expect(await screen.findByRole('menuitemcheckbox', { name: /Maya Okafor/ })).toBeVisible()
  },
}

// --- Resources -------------------------------------------------------------

interface Resource {
  id: string
  name: string
  kind: 'cluster' | 'bucket' | 'workspace'
  provider: 'aws' | 'gcp' | 'azure'
  region: string
  status: 'running' | 'stopped' | 'error' | 'provisioning'
  owner: string
  org: string
  created: string
}

const RES_STATUS: Record<Resource['status'], Tone> = {
  running: 'success',
  stopped: 'muted',
  error: 'error',
  provisioning: 'info',
}
const OWNERS = ['alice', 'bob', 'carmen', 'deshawn', 'qa-bot']
const ORGS = [
  { value: 'research', label: 'Research' },
  { value: 'platform', label: 'Platform' },
  { value: 'finance', label: 'Finance' },
]
const REGIONS: Record<Resource['provider'], string> = {
  aws: 'us-east-1',
  gcp: 'us-central1',
  azure: 'eastus',
}
const RESOURCES: Resource[] = [
  'gpu-trainer',
  'genomics-batch',
  'cfd-solver',
  'render-farm',
  'ml-inference',
  'dev-sandbox',
  'nightly-etl',
  'seismic-proc',
  'archive-bucket',
  'notebooks',
  'weather-sim',
  'qa-runner',
].map((name, i) => {
  const provider = (['aws', 'gcp', 'azure'] as const)[i % 3] ?? 'aws'
  return {
    id: `r${i}`,
    name,
    kind: i % 4 === 3 ? 'bucket' : i % 5 === 4 ? 'workspace' : 'cluster',
    provider,
    region: REGIONS[provider],
    status:
      (['running', 'stopped', 'error', 'running', 'provisioning'] as const)[i % 5] ?? 'running',
    owner: OWNERS[i % OWNERS.length] ?? 'alice',
    org: ORGS[i % 2]?.value ?? 'research',
    created: dayOffset(-((i * 9) % 80)),
  }
})

/** A resource list on `useListView`: facets as before plus fields with conditions, a required
 *  organization, and page defaults, so the row offers Reset rather than Clear. Filters are
 *  remembered for the reader. */
function ResourcesDemo({ width, defaults }: { width?: number; defaults: boolean }) {
  const view = useListView<Resource>({
    storageKey: `story-resources-${defaults ? 'defaults' : 'plain'}-${width ?? 'wide'}`,
    columns: [
      { key: 'name', label: 'Name', alwaysVisible: true },
      { key: 'location', label: 'Location' },
      { key: 'status', label: 'Status' },
      { key: 'owner', label: 'Owner' },
    ],
    facets: [
      {
        key: 'status',
        label: 'Status',
        options: (Object.keys(RES_STATUS) as Resource['status'][]).map((s) => ({
          value: s,
          label: s[0]?.toUpperCase() + s.slice(1),
          icon: <StatusDot variant={RES_STATUS[s]} />,
        })),
        matches: (row, selected) => selected.includes(row.status),
      },
      {
        key: 'provider',
        label: 'Provider',
        options: [
          { value: 'aws', label: 'AWS' },
          { value: 'gcp', label: 'Google Cloud' },
          { value: 'azure', label: 'Azure' },
        ],
        matches: (row, selected) => selected.includes(row.provider),
      },
    ],
    filterFields: [
      {
        key: 'org',
        label: 'Organization',
        icon: <OrganizationIcon />,
        kind: 'enum',
        multiple: false,
        required: defaults,
        options: ORGS,
        value: (r) => r.org,
      },
      {
        key: 'owner',
        label: 'Owner',
        icon: <UserIcon />,
        kind: 'people',
        options: OWNERS.map((o) => ({ value: o, label: o, icon: <Avatar name={o} size="xs" /> })),
        value: (r) => r.owner,
      },
      {
        key: 'kind',
        label: 'Type',
        icon: <ClusterIcon />,
        kind: 'enum',
        options: [
          { value: 'cluster', label: 'Cluster' },
          { value: 'bucket', label: 'Bucket' },
          { value: 'workspace', label: 'Workspace' },
        ],
        value: (r) => r.kind,
      },
      {
        key: 'created',
        label: 'Created',
        icon: <CalendarIcon />,
        kind: 'date',
        value: (r) => r.created,
      },
    ],
    defaultFilters: defaults
      ? [
          { field: 'org', op: 'is', values: ['research'] },
          { field: 'status', op: 'isNot', values: ['stopped'] },
          { field: 'created', op: 'is', values: ['-90d'] },
        ]
      : [
          { field: 'status', op: 'is', values: ['running', 'error'] },
          { field: 'owner', op: 'is', values: ['alice', 'carmen', 'qa-bot'] },
        ],
  })
  const rows = view.applyFilters(RESOURCES)
  return (
    <Shell width={width}>
      <div className="flex h-12 shrink-0 items-center border-b border-(--theme-border) px-4 text-[16px] font-semibold">
        Resources
      </div>
      <ListPage
        view={view}
        toolbar={
          <div className="flex items-center justify-between gap-3 py-1.5">
            <ListCount
              total={RESOURCES.length}
              matches={rows.length}
              filterActive={view.activeFilterCount > 0}
              noun="resource"
              nounPlural="resources"
            />
            <div className="ml-auto flex items-center gap-2">
              <ListFilterMenu view={view} />
              <ListDisplayMenu view={view} />
            </div>
          </div>
        }
      >
        <Table {...listTableProps}>
          <Table.Header caps={false}>Name</Table.Header>
          <Table.Header caps={false} className="hidden @[36rem]:table-cell">
            Location
          </Table.Header>
          <Table.Header caps={false}>Status</Table.Header>
          <Table.Header caps={false} className="hidden @[36rem]:table-cell">
            Owner
          </Table.Header>
          {rows.map((r) => (
            <tr key={r.id} className="hover:theme-hover">
              <Table.Item>
                <div className="font-medium">{r.name}</div>
                <div className="text-[12px] text-(--theme-muted-text-color)">{r.kind}</div>
              </Table.Item>
              <Table.Item className="hidden @[36rem]:table-cell">
                {r.provider} · {r.region}
              </Table.Item>
              <Table.Item>
                <StatusBadge variant={RES_STATUS[r.status]}>{r.status}</StatusBadge>
              </Table.Item>
              <Table.Item className="hidden @[36rem]:table-cell">{r.owner}</Table.Item>
            </tr>
          ))}
        </Table>
      </ListPage>
    </Shell>
  )
}

interface ResourcesArgs {
  defaults: boolean
}

export const Resources: StoryObj<ResourcesArgs> = {
  args: { defaults: false },
  render: (args) => <ResourcesDemo defaults={args.defaults} />,
}

export const ResourcesDark: StoryObj<ResourcesArgs> = {
  ...Resources,
  globals: { mode: 'dark' },
}

/** Page defaults: a required Organization chip without a remove button, and Reset showing
 *  once the filters differ from the defaults. */
export const ResourcesWithDefaults: StoryObj<ResourcesArgs> = {
  ...Resources,
  args: { defaults: true },
}

export const ResourcesAtPhoneWidth: StoryObj<ResourcesArgs> = {
  args: { defaults: true },
  render: (args) => <ResourcesDemo defaults={args.defaults} width={390} />,
}

/** A required field with nothing chosen reads a muted "Any" and has no remove button. */
function RequiredDemo() {
  const filters = useListFilters<Resource>({
    storageKey: 'story-required',
    fields: [
      {
        key: 'org',
        label: 'Organization',
        icon: <OrganizationIcon />,
        kind: 'enum',
        multiple: false,
        required: true,
        options: ORGS,
      },
      {
        key: 'provider',
        label: 'Provider',
        kind: 'enum',
        pinned: true,
        options: [
          { value: 'aws', label: 'AWS' },
          { value: 'gcp', label: 'Google Cloud' },
        ],
      },
    ],
    remember: false,
  })
  return (
    <div className="bg-(--theme-app-bg) p-4">
      <ListFilterBar filters={filters} />
    </div>
  )
}

export const RequiredAndPinned: StoryObj = {
  render: () => <RequiredDemo />,
}

// A host that words the condition by a plural rule: "one" for a single value, "other" for many.
const PLURAL_CONDITIONS = {
  filters: {
    operator: (op: string, n: number) =>
      op === 'is' ? (n === 1 ? 'is' : 'is any of') : op === 'isNot' ? 'is not' : op,
  },
}

function WordedByCountDemo() {
  const filters = useListFilters<Resource>({
    storageKey: 'story-worded-by-count',
    fields: [
      {
        key: 'org',
        label: 'Organization',
        icon: <OrganizationIcon />,
        kind: 'enum',
        multiple: false,
        options: ORGS,
      },
      {
        key: 'provider',
        label: 'Provider',
        kind: 'enum',
        options: [
          { value: 'aws', label: 'AWS' },
          { value: 'gcp', label: 'Google Cloud' },
        ],
      },
    ],
    defaultFilters: [{ field: 'provider', op: 'is', values: ['aws', 'gcp'] }],
    remember: false,
  })
  return (
    <UIProvider strings={PLURAL_CONDITIONS}>
      <div className="bg-(--theme-app-bg) p-4">
        <ListFilterBar filters={filters} />
      </div>
    </UIProvider>
  )
}

/** Under host strings that word the condition by count, as a plural rule does, a field of one
 *  value reads "is" just added, with nothing chosen yet, and only a field of many reads "is any of" once
 *  more than one is chosen. */
export const ConditionWordedByCount: StoryObj = {
  render: () => <WordedByCountDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Added from the menu, with nothing chosen yet.
    await userEvent.click(canvas.getByRole('button', { name: 'Filter' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Organization' }))
    await userEvent.keyboard('{Escape}')
    const org = await canvas.findByRole('group', { name: /^Organization/ })
    await expect(within(org).getByText('is')).toBeInTheDocument()
    const provider = canvas.getByRole('group', { name: /^Provider/ })
    await expect(within(provider).getByText('is any of')).toBeInTheDocument()
  },
}

// --- Quick filters ---------------------------------------------------------

type JobState = 'running' | 'pending' | 'completed' | 'failed' | 'cancelled'

interface Job {
  id: string
  name: string
  state: JobState
  partition: string
  user: string
  submitted: string
  overBudget: boolean
}

const JOB_STATE: Record<JobState, { label: string; tone: Tone }> = {
  running: { label: 'Running', tone: 'info' },
  pending: { label: 'Pending', tone: 'warning' },
  completed: { label: 'Completed', tone: 'success' },
  failed: { label: 'Failed', tone: 'error' },
  cancelled: { label: 'Canceled', tone: 'muted' },
}

const JOB_NAMES = [
  'wrf-forecast',
  'bwa-align',
  'lammps-md',
  'openfoam-cavity',
  'pytorch-ddp',
  'gromacs-npt',
  'blast-search',
  'cp2k-relax',
  'hpl-bench',
  'nwchem-opt',
  'star-index',
  'vasp-scf',
  'paraview-batch',
  'namd-equil',
]

const JOBS: Job[] = JOB_NAMES.map((name, i) => ({
  id: String(48210 + i),
  name,
  state: (
    ['running', 'pending', 'running', 'completed', 'failed', 'running', 'cancelled'] as const
  )[i % 7] as JobState,
  partition: (['compute', 'gpu', 'highmem'] as const)[i % 3] ?? 'compute',
  user: OWNERS[i % OWNERS.length] ?? 'alice',
  submitted: dayOffset(-((i * 23) % 400)),
  overBudget: i % 4 === 2,
}))

/** A job list whose states also show as toggles with how many jobs are in each, beside a
 *  suggested "Over budget" toggle in the warning tone. The toggles and the chips set the same
 *  filters. Its Submitted field offers presets of its own. */
function QuickFiltersDemo({ width }: { width?: number }) {
  const counts = useMemo(() => {
    const out: Record<string, number> = {}
    for (const job of JOBS) {
      out[job.state] = (out[job.state] ?? 0) + 1
    }
    return out
  }, [])
  const view = useListView<Job>({
    storageKey: `story-quick-${width ?? 'wide'}`,
    columns: [
      { key: 'name', label: 'Job', alwaysVisible: true },
      { key: 'partition', label: 'Partition' },
      { key: 'state', label: 'State' },
    ],
    facets: [
      {
        key: 'state',
        label: 'State',
        options: (Object.keys(JOB_STATE) as JobState[]).map((s) => ({
          value: s,
          label: JOB_STATE[s].label,
          icon: <StatusDot variant={JOB_STATE[s].tone} size={8} />,
        })),
        matches: (row, selected) => selected.includes(row.state),
      },
      {
        key: 'partition',
        label: 'Partition',
        options: ['compute', 'gpu', 'highmem'].map((p) => ({ value: p, label: p })),
        matches: (row, selected) => selected.includes(row.partition),
      },
    ],
    filterFields: [
      {
        key: 'overBudget',
        label: 'Over budget',
        kind: 'boolean',
        value: (r) => r.overBudget,
      },
      {
        key: 'submitted',
        label: 'Submitted',
        icon: <CalendarIcon />,
        kind: 'date',
        presets: ['-24h', '-7d', '-30d', '-365d', 'year', 'all'],
        value: (r) => r.submitted,
      },
    ],
    quickFilters: [
      { field: 'state', counts, all: { count: JOBS.length }, multiple: false },
      {
        field: 'overBudget',
        counts: { true: JOBS.filter((j) => j.overBudget).length },
        tone: 'warning',
      },
    ],
    defaultFilters: [{ field: 'submitted', op: 'is', values: ['-365d'] }],
  })
  const rows = view.applyFilters(JOBS)
  return (
    <Shell width={width}>
      <div className="flex h-12 shrink-0 items-center border-b border-(--theme-border) px-4 text-[16px] font-semibold">
        Jobs
      </div>
      <ListPage
        view={view}
        toolbar={
          <div className="flex items-center justify-between gap-3 py-1.5">
            <ListCount
              total={JOBS.length}
              matches={rows.length}
              filterActive={view.activeFilterCount > 0}
              noun="job"
              nounPlural="jobs"
            />
            <div className="ml-auto flex items-center gap-2">
              <ListFilterMenu view={view} />
              <ListDisplayMenu view={view} />
            </div>
          </div>
        }
      >
        <Table {...listTableProps}>
          <Table.Header caps={false}>Job</Table.Header>
          <Table.Header caps={false} className="hidden @[36rem]:table-cell">
            Partition
          </Table.Header>
          <Table.Header caps={false}>State</Table.Header>
          {rows.map((r) => (
            <tr key={r.id} className="hover:theme-hover">
              <Table.Item>
                <div className="font-medium">{r.name}</div>
                <div className="text-[12px] text-(--theme-muted-text-color)">
                  {r.id} · {r.user}
                </div>
              </Table.Item>
              <Table.Item className="hidden @[36rem]:table-cell">{r.partition}</Table.Item>
              <Table.Item>
                <StatusBadge variant={JOB_STATE[r.state].tone}>
                  {JOB_STATE[r.state].label}
                </StatusBadge>
              </Table.Item>
            </tr>
          ))}
        </Table>
      </ListPage>
    </Shell>
  )
}

export const QuickFilters: StoryObj = {
  render: () => <QuickFiltersDemo />,
}

export const QuickFiltersDark: StoryObj = {
  ...QuickFilters,
  globals: { mode: 'dark' },
}

/** At phone width the state toggles keep to one line, the pressed one always shown, and
 *  "+n more" opens the rest in the filters sheet. */
export const QuickFiltersAtPhoneWidth: StoryObj = {
  render: () => <QuickFiltersDemo width={390} />,
}

export const QuickFiltersAtPhoneWidthDark: StoryObj = {
  ...QuickFiltersAtPhoneWidth,
  globals: { mode: 'dark' },
}

// --- A bar sharing its line ---------------------------------------------------

const QUEUE_FIELDS: FilterField[] = [
  {
    key: 'state',
    label: 'State',
    kind: 'enum',
    operators: ['is'],
    options: (['discarded', 'retryable', 'running'] as const).map((s) => ({
      value: s,
      label: { discarded: 'Discarded', retryable: 'Retrying', running: 'Running' }[s],
      icon: (
        <StatusDot
          variant={s === 'discarded' ? 'error' : s === 'retryable' ? 'warning' : 'info'}
          size={8}
        />
      ),
    })),
  },
  {
    key: 'queue',
    label: 'Queue',
    kind: 'enum',
    operators: ['is'],
    multiple: false,
    options: ['cluster-provisioning', 'notifications'].map((q) => ({ value: q, label: q })),
  },
]

/** A filter bar beside a toolbar's buttons, as a page's header holds it, with a pressed state
 *  and a queue chip that leave no room for "+n more" or Clear on their lines on a phone. */
function SharedLineDemo({ width }: { width?: number }) {
  const [active, setActive] = useState<ActiveFilter[]>([
    { field: 'state', op: 'is', values: ['running'] },
    { field: 'queue', op: 'is', values: ['cluster-provisioning'] },
  ])
  const filters = useListFilters({
    storageKey: `story-shared-line-${width ?? 'wide'}`,
    fields: QUEUE_FIELDS,
    remember: false,
    store: { value: active, onChange: setActive },
    quick: [{ field: 'state', counts: { retryable: 1, running: 2 } }],
  })
  return (
    <Shell width={width}>
      <div className="flex h-12 shrink-0 items-center border-b border-(--theme-border) px-4 text-[16px] font-semibold">
        Background jobs
      </div>
      <div className="flex items-start gap-2 px-4">
        <ListFilterBar filters={filters} className="min-w-0 flex-1" />
        <div className="flex shrink-0 items-center gap-1.5 py-1.5">
          <button
            type="button"
            aria-label="Refresh"
            className={buttonClasses({ variant: 'outline', size: 'sm', iconOnly: true })}
          >
            <RefreshIcon aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Filter"
            className={buttonClasses({ variant: 'outline', size: 'sm', iconOnly: true })}
          >
            <FilterIcon aria-hidden="true" />
          </button>
        </div>
      </div>
    </Shell>
  )
}

export const SharedLine: StoryObj = {
  render: () => <SharedLineDemo />,
}

/** At phone width neither "+n more" nor Clear sits on a line of its own: the toggles give way
 *  down to the pressed one, and where Clear doesn't fit after "+", it is the last item in the +
 *  menu instead. */
export const SharedLineAtPhoneWidth: StoryObj = {
  render: () => <SharedLineDemo width={390} />,
}

export const SharedLineAtPhoneWidthDark: StoryObj = {
  ...SharedLineAtPhoneWidth,
  globals: { mode: 'dark' },
}

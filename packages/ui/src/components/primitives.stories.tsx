import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, screen, userEvent, waitFor, within } from 'storybook/test'
import type { RunStatus } from '../engine'
import { formatBytes } from '../format'
import { Avatar } from './Avatar'
import { Button } from './Button'
import { buttonClasses } from './buttonClasses'
import { Checkbox } from './Checkbox'
import { Autocomplete, Combobox } from './Combobox'
import { ConfirmModal } from './ConfirmModal'
import { CreateModal, CreateModalSwitch } from './CreateModal'
import { DatePicker } from './DatePicker'
import { EmptyState } from './EmptyState'
import { ExternalLink } from './ExternalLink'
import { fieldBox } from './fieldBox'
import { InfoTip } from './InfoTip'
import { Input } from './Input'
import { positionKeys } from './keys'
import { type BarTone, Meter, ProgressBar } from './Meter'
import { Modal, type ModalProps } from './Modal'
import { NumberInput } from './NumberInput'
import { Overview } from './Overview'
import { RunStatusIcon, runStatusTone } from './RunStatusIcon'
import { Elapsed, RelativeTime } from './relativeTime'
import { SegmentedControl } from './SegmentedControl'
import { Select } from './Select'
import { StatusBadge, StatusDot } from './StatusBadge'
import { Switch } from './Switch'
import { type SortDirection, Table, type TableDensity } from './Table'
import { Tooltip } from './Tooltip'

const meta: Meta = {
  title: 'UI/Primitives',
}
export default meta

const RUN_STATUSES: RunStatus[] = [
  'running',
  'completed',
  'error',
  'canceled',
  'canceling',
  'skipped',
  'skipped-failed',
  'faulted',
  '',
]

/** A run status as an icon beside what ran, and in words as a badge in the same tone. */
export const RunStatuses: StoryObj = {
  render: () => (
    <div className="flex flex-col gap-2 text-sm">
      {RUN_STATUSES.map((status) => (
        <div key={status || 'none'} className="flex items-center gap-6">
          <span className="flex w-20 items-center gap-2">
            <RunStatusIcon status={status} />
            build
          </span>
          <StatusBadge variant={runStatusTone(status)}>{status || 'not run'}</StatusBadge>
        </div>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('img', { name: 'error' })).toBeVisible()
    await expect(canvas.getByRole('img', { name: 'completed' })).toBeVisible()
  },
}

export const Badges: StoryObj = {
  render: () => (
    <div className="flex items-center gap-3">
      <StatusBadge variant="success">Running</StatusBadge>
      <StatusBadge variant="warning" pulse>
        Degraded
      </StatusBadge>
      <StatusBadge variant="error">Stopped</StatusBadge>
      <StatusBadge variant="info" size="sm">
        Preview
      </StatusBadge>
      <StatusBadge variant="muted">Archived</StatusBadge>
      <StatusDot variant="success" />
    </div>
  ),
}

/** A picture, or initials until it loads and when it fails; one image to assistive
 *  technology either way. */
export const Avatars: StoryObj = {
  render: () => (
    <div className="flex items-end gap-3">
      <Avatar name="Ada Lovelace" size="xs" />
      <Avatar name="Ada Lovelace" size="sm" status="online" />
      <Avatar name="Grace Hopper" size="md" status="away" />
      <Avatar name="Alan Turing" size="lg" status="busy" />
      <Avatar name="Katherine Johnson" src="/missing-avatar.png" size="xl" status="offline" />
      <Avatar size="2xl" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // The name says the presence the dot shows.
    await expect(canvas.getByRole('img', { name: 'Grace Hopper, away' })).toHaveTextContent('GH')
    // A picture that fails keeps the initials.
    await waitFor(() =>
      expect(canvas.getByRole('img', { name: 'Katherine Johnson, offline' })).toHaveTextContent(
        'KJ',
      ),
    )
  },
}

/** Where there is nothing yet: a panel stands in for a whole list, and bare sits
 *  inside something that already frames it. */
export const EmptyStates: StoryObj<{ variant: 'panel' | 'bare' }> = {
  args: { variant: 'panel' },
  argTypes: { variant: { control: 'inline-radio', options: ['panel', 'bare'] } },
  render: ({ variant }) => (
    <div className="max-w-xl">
      <EmptyState
        variant={variant}
        icon={<span aria-hidden="true">∅</span>}
        title="No clusters yet"
        description="Connect machines you run, or start new ones in the cloud."
        action={
          <Button variant="primary" size="sm">
            Add cluster
          </Button>
        }
      />
    </div>
  ),
}

type ModalArgs = Pick<ModalProps, 'align' | 'dismissible' | 'size'> & { paragraphs: number }

function ModalDemo({ align, dismissible, size = 'md', paragraphs = 1 }: Partial<ModalArgs>) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        Open modal
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        align={align}
        dismissible={dismissible}
        size={size}
        title="Release notes"
        description="Focus stays inside until the modal closes, then returns to the button that opened it."
        footer={
          <Button variant="primary" size="sm" onClick={() => setOpen(false)}>
            Done
          </Button>
        }
      >
        {positionKeys(paragraphs, 'note').map((key) => (
          <p key={key} className="mb-3 text-sm last:mb-0">
            This version speeds up the scheduler, adds a retry policy to every job, and keeps logs
            for thirty days instead of seven.
          </p>
        ))}
      </Modal>
    </>
  )
}

const openModal = async (canvasElement: HTMLElement, name = 'Open modal') => {
  await userEvent.click(within(canvasElement).getByRole('button', { name }))
}

/** The standard layout: a title that names it, a description, a body and a footer. Escape
 *  and the backdrop close it. */
export const ModalStory: StoryObj<ModalArgs> = {
  name: 'Modal',
  args: { align: 'top', dismissible: true, size: 'md', paragraphs: 1 },
  argTypes: {
    align: { control: 'inline-radio', options: ['top', 'center'] },
    dismissible: { control: 'boolean', description: 'False ignores Escape and the backdrop.' },
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg', 'xl'] },
    paragraphs: {
      control: { type: 'range', min: 1, max: 30 },
      description: 'How long the body runs.',
    },
  },
  render: (args) => <ModalDemo {...args} />,
  play: async ({ canvasElement }) => {
    await openModal(canvasElement)
    const dialog = await screen.findByRole('dialog', { name: 'Release notes' })
    await waitFor(() => expect(dialog).toBeVisible())
    await expect(dialog).toHaveAccessibleDescription(/Focus stays inside/)
  },
}

/** A body taller than the window scrolls on its own, keeping the title and the footer in view. */
export const ModalLongBody: StoryObj = {
  name: 'Modal, long body',
  render: () => <ModalDemo paragraphs={30} />,
  play: async ({ canvasElement }) => {
    await openModal(canvasElement)
    const dialog = await screen.findByRole('dialog', { name: 'Release notes' })
    await waitFor(() => expect(dialog).toBeVisible())
    const done = within(dialog).getByRole('button', { name: 'Done' })
    const bottom = done.getBoundingClientRect().bottom
    await expect(bottom).toBeLessThanOrEqual(window.innerHeight)
  },
}

/** Unsaved input: Escape and the backdrop leave it open, its own buttons still close it. */
export const ModalNotDismissible: StoryObj = {
  name: 'Modal, not dismissible',
  render: () => <ModalDemo dismissible={false} />,
  play: async ({ canvasElement }) => {
    await openModal(canvasElement)
    const dialog = await screen.findByRole('dialog', { name: 'Release notes' })
    await userEvent.keyboard('{Escape}')
    await expect(dialog).toBeVisible()
  },
}

function ConfirmDemo({ destructive = false }: { destructive?: boolean }) {
  const [open, setOpen] = useState(false)
  const [snapshots, setSnapshots] = useState(false)
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        Open modal
      </Button>
      <ConfirmModal
        open={open}
        onClose={() => setOpen(false)}
        destructive={destructive}
        title={destructive ? 'Delete cluster?' : 'Confirm action'}
        description={
          destructive ? 'Its jobs stop and its disks are erased.' : 'You can change this later.'
        }
        confirmLabel={destructive ? 'Delete' : 'Confirm'}
        onConfirm={() => setOpen(false)}
      >
        {destructive && (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={snapshots} onCheckedChange={setSnapshots} />
            Also delete its snapshots
          </label>
        )}
      </ConfirmModal>
    </>
  )
}

export const ConfirmModalStory: StoryObj = {
  name: 'Confirm modal',
  render: () => <ConfirmDemo />,
  play: async ({ canvasElement }) => {
    await openModal(canvasElement)
    // The dialog portals outside the story canvas.
    const dialog = await screen.findByRole('dialog', { name: 'Confirm action' })
    await waitFor(() => expect(dialog).toBeVisible())
  },
}

/** A destructive confirmation is an alertdialog: it waits for an answer, and the backdrop doesn't close it. */
export const DestructiveConfirmModal: StoryObj = {
  name: 'Confirm modal, destructive',
  render: () => <ConfirmDemo destructive />,
  play: async ({ canvasElement }) => {
    await openModal(canvasElement)
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete cluster?' })
    await waitFor(() => expect(dialog).toBeVisible())
    await expect(dialog).toHaveAccessibleDescription('Its jobs stop and its disks are erased.')
  },
}

function CreateModalDemo() {
  const [open, setOpen] = useState(false)
  const [shared, setShared] = useState(false)
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        New widget
      </Button>
      <CreateModal
        open={open}
        onClose={() => setOpen(false)}
        typeLabel="Widget"
        namePlaceholder="widget-name"
        validateName={(name) => (name.includes(' ') ? 'No spaces allowed' : null)}
        onSubmit={async () => true}
        showFavorite
        properties={
          <CreateModalSwitch label="Public" checked={shared} onCheckedChange={setShared} />
        }
        advanced={<Input label="Region" placeholder="nearest" />}
      />
    </>
  )
}

export const CreateModalStory: StoryObj = {
  name: 'Create modal',
  render: () => <CreateModalDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'New widget' }))
    await expect(await screen.findByPlaceholderText('widget-name')).toBeVisible()
    // Secondary detail waits behind its own toggle.
    const advanced = screen.getByRole('button', { name: 'Advanced' })
    await expect(advanced).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(advanced)
    await waitFor(() => expect(screen.getByPlaceholderText('nearest')).toBeVisible())
  },
}

const clusters = [
  { name: 'alpha', status: 'ready', region: 'us-east-1', nodes: 4 },
  { name: 'gamma', status: 'ready', region: 'eu-west-2', nodes: 12 },
  { name: 'beta', status: 'ready', region: 'us-west-2', nodes: 2 },
]

function TablesDemo({ density }: { density: TableDensity }) {
  const [sort, setSort] = useState<{ key: 'name' | 'nodes'; direction: SortDirection }>({
    key: 'name',
    direction: 'ascending',
  })
  const sorted = [...clusters].sort((a, b) => {
    const order = a[sort.key] < b[sort.key] ? -1 : a[sort.key] > b[sort.key] ? 1 : 0
    return sort.direction === 'descending' ? -order : order
  })
  const sortBy = (key: 'name' | 'nodes') => () =>
    setSort((now) => ({
      key,
      direction: now.key === key && now.direction === 'ascending' ? 'descending' : 'ascending',
    }))
  const directionOf = (key: 'name' | 'nodes'): SortDirection =>
    sort.key === key ? sort.direction : 'none'
  return (
    <div className="flex flex-col gap-6">
      <Table roundedTop density={density}>
        <Table.Header sort={directionOf('name')} onSort={sortBy('name')}>
          Name
        </Table.Header>
        <Table.Header>Status</Table.Header>
        <Table.Header>Region</Table.Header>
        <Table.Header sort={directionOf('nodes')} onSort={sortBy('nodes')} className="text-right">
          Nodes
        </Table.Header>
        {sorted.map((cluster) => (
          <tr key={cluster.name}>
            <Table.Item>{cluster.name}</Table.Item>
            <Table.Item>
              <StatusBadge variant="success">{cluster.status}</StatusBadge>
            </Table.Item>
            <Table.Item>{cluster.region}</Table.Item>
            <Table.Item className="text-right tabular-nums">{cluster.nodes}</Table.Item>
          </tr>
        ))}
      </Table>
      <Table density="compact" rounded>
        <Table.Header>Key</Table.Header>
        <Table.Header>Value</Table.Header>
        <tr>
          <Table.Item>version</Table.Item>
          <Table.Item>0.3.0</Table.Item>
        </tr>
        <tr>
          <Table.Item>channel</Table.Item>
          <Table.Item>stable</Table.Item>
        </tr>
      </Table>
    </div>
  )
}

/** In a box that scrolls, `stickyHeader` keeps the column titles in view
 *  while the rows pass under them. */
export const StickyTableHeader: StoryObj<{ stickyHeader: boolean }> = {
  args: { stickyHeader: true },
  argTypes: { stickyHeader: { control: 'boolean' } },
  render: ({ stickyHeader }) => (
    // Sizes are inline: the package's stylesheet doesn't scan stories.
    <div className="overflow-auto rounded-md border theme-border" style={{ height: '16rem' }}>
      <Table borderless panel={false} stickyHeader={stickyHeader}>
        <Table.Header>Name</Table.Header>
        <Table.Header>Region</Table.Header>
        <Table.Header className="text-right">Nodes</Table.Header>
        {Array.from({ length: 24 }, (_, i) => {
          const cluster = clusters[i % clusters.length] ?? clusters[0]
          const name = `${cluster?.name}-${i + 1}`
          return (
            <tr key={name}>
              <Table.Item>{name}</Table.Item>
              <Table.Item>{cluster?.region}</Table.Item>
              <Table.Item className="text-right tabular-nums">{cluster?.nodes}</Table.Item>
            </tr>
          )
        })}
      </Table>
    </div>
  ),
}

/** Column titles line up with the values under them. A sortable column's title is a
 *  button that says its direction; an unsorted one shows its mark on hover and focus.
 *  `compact` fits a short list of keys and values. */
export const Tables: StoryObj<{ density: TableDensity }> = {
  args: { density: 'comfortable' },
  argTypes: { density: { control: 'inline-radio', options: ['comfortable', 'compact'] } },
  render: (args) => <TablesDemo {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const name = canvas.getByRole('columnheader', { name: 'Name' })
    await expect(name).toHaveAttribute('aria-sort', 'ascending')
    await expect(canvas.getByRole('columnheader', { name: 'Nodes' })).toHaveAttribute(
      'aria-sort',
      'none',
    )
    await expect(canvas.getByRole('columnheader', { name: 'Status' })).not.toHaveAttribute(
      'aria-sort',
    )
    await userEvent.click(within(name).getByRole('button'))
    await expect(name).toHaveAttribute('aria-sort', 'descending')
    await expect(canvas.getAllByRole('row')[1]).toHaveTextContent('gamma')
  },
}

function InputsDemo() {
  const [choice, setChoice] = useState<string | null>('medium')
  const [branch, setBranch] = useState('')
  const [enabled, setEnabled] = useState(false)
  return (
    <div className="flex flex-col gap-6 max-w-sm">
      <Combobox
        aria-label="Instance size"
        items={['small', 'medium', 'large']}
        value={choice}
        onValueChange={setChoice}
      />
      <Autocomplete
        aria-label="Branch"
        items={['main', 'develop']}
        value={branch}
        onValueChange={setBranch}
        placeholder="Type or pick a branch"
      />
      <label className="flex items-center gap-2 text-sm">
        <Switch checked={enabled} onCheckedChange={setEnabled} />
        Notifications
      </label>
    </div>
  )
}

export const Inputs: StoryObj = {
  render: () => <InputsDemo />,
}

function SegmentedDemo({ fill, iconOnly }: { fill: boolean; iconOnly: boolean }) {
  const [range, setRange] = useState<'day' | 'week' | 'month'>('week')
  return (
    <div className="flex w-64 flex-col gap-6">
      <SegmentedControl
        label="Range"
        value={range}
        onValueChange={setRange}
        fill={fill}
        iconOnly={iconOnly}
        options={[
          { value: 'day', label: 'Day', icon: <StatusDot variant="muted" size={6} /> },
          {
            value: 'week',
            label: 'Week',
            icon: <StatusDot variant="success" size={6} />,
            badge: <StatusDot variant="warning" size={6} />,
          },
          { value: 'month', label: 'Month', icon: <StatusDot variant="error" size={6} /> },
        ]}
      />
    </div>
  )
}

// One choice among a few, always one current. The badge says the other side
// is worth a look; with only icons it moves to the corner.
export const Segmented: StoryObj<{ fill: boolean; iconOnly: boolean }> = {
  args: { fill: true, iconOnly: false },
  render: (args) => <SegmentedDemo {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Month' }))
    await expect(canvas.getByRole('button', { name: 'Month' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  },
}

const longName = 'a-very-long-resource-name-that-does-not-fit-in-its-column'

export const Tooltips: StoryObj<{ side: 'top' | 'bottom' | 'left' | 'right' }> = {
  args: { side: 'top' },
  argTypes: { side: { control: 'inline-radio', options: ['top', 'bottom', 'left', 'right'] } },
  render: ({ side }) => (
    <div className="flex flex-col items-start gap-6 p-8 text-sm">
      <div className="flex items-center gap-6">
        <Tooltip content="Saves the draft" side={side}>
          <Button variant="secondary">Save</Button>
        </Tooltip>
        <Tooltip content="Search the list" shortcut="⌘+F" side={side}>
          <Button variant="secondary">Search</Button>
        </Tooltip>
        <Tooltip content="Nothing to undo" side={side} disabled>
          <Button variant="secondary">Disabled tooltip</Button>
        </Tooltip>
      </div>
      <Tooltip content={longName} overflowOnly side={side}>
        <button type="button" className="w-48 truncate text-left">
          {longName}
        </button>
      </Tooltip>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.hover(canvas.getByRole('button', { name: 'Search' }))
    // Base UI keeps tooltips out of the accessibility tree, so find the text.
    // Wait out the hover delay and the fade-in.
    await waitFor(() => expect(screen.getByText('Search the list')).toBeVisible())
  },
}

export const InfoTips: StoryObj = {
  render: () => (
    <div className="flex items-center gap-6 p-8 text-sm">
      <span className="inline-flex items-center gap-1">
        Retries
        <InfoTip text={'How many times a job reruns.\nSee [the docs](https://example.com).'} />
      </span>
      <InfoTip text="The runner stopped responding." className="gap-1">
        <RunStatusIcon status="error" />
        Failed
      </InfoTip>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'More information' }))
    await waitFor(() => expect(screen.getByRole('link', { name: /^the docs/ })).toBeVisible())
  },
}

/** An InfoTip whose text a control already reads as its description hides its ? from assistive
 *  technology and Tab. A Field's `help` sets this up, and opens the tip while the control has
 *  keyboard focus. */
export const InfoTipDescribingAControl: StoryObj = {
  render: () => (
    <div className="flex items-center gap-2 p-8 pt-20 text-sm">
      <label htmlFor="retries">Retries</label>
      <InfoTip text="How many times a job reruns." describesControl />
      <input id="retries" aria-describedby="retries-help" className={fieldBox()} />
      <span id="retries-help" hidden>
        How many times a job reruns.
      </span>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('textbox', { name: 'Retries' })).toHaveAccessibleDescription(
      'How many times a job reruns.',
    )
    await expect(canvas.queryByRole('button', { name: 'More information' })).toBeNull()
  },
}

/** A thing's summary: its mark, name and kind, a row of badges, and its actions. */
export const OverviewStory: StoryObj<{ loading: boolean }> = {
  name: 'Overview',
  args: { loading: false },
  render: ({ loading }) => (
    <Overview
      className="max-w-xl"
      loading={loading}
      iconSize={48}
      icon={<Avatar name="Grace Hopper" size="2xl" />}
      name="gpu-trainer-01"
      type="Cluster"
      actions={<Button size="sm">Restart</Button>}
    >
      <StatusBadge variant="success" dot>
        Running
      </StatusBadge>
    </Overview>
  ),
}

export const OverviewLoading: StoryObj = {
  name: 'Overview loading',
  render: () => <Overview icon={null} name="Resource" loading className="max-w-sm" />,
}

export const Switches: StoryObj<{
  size: 'sm' | 'md'
  disabled: boolean
  invalid: boolean
  stateNames: boolean
  rightToLeft: boolean
}> = {
  args: { size: 'md', disabled: false, invalid: false, stateNames: true, rightToLeft: false },
  argTypes: { size: { control: 'inline-radio', options: ['sm', 'md'] } },
  render: ({ size, disabled, invalid, stateNames, rightToLeft }) => (
    // In a right-to-left page an on switch's thumb sits at the left, the end of the line.
    <div dir={rightToLeft ? 'rtl' : undefined} className="flex flex-col gap-3 text-sm">
      <label className="flex items-center gap-2">
        <Switch size={size} disabled={disabled} aria-invalid={invalid || undefined} />
        Email notifications
      </label>
      <label className="flex items-center gap-2">
        <Switch
          size={size}
          defaultChecked
          disabled={disabled}
          aria-invalid={invalid || undefined}
        />
        Automatic updates
      </label>
      {/* States with names of their own show the current one beside the switch. */}
      <div className="flex items-center gap-2">
        <span id="visibility-label">Visibility</span>
        <Switch
          aria-labelledby="visibility-label"
          size={size}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          onLabel={stateNames ? 'Public' : undefined}
          offLabel={stateNames ? 'Private' : undefined}
        />
      </div>
    </div>
  ),
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const notifications = canvas.getByRole('switch', { name: 'Email notifications' })
    await userEvent.click(notifications)
    await expect(notifications).toHaveAttribute('aria-checked', 'true')
    if (args.stateNames && !args.disabled) {
      await expect(canvas.getByText('Private')).toBeVisible()
      await userEvent.click(canvas.getByRole('switch', { name: 'Visibility' }))
      await waitFor(() => expect(canvas.getByText('Public')).toBeVisible())
      await expect(canvas.getByText('Private')).not.toBeVisible()
    }
  },
}

/** Switches in a right-to-left page, whose thumbs slide to the left when on. */
export const SwitchesRightToLeft: typeof Switches = {
  ...Switches,
  args: { ...Switches.args, rightToLeft: true },
}

// Described as a Combobox's options are, so the two lists can be compared.
const SIZES = [
  { value: 'small', label: 'Small', description: '2 vCPU, 8 GB' },
  { value: 'medium', label: 'Medium', description: '4 vCPU, 16 GB' },
  { value: 'large', label: 'Large', description: '8 vCPU, 32 GB', disabled: true },
]

function SelectsDemo({
  disabled,
  invalid,
  size,
}: {
  disabled: boolean
  invalid: boolean
  size: 'sm' | 'md'
}) {
  const [instance, setInstance] = useState<string | null>(null)
  const [regions, setRegions] = useState<string[]>(['us-east'])
  return (
    <div className="flex max-w-xs flex-col gap-4">
      <Select
        aria-label="Instance size"
        items={SIZES}
        value={instance}
        onValueChange={setInstance}
        placeholder="Pick a size"
        disabled={disabled}
        aria-invalid={invalid}
        size={size}
      />
      <Select
        multiple
        aria-label="Regions"
        items={[
          { value: 'us-east', label: 'US East' },
          { value: 'us-west', label: 'US West' },
          { value: 'eu-central', label: 'EU Central' },
        ]}
        value={regions}
        onValueChange={setRegions}
        placeholder="Pick regions"
        disabled={disabled}
        aria-invalid={invalid}
        size={size}
      />
    </div>
  )
}

export const Selects: StoryObj<{ disabled: boolean; invalid: boolean; size: 'sm' | 'md' }> = {
  args: { disabled: false, invalid: false, size: 'md' },
  argTypes: { size: { control: 'inline-radio', options: ['sm', 'md'] } },
  render: (args) => <SelectsDemo {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('combobox', { name: 'Instance size' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Medium' }))
    await expect(canvas.getByRole('combobox', { name: 'Instance size' })).toHaveTextContent(
      'Medium',
    )
  },
}

const MODES = [
  { value: 'ask', label: 'Ask', description: 'Asks before every change' },
  { value: 'auto', label: 'Auto', description: 'Changes files without asking' },
  { value: 'locked', label: 'Locked', description: 'Read only', disabled: true },
]

function SelectTriggerDemo({ disabled }: { disabled: boolean }) {
  const [mode, setMode] = useState<string | null>('ask')
  return (
    <Select
      aria-label="Mode"
      items={MODES}
      value={mode}
      onValueChange={setMode}
      disabled={disabled}
      triggerTooltip="How the agent edits files"
      trigger={
        <button type="button" className={buttonClasses({ variant: 'outline', size: 'sm' })}>
          {MODES.find((m) => m.value === mode)?.label}
        </button>
      }
    />
  )
}

/** A toolbar chip opens the list; options carry a description line. */
export const SelectTrigger: StoryObj<{ disabled: boolean }> = {
  args: { disabled: false },
  render: (args) => <SelectTriggerDemo {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('combobox', { name: 'Mode' }))
    await userEvent.click(await screen.findByRole('option', { name: /Auto/ }))
    await expect(canvas.getByRole('combobox', { name: 'Mode' })).toHaveTextContent('Auto')
  },
}

const THEMES = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'contrast', label: 'High contrast' },
]

function SelectPreviewDemo() {
  const [theme, setTheme] = useState<string | null>('light')
  const [previewing, setPreviewing] = useState<string | undefined>()
  const shown = previewing ?? theme
  return (
    <div className="flex max-w-xs flex-col gap-3 text-sm">
      {/* Above the Select, so the open list doesn't cover it. */}
      <span data-testid="applied">
        {previewing ? 'Previewing' : 'Applied'}: {THEMES.find((t) => t.value === shown)?.label}
      </span>
      <Select
        aria-label="Theme"
        size="sm"
        items={THEMES}
        value={theme}
        onValueChange={setTheme}
        onItemHighlighted={setPreviewing}
      />
    </div>
  )
}

/** Moving through the list previews each theme; closing it goes back to the chosen one. */
export const SelectPreview: StoryObj = {
  render: () => <SelectPreviewDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('combobox', { name: 'Theme' }))
    // Opening highlights the chosen theme; the arrow moves on from there.
    await waitFor(() =>
      expect(canvas.getByTestId('applied')).toHaveTextContent('Previewing: Light'),
    )
    await userEvent.keyboard('{ArrowDown}')
    await waitFor(() => expect(canvas.getByTestId('applied')).toHaveTextContent('Previewing: Dark'))
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(canvas.getByTestId('applied')).toHaveTextContent('Applied: Light'))
  },
}

type NumberFormat = 'plain' | 'grouped' | 'currency' | 'unit'

const NUMBER_FORMATS: Record<NumberFormat, Intl.NumberFormatOptions> = {
  plain: {},
  grouped: { useGrouping: true },
  currency: { style: 'currency', currency: 'USD' },
  unit: { style: 'unit', unit: 'gigabyte' },
}

function NumberInputDemo({
  format,
  steppers,
  disabled,
  invalid,
}: {
  format: NumberFormat
  steppers: boolean
  disabled: boolean
  invalid: boolean
}) {
  const [value, setValue] = useState<number | null>(2500)
  return (
    <div className="flex max-w-xs flex-col gap-2 text-sm">
      <label htmlFor="budget" className="font-medium">
        Budget
      </label>
      <NumberInput
        id="budget"
        value={value}
        onValueChange={setValue}
        min={0}
        step={100}
        format={NUMBER_FORMATS[format]}
        steppers={steppers}
        disabled={disabled}
        aria-invalid={invalid}
      />
      <span data-testid="number-value">{value === null ? 'empty' : value}</span>
    </div>
  )
}

/** A number with Intl formatting, held as a number; steppers move it by `step` within range. */
export const NumberInputs: StoryObj<{
  format: NumberFormat
  steppers: boolean
  disabled: boolean
  invalid: boolean
}> = {
  args: { format: 'grouped', steppers: true, disabled: false, invalid: false },
  argTypes: {
    format: { control: 'inline-radio', options: ['plain', 'grouped', 'currency', 'unit'] },
  },
  render: (args) => <NumberInputDemo {...args} />,
  play: async ({ canvasElement, args }) => {
    if (args.disabled) {
      return
    }
    const canvas = within(canvasElement)
    const input = canvas.getByRole('textbox', { name: 'Budget' })
    await userEvent.clear(input)
    await userEvent.type(input, '1234')
    await waitFor(() => expect(canvas.getByTestId('number-value')).toHaveTextContent('1234'))
  },
}

function DatePickerDemo({
  withTime,
  bounded,
  required,
  disabled,
  invalid,
}: {
  withTime: boolean
  bounded: boolean
  required: boolean
  disabled: boolean
  invalid: boolean
}) {
  const [value, setValue] = useState(withTime ? '2026-03-14T09:30' : '2026-03-14')
  return (
    <div className="flex flex-col gap-2 text-sm">
      <span id="starts-label" className="font-medium">
        Starts
      </span>
      <DatePicker
        aria-labelledby="starts-label"
        value={value}
        onValueChange={setValue}
        withTime={withTime}
        timeStep={900}
        min={bounded ? (withTime ? '2026-03-10T08:00' : '2026-03-10') : undefined}
        max={bounded ? (withTime ? '2026-03-31T18:00' : '2026-03-31') : undefined}
        required={required}
        disabled={disabled}
        aria-invalid={invalid}
      />
      <span data-testid="date-value">{value || 'empty'}</span>
    </div>
  )
}

/** A day from a calendar in the reader's locale; with a time, a time input beside it. The
 *  value reads as a native date or datetime-local input's would. */
export const DatePickers: StoryObj<{
  withTime: boolean
  bounded: boolean
  required: boolean
  disabled: boolean
  invalid: boolean
}> = {
  args: { withTime: true, bounded: true, required: false, disabled: false, invalid: false },
  render: (args) => <DatePickerDemo key={String(args.withTime)} {...args} />,
  play: async ({ canvasElement, args }) => {
    if (args.disabled) {
      return
    }
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Starts' }))
    const grid = await screen.findByRole('grid')
    const day = new Intl.DateTimeFormat(undefined, { dateStyle: 'full' }).format(
      new Date(2026, 2, 20),
    )
    await userEvent.click(within(grid).getByRole('button', { name: day }))
    await waitFor(() =>
      expect(canvas.getByTestId('date-value')).toHaveTextContent(
        args.withTime ? '2026-03-20T09:30' : '2026-03-20',
      ),
    )
  },
}

const GB = 1024 ** 3

/** Readings against levels: amber past `warnAt`, red past `errorAt`. */
export const Meters: StoryObj<{ value: number; showValue: 'beside' | 'tooltip' }> = {
  args: { value: 62, showValue: 'beside' },
  argTypes: {
    value: { control: { type: 'range', min: 0, max: 100 } },
    showValue: { control: 'inline-radio', options: ['beside', 'tooltip'] },
  },
  render: ({ value, showValue }) => (
    <div className="flex w-72 flex-col gap-6 p-8">
      <Meter
        value={value}
        showValue={showValue}
        label="Storage"
        detail={`${formatBytes((value / 100) * 50 * GB)} of ${formatBytes(50 * GB)}`}
      />
      <Meter value={85} label="Memory" />
      <Meter value={96} label="Quota" />
      <Meter value={12} tone="error" label="Frozen allocation" />
      <Meter value={6} max={16} format={{}} label="Cores in use" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByRole('meter')).toHaveLength(5)
    await expect(canvas.getByRole('meter', { name: 'Memory' })).toHaveTextContent('85%')
  },
}

const PROGRESS: { label: string; value: number | null; tone: BarTone; status?: string }[] = [
  { label: 'results.csv', value: 42, tone: 'accent' },
  { label: 'model.bin', value: 100, tone: 'success', status: 'Completed' },
  { label: 'archive.tar', value: 64, tone: 'error', status: 'Failed' },
  { label: 'notes.txt', value: 18, tone: 'muted', status: 'Canceled' },
  { label: 'Preparing', value: null, tone: 'accent' },
]

/** Tasks under way, settled ones with a status in place of the percentage. */
export const ProgressBars: StoryObj<{ size: 'sm' | 'md' | 'lg' }> = {
  args: { size: 'md' },
  argTypes: { size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] } },
  render: ({ size }) => (
    <div className="flex w-72 flex-col gap-6 p-8">
      {PROGRESS.map(({ label, value, tone, status }) => (
        <ProgressBar
          key={label}
          value={value}
          tone={tone}
          status={status}
          label={label}
          size={size}
          detail={value === 42 ? '21 MB / 50 MB' : undefined}
        />
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('progressbar', { name: 'results.csv' })).toHaveTextContent('42%')
    await expect(canvas.getByRole('progressbar', { name: 'model.bin' })).toHaveTextContent(
      'Completed',
    )
  },
}

const MINUTE = 60_000

/** Times that keep counting while on screen, long or compact, with the exact
 *  time on hover. */
export const RelativeTimes: StoryObj<{ format: 'long' | 'compact' }> = {
  args: { format: 'long' },
  argTypes: { format: { control: 'inline-radio', options: ['long', 'compact'] } },
  render: ({ format }) => {
    const now = Date.now()
    return (
      <div className="flex flex-col gap-2 p-8 text-sm">
        {[0.2, 5, 90, 60 * 30, 60 * 24 * 400].map((minutes) => (
          <RelativeTime key={minutes} value={now - minutes * MINUTE} format={format} />
        ))}
      </div>
    )
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByText(args.format === 'compact' ? '5m' : '5 minutes ago'),
    ).toBeInTheDocument()
  },
}

/** How long something ran: counting while it has no end, fixed once it has one. */
export const ElapsedTimes: StoryObj<{ running: boolean }> = {
  args: { running: true },
  render: ({ running }) => {
    const now = Date.now()
    return (
      <div className="flex flex-col gap-2 p-8 text-sm tabular-nums">
        <Elapsed start={now - 75_000} running={running} />
        <Elapsed start={now - 3 * 60 * MINUTE} end={now - 60 * MINUTE - 4_000} />
      </div>
    )
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('1h 59m 56s').tagName).toBe('TIME')
    await waitFor(() => expect(canvas.getByText(/^1m 1[5-9]s$/)).toBeInTheDocument())
  },
}

/** Links that leave the page open a new tab and say so to screen readers. */
export const ExternalLinks: StoryObj = {
  render: () => (
    <div className="flex items-center gap-6 p-8 text-sm">
      <ExternalLink href="https://example.com" className="link">
        Documentation
      </ExternalLink>
      <ExternalLink href="https://example.com" className="link" icon>
        Status page
      </ExternalLink>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const link = within(canvasElement).getByRole('link', { name: /^Status page/ })
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  },
}

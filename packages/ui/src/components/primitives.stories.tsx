import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, screen, userEvent, waitFor, within } from 'storybook/test'
import type { RunStatus } from '../engine'
import Callout from './Callout'
import { Autocomplete, Combobox } from './Combobox'
import { ConfirmModal } from './ConfirmModal'
import { CreateModal, CreateModalField } from './CreateModal'
import { primaryButtonClasses } from './ghostButton'
import { Indicator } from './Indicator'
import { InfoTip } from './InfoTip'
import Loader from './Loader'
import { Modal, ModalDescription, type ModalProps, ModalTitle } from './Modal'
import { Overview } from './Overview'
import { SegmentedControl } from './SegmentedControl'
import { Select } from './Select'
import { StatusBadge, StatusDot } from './StatusBadge'
import { Switch } from './Switch'
import { CompactTable, Table } from './Table'
import { Tooltip } from './Tooltip'

const meta: Meta = {
  title: 'UI/Primitives',
}
export default meta

const INDICATOR_STATUSES: RunStatus[] = [
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

export const Indicators: StoryObj = {
  render: () => (
    <div className="flex flex-col gap-2">
      {INDICATOR_STATUSES.map((status) => (
        <div key={status || 'none'} className="flex items-center gap-3">
          <Indicator status={status} />
          <span className="text-sm">{status || '(no status)'}</span>
        </div>
      ))}
    </div>
  ),
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

export const Feedback: StoryObj = {
  render: () => (
    <div className="flex flex-col gap-4 max-w-xl">
      <Callout type="info">Informational callout with guidance.</Callout>
      <Callout type="warning">Something needs attention.</Callout>
      <Callout type="error">Something went wrong.</Callout>
      <Loader text="Loading resources" size={40} />
    </div>
  ),
}

export const Loaders: StoryObj<{ size: number; text: string }> = {
  args: { size: 48, text: 'Loading resources' },
  argTypes: { size: { control: { type: 'range', min: 16, max: 160 } } },
  render: (args) => (
    <div className="flex items-start" style={{ gap: 48 }}>
      <Loader {...args} variant="spinner" full={false} />
      <Loader {...args} variant="logo" full={false} />
    </div>
  ),
}

function ModalDemo({ align, dismissible }: Pick<ModalProps, 'align' | 'dismissible'>) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="btn btn-info" onClick={() => setOpen(true)}>
        Open modal
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        align={align}
        dismissible={dismissible}
        className="w-[480px] max-w-full p-6"
      >
        <ModalTitle className="text-lg font-semibold">Release notes</ModalTitle>
        <ModalDescription className="mt-1.5 text-sm text-(--theme-muted-text-color)">
          Focus stays inside until the modal closes, then returns to the button that opened it.
        </ModalDescription>
        <div className="mt-5 flex justify-end">
          <button type="button" className={primaryButtonClasses} onClick={() => setOpen(false)}>
            Done
          </button>
        </div>
      </Modal>
    </>
  )
}

const openModal = async (canvasElement: HTMLElement, name = 'Open modal') => {
  await userEvent.click(within(canvasElement).getByRole('button', { name }))
}

/** A plain modal: Escape and the backdrop close it. */
export const ModalStory: StoryObj<Pick<ModalProps, 'align' | 'dismissible'>> = {
  name: 'Modal',
  args: { align: 'top', dismissible: true },
  argTypes: {
    align: { control: 'inline-radio', options: ['top', 'center'] },
    dismissible: { control: 'boolean', description: 'False ignores Escape and the backdrop.' },
  },
  render: (args) => <ModalDemo {...args} />,
  play: async ({ canvasElement }) => {
    await openModal(canvasElement)
    const dialog = await screen.findByRole('dialog', { name: 'Release notes' })
    await waitFor(() => expect(dialog).toBeVisible())
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
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
  return (
    <>
      <button type="button" className="btn btn-info" onClick={() => setOpen(true)}>
        Open modal
      </button>
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
      />
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
  return (
    <>
      <button type="button" className="btn btn-info" onClick={() => setOpen(true)}>
        New widget
      </button>
      <CreateModal
        open={open}
        onClose={() => setOpen(false)}
        typeLabel="Widget"
        namePlaceholder="widget-name"
        validateName={(name) => (name.includes(' ') ? 'No spaces allowed' : null)}
        onSubmit={async () => true}
        properties={<CreateModalField label="Size" placeholder="medium" />}
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
  },
}

export const Tables: StoryObj = {
  render: () => (
    <div className="flex flex-col gap-6">
      <Table roundedTop>
        <Table.Header>Name</Table.Header>
        <Table.Header>Status</Table.Header>
        <Table.Header>Region</Table.Header>
        {['alpha', 'beta'].map((name) => (
          <tr key={name}>
            <Table.Item>{name}</Table.Item>
            <Table.Item>
              <StatusBadge variant="success">ready</StatusBadge>
            </Table.Item>
            <Table.Item>us-east-1</Table.Item>
          </tr>
        ))}
      </Table>
      <CompactTable>
        <CompactTable.Header>Key</CompactTable.Header>
        <CompactTable.Header>Value</CompactTable.Header>
        <tr>
          <CompactTable.Item>version</CompactTable.Item>
          <CompactTable.Item>0.3.0</CompactTable.Item>
        </tr>
      </CompactTable>
    </div>
  ),
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
          <button type="button" className="btn">
            Save
          </button>
        </Tooltip>
        <Tooltip content="Search the list" shortcut="⌘+F" side={side}>
          <button type="button" className="btn">
            Search
          </button>
        </Tooltip>
        <Tooltip content="Nothing to undo" side={side} disabled>
          <button type="button" className="btn">
            Disabled tooltip
          </button>
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
        <Indicator status="error" />
        Failed
      </InfoTip>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'More information' }))
    await waitFor(() => expect(screen.getByRole('link', { name: 'the docs' })).toBeVisible())
  },
}

export const OverviewLoading: StoryObj = {
  name: 'Overview loading',
  render: () => <Overview Icon={null} name="Resource" loading className="max-w-sm gap-3" />,
}

export const Switches: StoryObj<{ size: 'sm' | 'md'; disabled: boolean; invalid: boolean }> = {
  args: { size: 'md', disabled: false, invalid: false },
  argTypes: { size: { control: 'inline-radio', options: ['sm', 'md'] } },
  render: ({ size, disabled, invalid }) => (
    <div className="flex flex-col gap-3 text-sm">
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
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const notifications = canvas.getByRole('switch', { name: 'Email notifications' })
    await userEvent.click(notifications)
    await expect(notifications).toHaveAttribute('aria-checked', 'true')
  },
}

const SIZES = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large', disabled: true },
]

function SelectsDemo({ disabled, invalid }: { disabled: boolean; invalid: boolean }) {
  const [size, setSize] = useState<string | null>(null)
  const [regions, setRegions] = useState<string[]>(['us-east'])
  return (
    <div className="flex max-w-xs flex-col gap-4">
      <Select
        aria-label="Instance size"
        items={SIZES}
        value={size}
        onValueChange={setSize}
        placeholder="Pick a size"
        disabled={disabled}
        aria-invalid={invalid}
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
      />
    </div>
  )
}

export const Selects: StoryObj<{ disabled: boolean; invalid: boolean }> = {
  args: { disabled: false, invalid: false },
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
        <button
          type="button"
          className="inline-flex h-7 items-center rounded-md border border-(--theme-border) px-2 text-xs font-medium"
        >
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
      <Select
        aria-label="Theme"
        items={THEMES}
        value={theme}
        onValueChange={setTheme}
        onItemHighlighted={setPreviewing}
      />
      <span data-testid="applied">
        {previewing ? 'Previewing' : 'Applied'}: {THEMES.find((t) => t.value === shown)?.label}
      </span>
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

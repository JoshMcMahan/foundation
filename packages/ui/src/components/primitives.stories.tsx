import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, screen, userEvent, within } from 'storybook/test'
import type { RunStatus } from '../engine'
import Callout from './Callout'
import { UncontrolledCollapsiblePanel } from './CollapsiblePanel'
import { ConfirmModal } from './ConfirmModal'
import { CreateModal, CreateModalField } from './CreateModal'
import Dropdown from './Dropdown'
import { Indicator } from './Indicator'
import Loader from './Loader'
import { SegmentedControl } from './SegmentedControl'
import { StatusBadge, StatusDot } from './StatusBadge'
import SwitchToggle from './SwitchToggle'
import { CompactTable, Table } from './Table'

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

function ModalDemo() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="btn btn-info" onClick={() => setOpen(true)}>
        Open modal
      </button>
      <ConfirmModal
        open={open}
        onClose={() => setOpen(false)}
        title="Confirm action"
        description="Modals trap focus and close on Escape or backdrop click."
        confirmLabel="Confirm"
        onConfirm={() => setOpen(false)}
      />
    </>
  )
}

export const ModalStory: StoryObj = {
  name: 'Confirm modal',
  render: () => <ModalDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Open modal' }))
    // The dialog portals outside the story canvas.
    await expect(await screen.findByText('Confirm action')).toBeVisible()
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
    <div className="flex flex-col gap-8">
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
  const [choice, setChoice] = useState<unknown>('medium')
  const [branch, setBranch] = useState<unknown>('')
  const [enabled, setEnabled] = useState(false)
  return (
    <div className="flex flex-col gap-6 max-w-sm">
      <Dropdown
        ariaLabel="Instance size"
        options={['small', 'medium', 'large']}
        value={choice as string}
        onChange={setChoice}
      />
      <Dropdown
        ariaLabel="Branch"
        options={['main', 'develop']}
        value={branch as string}
        onChange={setBranch}
        allowCustomValue
        showCaret={false}
        placeholder="Type or pick a branch"
      />
      <SwitchToggle value={enabled} onChange={setEnabled} />
      <UncontrolledCollapsiblePanel title="Advanced settings">
        <div className="p-4 text-sm">Panel body content.</div>
      </UncontrolledCollapsiblePanel>
    </div>
  )
}

export const Inputs: StoryObj = {
  render: () => <InputsDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByText('Advanced settings'))
    await expect(canvas.getByText('Panel body content.')).toBeVisible()
  },
}

function SegmentedDemo({ fill, iconOnly }: { fill: boolean; iconOnly: boolean }) {
  const [range, setRange] = useState<'day' | 'week' | 'month'>('week')
  return (
    <div className="flex w-64 flex-col gap-6">
      <SegmentedControl
        label="Range"
        value={range}
        onChange={setRange}
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

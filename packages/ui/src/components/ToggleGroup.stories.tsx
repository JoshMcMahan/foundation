import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, within } from 'storybook/test'
import { CloudIcon, ClusterIcon, DesktopIcon } from '../icons'
import { Field } from './Field'
import { StatusDot } from './StatusBadge'
import { ToggleGroup, type ToggleGroupOption } from './ToggleGroup'

interface Args {
  multiple: boolean
  all: boolean
  counts: boolean
  size: 'sm' | 'md'
  disabled: boolean
  allLabel: string
}

const meta: Meta<Args> = {
  title: 'UI/ToggleGroup',
  args: { multiple: true, all: false, counts: true, size: 'sm', disabled: false, allLabel: '' },
  argTypes: {
    multiple: { description: 'Several options may be pressed at once; off allows one or none.' },
    all: { description: 'Leads with an All option, pressed while nothing else is.' },
    counts: { description: 'Each option shows how many items it matches.' },
    size: { control: 'inline-radio', options: ['sm', 'md'] },
    disabled: { description: 'The whole group ignores presses.' },
    allLabel: { control: 'text', description: 'The All option’s words, such as "All runs".' },
  },
}
export default meta

type Status = 'running' | 'queued' | 'completed' | 'failed' | 'canceled'

const STATUSES: ToggleGroupOption<Status>[] = [
  { value: 'running', label: 'Running', icon: <StatusDot variant="info" />, count: 12 },
  { value: 'queued', label: 'Queued', icon: <StatusDot variant="warning" />, count: 4 },
  { value: 'completed', label: 'Completed', icon: <StatusDot variant="success" />, count: 1830 },
  { value: 'failed', label: 'Failed', icon: <StatusDot variant="error" />, count: 27 },
  { value: 'canceled', label: 'Canceled', icon: <StatusDot variant="muted" />, count: 0 },
]
const TOTAL = STATUSES.reduce((sum, status) => sum + (status.count ?? 0), 0)

function StatusFilter({
  multiple,
  all,
  counts,
  size,
  disabled,
  allLabel,
  initial = [],
}: Args & { initial?: Status[] }) {
  const [value, setValue] = useState<Status[]>(initial)
  const options = counts ? STATUSES : STATUSES.map(({ count: _, ...option }) => option)
  return (
    <div className="flex flex-col gap-3">
      <ToggleGroup
        label="Status"
        options={options}
        value={value}
        onValueChange={setValue}
        multiple={multiple}
        all={all && (counts ? { count: TOTAL } : true)}
        allLabel={allLabel || undefined}
        size={size}
        disabled={disabled}
      />
      <span data-testid="shown" className="text-xs theme-muted-text">
        {value.length ? `Showing ${value.join(', ')}` : 'Showing every run'}
      </span>
    </div>
  )
}

/** Statuses to show, several at once, each with its tone's dot and how many
 *  runs it matches. Nothing pressed shows every run. */
export const Multiple: StoryObj<Args> = {
  render: (args) => <StatusFilter {...args} initial={['running', 'failed']} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /Queued/ }))
    await expect(canvas.getByTestId('shown')).toHaveTextContent('running, queued, failed')
    await userEvent.click(canvas.getByRole('button', { name: /Failed/ }))
    await expect(canvas.getByTestId('shown')).toHaveTextContent('running, queued')
  },
}

/** An All option leads, pressed while nothing else is, with the total beside
 *  it; pressing it clears the rest. */
export const WithAll: StoryObj<Args> = {
  args: { all: true },
  render: (args) => <StatusFilter {...args} initial={['completed']} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const all = canvas.getByRole('button', { name: /^All/ })
    await expect(all).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(all)
    await expect(all).toHaveAttribute('aria-pressed', 'true')
    await expect(canvas.getByTestId('shown')).toHaveTextContent('Showing every run')
  },
}

/** One status or none, for a list that can filter by only one at a time:
 *  pressing another replaces it, pressing it again shows everything. */
export const OneOrNone: StoryObj<Args> = {
  args: { multiple: false, all: true },
  render: (args) => <StatusFilter {...args} initial={['failed']} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /Running/ }))
    await expect(canvas.getByTestId('shown')).toHaveTextContent(/^Showing running$/)
  },
}

/** Arrow keys move between options, wrapping at the ends, and Space or Enter
 *  presses the focused one; Tab leaves the group in one step. */
export const Keyboard: StoryObj<Args> = {
  render: (args) => <StatusFilter {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.tab()
    await expect(canvas.getByRole('button', { name: /Running/ })).toHaveFocus()
    await userEvent.keyboard('{ArrowRight}{ArrowRight}{ArrowRight} ')
    await expect(canvas.getByTestId('shown')).toHaveTextContent('Showing failed')
  },
}

const PLACES: ToggleGroupOption<string>[] = [
  { value: 'cloud', label: 'Cloud', icon: <CloudIcon /> },
  { value: 'cluster', label: 'On-premises cluster', icon: <ClusterIcon /> },
  { value: 'workstation', label: 'Workstation', icon: <DesktopIcon />, disabled: true },
]

function PlacesDemo({ size, disabled }: Args) {
  const [value, setValue] = useState<string[]>([])
  return (
    <ToggleGroup
      label="Where it runs"
      options={PLACES}
      value={value}
      onValueChange={setValue}
      all
      multiple={false}
      size={size}
      disabled={disabled}
    />
  )
}

/** A leading icon instead of a dot, and an option that can't be pressed. */
export const IconsAndDisabled: StoryObj<Args> = {
  args: { size: 'md' },
  render: (args) => <PlacesDemo {...args} />,
}

/** On a narrow screen the options wrap onto further lines rather than scroll. */
export const Narrow: StoryObj<Args> = {
  args: { all: true },
  render: (args) => (
    <div className="w-72 rounded-lg border border-(--theme-border) p-3">
      <StatusFilter {...args} />
    </div>
  ),
}

/** Inside a `Field group`, the legend names the options, so `label` is left out. */
export const InAField: StoryObj<Args> = {
  render: (args) => {
    const Demo = () => {
      const [value, setValue] = useState<Status[]>(['queued'])
      return (
        <div className="max-w-md">
          <Field group label="Notify me about" description="Runs in any of these states.">
            <ToggleGroup
              options={STATUSES.map(({ count: _, ...option }) => option)}
              value={value}
              onValueChange={setValue}
              size={args.size}
              disabled={args.disabled}
            />
          </Field>
        </div>
      )
    }
    return <Demo />
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('group', { name: 'Notify me about' })).toBeInTheDocument()
  },
}

type Arch = 'amd64' | 'arm64' | 'gpu'

/** The machine types a project may use, with a live summary of what the filter
 *  lets through that the group names as its description. All stands apart
 *  from the options, and a pressed option shows a check as well as its tint. */
export const WithSummary: StoryObj<Args> = {
  args: { all: true, size: 'md' },
  render: function Render({ size }) {
    const [value, setValue] = useState<Arch[]>(['amd64'])
    const options: ToggleGroupOption<Arch>[] = [
      { value: 'amd64', label: 'x86-64', icon: <DesktopIcon /> },
      { value: 'arm64', label: 'Arm', icon: <ClusterIcon /> },
      { value: 'gpu', label: 'GPU', icon: <CloudIcon /> },
    ]
    return (
      <div className="flex flex-col gap-2">
        <ToggleGroup
          label="Machine types"
          options={options}
          value={value}
          onValueChange={setValue}
          all
          size={size}
          aria-describedby="types-summary"
        />
        <p id="types-summary" aria-live="polite" className="m-0 text-xs theme-muted-text">
          {value.length === 0 ? 'Every type is allowed' : `${value.length} of 3 types allowed`}
        </p>
      </div>
    )
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('group', { name: 'Machine types' })).toHaveAccessibleDescription(
      '1 of 3 types allowed',
    )
  },
}

/** The All option named for what it covers. */
export const AllLabel: StoryObj<Args> = {
  args: { all: true, allLabel: 'All runs' },
  render: (args) => <StatusFilter {...args} />,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: /^All runs/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  },
}

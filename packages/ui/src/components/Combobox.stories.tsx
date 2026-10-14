import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, screen, userEvent, within } from 'storybook/test'
import { CloudIcon, ClusterIcon, NodeIcon } from '../icons'
import { Autocomplete, Combobox, type ComboboxGroup, type ComboboxItem } from './Combobox'

interface FieldArgs {
  disabled: boolean
  invalid: boolean
  placeholder: string
}

const meta: Meta<FieldArgs> = {
  title: 'UI/Combobox',
  args: { disabled: false, invalid: false, placeholder: 'Pick one' },
  decorators: [(Story) => <div className="max-w-sm">{Story()}</div>],
}
export default meta

const sizes = [
  { label: 'Small', value: 'small', description: '2 vCPU, 8 GB' },
  { label: 'Medium', value: 'medium', description: '4 vCPU, 16 GB' },
  { label: 'Large', value: 'large', description: '8 vCPU, 32 GB', disabled: true },
]

function SingleDemo({ disabled, invalid, placeholder }: FieldArgs) {
  const [value, setValue] = useState<string | null>(null)
  return (
    <Combobox
      aria-label="Instance size"
      items={sizes}
      value={value}
      onValueChange={setValue}
      disabled={disabled}
      aria-invalid={invalid}
      placeholder={placeholder}
    />
  )
}

export const Single: StoryObj<FieldArgs> = {
  render: (args) => <SingleDemo {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Show options' }))
    await userEvent.click(await screen.findByRole('option', { name: /Medium/ }))
    await expect(canvas.getByRole('combobox', { name: 'Instance size' })).toHaveValue('Medium')
  },
}

const clusters: ComboboxGroup<{ id: string }>[] = ['alpha', 'beta'].map((name) => ({
  label: name,
  items: [
    { label: 'Login node', value: { id: `login:${name}` }, icon: <NodeIcon /> },
    ...[0, 1, 2].map((i) => ({
      label: `${name}-environment-with-a-long-descriptive-name-${i}`,
      value: { id: `env:${name}:${i}` },
      icon: <CloudIcon />,
    })),
  ],
}))

function GroupedDemo(args: FieldArgs) {
  const [value, setValue] = useState<{ id: string } | null>({ id: 'login:beta' })
  return (
    <Combobox
      aria-label="Cluster"
      items={clusters}
      value={value}
      onValueChange={setValue}
      disabled={args.disabled}
      aria-invalid={args.invalid}
      placeholder={args.placeholder}
    />
  )
}

/** Headings, icons, object values and labels that truncate; typing a heading finds its items. */
export const Grouped: StoryObj<FieldArgs> = {
  render: (args) => <GroupedDemo {...args} />,
}

// Every cluster item is an object, so they read back without narrowing.
const clusterItems = clusters.flatMap((g) => g.items) as ComboboxItem<{ id: string }>[]

function ButtonTriggerDemo(args: FieldArgs) {
  const [value, setValue] = useState<{ id: string } | null>(null)
  const chosen = clusterItems.find((item) => item.value.id === value?.id)
  return (
    <Combobox
      aria-label="Cluster"
      items={clusters}
      value={value}
      onValueChange={setValue}
      disabled={args.disabled}
      placeholder={args.placeholder}
      triggerTooltip="Where the session runs"
      trigger={
        <button
          type="button"
          className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-md border border-(--theme-border) px-2 text-xs font-medium"
        >
          <span className="truncate">{chosen?.label ?? 'Cluster'}</span>
        </button>
      }
    />
  )
}

/** A compact button opens the list, with the search input inside the popup. */
export const ButtonTrigger: StoryObj<FieldArgs> = {
  render: (args) => <ButtonTriggerDemo {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('combobox', { name: 'Cluster' }))
    await userEvent.type(await screen.findByPlaceholderText('Pick one'), 'beta')
    await userEvent.click(await screen.findByRole('option', { name: /beta-environment.*-1/ }))
    await expect(canvas.getByRole('combobox', { name: 'Cluster' })).toHaveTextContent(
      'beta-environment-with-a-long-descriptive-name-1',
    )
  },
}

const sessions: ComboboxGroup[] = [
  {
    label: 'alpha',
    icon: <ClusterIcon />,
    description: 'Shared by bob',
    items: [
      { label: 'Large', value: 'alpha/large' },
      { label: 'Small', value: 'alpha/small' },
    ],
  },
  { label: 'beta', icon: <ClusterIcon />, description: 'Connecting…', items: [] },
  { label: 'gamma', icon: <CloudIcon />, description: 'Not responding', items: [] },
  { label: 'delta', icon: <CloudIcon />, items: [{ label: 'Medium', value: 'delta/medium' }] },
]

function GroupHeadingsDemo(args: FieldArgs) {
  const [value, setValue] = useState<string | null>(null)
  return (
    <Combobox
      aria-label="Model"
      items={sessions}
      value={value}
      onValueChange={setValue}
      disabled={args.disabled}
      placeholder={args.placeholder}
      trigger={
        <button
          type="button"
          className="inline-flex h-7 items-center rounded-md border border-(--theme-border) px-2 text-xs font-medium"
        >
          {value ?? 'Model'}
        </button>
      }
    />
  )
}

/** Headings with an icon and a description; groups with no items report only a status, and a search finds them by name. */
export const GroupHeadings: StoryObj<FieldArgs> = {
  render: (args) => <GroupHeadingsDemo {...args} />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('combobox', { name: 'Model' }))
    await expect(await screen.findByText('· Not responding')).toBeInTheDocument()
    await userEvent.type(screen.getByPlaceholderText('Pick one'), 'gamma')
    await expect(screen.queryAllByRole('option')).toHaveLength(0)
    await expect(screen.getByText('gamma')).toBeInTheDocument()
  },
}

const regions = Array.from({ length: 5000 }, (_, i) => `region-${String(i).padStart(4, '0')}`)

function ManyDemo(args: FieldArgs) {
  const [value, setValue] = useState<string | null>(null)
  return (
    <Combobox
      aria-label="Region"
      items={regions}
      value={value}
      onValueChange={setValue}
      disabled={args.disabled}
      aria-invalid={args.invalid}
      placeholder={args.placeholder}
    />
  )
}

/** Five thousand items; only the visible rows render. */
export const ManyItems: StoryObj<FieldArgs> = {
  render: (args) => <ManyDemo {...args} />,
}

function MultipleDemo(args: FieldArgs) {
  const [value, setValue] = useState<string[]>(['small'])
  return (
    <Combobox
      multiple
      aria-label="Instance sizes"
      items={sizes}
      value={value}
      onValueChange={setValue}
      disabled={args.disabled}
      aria-invalid={args.invalid}
      placeholder={args.placeholder}
    />
  )
}

export const Multiple: StoryObj<FieldArgs> = {
  render: (args) => <MultipleDemo {...args} />,
}

function UnlistedDemo(args: FieldArgs) {
  const [value, setValue] = useState<{ name: string } | null>({ name: 'retired-cluster' })
  return (
    <Combobox<{ name: string }>
      aria-label="Saved cluster"
      items={[{ label: 'current-cluster', value: { name: 'current-cluster' } }]}
      value={value}
      onValueChange={setValue}
      itemToStringLabel={(cluster) => cluster.name}
      disabled={args.disabled}
      aria-invalid={args.invalid}
      placeholder={args.placeholder}
    />
  )
}

/** A saved value the list no longer offers still shows, labeled by itemToStringLabel. */
export const UnlistedValue: StoryObj<FieldArgs> = {
  render: (args) => <UnlistedDemo {...args} />,
}

function AutocompleteDemo(args: FieldArgs) {
  const [value, setValue] = useState('')
  return (
    <Autocomplete
      aria-label="When to run"
      items={[
        { label: 'Always, even after a failure', value: 'always()' },
        { label: 'Only after a failure', value: 'failure()' },
      ]}
      value={value}
      onValueChange={setValue}
      disabled={args.disabled}
      aria-invalid={args.invalid}
      placeholder={args.placeholder}
    />
  )
}

/** Free text with suggestions: any typed value is kept. */
export const FreeText: StoryObj<FieldArgs> = {
  render: (args) => <AutocompleteDemo {...args} />,
}

interface TagsArgs extends FieldArgs {
  maxItems: number
  maxLength: number
}

function TagsDemo({ maxItems, maxLength, ...args }: TagsArgs) {
  const [tags, setTags] = useState<string[]>(['python'])
  return (
    <Combobox
      multiple
      creatable
      maxItems={maxItems}
      maxLength={maxLength}
      aria-label="Tags"
      items={['python', 'gpu', 'genomics', 'machine-learning', 'visualization']}
      value={tags}
      // Tags read alike however they were typed.
      onValueChange={(next) => setTags([...new Set(next.map((tag) => tag.toLowerCase()))])}
      disabled={args.disabled}
      aria-invalid={args.invalid}
      placeholder="Add a tag"
    />
  )
}

/** Tags: pick suggestions or type new ones, Enter adding what was typed, up to a limit. */
export const Tags: StoryObj<TagsArgs> = {
  args: { maxItems: 4, maxLength: 30 },
  render: (args) => <TagsDemo {...args} />,
  play: async ({ canvasElement, args }) => {
    if (args.disabled) {
      return
    }
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByRole('combobox', { name: 'Tags' }), 'Climate{Enter}')
    await expect(await canvas.findByRole('button', { name: 'Remove climate' })).toBeInTheDocument()
  },
}

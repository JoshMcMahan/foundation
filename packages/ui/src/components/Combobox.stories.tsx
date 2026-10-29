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

const presets: ComboboxGroup[] = [
  { label: 'My presets', items: [{ label: 'my-config', value: 'my-config' }] },
  { label: 'Built-in presets', items: [{ label: 'config_1', value: 'config_1' }] },
]

function ShortGroupsDemo(args: FieldArgs) {
  const [value, setValue] = useState<string | null>(null)
  return (
    <Combobox
      aria-label="Preset"
      items={presets}
      value={value}
      onValueChange={setValue}
      disabled={args.disabled}
      aria-invalid={args.invalid}
      placeholder={args.placeholder}
    />
  )
}

/** The last row highlighted: it sits in the same gutter at the panel's bottom as at its sides. */
export const LastItemHighlighted: StoryObj<FieldArgs> = {
  args: { placeholder: 'Load a preset' },
  render: (args) => <ShortGroupsDemo {...args} />,
  play: async ({ canvasElement, args }) => {
    if (args.disabled) {
      return
    }
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Show options' }))
    const last = await screen.findByRole('option', { name: 'config_1' })
    await userEvent.hover(last)
    await expect(last).toHaveAttribute('data-highlighted')
  },
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
    // Named by its label and then what it holds.
    await userEvent.click(canvas.getByRole('combobox', { name: /^Cluster/ }))
    await userEvent.type(await screen.findByPlaceholderText('Pick one'), 'beta')
    await userEvent.click(await screen.findByRole('option', { name: /beta-environment.*-1/ }))
    await expect(
      canvas.getByRole('combobox', {
        name: 'Cluster beta-environment-with-a-long-descriptive-name-1',
      }),
    ).toHaveTextContent('beta-environment-with-a-long-descriptive-name-1')
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

/** A report's user filter searches names without offering to save or fill credentials. */
export const UserFilter: StoryObj<FieldArgs> = {
  args: { placeholder: 'All users' },
  render: (args) => (
    <Combobox
      multiple
      aria-label="User"
      items={['alice', 'bob', 'carol']}
      disabled={args.disabled}
      aria-invalid={args.invalid}
      placeholder={args.placeholder}
    />
  ),
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const input = canvas.getByRole('combobox', { name: 'User' })
    await expect(input).toHaveAttribute('data-1p-ignore')
    if (args.disabled) {
      return
    }
    await userEvent.type(input, 'bob')
    await userEvent.click(await screen.findByRole('option', { name: 'bob' }))
    await expect(canvas.getByText('bob')).toBeVisible()
    await expect(input).toHaveValue('')
  },
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

interface Region {
  id: string
  name: string
  zone: string
  nodes: number
  gpus: string
}

const areas: Region[] = [
  { id: 'use1', name: 'us-east-1', zone: 'Virginia', nodes: 48, gpus: 'H100' },
  { id: 'usw2', name: 'us-west-2', zone: 'Oregon', nodes: 32, gpus: 'A100' },
  { id: 'euc1', name: 'eu-central-1', zone: 'Frankfurt', nodes: 12, gpus: 'L4' },
  { id: 'apn1', name: 'ap-northeast-1', zone: 'Tokyo', nodes: 6, gpus: 'None' },
]

function RegionDetails({ region }: { region: Region | undefined }) {
  if (!region) {
    return <p className="m-0 p-4 text-xs">Highlight a region to see its capacity.</p>
  }
  return (
    <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 p-4 text-xs">
      <dt className="text-(--theme-muted-text-color)">Zone</dt>
      <dd className="m-0">{region.zone}</dd>
      <dt className="text-(--theme-muted-text-color)">Nodes</dt>
      <dd className="m-0">{region.nodes}</dd>
      <dt className="text-(--theme-muted-text-color)">GPUs</dt>
      <dd className="m-0">{region.gpus}</dd>
    </dl>
  )
}

function DetailsDemo({ width, ...args }: FieldArgs & { width: number }) {
  const [value, setValue] = useState<string[]>([])
  const byId = (id: string | undefined) => areas.find((region) => region.id === id)
  return (
    <div style={{ width }}>
      <Combobox
        multiple
        aria-label="Regions"
        items={areas.map((region) => ({
          value: region.id,
          label: region.name,
          description: `${region.nodes} nodes`,
          // The pane is hidden from assistive technology, so the option says what it would.
          accessibleDescription: `${region.nodes} nodes in ${region.zone}, ${region.gpus} GPUs`,
          badge:
            region.gpus === 'H100' ? (
              <span className="rounded bg-(--theme-muted-panel-bg) px-1 text-[10px]">Fastest</span>
            ) : undefined,
        }))}
        value={value}
        onValueChange={setValue}
        disabled={args.disabled}
        placeholder={args.placeholder}
        details={(id) => <RegionDetails region={byId(id)} />}
        detailsSummary={(id) => {
          const region = byId(id)
          return region && `${region.zone} · ${region.gpus} GPUs`
        }}
      />
    </div>
  )
}

/** A pane beside the list follows the highlighted item, from the keyboard or the pointer. Below
 *  30rem it gives way to a line under the highlighted item. */
export const Details: StoryObj<FieldArgs & { width: number }> = {
  args: { width: 560 },
  argTypes: { width: { control: { type: 'range', min: 280, max: 720, step: 20 } } },
  decorators: [(Story) => <div>{Story()}</div>],
  render: (args) => <DetailsDemo {...args} />,
  play: async ({ canvasElement }) => {
    const field = within(canvasElement).getByRole('combobox', { name: 'Regions' })
    await userEvent.click(field)
    await userEvent.keyboard('{ArrowDown}')
    await expect(
      await screen.findByRole('option', { description: '48 nodes in Virginia, H100 GPUs' }),
    ).toBeInTheDocument()
  },
}

/** The same at a phone's width: the line under the highlighted item stands in for the pane. */
export const DetailsNarrow: StoryObj<FieldArgs & { width: number }> = {
  ...Details,
  args: { width: 340 },
}

function HostSearchDemo(args: FieldArgs) {
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<{ query: string; items: string[] }>({ query: '', items: [] })
  const loading = query !== found.query
  return (
    <Combobox
      multiple
      aria-label="Users"
      items={found.items}
      onQueryChange={(next) => {
        setQuery(next)
        // Stands in for a request to the server.
        setTimeout(
          () =>
            setFound({
              query: next,
              items: ['ada', 'grace', 'katherine', 'margaret']
                .filter((name) => name.includes(next.toLowerCase()))
                .map((name) => `${name}@example.com`),
            }),
          600,
        )
      }}
      loading={loading}
      disabled={args.disabled}
      placeholder="Search users"
    />
  )
}

/** The host filters, such as on a server: `items` show as given, with `loading` while it searches. */
export const HostSearch: StoryObj<FieldArgs> = {
  render: (args) => <HostSearchDemo {...args} />,
  play: async ({ canvasElement }) => {
    await userEvent.type(within(canvasElement).getByRole('combobox', { name: 'Users' }), 'gr')
    await expect(await screen.findByRole('status')).toHaveTextContent('Searching…')
    await expect(
      await screen.findByRole('option', { name: 'grace@example.com' }, { timeout: 2000 }),
    ).toBeInTheDocument()
  },
}

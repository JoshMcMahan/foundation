import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { SegmentedControl } from './SegmentedControl'
import { TabPanel, Tabs, type TabsProps } from './Tabs'

interface Args {
  variant: NonNullable<TabsProps<string>['variant']>
  size: 'sm' | 'md'
  fill: boolean | 'narrow'
  counts: boolean
  steadyHeight: boolean
}

const meta: Meta<Args> = {
  title: 'UI/Tabs',
  args: { variant: 'line', size: 'md', fill: false, counts: true, steadyHeight: false },
  argTypes: {
    variant: { control: 'inline-radio', options: ['line', 'segmented'] },
    size: { control: 'inline-radio', options: ['sm', 'md'], description: 'Segmented only.' },
    fill: {
      control: 'inline-radio',
      options: [false, true, 'narrow'],
      description: 'Segmented only: share the width, or only on a phone with `narrow`.',
    },
    counts: { description: 'Each tab shows how many things it holds.' },
    steadyHeight: {
      description: 'The panels keep the tallest one’s height, so a tab change moves nothing below.',
    },
  },
}
export default meta

const RESOURCES = [
  { value: 'vms', label: 'VMs', count: 128 },
  { value: 'disks', label: 'Disks', count: 23, tone: 'warning' as const },
  { value: 'addresses', label: 'Addresses', count: 4 },
  { value: 'buckets', label: 'Buckets', count: 1204 },
]

/** Views of a cloud account's resources, each counted; the disks left behind
 *  by deleted machines read in the warning tone. */
export const CountsAndTone: StoryObj<Args> = {
  render: ({ variant, size, fill, counts }) => (
    <div className="max-w-xl">
      <Tabs
        label="Resources"
        variant={variant}
        size={size}
        fill={fill}
        items={RESOURCES.map(({ count, ...item }) => (counts ? { ...item, count } : item))}
      >
        {RESOURCES.map((item) => (
          <TabPanel key={item.value} value={item.value} className="py-4 text-sm">
            {item.label}
          </TabPanel>
        ))}
      </Tabs>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('tab', { name: /Disks/ }))
    await expect(canvas.getByRole('tab', { name: /Disks/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  },
}

/** The small size, for a pane's head or beside a page header's other small
 *  controls: segmented tabs and a segmented control match. */
export const SmallSegments: StoryObj<Args> = {
  args: { variant: 'segmented', size: 'sm' },
  render: ({ size, fill }) => (
    <div className="flex flex-col items-start gap-3">
      <Tabs
        label="Views"
        variant="segmented"
        size={size}
        fill={fill}
        items={[
          { value: 'list', label: 'List' },
          { value: 'board', label: 'Board', count: 12 },
          { value: 'timeline', label: 'Timeline' },
        ]}
      />
      <SegmentedControl
        label="Depth"
        size={size}
        fill={fill}
        options={[
          { value: '1', label: '1 hop' },
          { value: '2', label: '2 hops' },
        ]}
        value="1"
      />
    </div>
  ),
}

/** Two ways to add a dataset in a card, the panels sharing the taller one's height: the note
 *  under the card stays where it is when the tab changes. Turn `steadyHeight` off to see it move. */
export const SteadyHeight: StoryObj<Args> = {
  args: { variant: 'segmented', fill: true, steadyHeight: true },
  render: ({ variant, size, fill, steadyHeight }) => (
    <div className="flex max-w-sm flex-col gap-3">
      <div className="rounded-lg border border-(--theme-border) p-4">
        <Tabs
          label="Add a dataset"
          variant={variant}
          size={size}
          fill={fill}
          steadyHeight={steadyHeight}
          items={[
            { value: 'upload', label: 'Upload' },
            { value: 'link', label: 'Link' },
          ]}
        >
          <TabPanel value="upload" className="pt-4 text-sm">
            <p>Drop files here, or choose them from your computer.</p>
            <ul className="mt-2 list-disc ps-5 theme-muted-text">
              <li>CSV or Parquet</li>
              <li>Up to 5 GB each</li>
              <li>Up to 100 files at once</li>
            </ul>
          </TabPanel>
          <TabPanel value="link" className="pt-4 text-sm">
            <p>Paste the address of a bucket or a public file.</p>
          </TabPanel>
        </Tabs>
      </div>
      <p className="text-sm theme-muted-text">The dataset is private until you share it.</p>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const note = canvas.getByText(/private until/)
    const top = note.getBoundingClientRect().top
    await userEvent.click(canvas.getByRole('tab', { name: 'Link' }))
    await expect(canvas.getByRole('tab', { name: 'Link' })).toHaveAttribute('aria-selected', 'true')
    await expect(note.getBoundingClientRect().top).toBe(top)
  },
}

const INVENTORY = [
  { value: 'cluster', label: 'Cluster' },
  { value: 'vm', label: 'VM' },
  { value: 'lustre', label: 'Lustre' },
  { value: 'disk', label: 'Disk', count: 3 },
  { value: 'snapshot', label: 'Snapshot' },
  { value: 'bucket', label: 'Bucket' },
  { value: 'nfs', label: 'NFS' },
  { value: 'ip', label: 'IP' },
  { value: 'networkinterface', label: 'Network interface' },
  { value: 'orphan', label: 'Orphan', count: 2, tone: 'warning' as const },
  { value: 'credentials', label: 'Credentials' },
]

/** An inventory's eleven tabs, two of them counted, more than a phone's width holds: the row
 *  fades at whichever end hides tabs, and keeps the current tab in view. */
export const ManyTabs: StoryObj = {
  render: () => (
    // Inline: the package's stylesheet doesn't scan stories.
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 24 }}>
      <Tabs label="First tab current" items={INVENTORY} defaultValue="cluster" />
      <Tabs label="A tab past the edge current" items={INVENTORY} defaultValue="orphan" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const orphan = canvas.getAllByRole('tab', { name: /Orphan/ })[1] as HTMLElement
    const list = orphan.closest('[role="tablist"]') as HTMLElement
    // Scrolled so the current tab shows whole.
    const tab = orphan.getBoundingClientRect()
    const row = list.getBoundingClientRect()
    await expect(tab.left).toBeGreaterThanOrEqual(row.left)
    await expect(tab.right).toBeLessThanOrEqual(row.right)
  },
}

const CLUSTER_VIEWS = ['Details', 'Jobs', 'Queues', 'Nodes', 'Environments', 'Events'].map(
  (label) => ({
    value: label.toLowerCase(),
    label,
  }),
)

/** Six views on a phone, one tab cut at the edge and one past it: the row fades over the cut
 *  tab and shows an arrow at each end that hides tabs, so it reads as running on rather than
 *  clipped. It scrolls sideways, and a press on an arrow moves it most of its width. */
export const OnAPhone: StoryObj = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  render: () => (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 24 }}>
      <Tabs label="First tab current" items={CLUSTER_VIEWS} defaultValue="details" />
      <Tabs label="Last tab current" items={CLUSTER_VIEWS} defaultValue="events" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const events = canvas.getAllByRole('tab', { name: 'Events' })[1] as HTMLElement
    const list = events.closest('[role="tablist"]') as HTMLElement
    // The current tab shows whole, clear of the fade at the row's start.
    await expect(events.getBoundingClientRect().right).toBeLessThanOrEqual(
      list.getBoundingClientRect().right,
    )
  },
}

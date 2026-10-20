import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { ClusterIcon, FolderIcon, RefreshIcon, UploadIcon } from '../icons'
import { type Breadcrumb, Breadcrumbs, type BreadcrumbsProps } from './Breadcrumbs'
import { Button } from './Button'

const PAGE_TRAIL: Breadcrumb[] = [
  { label: 'Compute', href: '/compute' },
  { label: 'Clusters', href: '/compute/clusters' },
  { label: 'gpu-a100-east' },
]

const FOLDERS: Breadcrumb[] = [
  { label: 'demo-bucket' },
  { label: 'results' },
  { label: 'run-002' },
  { label: 'checkpoints' },
]

const LONG_TRAIL: Breadcrumb[] = [
  { label: 'Organizations', href: '/org' },
  // No href: the folded menu still shows it, as a row that goes nowhere.
  { label: 'Research computing division' },
  { label: 'Cloud accounts', href: '/org/research/cloud-accounts' },
  { label: 'production-us-east-gpu-reservations-2026-q4' },
]

interface BreadcrumbsArgs {
  crumbs: Breadcrumb[]
  current: NonNullable<BreadcrumbsProps['current']>
  heading: boolean
  label: string
  width: number
  /** Set by the stories whose crumbs go somewhere in place. */
  onSelect?: (crumb: Breadcrumb, index: number) => void
}

const meta: Meta<BreadcrumbsArgs> = {
  title: 'UI/Breadcrumbs',
  args: {
    crumbs: PAGE_TRAIL,
    current: 'page',
    heading: false,
    label: '',
    width: 560,
  },
  argTypes: {
    crumbs: { control: 'object' },
    current: {
      control: 'inline-radio',
      options: ['page', 'location'],
      description: 'The last crumb is the page, or a place within it such as the open folder',
    },
    heading: { control: 'boolean', description: 'The last crumb is the page’s h1' },
    label: { control: 'text', description: 'Names the landmark; empty for the strings’ default' },
    width: {
      control: { type: 'range', min: 160, max: 800, step: 20 },
      description: 'The room the trail has (story only)',
    },
    onSelect: { table: { disable: true } },
  },
}
export default meta

type Story = StoryObj<BreadcrumbsArgs>

/** A box the width the story's control gives it. Sizes are inline: the
 *  package's stylesheet doesn't scan stories. */
function Room({ width, children }: { width: number; children: ReactNode }) {
  return (
    <div
      className="rounded-md border border-(--theme-border) bg-(--theme-app-bg)"
      style={{ width, maxWidth: '100%', padding: '0.75rem 1rem' }}
    >
      {children}
    </div>
  )
}

function Trail({ crumbs, current, heading, label, width, onSelect }: BreadcrumbsArgs) {
  return (
    <Room width={width}>
      <Breadcrumbs
        crumbs={crumbs}
        current={current}
        heading={heading}
        label={label || undefined}
        onSelect={onSelect}
      />
    </Room>
  )
}

/** A trail of links to the page, which is the last crumb. Narrow the width to
 *  fold it. */
export const Links: Story = {
  render: (args) => <Trail {...args} />,
  play: async ({ canvasElement }) => {
    const nav = within(canvasElement).getByRole('navigation', { name: 'Breadcrumb' })
    await expect(within(nav).getByRole('link', { name: 'Clusters' })).toHaveAttribute(
      'href',
      '/compute/clusters',
    )
    await expect(nav.querySelector('[aria-current="page"]')).toHaveTextContent('gpu-a100-east')
  },
}

/** Goes back up to the crumb chosen, as a view that opens folders in place does. */
function useGoUp(args: BreadcrumbsArgs) {
  const [crumbs, setCrumbs] = useState(args.crumbs)
  const onSelect = (crumb: Breadcrumb, index: number) => {
    args.onSelect?.(crumb, index)
    setCrumbs(crumbs.slice(0, index + 1))
  }
  return { crumbs, onSelect }
}

function FolderTrail(args: BreadcrumbsArgs) {
  return <Trail {...args} {...useGoUp(args)} />
}

/** Crumbs without an `href` are buttons through `onSelect`, for a view that
 *  opens a place in itself, such as a folder; the last is that place, not the
 *  page. Choose one to go back up. */
export const InPlace: Story = {
  args: { crumbs: FOLDERS, current: 'location', label: 'Location', onSelect: fn() },
  render: (args) => <FolderTrail {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const nav = canvas.getByRole('navigation', { name: 'Location' })
    await expect(within(nav).queryByRole('link')).toBeNull()
    await userEvent.click(within(nav).getByRole('button', { name: 'results' }))
    await expect(args.onSelect).toHaveBeenCalledWith(FOLDERS[1], 1)
    await expect(nav.querySelector('[aria-current="location"]')).toHaveTextContent('results')
  },
}

/** A trail too wide for its room folds all but the parent into a menu; a crumb
 *  with nowhere to go shows there disabled. The last crumb truncates only once
 *  nothing else can go, with the full name on hover. */
export const Folded: Story = {
  args: { crumbs: LONG_TRAIL, width: 420 },
  render: (args) => <Trail {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const more = await waitFor(() => canvas.getByRole('button', { name: 'Show full path' }))
    await expect(canvas.getByRole('link', { name: 'Cloud accounts' })).toBeVisible()
    await expect(canvas.queryByRole('link', { name: 'Organizations' })).toBeNull()
    await userEvent.click(more)
    const body = within(canvasElement.ownerDocument.body)
    const org = await body.findByRole('menuitem', { name: 'Organizations' })
    await expect(org.closest('a')).toHaveAttribute('href', '/org')
    await expect(
      body.getByRole('menuitem', { name: 'Research computing division' }),
    ).toHaveAttribute('aria-disabled', 'true')
    await userEvent.keyboard('{Escape}')
  },
}

/** A name still loading shows a placeholder in its place. */
export const LoadingName: Story = {
  args: { crumbs: [{ label: 'Clusters', href: '/clusters' }, { label: '' }] },
  render: (args) => <Trail {...args} />,
  play: async ({ canvasElement }) => {
    const nav = within(canvasElement).getByRole('navigation', { name: 'Breadcrumb' })
    await expect(nav.querySelector('[aria-current]')).toHaveTextContent('Loading')
  },
}

interface RowArgs extends BreadcrumbsArgs {
  actions: boolean
}

/** In a flex row, such as a panel's header, the trail takes the room the row's
 *  other items leave it, and folds again when an action joins them. */
export const InARow: StoryObj<RowArgs> = {
  args: {
    crumbs: FOLDERS,
    current: 'location',
    label: 'Location',
    width: 460,
    actions: true,
    onSelect: fn(),
  },
  argTypes: { actions: { control: 'boolean', description: 'Actions beside the trail' } },
  render: ({ actions, ...args }) => (
    <div
      className="flex items-center justify-between rounded-md border border-(--theme-border) bg-(--theme-app-bg)"
      style={{ width: args.width, maxWidth: '100%', gap: '0.75rem', padding: '0.5rem 1rem' }}
    >
      <RowTrail {...args} />
      {actions && (
        <div className="flex shrink-0 items-center gap-2">
          <Button size="sm" variant="outline" icon={<RefreshIcon />}>
            Refresh
          </Button>
          <Button size="sm" icon={<UploadIcon />}>
            Upload
          </Button>
        </div>
      )}
    </div>
  ),
  play: async ({ canvasElement, args }) => {
    if (!args.actions) {
      return
    }
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByRole('button', { name: 'Show full path' })).toBeVisible(),
    )
  },
}

function RowTrail(args: BreadcrumbsArgs) {
  return <Breadcrumbs current={args.current} label={args.label || undefined} {...useGoUp(args)} />
}

/** Crumbs with icons before their labels, such as the section a page belongs
 *  to; a folded crumb keeps its icon in the "…" menu. The text stays 13px. */
export const WithIcons: Story = {
  args: {
    crumbs: [
      { label: 'Compute', href: '/compute', icon: <ClusterIcon /> },
      { label: 'Clusters', href: '/compute/clusters', icon: <FolderIcon /> },
      { label: 'gpu-a100-east' },
    ],
  },
  render: (args) => <Trail {...args} />,
  play: async ({ canvasElement }) => {
    const nav = within(canvasElement).getByRole('navigation', { name: 'Breadcrumb' })
    await expect(within(nav).getByRole('link', { name: 'Clusters' })).toBeVisible()
  },
}

import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import {
  ArchiveIcon,
  CancelIcon,
  CopyIcon,
  EditIcon,
  ExternalLinkIcon,
  FavoriteIcon,
  FavoriteOutlineIcon,
  RunWorkflowIcon,
  SaveIcon,
  ShareIcon,
  StopIcon,
  TerminalIcon,
  TrashIcon,
} from '../icons'
import type { Breadcrumb } from './PageHeader'
import { PageHeader, PageHeaderBar, PageHeaderProvider } from './PageHeader'
import { PageHeaderAction, PageHeaderAddButton, PageHeaderMenu } from './PageHeaderAction'
import { useLink } from './Provider'
import { SegmentedControl } from './SegmentedControl'

/** What a host's shell does: the provider above everything, the bar in its
 *  chrome, and the routes in a scrolling main beside a sidebar, which a
 *  phone screen leaves out. */
function Shell({
  children,
  compact = false,
  persistent = false,
  narrow = false,
}: {
  children: ReactNode
  compact?: boolean | undefined
  persistent?: boolean | undefined
  narrow?: boolean | undefined
}) {
  return (
    <PageHeaderProvider>
      {/* Sizes are inline: the package's stylesheet doesn't scan stories. */}
      <div
        className="flex overflow-hidden rounded-md border border-(--theme-border) bg-(--theme-app-bg)"
        style={{ height: '22rem', maxWidth: narrow ? '22rem' : undefined }}
      >
        {!narrow && (
          <nav
            aria-label="Sections"
            className="flex shrink-0 max-sm:hidden flex-col gap-2 border-r border-(--theme-border) p-3 text-xs text-(--theme-muted-text-color)"
            style={{ width: '11rem' }}
          >
            <p className="m-0 font-medium text-(--theme-app)">Workspace</p>
            <p className="m-0">Compute</p>
            <p className="m-0">Storage</p>
            <p className="m-0">Settings</p>
          </nav>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <PageHeaderBar compact={compact} persistent={persistent} />
          <main className="min-h-0 flex-1 overflow-auto p-4 text-sm text-(--theme-muted-text-color)">
            {children}
          </main>
        </div>
      </div>
    </PageHeaderProvider>
  )
}

const BUCKET_TRAIL: Breadcrumb[] = [
  { label: 'Storage', href: '/storage' },
  { label: 'Buckets', href: '/storage/buckets' },
  { label: 'training-data' },
]

const BUCKET_MENU = [
  { label: 'Duplicate', onClick: () => {} },
  { label: 'Delete', destructive: true, onClick: () => {} },
]

interface ShellArgs {
  compact: boolean
  persistent: boolean
  hidden: boolean
  narrow: boolean
  breadcrumbs: Breadcrumb[]
  onSave: () => void
}

const meta: Meta<ShellArgs> = {
  title: 'UI/PageHeader',
  args: {
    compact: false,
    persistent: false,
    hidden: false,
    narrow: false,
    breadcrumbs: BUCKET_TRAIL,
    onSave: fn(),
  },
  argTypes: {
    compact: { control: 'boolean', description: 'PageHeaderBar: the shorter bar' },
    persistent: {
      control: 'boolean',
      description: 'PageHeaderBar: keep the bar when the page declares nothing',
    },
    hidden: { control: 'boolean', description: 'PageHeader: the page takes the bar away' },
    narrow: { control: 'boolean', description: 'A phone-width shell' },
    breadcrumbs: { control: 'object' },
    onSave: { table: { disable: true } },
  },
}
export default meta

type Story = StoryObj<ShellArgs>

function BucketPage({ compact, persistent, hidden, narrow, breadcrumbs, onSave }: ShellArgs) {
  return (
    <Shell compact={compact} persistent={persistent} narrow={narrow}>
      <PageHeader
        breadcrumbs={breadcrumbs}
        hidden={hidden}
        titleActions={
          <>
            <PageHeaderAction icon={EditIcon} iconOnly label="Edit bucket" href="/edit" />
            <PageHeaderMenu items={BUCKET_MENU} />
          </>
        }
        actions={
          <>
            <PageHeaderAction icon={CancelIcon} label="Discard changes" onClick={() => {}} />
            <PageHeaderAction icon={SaveIcon} label="Save" onClick={onSave} />
          </>
        }
      />
      <p className="m-0">The page's content scrolls under the bar.</p>
    </Shell>
  )
}

/** The page declares its header; the shell's bar shows it, with the actions at
 *  the end of the bar and the edit button and menu beside the title. */
export const InShell: Story = {
  render: (args) => <BucketPage {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const trail = canvas.getByRole('navigation', { name: 'Breadcrumb' })
    // A narrow shell folds the ancestors into a menu; a wide one shows them all.
    if (!args.narrow) {
      await expect(trail.querySelectorAll('ol > li')).toHaveLength(3)
      await expect(within(trail).getByRole('link', { name: 'Buckets' })).toHaveAttribute(
        'href',
        '/storage/buckets',
      )
    }
    const title = canvas.getByRole('heading', { level: 1 })
    await expect(title).toHaveTextContent('training-data')
    await expect(title).toHaveAttribute('aria-current', 'page')
    await expect(canvas.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    // The actions sit in the bar, so they come before the content in focus order.
    const save = canvas.getByRole('button', { name: 'Save' })
    const content = canvas.getByText("The page's content scrolls under the bar.")
    await expect(
      save.compareDocumentPosition(content) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    await userEvent.click(save)
    await expect(args.onSave).toHaveBeenCalledOnce()
  },
}

/** `heading={false}` for a page whose `h1` is in its body, such as an issue's title: the bar
 *  keeps its trail and actions, and its last crumb still says it is the current page, but
 *  isn't a heading, so the page has one `h1`. */
export const HeadingInBody: Story = {
  render: ({ compact, persistent, narrow }) => (
    <Shell compact={compact} persistent={persistent} narrow={narrow}>
      <PageHeader
        heading={false}
        breadcrumbs={[
          { label: 'Core Platform', href: '/teams/core' },
          { label: 'Issues', href: '/teams/core/issues' },
          { label: 'CORE-128' },
        ]}
        titleActions={<PageHeaderMenu items={BUCKET_MENU} />}
        actions={<PageHeaderAction icon={ShareIcon} label="Share" onClick={() => {}} />}
      />
      <h1 className="m-0 text-xl font-semibold text-(--theme-app)">
        Export fails for invoices over 10,000 lines
      </h1>
      <p className="m-0 mt-2">The issue's title is the page's heading, in its body.</p>
    </Shell>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const headings = canvas.getAllByRole('heading', { level: 1 })
    await expect(headings).toHaveLength(1)
    await expect(headings[0]).toHaveTextContent('Export fails for invoices over 10,000 lines')
    const trail = canvas.getByRole('navigation', { name: 'Breadcrumb' })
    await expect(trail.querySelector('[aria-current="page"]')).toHaveTextContent('CORE-128')
  },
}

function TitleActionsExample() {
  const [favorite, setFavorite] = useState(false)
  return (
    <PageHeader
      breadcrumbs={[{ label: 'Runs', href: '/runs' }, { label: 'nightly-benchmark' }]}
      titleActions={
        <>
          <PageHeaderAction
            icon={favorite ? FavoriteIcon : FavoriteOutlineIcon}
            iconOnly
            label="Favorite"
            pressed={favorite}
            onClick={() => setFavorite((f) => !f)}
          />
          <PageHeaderAction icon={EditIcon} iconOnly label="Rename" onClick={() => {}} />
          <PageHeaderMenu items={BUCKET_MENU} label="Run actions" />
        </>
      }
    />
  )
}

/** Toggles beside the title keep the page's state: they render in the page's
 *  tree, though they show in the shell's bar. */
export const TitleActions: Story = {
  render: () => (
    <Shell>
      <TitleActionsExample />
    </Shell>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const favorite = canvas.getByRole('button', { name: 'Favorite' })
    await expect(favorite).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(favorite)
    await expect(favorite).toHaveAttribute('aria-pressed', 'true')
  },
}

interface ActionArgs {
  label: string
  destructive: boolean
  disabled: boolean
  disabledReason: string
  iconOnly: boolean
}

/** An action that removes or breaks something reads as the others do in the bar, and takes
 *  the error color as a menu entry, where a narrow bar moves it and where it belongs. */
export const DestructiveAction: StoryObj<ActionArgs> = {
  args: {
    label: 'Remove',
    destructive: true,
    disabled: false,
    disabledReason: 'Detach the bucket first',
    iconOnly: false,
  },
  argTypes: {
    label: { control: 'text' },
    destructive: { control: 'boolean' },
    disabled: { control: 'boolean' },
    disabledReason: { control: 'text' },
    iconOnly: { control: 'boolean' },
  },
  render: ({ label, destructive, disabled, disabledReason, iconOnly }) => (
    <Shell>
      <PageHeader
        breadcrumbs={BUCKET_TRAIL}
        actions={
          <>
            <PageHeaderAction icon={SaveIcon} label="Save" onClick={() => {}} />
            <PageHeaderAction
              icon={TrashIcon}
              label={label}
              destructive={destructive}
              disabled={disabled}
              disabledReason={disabledReason}
              iconOnly={iconOnly}
              onClick={() => {}}
            />
          </>
        }
      />
    </Shell>
  ),
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const remove = canvas.getByRole('button', { name: new RegExp(`^${args.label}`) })
    const save = canvas.getByRole('button', { name: 'Save' })
    const color = (el: Element) => getComputedStyle(el.querySelector('svg') as Element).color
    await expect(color(remove)).toBe(color(save))
  },
}

/** A command that can't run yet stays focusable and says why, by tooltip and
 *  in its name, and ignores presses. */
export const DisabledWithReason: StoryObj<{ disabledReason: string; onSave: () => void }> = {
  args: { disabledReason: 'Nothing to save yet', onSave: fn() },
  argTypes: { disabledReason: { control: 'text' }, onSave: { table: { disable: true } } },
  render: ({ disabledReason, onSave }) => (
    <Shell>
      <PageHeader
        breadcrumbs={[{ label: 'Settings', href: '/settings' }, { label: 'Login banner' }]}
        actions={
          <>
            <PageHeaderAction icon={CancelIcon} label="Discard" disabled onClick={() => {}} />
            <PageHeaderAction
              icon={SaveIcon}
              label="Save"
              disabled
              disabledReason={disabledReason}
              onClick={onSave}
            />
            <PageHeaderAddButton
              label="New banner"
              word="create"
              disabled
              disabledReason="Only one banner at a time"
              onClick={() => {}}
            />
          </>
        }
      />
    </Shell>
  ),
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const save = canvas.getByRole('button', { name: `Save. ${args.disabledReason}` })
    await expect(save).toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(save)
    await expect(args.onSave).not.toHaveBeenCalled()
    await userEvent.hover(save)
    const body = within(canvasElement.ownerDocument.body)
    const tip = await body.findByText(args.disabledReason)
    await waitFor(() => expect(tip).toBeVisible())
  },
}

/** Every kind of header action: links, an external link, a button, a "+ Create"
 *  chooser and the "…" menu. */
export const ActionKinds: Story = {
  render: () => (
    <Shell>
      <PageHeader
        breadcrumbs={[{ label: 'Sessions', href: '/sessions' }, { label: 'notebook-a100' }]}
        titleActions={<PageHeaderMenu items={BUCKET_MENU} />}
        actions={
          <>
            <PageHeaderAction
              icon={ExternalLinkIcon}
              label="Open in new tab"
              href="https://example.com"
              external
            />
            <PageHeaderAction icon={EditIcon} label="Edit" href="/sessions/notebook-a100/edit" />
            <PageHeaderAddButton
              label="New session"
              word="create"
              menu={[
                { label: 'Notebook', onClick: () => {} },
                { label: 'Desktop', onClick: () => {} },
              ]}
            />
          </>
        }
      />
    </Shell>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const external = canvas.getByRole('link', { name: /Open in new tab/ })
    await expect(external).toHaveAttribute('target', '_blank')
    await userEvent.click(canvas.getByRole('button', { name: 'New session' }))
    const body = within(canvasElement.ownerDocument.body)
    const item = await body.findByRole('menuitem', { name: 'Desktop' })
    await waitFor(() => expect(item).toBeVisible())
    await userEvent.keyboard('{Escape}')
  },
}

/** A cluster's commands: labeled actions are small outline buttons, as "+ Add" is, and what
 *  removes it sits in the "…" menu, in the error color. `variant="link"` keeps the older
 *  link-colored text, shown on the second bar. */
export const ActionVariants: Story = {
  render: () => (
    <div className="space-y-4">
      <div className="rounded-md border border-(--theme-border)">
        <PageHeader
          breadcrumbs={[{ label: 'Clusters', href: '/clusters' }, { label: 'gpu-training' }]}
          titleActions={
            <PageHeaderMenu
              items={[
                { label: 'Duplicate', onClick: () => {} },
                { label: 'Delete cluster', destructive: true, onClick: () => {} },
              ]}
            />
          }
          actions={
            <>
              <PageHeaderAction icon={TerminalIcon} label="Terminal" onClick={() => {}} />
              <PageHeaderAction icon={StopIcon} label="Stop" onClick={() => {}} />
              <PageHeaderAddButton label="Add node" onClick={() => {}} />
            </>
          }
        />
      </div>
      <div className="rounded-md border border-(--theme-border)">
        <PageHeader
          breadcrumbs={[{ label: 'Docs', href: '/docs' }, { label: 'Quick start' }]}
          actions={
            <PageHeaderAction
              icon={ExternalLinkIcon}
              label="Open in new tab"
              href="https://example.com"
              external
              variant="link"
            />
          }
        />
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const stop = canvas.getByRole('button', { name: 'Stop' })
    const add = canvas.getByRole('button', { name: 'Add node' })
    // The header's commands share one look.
    await expect(getComputedStyle(stop).borderTopWidth).toBe(getComputedStyle(add).borderTopWidth)
  },
}

function WithToolbarExample() {
  const [range, setRange] = useState('7d')
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Usage' }]}
        toolbar={
          <div className="flex items-center justify-end py-1.5">
            <SegmentedControl
              label="Time range"
              value={range}
              onValueChange={setRange}
              options={[
                { value: '24h', label: '24h' },
                { value: '7d', label: '7 days' },
                { value: '30d', label: '30 days' },
              ]}
            />
          </div>
        }
      />
      <p className="m-0">Showing {range}.</p>
    </>
  )
}

/** A row under the bar for controls that change what the page shows. */
export const WithToolbar: Story = {
  render: () => (
    <Shell>
      <WithToolbarExample />
    </Shell>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: '30 days' }))
    await expect(canvas.getByText('Showing 30d.')).toBeInTheDocument()
  },
}

/** A page that fills the window takes the bar away while it's mounted. */
export const Hidden: Story = {
  args: { hidden: true },
  render: ({ hidden, persistent }) => (
    <Shell persistent={persistent}>
      <PageHeader breadcrumbs={[{ label: 'Desktop' }]} hidden={hidden} />
      <p className="m-0">A remote desktop fills this page.</p>
    </Shell>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('navigation', { name: 'Breadcrumb' })).toBeNull()
  },
}

/** A name still loading shows a placeholder in its place. */
export const LoadingName: Story = {
  render: () => (
    <Shell>
      <PageHeader breadcrumbs={[{ label: 'Clusters', href: '/clusters' }, { label: '' }]} />
    </Shell>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { level: 1 })).toHaveTextContent('Loading')
  },
}

/** A trail too wide for its bar folds all but the parent, the way back, into a
 *  menu of links, and the parent too where the page's name can't fit whole
 *  beside it. The name itself never truncates; see `LongName`. */
export const LongTrail: Story = {
  args: {
    breadcrumbs: [
      { label: 'Organizations', href: '/org' },
      { label: 'Research computing division', href: '/org/research' },
      { label: 'Cloud accounts', href: '/org/research/cloud-accounts' },
      { label: 'production-us-east-gpu-reservations-2026-q4' },
    ],
  },
  render: (args) => <BucketPage {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const title = canvas.getByRole('heading', { level: 1 })
    await waitFor(() => expect(canvas.queryByRole('link', { name: 'Organizations' })).toBeNull())
    await expect(title.scrollWidth).toBeLessThanOrEqual(title.clientWidth)
    // A phone-width shell has no room for the parent beside the name.
    if (args.narrow) {
      await expect(canvas.queryByRole('link', { name: 'Cloud accounts' })).toBeNull()
    } else {
      await expect(canvas.getByRole('link', { name: 'Cloud accounts' })).toBeVisible()
    }
    // The folded crumbs are links in a menu.
    await userEvent.click(canvas.getByRole('button', { name: 'Show full path' }))
    const body = within(canvasElement.ownerDocument.body)
    const org = await body.findByRole('menuitem', { name: 'Organizations' })
    await expect(org.closest('a')).toHaveAttribute('href', '/org')
    await userEvent.keyboard('{Escape}')
  },
}

/** A page's name too long for the room the trail leaves wraps, and the bar
 *  grows to fit, so a phone shows the whole name with no tooltip to reach. Its
 *  ancestors fold first. */
export const LongName: Story = {
  args: {
    narrow: true,
    breadcrumbs: [
      { label: 'Storage', href: '/storage' },
      { label: 'Buckets', href: '/storage/buckets' },
      { label: 'Shared training data for the vision research group' },
    ],
  },
  render: (args) => <BucketPage {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const title = canvas.getByRole('heading', { level: 1 })
    await expect(title.scrollWidth).toBeLessThanOrEqual(title.clientWidth)
    if (args.narrow) {
      await waitFor(() => expect(canvas.queryByRole('link', { name: 'Buckets' })).toBeNull())
      const style = getComputedStyle(title)
      const text = title.clientHeight - Number.parseFloat(style.paddingTop) * 2
      await expect(text / Number.parseFloat(style.lineHeight)).toBeGreaterThan(1)
    }
  },
}

/** A layout declares the section's trail and title menu; the tab under it
 *  declares its own trail and Save. The bar shows the tab's trail and both
 *  sets of actions, the layout's first. */
export const LayoutAndPage: Story = {
  render: () => (
    <Shell>
      <PageHeader
        breadcrumbs={[{ label: 'Clusters', href: '/clusters' }, { label: 'gpu-trainer-01' }]}
        titleActions={<PageHeaderMenu items={BUCKET_MENU} label="Cluster actions" />}
      />
      <PageHeader
        breadcrumbs={[
          { label: 'Clusters', href: '/clusters' },
          { label: 'gpu-trainer-01', href: '/clusters/gpu-trainer-01' },
          { label: 'Definition' },
        ]}
        actions={<PageHeaderAction icon={SaveIcon} label="Save" onClick={() => {}} />}
      />
    </Shell>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { level: 1 })).toHaveTextContent('Definition')
    await expect(canvas.getByRole('button', { name: 'Cluster actions' })).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Save' })).toBeVisible()
  },
}

function NavigationExample() {
  const Link = useLink()
  const [page, setPage] = useState<'list' | 'detail'>('list')
  const link = 'text-(--theme-link) hover:underline'
  return page === 'list' ? (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Buckets' }]}
        actions={<PageHeaderAddButton label="New bucket" word="create" onClick={() => {}} />}
      />
      <Link
        href="/storage/buckets/training-data"
        className={link}
        onClick={() => setPage('detail')}
      >
        Open training-data
      </Link>
    </>
  ) : (
    <>
      <PageHeader
        breadcrumbs={BUCKET_TRAIL}
        actions={
          <PageHeaderAction icon={TrashIcon} label="Delete" destructive onClick={() => {}} />
        }
      />
      <Link href="/storage/buckets" className={link} onClick={() => setPage('list')}>
        Back to buckets
      </Link>
    </>
  )
}

/** Moving between pages swaps the whole header before paint: no trail or
 *  action of the page left behind. */
export const Navigation: Story = {
  render: () => (
    <Shell>
      <NavigationExample />
    </Shell>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('link', { name: 'Open training-data' }))
    await expect(canvas.getByRole('heading', { level: 1 })).toHaveTextContent('training-data')
    await expect(canvas.queryByRole('button', { name: 'New bucket' })).toBeNull()
    await userEvent.click(canvas.getByRole('link', { name: 'Back to buckets' }))
    await expect(canvas.getByRole('heading', { level: 1 })).toHaveTextContent('Buckets')
    await expect(canvas.queryByRole('button', { name: 'Delete' })).toBeNull()
  },
}

/** Without a provider, as on a page with no shell, the header renders in place. */
export const Standalone: Story = {
  render: () => (
    <div className="rounded-md border border-(--theme-border)">
      <PageHeader
        breadcrumbs={BUCKET_TRAIL}
        titleActions={<PageHeaderMenu items={BUCKET_MENU} />}
        actions={<PageHeaderAddButton label="Add object" href="/upload" />}
      />
      <p className="m-0 p-4 text-sm text-(--theme-muted-text-color)">Page content.</p>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { level: 1 })).toHaveTextContent('training-data')
    await expect(canvas.getByRole('link', { name: 'Add object' })).toBeVisible()
  },
}

/** In place, the header has no fill of its own: on a panel it shows the panel, and on the
 *  app's background it shows that, so it never reads as a strip of another color. */
export const StandaloneOnSurfaces: Story = {
  render: () => (
    <div className="flex flex-col gap-4 bg-(--theme-app-bg) p-4">
      <div className="overflow-hidden rounded-md border border-(--theme-border) bg-(--theme-panel-bg)">
        <PageHeader
          breadcrumbs={BUCKET_TRAIL}
          actions={<PageHeaderAddButton label="Add object" href="/upload" />}
        />
        <p className="m-0 p-4 text-sm text-(--theme-muted-text-color)">On a panel.</p>
      </div>
      <div className="rounded-md border border-(--theme-border)">
        <PageHeader
          breadcrumbs={BUCKET_TRAIL}
          actions={<PageHeaderAddButton label="Add object" href="/upload" />}
        />
        <p className="m-0 p-4 text-sm text-(--theme-muted-text-color)">On the app's background.</p>
      </div>
    </div>
  ),
}

interface ActionLinkArgs {
  href: string
  reloadDocument: boolean
  external: boolean
  disabled: boolean
}

/** Header actions that navigate are links: each opens in a new tab, shows its URL on hover and
 *  routes through the host's link on a plain click. Disabled, each stays a focusable link that
 *  goes nowhere, its reason in the tooltip. */
export const ActionLinks: StoryObj<ActionLinkArgs> = {
  args: {
    href: '/storage/buckets/training-data?tab=objects#upload',
    reloadDocument: false,
    external: false,
    disabled: false,
  },
  argTypes: {
    href: { control: 'text', description: 'Where every action goes, search and hash included.' },
    reloadDocument: {
      control: 'boolean',
      description: 'Loads the page instead of routing, for a path the router does not serve.',
    },
    external: { control: 'boolean', description: 'Opens in a new tab.' },
  },
  render: ({ href, reloadDocument, external, disabled }) => {
    const link = { href, reloadDocument, external, disabled, disabledReason: 'Needs write access' }
    return (
      <PageHeader
        breadcrumbs={[{ label: 'Storage', href: '/storage' }, { label: 'training-data' }]}
        titleActions={<PageHeaderAction icon={EditIcon} iconOnly label="Edit" {...link} />}
        actions={
          <>
            <PageHeaderAction icon={ExternalLinkIcon} label="Open console" {...link} />
            <PageHeaderAddButton label="Add object" {...link} />
          </>
        }
      />
    )
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('link', { name: 'Storage' })).toHaveAttribute('href', '/storage')
    for (const name of [/^Edit/, /^Open console/, /^Add object/]) {
      const link = canvas.getByRole('link', { name })
      if (args.disabled) {
        await expect(link).toHaveAttribute('aria-disabled', 'true')
        await expect(link).not.toHaveAttribute('href')
      } else {
        await expect(link).toHaveAttribute('href', args.href)
      }
    }
  },
}

/** The same actions, disabled: links that go nowhere, still reachable for the tooltip saying why. */
export const ActionLinksDisabled: StoryObj<ActionLinkArgs> = {
  ...ActionLinks,
  args: { ...ActionLinks.args, disabled: true },
}

/** A command under way: a spinner takes the icon's place, and the action keeps
 *  focus but can't be pressed again until it's done. */
export const BusyAction: StoryObj<{ loading: boolean }> = {
  args: { loading: true },
  argTypes: { loading: { description: 'PageHeaderAction and PageHeaderAddButton: busy' } },
  render: ({ loading }) => (
    <Shell>
      <PageHeader
        breadcrumbs={[{ label: 'Workflows', href: '/workflows' }, { label: 'nightly-train' }]}
        actions={
          <>
            <PageHeaderAction
              icon={RunWorkflowIcon}
              label="Run"
              loading={loading}
              onClick={() => {}}
            />
            <PageHeaderAddButton label="New schedule" loading={loading} onClick={() => {}} />
          </>
        }
      />
    </Shell>
  ),
  play: async ({ canvasElement, args }) => {
    const run = within(canvasElement).getByRole('button', { name: 'Run' })
    await expect(run.getAttribute('aria-busy')).toBe(args.loading ? 'true' : null)
  },
}

function CrowdedPage({ narrow }: { narrow: boolean }) {
  return (
    <Shell narrow={narrow}>
      <PageHeader
        breadcrumbs={[{ label: 'Workflows', href: '/workflows' }, { label: 'nightly-train' }]}
        titleActions={
          <PageHeaderAction icon={EditIcon} iconOnly label="Rename" onClick={() => {}} />
        }
        actions={
          <>
            <PageHeaderAction icon={RunWorkflowIcon} label="Run" onClick={() => {}} />
            <PageHeaderAction
              icon={StopIcon}
              label="Stop"
              onClick={() => {}}
              disabled
              disabledReason="Nothing is running"
            />
            <PageHeaderAction icon={TerminalIcon} label="Terminal" href="/terminal" />
            <PageHeaderAction icon={CopyIcon} label="Duplicate" onClick={() => {}} />
            <PageHeaderAction icon={ShareIcon} label="Share" onClick={() => {}} />
            <PageHeaderAction icon={ArchiveIcon} label="Archive" onClick={() => {}} />
            <PageHeaderAction icon={TrashIcon} label="Delete" destructive onClick={() => {}} />
          </>
        }
      />
      <p className="m-0">Seven commands in a bar that has room for some of them.</p>
    </Shell>
  )
}

/** More commands than the bar has room for: their labels fold to icons first,
 *  and then the trailing ones move into a "…" menu, last first, so the trail
 *  keeps the room to name the page. Toggle `narrow` for a phone. */
export const CrowdedActions: Story = {
  args: { narrow: true },
  render: ({ narrow }) => <CrowdedPage narrow={narrow} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() => expect(canvas.getByRole('button', { name: 'More actions' })).toBeVisible())
    await userEvent.click(canvas.getByRole('button', { name: 'More actions' }))
    await expect(
      await within(document.body).findByRole('menuitem', { name: 'Delete' }),
    ).toBeVisible()
  },
}

import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { ListSkeleton } from '../list/ListTable'
import { Loader, type LoaderProps } from './Loader'
import { RefreshButton, type RefreshButtonProps } from './RefreshButton'
import { LoadingRegion, Skeleton } from './Skeleton'

const meta: Meta = {
  title: 'UI/Loading',
}
export default meta

export const Skeletons: StoryObj = {
  render: () => (
    <LoadingRegion className="flex max-w-xl flex-col gap-4">
      <div className="flex items-center gap-3">
        <Skeleton circle height={40} />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton width="60%" height={16} />
          <Skeleton width="40%" height={12} />
        </div>
      </div>
      <Skeleton count={3} height={32} className="my-2" />
    </LoadingRegion>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('status', { name: 'Loading…' })).toBeVisible()
  },
}

export const ListLoading: StoryObj = {
  name: 'List skeleton',
  render: () => <ListSkeleton rows={4} />,
}

export const Loaders: StoryObj<LoaderProps> = {
  args: { size: 48, label: 'Loading resources', variant: 'spinner', inline: false },
  argTypes: {
    size: { control: { type: 'range', min: 16, max: 160 } },
    variant: { control: 'inline-radio', options: ['spinner', 'logo'] },
    fill: { control: 'inline-radio', options: [undefined, 'screen', 'page', 'section'] },
  },
  render: (args) => <Loader {...args} />,
}

/** A route on its way: the logo centered in the page's region at 40px, as
 *  `fill="page"` gives it. `screen` centers in the whole window at 48px, while
 *  the app starts; `section` in a pane with no height of its own. */
export const PageLoader: StoryObj<Pick<LoaderProps, 'fill'>> = {
  name: 'Page loader',
  args: { fill: 'page' },
  argTypes: { fill: { control: 'inline-radio', options: ['screen', 'page', 'section'] } },
  render: ({ fill }) => (
    // A region of its own, as a page's scrolling area is; inline, since stories aren't scanned.
    <div className="panel" style={{ height: fill === 'section' ? undefined : '20rem' }}>
      <Loader variant="logo" fill={fill} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('status', { name: 'Loading…' })).toBeVisible()
  },
}

/** A route loading in an app with a sidebar and a top bar: `fill="content"` centers the logo in
 *  the content area beside the sidebar and under the header the page pins, as the eye expects.
 *  `window` shows a loader laid over the whole window instead, off to the sidebar's side. The
 *  area is found from the page around it, so the host passes no sizes; on a phone, with the
 *  sidebar away, it is the window under the header. */
export const LoaderInAShell: StoryObj<{ fill: 'content' | 'window' }> = {
  name: 'Loader in a shell',
  args: { fill: 'content' },
  argTypes: { fill: { control: 'inline-radio', options: ['content', 'window'] } },
  parameters: { layout: 'fullscreen' },
  render: ({ fill }) => (
    // Sizes are inline: the package's stylesheet doesn't scan stories.
    <div className="flex h-dvh">
      <nav
        className="flex shrink-0 flex-col gap-1 border-r border-(--theme-border) bg-(--theme-panel-bg) p-3 text-sm max-sm:hidden"
        style={{ width: 240 }}
      >
        <span className="font-semibold">Workspace</span>
        <span className="theme-muted-text">Clusters</span>
        <span className="theme-muted-text">Storage</span>
        <span className="theme-muted-text">Runs</span>
      </nav>
      <div className="flex min-w-0 flex-1 flex-col overflow-auto">
        <div className="sticky top-0 flex h-12 shrink-0 items-center border-b border-(--theme-border) bg-(--theme-app-bg) px-4 text-sm font-semibold">
          Resources
        </div>
        {fill === 'content' ? (
          <Loader variant="logo" fill="content" label="Loading resources" />
        ) : (
          <div className="pointer-events-none fixed inset-0 flex items-center justify-center">
            <Loader variant="logo" label="Loading resources" />
          </div>
        )}
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('status', { name: 'Loading resources' }),
    ).toBeVisible()
  },
}

/** In a page's toolbar: `iconOnly="phone"` shows when the data was updated beside the icon on a
 *  wider screen, and only the icon on a phone, where the toolbar has no room, still named
 *  "Refresh". Below it, each look on its own. */
export const RefreshIconOnlyOnAPhone: StoryObj = {
  name: 'Refresh, icon only on a phone',
  parameters: { layout: 'padded' },
  render: () => (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-2 rounded-md border border-(--theme-border) px-4 py-2 text-sm">
        <span className="font-semibold">AI usage</span>
        <RefreshButton iconOnly="phone" onRefresh={() => {}} updatedAt={Date.now() - 2 * 60_000} />
      </div>
      {/* Sizes are inline: the package's stylesheet doesn't scan stories. */}
      <div className="flex flex-col gap-2 text-xs">
        <div className="flex items-center gap-4">
          <span className="theme-muted-text" style={{ width: 56 }}>
            Ghost
          </span>
          <RefreshButton iconOnly="phone" onRefresh={() => {}} />
        </div>
        <div className="flex items-center gap-4">
          <span className="theme-muted-text" style={{ width: 56 }}>
            Outline
          </span>
          <RefreshButton iconOnly="phone" variant="outline" onRefresh={() => {}} />
        </div>
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: /^Refresh\.\s?Updated/ })).toBeVisible()
    await expect(canvas.getAllByRole('button', { name: 'Refresh' })).toHaveLength(2)
  },
}

// Pending until the refresh it started settles, which the play holds open.
const neverSettles = () => new Promise(() => {})

export const RefreshButtons: StoryObj<
  Pick<RefreshButtonProps, 'size' | 'refreshing'> & { variant: RefreshButtonProps['variant'] }
> = {
  name: 'Refresh buttons',
  args: { size: 'md', refreshing: false, variant: 'ghost' },
  argTypes: {
    size: { control: 'inline-radio', options: ['md', 'sm'] },
    variant: {
      control: 'inline-radio',
      options: ['ghost', 'outline', 'secondary', 'primary', 'inline'],
      description: '`inline` sits in a line of text-sized details.',
    },
  },
  render: (args) => (
    <div className="flex items-center gap-4">
      <RefreshButton {...args} onRefresh={neverSettles} />
      <RefreshButton {...args} onRefresh={() => {}} updatedAt={Date.now() - 90_000} />
      <RefreshButton {...args} onRefresh={() => {}} iconOnly />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // The labeled button; the icon-only one beside it shares the name.
    const [refresh] = canvas.getAllByRole('button', { name: 'Refresh' })
    if (!refresh) {
      throw new Error('no refresh button')
    }
    await userEvent.click(refresh)
    await waitFor(() => expect(refresh).toHaveAttribute('aria-busy', 'true'))
    await expect(canvas.getByRole('button', { name: /^Updated/ })).toBeVisible()
  },
}

/** In a line of details, such as under a page's title: the inline look takes the size of the
 *  text around it, and `updatedAt` takes any time value, here an ISO string. */
export const RefreshInline: StoryObj<{ refreshing: boolean }> = {
  name: 'Refresh, inline',
  args: { refreshing: false },
  render: ({ refreshing }) => (
    <div className="flex items-center gap-2 p-8 text-[13px] text-(--theme-muted-text-color)">
      <span>12 clusters</span>
      <span aria-hidden="true">·</span>
      <RefreshButton
        variant="inline"
        className="-mx-1"
        refreshing={refreshing}
        onRefresh={() => {}}
        updatedAt={new Date(Date.now() - 4 * 60_000).toISOString()}
      />
    </div>
  ),
}

/** While busy without a time to show, the label reads "Refreshing"; the name stays "Refresh". */
export const RefreshBusy: StoryObj = {
  name: 'Refresh, busy',
  render: () => (
    <div className="flex items-center gap-4 p-8">
      <RefreshButton variant="primary" size="sm" refreshing onRefresh={() => {}} />
      <RefreshButton refreshing onRefresh={() => {}} />
    </div>
  ),
}

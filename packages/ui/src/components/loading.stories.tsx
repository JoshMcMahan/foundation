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

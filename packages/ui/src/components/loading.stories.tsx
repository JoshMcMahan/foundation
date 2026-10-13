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
  },
  render: (args) => <Loader {...args} />,
}

// Pending until the refresh it started settles, which the play holds open.
const neverSettles = () => new Promise(() => {})

export const RefreshButtons: StoryObj<Pick<RefreshButtonProps, 'size' | 'refreshing'>> = {
  name: 'Refresh buttons',
  args: { size: 'md', refreshing: false },
  argTypes: { size: { control: 'inline-radio', options: ['md', 'sm'] } },
  render: (args) => (
    <div className="flex items-center gap-4">
      <RefreshButton {...args} onRefresh={neverSettles} />
      <RefreshButton {...args} onRefresh={() => {}} updatedAt={Date.now() - 90_000} />
      <RefreshButton {...args} onRefresh={() => {}} iconOnly />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // The labelled button; the icon-only one beside it shares the name.
    const [refresh] = canvas.getAllByRole('button', { name: 'Refresh' })
    if (!refresh) {
      throw new Error('no refresh button')
    }
    await userEvent.click(refresh)
    await waitFor(() => expect(refresh).toHaveAttribute('aria-busy', 'true'))
    await expect(canvas.getByRole('button', { name: /^Updated/ })).toBeVisible()
  },
}

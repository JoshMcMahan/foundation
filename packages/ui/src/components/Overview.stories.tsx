import type { Meta, StoryObj } from '@storybook/react-vite'
import type { CSSProperties, ReactNode } from 'react'
import { expect, within } from 'storybook/test'
import { ClusterIcon, NodeIcon } from '../icons'
import { Avatar } from './Avatar'
import { Button } from './Button'
import { Overview } from './Overview'
import { RefreshButton } from './RefreshButton'
import { StatusBadge } from './StatusBadge'
import { StatusLabel } from './StatusLabel'
import { Tag } from './Tag'

/** A thing's summary at the top of its page: its mark, its name and kind, a row of what
 *  describes it, and what to do with it. On a narrow page the mark shrinks to sit beside the
 *  name, and the lines under the name start at the page's edge, the content's edge below. */
const meta: Meta = {
  title: 'UI/Overview',
  parameters: { layout: 'fullscreen' },
}
export default meta

// Sizes are inline: the package's stylesheet doesn't scan stories.
const card: CSSProperties = {
  border: '1px solid var(--theme-border)',
  borderRadius: 12,
  padding: 16,
  fontSize: 13,
  color: 'var(--theme-muted-text-color)',
}

/** What a resource page does: the overview over the page's content, both on its 16px edge. */
function Page({ children }: { children: ReactNode }) {
  return (
    <div style={{ background: 'var(--theme-app-bg)', minHeight: '100vh' }}>
      {children}
      <div style={{ padding: 16 }}>
        <div style={card}>Definition</div>
      </div>
    </div>
  )
}

/** A host's resource mark: a picture it sizes itself, here 100px with the padding an editable
 *  thumbnail keeps. */
function Mark({ size = 100 }: { size?: number }) {
  return (
    <div style={{ width: size, height: size }}>
      <ClusterIcon style={{ width: '100%', height: '100%', padding: '15%' }} aria-hidden />
    </div>
  )
}

/** A cluster's page: its 100px mark, its name and kind, and its state. */
export const Resource: StoryObj = {
  render: () => (
    <Page>
      <Overview className="px-4 pt-2" icon={<Mark />} name="gpu-trainer-01" type="Existing cluster">
        <StatusLabel variant="success">Connected</StatusLabel>
      </Overview>
    </Page>
  ),
}

/** A name with a flag beside it, its identifier as the kind, and two lines of details: its
 *  state and when it was fetched, then its tags. Every line wraps, and on a narrow page every
 *  line under the name starts at the page's edge. */
export const Details: StoryObj = {
  render: () => (
    <Page>
      <Overview
        className="px-4 pt-2"
        icon={<Mark size={56} />}
        name={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>HPC lab</span>
            <StatusBadge variant="muted" size="md">
              Managed cluster
            </StatusBadge>
          </span>
        }
        type={<span className="font-mono">hpc-lab</span>}
      >
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-(--theme-muted-text-color)">
            <StatusLabel variant="muted" off>
              No nodes
            </StatusLabel>
            <span className="flex items-center gap-1.5">
              <NodeIcon className="size-3.5" aria-hidden />
              <span className="font-mono">slurm</span>
            </span>
            <RefreshButton
              variant="inline"
              className="-mx-1 text-[13px]"
              updatedAt={Date.now() - 3000}
              onRefresh={() => {}}
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Tag>gpu</Tag>
            <Tag>research</Tag>
            <Tag>on-prem</Tag>
          </div>
        </div>
      </Overview>
    </Page>
  ),
}

/** Actions at the row's end, such as a definition's save. On a narrow page they stay on the
 *  name's row. */
export const WithActions: StoryObj = {
  render: () => (
    <Page>
      <Overview
        className="px-4 pt-2"
        icon={<Mark />}
        name="gpu-trainer-01"
        type="Existing cluster"
        actions={<Button variant="primary">Save</Button>}
      >
        <StatusLabel variant="success">Connected</StatusLabel>
      </Overview>
    </Page>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: 'Save' })).toBeVisible()
  },
}

/** A person's mark: an avatar, a flag and an action. */
export const Person: StoryObj<{ loading: boolean }> = {
  parameters: { layout: 'padded' },
  args: { loading: false },
  render: ({ loading }) => (
    <Overview
      className="max-w-xl"
      loading={loading}
      iconSize={48}
      icon={<Avatar name="Grace Hopper" size="2xl" />}
      name="gpu-trainer-01"
      type="Cluster"
      actions={<Button size="sm">Restart</Button>}
    >
      <StatusBadge variant="success" dot>
        Running
      </StatusBadge>
    </Overview>
  ),
}

export const Loading: StoryObj = {
  parameters: { layout: 'padded' },
  render: () => <Overview icon={null} name="Resource" loading className="max-w-sm" />,
}

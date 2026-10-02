import type { Meta, StoryObj } from '@storybook/react-vite'
import { AddIcon } from '../icons'
import { BreadcrumbProvider } from './Breadcrumbs'
import {
  BreadcrumbsActionButton,
  HeaderActionMenu,
  HeaderAddButton,
  HeaderEditButton,
  PageHeader,
} from './PageHeader'

const meta: Meta<typeof PageHeader> = {
  title: 'UI/PageHeader',
  component: PageHeader,
  decorators: [
    (Story) => (
      <BreadcrumbProvider>
        <Story />
      </BreadcrumbProvider>
    ),
  ],
}
export default meta

type Story = StoryObj<typeof PageHeader>

export const Basic: Story = {
  args: {
    breadcrumbs: [{ label: 'Clusters', href: '/clusters' }],
    title: 'gpu-cluster',
  },
}

export const WithActions: Story = {
  render: (args) => (
    <PageHeader
      {...args}
      breadcrumbs={[
        { label: 'Storage', href: '/storage' },
        { label: 'Buckets', href: '/storage/buckets' },
      ]}
      title="training-data"
      actions={
        <>
          <HeaderEditButton to="/storage/buckets/training-data/edit" />
          <HeaderAddButton label="Add object" word="add" to="/upload" />
          <HeaderActionMenu
            items={[
              { label: 'Duplicate', onSelect: () => {} },
              { label: 'Delete', onSelect: () => {} },
            ]}
          />
        </>
      }
    />
  ),
}

export const WithToolbar: Story = {
  args: {
    breadcrumbs: [{ label: 'Runs', href: '/runs' }],
    title: 'All runs',
    toolbar: (
      <div className="flex items-center gap-2 py-1.5">
        <BreadcrumbsActionButton icon={AddIcon} label="New run" to="/runs/new" />
      </div>
    ),
  },
}

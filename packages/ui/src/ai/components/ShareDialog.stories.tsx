import type { Meta, StoryObj } from '@storybook/react-vite'
import { makeStaticAdapter, StoryChat } from '../stories/harness'
import ShareDialog from './ShareDialog'

const meta: Meta = {
  title: 'Chat/Share dialog',
  component: ShareDialog,
  parameters: { layout: 'centered' },
}

export default meta

export const Open: StoryObj = {
  render: () => (
    <StoryChat adapter={makeStaticAdapter({ sharing: true })} conversationId="conv-1">
      <ShareDialog conversationId="conv-1" isOpen onClose={() => console.info('[close]')} />
    </StoryChat>
  ),
}

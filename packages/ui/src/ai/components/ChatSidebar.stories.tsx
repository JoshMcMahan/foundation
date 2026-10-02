import type { Meta, StoryObj } from '@storybook/react-vite'
import { makeStaticAdapter, makeSummaries, StoryChat, StoryViewport } from '../stories/harness'
import ChatSidebar from './ChatSidebar'

const meta: Meta = {
  title: 'Chat/Sidebar',
  component: ChatSidebar,
  parameters: { layout: 'fullscreen' },
}

export default meta

export const Conversations: StoryObj<{
  count: number
  sharedEvery: number
}> = {
  args: { count: 12, sharedEvery: 4 },
  argTypes: {
    count: { control: { type: 'range', min: 0, max: 60 } },
    sharedEvery: {
      control: { type: 'range', min: 0, max: 10 },
      description: 'Every Nth conversation is shared-with-you (0 = none)',
    },
  },
  render: (args) => (
    <StoryChat
      adapter={makeStaticAdapter({ summaries: makeSummaries(args) })}
      conversationId="conv-1"
    >
      <StoryViewport>
        <ChatSidebar />
      </StoryViewport>
    </StoryChat>
  ),
}

export const Empty: StoryObj = {
  render: () => (
    <StoryChat
      adapter={makeStaticAdapter({ summaries: [], conversations: [] })}
      conversationId={null}
    >
      <StoryViewport>
        <ChatSidebar />
      </StoryViewport>
    </StoryChat>
  ),
}

// Attachments sit under New chat; the footer strip appears only when the host wires Manage Providers.
export const FooterLinks: StoryObj = {
  render: () => (
    <StoryChat
      adapter={makeStaticAdapter({
        summaries: makeSummaries({ count: 6, sharedEvery: 0 }),
        attachments: true,
      })}
      config={{ extraLinks: { manageProviders: '#providers' } }}
      conversationId="conv-1"
    >
      <StoryViewport>
        <ChatSidebar />
      </StoryViewport>
    </StoryChat>
  ),
}

import type { Meta, StoryObj } from '@storybook/react-vite'
import { makeStaticAdapter, StoryChat, StoryViewport } from '../stories/harness'
import ChatEmptyState from './ChatEmptyState'

const meta: Meta = {
  title: 'Chat/Empty state',
  component: ChatEmptyState,
  parameters: { layout: 'fullscreen' },
}

export default meta

const STORY_PROMPTS = [
  "Summarize this week's open issues",
  'Write a SQL query that finds duplicate rows',
  'Explain the difference between a process and a thread',
  'Draft a release note for a bug fix',
]

export const SuggestedPrompts: StoryObj = {
  render: () => (
    <StoryChat
      adapter={makeStaticAdapter()}
      conversationId={null}
      config={{ suggestedPrompts: STORY_PROMPTS }}
    >
      <StoryViewport>
        <ChatEmptyState />
      </StoryViewport>
    </StoryChat>
  ),
}

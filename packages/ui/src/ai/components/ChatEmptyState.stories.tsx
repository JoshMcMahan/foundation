import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { makeStaticAdapter, StoryChat, StoryViewport } from '../stories/harness'
import ChatEmptyState from './ChatEmptyState'
import ChatThread from './ChatThread'

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

function EmptyStateToThread() {
  const [conversationId, setConversationId] = useState<string | null>(null)
  const adapter = useState(() => makeStaticAdapter({ conversations: [] }))[0]
  return (
    <StoryChat
      adapter={adapter}
      conversationId={conversationId}
      onNavigate={setConversationId}
      config={{ suggestedPrompts: STORY_PROMPTS }}
    >
      <StoryViewport>
        {conversationId ? <ChatThread conversationId={conversationId} /> : <ChatEmptyState />}
      </StoryViewport>
    </StoryChat>
  )
}

export const SuggestedPrompts: StoryObj = {
  render: () => <EmptyStateToThread />,
}

import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { makeStaticAdapter, StoryChat, StoryViewport } from '../stories/harness'
import ChatEmptyState from './ChatEmptyState'
import ChatInput from './ChatInput'
import ChatStage from './ChatStage'
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

// The only available connection has a rejected API key: the toolbar picker
// dims its models and the banner explains before the first message fails.
// Its owner also gets a link to the provider's settings.
export const BrokenProvider: StoryObj<{ owner: boolean }> = {
  args: { owner: true },
  argTypes: { owner: { control: 'boolean', description: 'The reader registered the provider' } },
  render: (args) => {
    const owner = args.owner ? 'alice' : 'bob'
    return (
      <StoryChat
        key={owner}
        adapter={makeStaticAdapter({
          providers: [
            { id: 'p-1', name: 'gateway', user: owner, cspKind: 'openai', status: 'active' },
          ],
          providerIssues: [
            {
              provider: 'gateway',
              provider_name: 'gateway',
              provider_owner: owner,
              status: 'unauthorized',
              message: 'API key locked - visit the unlock URL to re-enable',
            },
          ],
        })}
        config={{ extraLinks: { providerSettings: (user, name) => `#/providers/${user}/${name}` } }}
        conversationId={null}
      >
        <StoryViewport>
          <ChatEmptyState />
        </StoryViewport>
      </StoryChat>
    )
  },
}

// The new chat was asked to open on a session the reader can no longer reach:
// the notice says so above the greeting and offers a retry.
export const SessionUnreachable: StoryObj = {
  render: () => (
    <StoryChat conversationId={null}>
      <StoryViewport>
        <ChatEmptyState targetSession="workspace:gone-session" />
      </StoryViewport>
    </StoryChat>
  ),
}

// Another surface's start screen on the same stage: its own heading, the
// composer where a new chat has it, and its own list under the box.
export const HostStage: StoryObj<{ items: number }> = {
  args: { items: 4 },
  render: (args) => (
    <StoryChat conversationId={null}>
      <StoryViewport>
        <div className="flex h-full flex-col bg-(--theme-panel-bg)">
          <ChatStage
            heading="What should we work on?"
            subheading="Pick up where you left off or start fresh."
          >
            <ChatInput onSend={() => {}} attachments={false} conversationId="stage-story" />
            <ul className="mx-auto max-w-[var(--chat-column,50rem)] px-8">
              {Array.from({ length: args.items }, (_, i) => `Earlier task ${i + 1}`).map((task) => (
                <li
                  key={task}
                  className="border-b py-2 text-sm theme-border theme-muted-text last:border-b-0"
                >
                  {task}
                </li>
              ))}
            </ul>
          </ChatStage>
        </div>
      </StoryViewport>
    </StoryChat>
  ),
}

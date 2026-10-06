import type { Meta, StoryObj } from '@storybook/react-vite'
import { makeMessage, makePaste, makePasteText, StoryChat, StoryViewport } from '../stories/harness'
import type { ChatMessage } from '../types'
import ChatMessageList from './ChatMessageList'

const meta: Meta = {
  title: 'Chat/Message list',
  component: ChatMessageList,
  parameters: { layout: 'fullscreen' },
}

export default meta

const CONFIG = `partitions:
  - name: compute
    nodes: 12
  - name: gpu
    nodes: 4`

const log = makePaste(1, makePasteText(412))
const config = makePaste(2, CONFIG, { inline: true })

const sent: ChatMessage[] = [
  makeMessage({
    role: 'user',
    content: `Why does the build fail?\n\n${log.placeholder}\n\nIt ran with this config:\n\n${config.placeholder}`,
    pastes: [log, config],
  }),
  makeMessage({
    role: 'assistant',
    content:
      'The log stops at step 380, where the gpu partition asks for more nodes than the config gives it.',
  }),
]

const QUEUED = [
  'Then retry the build on compute only.',
  'And post the new log when it finishes.',
  'Keep the gpu partition as it is.',
]

function MessageList(props: Partial<Parameters<typeof ChatMessageList>[0]>) {
  return (
    <StoryChat>
      <StoryViewport>
        <div className="flex h-full flex-col bg-(--theme-panel-bg)">
          <ChatMessageList messages={sent} allMessages={sent} {...props} />
        </div>
      </StoryViewport>
    </StoryChat>
  )
}

// The log went as its file, so it shows as a card; the config went inline, so
// it shows as its text.
export const Pastes: StoryObj = {
  render: () => <MessageList />,
}

// Messages queued behind a running turn. The host can no longer take back the
// oldest handedOver of them, so those show no remove button on hover.
export const QueuedMessages: StoryObj<{ queued: number; handedOver: number }> = {
  args: { queued: 2, handedOver: 1 },
  argTypes: {
    queued: { control: { type: 'range', min: 0, max: QUEUED.length } },
    handedOver: { control: { type: 'range', min: 0, max: QUEUED.length } },
  },
  render: ({ queued, handedOver }) => {
    const messages = QUEUED.slice(0, queued).map((content, i) =>
      makeMessage({ id: `queued-${i + 1}`, role: 'user', content }),
    )
    const taken = new Set(messages.slice(0, handedOver).map((m) => m.id))
    return (
      <MessageList
        isStreaming
        queuedMessages={messages}
        onRemoveQueued={(id) => console.info('[remove queued]', id)}
        canRemoveQueued={(id) => !taken.has(id)}
      />
    )
  },
}

import type { Meta, StoryObj } from '@storybook/react-vite'
import { useMemo } from 'react'
import {
  makeAttachments,
  makeMessage,
  makePaste,
  makePasteText,
  makeStaticAdapter,
  StoryChat,
  StoryViewport,
} from '../stories/harness'
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

// Messages queued behind a running turn. The host has already handed the
// oldest handedOver of them to the running turn, so those say so and cannot be
// removed. delivery says when the rest reach the model: after the reply (the
// chat provider) or between the agent's steps (a steering host).
export const QueuedMessages: StoryObj<{
  queued: number
  handedOver: number
  delivery: 'afterReply' | 'nextStep'
}> = {
  args: { queued: 2, handedOver: 1, delivery: 'nextStep' },
  argTypes: {
    queued: { control: { type: 'range', min: 0, max: QUEUED.length } },
    handedOver: { control: { type: 'range', min: 0, max: QUEUED.length } },
    delivery: { control: 'inline-radio', options: ['afterReply', 'nextStep'] },
  },
  render: ({ queued, handedOver, delivery }) => {
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
        queueDelivery={delivery}
      />
    )
  },
}

const LINK =
  'https://example.com/organization/repository/tree/main/examples/structured_mesh_solver_parameter_sweep'

const longUrls: ChatMessage[] = [
  makeMessage({
    role: 'user',
    content: `Build the workflow to match this one:\n${LINK}\n\nSo it can feed a parameter sweep later.`,
  }),
  makeMessage({
    role: 'assistant',
    content: `The example at ${LINK} reads its inputs from one file, so a sweep only has to rewrite that file.`,
  }),
]

// A URL has nowhere to wrap, so it breaks inside the bubble rather than
// running past its edge.
export const LongUrls: StoryObj = {
  render: () => <MessageList messages={longUrls} allMessages={longUrls} />,
}

const LONG_REPLY = Array.from(
  { length: 12 },
  (_, i) =>
    `${i + 1}. **Cause ${i + 1}.** The request names a size or region the account cannot use, so the provider refuses it before a node starts.`,
).join('\n\n')

const longReplies: ChatMessage[] = [
  makeMessage({ role: 'user', content: 'Why do clusters fail to start?' }),
  makeMessage({ role: 'assistant', content: LONG_REPLY }),
  makeMessage({ role: 'user', content: 'And why do they fail to stop?' }),
  makeMessage({ role: 'assistant', content: LONG_REPLY }),
]

// An older long reply folds behind Show more; the latest stays open, so the
// thread, scrolled to its end, ends on the answer's last line.
export const LongReplies: StoryObj = {
  render: () => <MessageList messages={longReplies} allMessages={longReplies} />,
}

const reasoned: ChatMessage[] = [
  makeMessage({ role: 'user', content: 'Which partition should the sweep run on?' }),
  makeMessage({
    role: 'assistant',
    content: 'Run it on **compute**: the sweep is CPU-bound and gpu has only four nodes.',
    reasoning:
      'The sweep solves one mesh per point with no GPU kernels.\n\nCompute has 12 idle nodes; gpu has 4, all busy. Compute it is.',
    reasoningDuration: 4200,
  }),
]

// A finished reply's reasoning folds under its "Thought for" line and opens
// in place, above the answer. The play opens it; Thread / Live reasoning
// shows it streaming.
export const ReasoningOpened: StoryObj<{ open: boolean }> = {
  args: { open: true },
  render: () => <MessageList messages={reasoned} allMessages={reasoned} />,
  play: async ({ canvasElement, args }) => {
    if (args.open) {
      canvasElement.querySelector<HTMLButtonElement>('button[aria-expanded="false"]')?.click()
    }
  },
}

// Files sent with a message: pictures as thumbnails and the rest as chips, each
// a link to its download. With `preview` the host takes a plain click and opens
// the file in its own viewer; a modified click still opens the link.
export const Attachments: StoryObj<{ preview: boolean }> = {
  args: { preview: false },
  argTypes: {
    preview: { control: 'boolean', description: 'The host previews attachments (onOpen)' },
  },
  render: ({ preview }) => {
    const Story = () => {
      const adapter = useMemo(
        () => makeStaticAdapter({ attachments: true, previewAttachments: preview }),
        [],
      )
      const messages = [
        makeMessage({
          role: 'user',
          content: 'Here is the dashboard and the report. What stands out?',
          attachments: makeAttachments(),
        }),
        makeMessage({
          role: 'assistant',
          content: 'The gpu partition sat idle for most of the quarter while compute queued.',
        }),
      ]
      return (
        <StoryChat adapter={adapter}>
          <StoryViewport>
            <div className="flex h-full flex-col bg-(--theme-panel-bg)">
              <ChatMessageList messages={messages} allMessages={messages} />
            </div>
          </StoryViewport>
        </StoryChat>
      )
    }
    return <Story key={String(preview)} />
  },
}

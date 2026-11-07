import type { Meta, StoryObj } from '@storybook/react-vite'
import { useMemo, useState } from 'react'
import {
  makeAttachments,
  makeImageAttachments,
  makeMessage,
  makePaste,
  makePasteText,
  makeStaticAdapter,
  StoryChat,
  StoryViewport,
  useStreamedText,
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

const REPLY = Array.from(
  { length: 40 },
  (_, i) =>
    `Step ${i + 1} of the build asks the gpu partition for more nodes than the config gives it, so the scheduler holds the job until the request fits.`,
).join(' ')

function SendWhileReplyingList() {
  const { text } = useStreamedText(REPLY, 30_000)
  const [queued, setQueued] = useState<ChatMessage[]>([])
  const send = () =>
    setQueued((current) => [
      ...current,
      makeMessage({
        id: `sent-${current.length + 1}`,
        role: 'user',
        content: 'The sidebar is blank here [Image #1]',
        attachments: makeImageAttachments().slice(0, 1),
      }),
    ])
  return (
    <MessageList
      isStreaming
      streamingMessage={makeMessage({ id: 'reply', role: 'assistant', content: text })}
      queuedMessages={queued}
      queueDelivery="nextStep"
      inputElement={
        <div className="flex justify-end border-t theme-border bg-(--theme-panel-bg) p-3">
          <button type="button" onClick={send} className="rounded-lg border theme-border px-3 py-1">
            Send with a picture
          </button>
        </div>
      }
    />
  )
}

// A message sent while a reply is still coming in. A reader at the bottom keeps
// it in view, picture and all, and it stays put as the reply grows above it.
export const SendWhileReplying: StoryObj = {
  render: () => <SendWhileReplyingList />,
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

const failed: ChatMessage[] = [
  makeMessage({ role: 'user', content: 'Summarize the last build log.' }),
  makeMessage({
    role: 'assistant',
    content: '',
    error: 'The provider returned 429 Too Many Requests. Try again in a minute.',
  }),
]

// A reply that failed, in the theme's error tone, with retry when the host
// passes onRetryMessage.
export const FailedReply: StoryObj<{ retry: boolean }> = {
  args: { retry: true },
  render: ({ retry }) => (
    <MessageList
      messages={failed}
      allMessages={failed}
      {...(retry ? { onRetryMessage: () => {} } : {})}
    />
  ),
}

// A message the service refused until a limit resets says when to try again,
// with the exact time on hover, and stops saying it once that time passes.
function UntilResetExample({ hours, retry }: { hours: number; retry: boolean }) {
  const messages = useMemo(
    () => [
      makeMessage({
        role: 'user',
        content: 'Summarize the last build log.',
        error: 'The usage limit has been reached',
        retryAt: new Date(Date.now() + hours * 3_600_000).toISOString(),
      }),
    ],
    [hours],
  )
  return (
    <MessageList
      messages={messages}
      allMessages={messages}
      {...(retry ? { onRetryMessage: () => {} } : {})}
    />
  )
}

export const FailedUntilReset: StoryObj<{ hours: number; retry: boolean }> = {
  args: { hours: 3, retry: true },
  argTypes: { hours: { control: { type: 'number', min: -1, step: 0.5 } } },
  render: (args) => <UntilResetExample {...args} />,
}

type AttachmentsStoryArgs = { preview: boolean }

function AttachmentsExample({ preview }: AttachmentsStoryArgs) {
  const adapter = useMemo(
    () => makeStaticAdapter({ attachments: true, previewAttachments: preview }),
    [preview],
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

// Files sent with a message: pictures as thumbnails and the rest as chips, each
// a link to its download. With `preview` the host takes a plain click and opens
// the file in its own viewer; a modified click still opens the link.
export const Attachments: StoryObj<AttachmentsStoryArgs> = {
  args: { preview: false },
  argTypes: {
    preview: { control: 'boolean', description: 'The host previews attachments (onOpen)' },
  },
  render: ({ preview }) => <AttachmentsExample preview={preview} key={String(preview)} />,
}

function ImagesExample() {
  const adapter = useMemo(() => makeStaticAdapter({ attachments: true }), [])
  const messages = [
    makeMessage({
      role: 'user',
      content: 'These are from this morning. Why is the queue so deep?',
      attachments: makeImageAttachments(),
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

// Pictures sent with a message, the first with an inline preview its thumbnail
// shows. A plain click opens one larger in the page, where the arrow keys step
// through the rest; a modified click still opens the link.
export const Images: StoryObj = {
  render: () => <ImagesExample />,
}

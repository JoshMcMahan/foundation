// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import type { useChat, useChatStream } from '../core/ChatProvider'
import type { ChatMessage as Message } from '../types'
import ChatMessageList from './ChatMessageList'

type ChatState = ReturnType<typeof useChat> & ReturnType<typeof useChatStream>

const mockChat = {
  adapter: { attachments: undefined },
  isStreaming: false,
  isThinking: false,
  streamingContent: '',
  streamingReasoning: '',
  streamingParts: [],
  thinkingStartTime: null,
} as unknown as ChatState

vi.mock('../core/ChatProvider', () => ({
  useChat: () => mockChat,
  useChatStream: () => mockChat,
}))

vi.mock('./ChatMessage', () => ({
  __esModule: true,
  default: () => <div />,
}))

const conversation: Message[] = [
  { id: 'p1', role: 'user', content: 'Why does shard 12 fail?' },
  { id: 'a1', role: 'assistant', content: 'The form waits on a slow asset.' },
  { id: 'p2', role: 'user', content: 'Open a PR for the fix\nand attach the shots' },
  { id: 'a2', role: 'assistant', content: 'Opened it.' },
]

const scrollTo = vi.fn()

beforeEach(() => {
  scrollTo.mockClear()
  HTMLElement.prototype.scrollTo = scrollTo
})

function rect(top: number, bottom: number): DOMRect {
  return { top, bottom, left: 0, right: 800, width: 800, height: bottom - top } as DOMRect
}

function renderList(messages = conversation, pinPrompt = true) {
  render(<ChatMessageList messages={messages} allMessages={messages} pinPrompt={pinPrompt} />)
  return screen.getByRole('log')
}

/** Places each prompt's row against a 600px view whose top is at 0, then
 *  scrolls so the list reads where they are. */
function scrollToRows(log: HTMLElement, rows: Record<string, [number, number]>) {
  log.getBoundingClientRect = () => rect(0, 600)
  for (const row of log.querySelectorAll<HTMLElement>('[data-prompt]')) {
    const [top, bottom] = rows[row.dataset['prompt'] ?? ''] ?? [2000, 2050]
    row.getBoundingClientRect = () => rect(top, bottom)
  }
  fireEvent.scroll(log)
}

async function nextFrame() {
  await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
}

describe('ChatMessageList pinned prompt', () => {
  it("pins the first line of the turn's prompt once it scrolls above the view", async () => {
    const log = renderList()
    scrollToRows(log, { p1: [-900, -850], p2: [-300, -250] })

    const pin = await screen.findByRole('button', {
      name: 'Go to message: Open a PR for the fix…',
    })
    expect(pin).toHaveTextContent('Open a PR for the fix…')
  })

  it('shows nothing while any of the prompt is still on screen', async () => {
    const log = renderList()
    scrollToRows(log, { p1: [-900, -850], p2: [-30, 20] })
    await nextFrame()

    expect(screen.queryByRole('button', { name: /Go to message/ })).not.toBeInTheDocument()
  })

  it('pins nothing when a prompt starts right at the top of the view', async () => {
    const log = renderList()
    scrollToRows(log, { p1: [-900, -850], p2: [0, 50] })
    await nextFrame()

    expect(screen.queryByRole('button', { name: /Go to message/ })).not.toBeInTheDocument()
  })

  it("pins an earlier turn's prompt while that turn is in view", async () => {
    const log = renderList()
    scrollToRows(log, { p1: [-400, -350], p2: [500, 550] })

    expect(
      await screen.findByRole('button', { name: 'Go to message: Why does shard 12 fail?' }),
    ).toBeInTheDocument()
  })

  it("hides the pin in a turn opened without text, rather than pin the last turn's", async () => {
    const withPicture: Message[] = [
      ...conversation,
      { id: 'p3', role: 'user', content: '' },
      { id: 'a3', role: 'assistant', content: 'The sidebar is blank in that picture.' },
    ]
    const log = renderList(withPicture)
    scrollToRows(log, { p1: [-1500, -1450], p2: [-900, -850], p3: [-300, -250] })
    await nextFrame()

    expect(screen.queryByRole('button', { name: /Go to message/ })).not.toBeInTheDocument()
  })

  it('takes the reader back to the prompt and moves focus to it', async () => {
    const log = renderList()
    log.scrollTop = 1000
    scrollToRows(log, { p1: [-900, -850], p2: [-300, -250] })

    fireEvent.click(await screen.findByRole('button', { name: /Go to message/ }))

    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 700 }))
    expect(document.activeElement).toBe(log.querySelector('[data-prompt="p2"]'))
  })

  it('leaves the rows unmarked when the host does not pin prompts', () => {
    const log = renderList(conversation, false)

    expect(log.querySelector('[data-prompt]')).toBeNull()
  })
})

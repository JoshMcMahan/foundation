// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { FIND_IN_TRANSCRIPT_EVENT } from '../core/events'
import type { ChatMessage as Message } from '../types'
import SessionView from './SessionView'

const chat = {
  adapter: { attachments: undefined },
  isStreaming: false,
  stopStreaming: vi.fn(),
  isThinking: false,
  streamingContent: '',
  streamingReasoning: '',
  streamingParts: [],
  thinkingStartTime: null,
}

vi.mock('../core/ChatProvider', () => ({
  useChat: () => chat,
  useChatStream: () => chat,
  useChatModelName: () => undefined,
}))

// The composer's own words must never count as matches.
vi.mock('./ChatInput', () => ({
  __esModule: true,
  default: () => <div data-testid="composer">composer timeout</div>,
}))

vi.mock('../ui/Markdown', () => ({
  __esModule: true,
  default: ({ children }: { children: string }) => <p>{children}</p>,
}))

class FakeHighlight {
  ranges: Range[]
  priority = 0
  constructor(...ranges: Range[]) {
    this.ranges = ranges
  }
}
const highlights = new Map<string, FakeHighlight>()

beforeAll(() => {
  vi.stubGlobal('Highlight', FakeHighlight)
  vi.stubGlobal('CSS', { highlights })
})
afterAll(() => vi.unstubAllGlobals())
beforeEach(() => {
  highlights.clear()
  chat.stopStreaming.mockReset()
})

const messages: Message[] = [
  { id: 'u1', role: 'user', content: 'Why does the login test hit a timeout?' },
  { id: 'a1', role: 'assistant', content: 'The timeout comes from the redirect.', parentId: 'u1' },
]

function Session(props: Partial<ComponentProps<typeof SessionView>>) {
  return <SessionView sessionKey="s1" messages={messages} onSend={vi.fn()} find {...props} />
}

function openFind() {
  fireEvent.keyDown(document, { key: 'f', ctrlKey: true })
  return screen.getByRole('textbox', { name: 'Find in conversation' })
}

const count = () => screen.getByTestId('transcript-find-count')
const current = () => highlights.get('transcript-find-current')?.ranges

describe('SessionView find', () => {
  it('opens on Ctrl+F with the field focused, and on the host event', () => {
    const { unmount } = render(<Session />)
    expect(screen.queryByTestId('transcript-find')).not.toBeInTheDocument()
    expect(openFind()).toHaveFocus()
    unmount()

    render(<Session />)
    act(() => {
      document.dispatchEvent(new Event(FIND_IN_TRANSCRIPT_EVENT))
    })
    expect(screen.getByTestId('transcript-find')).toBeInTheDocument()
  })

  it('leaves Ctrl+F alone without find, or once something else took it', () => {
    const { rerender } = render(<Session find={false} />)
    expect(fireEvent.keyDown(document, { key: 'f', ctrlKey: true })).toBe(true)
    expect(screen.queryByTestId('transcript-find')).not.toBeInTheDocument()

    rerender(<Session />)
    const takeIt = (e: KeyboardEvent) => e.preventDefault()
    document.addEventListener('keydown', takeIt, { capture: true })
    fireEvent.keyDown(document, { key: 'f', ctrlKey: true })
    fireEvent.keyDown(document, { key: 'F', ctrlKey: true, shiftKey: true })
    document.removeEventListener('keydown', takeIt, { capture: true })
    expect(screen.queryByTestId('transcript-find')).not.toBeInTheDocument()
  })

  it('counts and paints the matches in the messages, not in the composer', () => {
    render(<Session />)
    fireEvent.change(openFind(), { target: { value: 'TIMEOUT' } })
    expect(count()).toHaveTextContent('1 of 2')
    expect(current()?.map((r) => r.toString())).toEqual(['timeout'])
    expect(highlights.get('transcript-find')?.ranges).toHaveLength(1)
  })

  it('steps through matches, wrapping at the ends', () => {
    render(<Session />)
    const input = openFind()
    fireEvent.change(input, { target: { value: 'timeout' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(count()).toHaveTextContent('2 of 2')
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(count()).toHaveTextContent('1 of 2')
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
    expect(count()).toHaveTextContent('2 of 2')
    fireEvent.click(screen.getByRole('button', { name: 'Previous match' }))
    expect(count()).toHaveTextContent('1 of 2')
    fireEvent.keyDown(document.body, { key: 'g', ctrlKey: true })
    expect(count()).toHaveTextContent('2 of 2')
  })

  it('says so when nothing matches, and offers no steps', () => {
    render(<Session />)
    fireEvent.change(openFind(), { target: { value: 'nowhere' } })
    expect(count()).toHaveTextContent('No results')
    expect(screen.getByRole('button', { name: 'Next match' })).toBeDisabled()
    expect(current()).toBeUndefined()
  })

  it('closes on Escape without stopping the running turn', () => {
    const onStop = vi.fn()
    render(<Session turn={{ running: true, onStop }} />)
    const input = openFind()
    fireEvent.change(input, { target: { value: 'timeout' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByTestId('transcript-find')).not.toBeInTheDocument()
    expect(onStop).not.toHaveBeenCalled()
    expect(highlights.size).toBe(0)
  })

  it('finds again as the transcript grows, keeping the current match', async () => {
    const { rerender } = render(<Session />)
    const input = openFind()
    fireEvent.change(input, { target: { value: 'timeout' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    rerender(
      <Session
        messages={[
          ...messages,
          { id: 'u2', role: 'user', content: 'Raise the timeout?', parentId: 'a1' },
        ]}
      />,
    )
    await waitFor(() => expect(count()).toHaveTextContent('2 of 3'))
  })

  it("leaves another view's matches painted when a view without find comes and goes", () => {
    render(<Session />)
    fireEvent.change(openFind(), { target: { value: 'timeout' } })
    const other = render(<Session sessionKey="s2" find={false} />)
    other.unmount()
    expect(current()?.map((r) => r.toString())).toEqual(['timeout'])
  })

  it('keeps the query to search again when reopened', () => {
    render(<Session />)
    fireEvent.change(openFind(), { target: { value: 'redirect' } })
    fireEvent.click(screen.getByRole('button', { name: 'Close find' }))
    expect(openFind()).toHaveValue('redirect')
    expect(count()).toHaveTextContent('1 of 1')
  })
})

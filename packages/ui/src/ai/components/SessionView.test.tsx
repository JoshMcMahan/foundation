// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import type { ChatMessage as Message } from '../types'
import type ChatMessageList from './ChatMessageList'
import SessionView from './SessionView'

const chat = { isStreaming: false, stopStreaming: vi.fn() }
let listProps: ComponentProps<typeof ChatMessageList> | undefined

vi.mock('../core/ChatProvider', () => ({
  useChat: () => chat,
}))

vi.mock('./ChatMessageList', () => ({
  __esModule: true,
  default: (props: ComponentProps<typeof ChatMessageList>) => {
    listProps = props
    return (
      <div data-testid="list">
        {props.footer}
        {props.inputElement}
      </div>
    )
  },
}))

vi.mock('./ChatInput', () => ({
  __esModule: true,
  default: (props: { disabled?: boolean; onEditLastMessage?: () => void }) => (
    <div
      data-testid="composer"
      data-disabled={String(!!props.disabled)}
      data-edits-last={String(!!props.onEditLastMessage)}
    />
  ),
}))

const ask: Message = { id: 'u1', role: 'user', content: 'stop it', parentId: 'root' }
const reply: Message = { id: 'a1', role: 'assistant', content: 'done', parentId: 'u1' }

beforeEach(() => {
  chat.isStreaming = false
  chat.stopStreaming.mockReset()
  listProps = undefined
})

function pressEscape(target: Element | Window = window) {
  fireEvent.keyDown(target, { key: 'Escape' })
}

describe('SessionView', () => {
  it('stops a turn the host runs with Escape while it runs', () => {
    const onStop = vi.fn()
    const { rerender } = render(
      <SessionView
        sessionKey="s1"
        messages={[ask]}
        onSend={vi.fn()}
        turn={{ running: true, onStop }}
      />,
    )
    pressEscape()
    expect(onStop).toHaveBeenCalledTimes(1)

    rerender(
      <SessionView
        sessionKey="s1"
        messages={[ask]}
        onSend={vi.fn()}
        turn={{ running: false, onStop }}
      />,
    )
    pressEscape()
    expect(onStop).toHaveBeenCalledTimes(1)
  })

  it("stops the chat provider's reply with Escape when the host runs no turn", () => {
    chat.isStreaming = true
    render(<SessionView sessionKey="s1" messages={[ask]} onSend={vi.fn()} />)
    pressEscape()
    expect(chat.stopStreaming).toHaveBeenCalledTimes(1)
  })

  it('leaves Escape to an open dialog', () => {
    const onStop = vi.fn()
    render(
      <>
        <div role="dialog">
          <button type="button">close</button>
        </div>
        <SessionView
          sessionKey="s1"
          messages={[ask]}
          onSend={vi.fn()}
          turn={{ running: true, onStop }}
        />
      </>,
    )
    pressEscape(screen.getByRole('button', { name: 'close' }))
    expect(onStop).not.toHaveBeenCalled()
  })

  it('resends an edited user message through onEdit with the message it edits', () => {
    const onEdit = vi.fn()
    render(<SessionView sessionKey="s1" messages={[ask, reply]} onSend={vi.fn()} onEdit={onEdit} />)
    act(() => listProps?.onEditMessage?.('u1'))
    expect(listProps?.editingMessageId).toBe('u1')

    act(() => listProps?.onSaveEdit?.('u1', 'stop it now'))

    expect(onEdit).toHaveBeenCalledWith(ask, 'stop it now')
    expect(listProps?.editingMessageId).toBeNull()
  })

  it('offers no editing without onEdit', () => {
    render(<SessionView sessionKey="s1" messages={[ask]} onSend={vi.fn()} />)
    expect(listProps?.onEditMessage).toBeUndefined()
    expect(screen.getByTestId('composer')).toHaveAttribute('data-edits-last', 'false')
  })

  it('shows an error in place of the transcript and keeps the composer', () => {
    render(
      <SessionView
        sessionKey="s1"
        messages={[]}
        onSend={vi.fn()}
        error={<p>Could not load the transcript</p>}
      />,
    )
    expect(screen.getByText('Could not load the transcript')).toBeInTheDocument()
    expect(screen.queryByTestId('list')).not.toBeInTheDocument()
    expect(screen.getByTestId('composer')).toBeInTheDocument()
  })

  it('disables the composer while the first messages load', () => {
    render(<SessionView sessionKey="s1" messages={[]} onSend={vi.fn()} loading />)
    expect(screen.queryByTestId('list')).not.toBeInTheDocument()
    expect(screen.getByTestId('composer')).toHaveAttribute('data-disabled', 'true')
  })
})

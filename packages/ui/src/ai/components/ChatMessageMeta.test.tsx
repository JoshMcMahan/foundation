// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { DateTime } from 'luxon'
import type { ChatMessage as Message } from '../types'
import ChatMessage from './ChatMessage'

vi.mock('../../icons', () => ({
  CheckIcon: () => <span data-testid="check-icon">✓</span>,
  RefreshIcon: () => <span data-testid="refresh-icon">↻</span>,
  EditIcon: () => <span data-testid="edit-icon">✎</span>,
  CopyIcon: () => <span data-testid="copy-icon">📋</span>,
  ErrorIcon: () => <span data-testid="error-icon">⚠</span>,
  RetryIcon: () => <span data-testid="retry-icon">↺</span>,
  FileIcon: () => <span data-testid="file-icon">📄</span>,
  DownloadFileIcon: () => <span data-testid="download-file-icon">⬇</span>,
  ThinkingIcon: () => <span data-testid="thinking-icon">💭</span>,
  ChevronRightIcon: () => <span data-testid="chevron-right-icon">›</span>,
  AngleLeftIcon: () => <span data-testid="angle-left-icon">‹</span>,
  AngleRightIcon: () => <span data-testid="angle-right-icon">›</span>,
}))

vi.mock('./agent/AgentMessageParts', () => ({
  __esModule: true,
  default: () => <div data-testid="agent-parts-mock" />,
}))

vi.mock('../ui/Markdown', () => ({
  __esModule: true,
  default: ({ children }: { children: string }) => <div data-testid="markdown">{children}</div>,
}))

const message = (overrides: Partial<Message> = {}): Message => ({
  id: `msg-${Math.random().toString(36).substring(7)}`,
  role: 'assistant',
  content: 'Reply content',
  ...overrides,
})

const defaultProps = {
  allMessages: [] as Message[],
}

const recentIso = DateTime.now().minus({ hours: 2 }).toISO()

function mockScrollHeight(value: number) {
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get: () => value,
  })
}

afterEach(() => {
  // Restore jsdom's default (undefined getter → 0)
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get: () => 0,
  })
})

describe('message metadata row', () => {
  it('renders a relative timestamp with an absolute title', () => {
    render(<ChatMessage {...defaultProps} message={message({ timestamp: recentIso })} />)
    const el = screen.getByText('2 hours ago')
    expect(el).toHaveAttribute('title')
  })

  it('ignores an invalid or empty timestamp', () => {
    render(<ChatMessage {...defaultProps} message={message({ timestamp: '' })} />)
    render(<ChatMessage {...defaultProps} message={message({ timestamp: 'not-a-date' })} />)
    expect(screen.queryByText(/ago$/)).not.toBeInTheDocument()
  })

  it('shows the model chip on assistant messages when present', () => {
    render(<ChatMessage {...defaultProps} message={message({ model: 'gpt-oss-120b' })} />)
    expect(screen.getByText('gpt-oss-120b')).toBeInTheDocument()
  })

  it('does not show model or tokens on user messages', () => {
    render(
      <ChatMessage
        {...defaultProps}
        message={message({
          role: 'user',
          model: 'gpt-oss-120b',
          tokensUsed: {
            prompt_tokens: 10,
            completion_tokens: 20,
            total_tokens: 30,
          },
          timestamp: recentIso,
        })}
      />,
    )
    expect(screen.queryByText('gpt-oss-120b')).not.toBeInTheDocument()
    expect(screen.queryByText('30 tokens')).not.toBeInTheDocument()
    // Timestamp still applies to user messages.
    expect(screen.getByText('2 hours ago')).toBeInTheDocument()
  })

  it('renders token usage with an in/out breakdown title', () => {
    render(
      <ChatMessage
        {...defaultProps}
        message={message({
          tokensUsed: {
            prompt_tokens: 1200,
            completion_tokens: 345,
            total_tokens: 1545,
          },
        })}
      />,
    )
    const el = screen.getByText('1,545 tokens')
    expect(el).toHaveAttribute('title', '1,200 in · 345 out')
  })

  it('renders nothing meta-related when no metadata is present', () => {
    const { container } = render(<ChatMessage {...defaultProps} message={message()} />)
    expect(container.querySelector('.chat-meta')).not.toBeInTheDocument()
  })
})

describe('stopped badge', () => {
  it('marks interrupted turns', () => {
    render(<ChatMessage {...defaultProps} message={message({ stopped: true })} />)
    expect(screen.getByText('Stopped')).toBeInTheDocument()
  })

  it('does not mark while streaming', () => {
    render(<ChatMessage {...defaultProps} message={message({ stopped: true })} isStreaming />)
    expect(screen.queryByText('Stopped')).not.toBeInTheDocument()
  })
})

describe('long message collapse', () => {
  it('clamps tall finished replies behind Show more and expands on click', () => {
    mockScrollHeight(2000)
    const { container } = render(<ChatMessage {...defaultProps} message={message()} />)
    expect(container.querySelector('.chat-message-clamp')).toBeInTheDocument()
    const toggle = screen.getByRole('button', { name: 'Show more' })
    fireEvent.click(toggle)
    expect(container.querySelector('.chat-message-clamp')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show less' })).toBeInTheDocument()
  })

  it('never clamps while streaming', () => {
    mockScrollHeight(2000)
    const { container } = render(<ChatMessage {...defaultProps} message={message()} isStreaming />)
    expect(container.querySelector('.chat-message-clamp')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument()
  })

  it('does not clamp short replies', () => {
    mockScrollHeight(300)
    const { container } = render(<ChatMessage {...defaultProps} message={message()} />)
    expect(container.querySelector('.chat-message-clamp')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument()
  })

  it('never clamps user messages', () => {
    mockScrollHeight(2000)
    const { container } = render(
      <ChatMessage
        {...defaultProps}
        message={message({ role: 'user', content: 'long user text' })}
      />,
    )
    expect(container.querySelector('.chat-message-clamp')).not.toBeInTheDocument()
  })
})

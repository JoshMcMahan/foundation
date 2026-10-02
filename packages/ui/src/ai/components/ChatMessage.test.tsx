// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ChatMessage as Message } from '../types'
import ChatMessage from './ChatMessage'

// Mock the icons
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

// Parts messages delegate to the agent renderer; its internals are covered
// by its own suite.
vi.mock('./agent/AgentMessageParts', () => ({
  __esModule: true,
  default: () => <div data-testid="agent-parts-mock" />,
}))

// Mock the Markdown component
vi.mock('../ui/Markdown', () => ({
  __esModule: true,
  default: ({ children }: { children: string }) => <div data-testid="markdown">{children}</div>,
}))

// Mock BranchNavigator
vi.mock('./BranchNavigator', () => ({
  __esModule: true,
  default: () => <div data-testid="branch-navigator">Branch Nav</div>,
}))

// Mock Avatar
vi.mock('../ui/Avatar', () => ({
  Avatar: ({ name }: { name?: string }) => <div data-testid="avatar">{name}</div>,
}))

// ==========================================
// Test Helpers
// ==========================================

const createMockMessage = (overrides: Partial<Message> = {}): Message => ({
  id: `msg-${Math.random().toString(36).substring(7)}`,
  role: 'user',
  content: 'Test message content',
  ...overrides,
})

const defaultProps = {
  message: createMockMessage(),
  allMessages: [] as Message[],
  attachmentDownloadUrl: (id: string) => `/api/aichat/attachments/${id}/download`,
}

// ==========================================
// Tests
// ==========================================

describe('ChatMessage', () => {
  describe('rendering', () => {
    it('renders user message content', () => {
      const message = createMockMessage({
        role: 'user',
        content: 'Hello, world!',
      })

      render(<ChatMessage {...defaultProps} message={message} />)

      expect(screen.getByText('Hello, world!')).toBeInTheDocument()
    })

    it('renders assistant message with Markdown', () => {
      const message = createMockMessage({
        role: 'assistant',
        content: '**Bold text**',
      })

      render(<ChatMessage {...defaultProps} message={message} />)

      expect(screen.getByTestId('markdown')).toBeInTheDocument()
      expect(screen.getByTestId('markdown')).toHaveTextContent('**Bold text**')
    })

    it('renders the agent parts timeline when parts are present', () => {
      const message = createMockMessage({
        role: 'assistant',
        content: '',
        parts: [{ kind: 'text', text: 'hi' }],
      })

      render(<ChatMessage {...defaultProps} message={message} />)

      expect(screen.getByTestId('agent-parts-mock')).toBeInTheDocument()
    })

    it('does not render tool messages', () => {
      const message = createMockMessage({
        role: 'tool',
        content: 'Tool result',
      })

      const { container } = render(<ChatMessage {...defaultProps} message={message} />)

      expect(container.firstChild).toBeNull()
    })

    it('does not render assistant messages with only tool calls', () => {
      const message = createMockMessage({
        role: 'assistant',
        content: '',
        toolCalls: [
          {
            id: 'call-1',
            type: 'function',
            function: { name: 'test', arguments: '{}' },
          },
        ],
      })

      const { container } = render(<ChatMessage {...defaultProps} message={message} />)

      expect(container.firstChild).toBeNull()
    })
  })

  describe('error display', () => {
    it('displays error message when message has error', () => {
      const message = createMockMessage({
        role: 'user',
        content: 'Failed message',
        error: 'Failed to send message',
      })

      render(<ChatMessage {...defaultProps} message={message} />)

      expect(screen.getByText('Failed to send message')).toBeInTheDocument()
      expect(screen.getByTestId('error-icon')).toBeInTheDocument()
    })

    it('shows retry button when onRetry is provided', () => {
      const message = createMockMessage({
        role: 'user',
        error: 'Network error',
      })
      const onRetry = vi.fn()

      render(<ChatMessage {...defaultProps} message={message} onRetry={onRetry} />)

      expect(screen.getByText('Retry')).toBeInTheDocument()
      expect(screen.getByTestId('retry-icon')).toBeInTheDocument()
    })

    it('calls onRetry with message id when retry button clicked', () => {
      const message = createMockMessage({
        id: 'error-msg-123',
        role: 'user',
        error: 'Network error',
      })
      const onRetry = vi.fn()

      render(<ChatMessage {...defaultProps} message={message} onRetry={onRetry} />)

      fireEvent.click(screen.getByText('Retry'))

      expect(onRetry).toHaveBeenCalledWith('error-msg-123')
      expect(onRetry).toHaveBeenCalledTimes(1)
    })

    it('does not show retry button when onRetry is not provided', () => {
      const message = createMockMessage({
        role: 'user',
        error: 'Network error',
      })

      render(<ChatMessage {...defaultProps} message={message} />)

      expect(screen.getByText('Network error')).toBeInTheDocument()
      expect(screen.queryByText('Retry')).not.toBeInTheDocument()
    })
  })

  describe('streaming indicator', () => {
    it('passes isStreaming to Markdown when streaming', () => {
      const message = createMockMessage({
        role: 'assistant',
        content: 'Loading...',
      })

      render(<ChatMessage {...defaultProps} message={message} isStreaming />)

      // Markdown component is rendered for assistant messages
      expect(screen.getByTestId('markdown')).toBeInTheDocument()
    })

    it('renders Markdown for non-streaming assistant messages', () => {
      const message = createMockMessage({
        role: 'assistant',
        content: 'Complete',
      })

      render(<ChatMessage {...defaultProps} message={message} isStreaming={false} />)

      expect(screen.getByTestId('markdown')).toBeInTheDocument()
    })
  })

  describe('edit mode', () => {
    it('shows textarea when isEditing is true', () => {
      const message = createMockMessage({ role: 'user', content: 'Edit me' })

      render(<ChatMessage {...defaultProps} message={message} isEditing />)

      expect(screen.getByRole('textbox')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('Edit your message...')).toBeInTheDocument()
    })

    it('pre-fills textarea with message content', () => {
      const message = createMockMessage({
        role: 'user',
        content: 'Original content',
      })

      render(<ChatMessage {...defaultProps} message={message} isEditing />)

      const textarea = screen.getByRole('textbox')
      expect(textarea).toHaveValue('Original content')
    })

    it('shows Cancel and Send buttons in edit mode', () => {
      const message = createMockMessage({ role: 'user' })

      render(<ChatMessage {...defaultProps} message={message} isEditing />)

      expect(screen.getByText('Cancel')).toBeInTheDocument()
      expect(screen.getByText('Send')).toBeInTheDocument()
    })

    it('calls onCancelEdit when Cancel is clicked', () => {
      const message = createMockMessage({ role: 'user' })
      const onCancelEdit = vi.fn()

      render(
        <ChatMessage {...defaultProps} message={message} isEditing onCancelEdit={onCancelEdit} />,
      )

      fireEvent.click(screen.getByText('Cancel'))

      expect(onCancelEdit).toHaveBeenCalledTimes(1)
    })

    it('calls onSaveEdit when Send is clicked', () => {
      const message = createMockMessage({
        id: 'edit-msg',
        role: 'user',
        content: 'Original',
      })
      const onSaveEdit = vi.fn()

      render(<ChatMessage {...defaultProps} message={message} isEditing onSaveEdit={onSaveEdit} />)

      const textarea = screen.getByRole('textbox')
      fireEvent.change(textarea, { target: { value: 'Updated content' } })
      fireEvent.click(screen.getByText('Send'))

      expect(onSaveEdit).toHaveBeenCalledWith('edit-msg', 'Updated content')
    })

    it('calls onSaveEdit when Enter is pressed (without Shift)', () => {
      const message = createMockMessage({
        id: 'edit-msg',
        role: 'user',
        content: 'Original',
      })
      const onSaveEdit = vi.fn()

      render(<ChatMessage {...defaultProps} message={message} isEditing onSaveEdit={onSaveEdit} />)

      const textarea = screen.getByRole('textbox')
      fireEvent.change(textarea, { target: { value: 'New content' } })
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })

      expect(onSaveEdit).toHaveBeenCalledWith('edit-msg', 'New content')
    })

    it('does not call onSaveEdit when Shift+Enter is pressed', () => {
      const message = createMockMessage({ role: 'user', content: 'Original' })
      const onSaveEdit = vi.fn()

      render(<ChatMessage {...defaultProps} message={message} isEditing onSaveEdit={onSaveEdit} />)

      const textarea = screen.getByRole('textbox')
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true })

      expect(onSaveEdit).not.toHaveBeenCalled()
    })

    it('calls onCancelEdit when Escape is pressed', () => {
      const message = createMockMessage({ role: 'user' })
      const onCancelEdit = vi.fn()

      render(
        <ChatMessage {...defaultProps} message={message} isEditing onCancelEdit={onCancelEdit} />,
      )

      const textarea = screen.getByRole('textbox')
      fireEvent.keyDown(textarea, { key: 'Escape' })

      expect(onCancelEdit).toHaveBeenCalledTimes(1)
    })

    it('disables Send button when content is empty', () => {
      const message = createMockMessage({ role: 'user', content: 'Original' })

      render(<ChatMessage {...defaultProps} message={message} isEditing />)

      const textarea = screen.getByRole('textbox')
      fireEvent.change(textarea, { target: { value: '   ' } })

      expect(screen.getByText('Send')).toBeDisabled()
    })
  })

  describe('action buttons', () => {
    it('shows action buttons on hover for user messages', async () => {
      const message = createMockMessage({ role: 'user', content: 'Hoverable' })

      render(<ChatMessage {...defaultProps} message={message} />)

      const messageContainer = screen.getByText('Hoverable').closest('.group')
      if (messageContainer) {
        fireEvent.mouseEnter(messageContainer)
      }

      // Action buttons should become visible
      await waitFor(() => {
        expect(screen.getByTestId('copy-icon')).toBeInTheDocument()
      })
    })

    it('shows regenerate button for assistant messages', () => {
      const message = createMockMessage({
        role: 'assistant',
        content: 'Assistant response',
      })
      const onRegenerate = vi.fn()

      render(<ChatMessage {...defaultProps} message={message} onRegenerate={onRegenerate} />)

      expect(screen.getByTestId('refresh-icon')).toBeInTheDocument()
    })
  })

  describe('attachments', () => {
    it('displays attachment indicators when message has attachments', () => {
      const message = createMockMessage({
        role: 'user',
        content: 'Message with files',
        attachments: [
          {
            id: 'file-1',
            filename: 'photo.png',
            contentType: 'image/png',
            size: 1024,
            conversationId: 'conv-1',
            uploadedAt: new Date().toISOString(),
          },
          {
            id: 'file-2',
            filename: 'doc.pdf',
            contentType: 'application/pdf',
            size: 2048,
            conversationId: 'conv-1',
            uploadedAt: new Date().toISOString(),
          },
        ],
      })

      render(<ChatMessage {...defaultProps} message={message} />)

      // Should show attachment elements for each attachment
      expect(screen.getByAltText('photo.png')).toBeInTheDocument()
      expect(screen.getByText('doc.pdf')).toBeInTheDocument()
    })

    it('does not show attachment section when no attachments', () => {
      const message = createMockMessage({
        role: 'user',
        content: 'No attachments',
        attachments: [],
      })

      render(<ChatMessage {...defaultProps} message={message} />)

      expect(screen.queryByText('Attachment')).not.toBeInTheDocument()
    })
  })

  describe('author attribution', () => {
    it('renders author name and avatar when showAuthor is true', () => {
      const message = createMockMessage({
        role: 'user',
        content: 'Hello',
        author: {
          id: 'user-1',
          username: 'jdoe',
          name: 'Jane Doe',
          avatarUrl: 'https://www.gravatar.com/avatar/test',
        },
      })

      render(<ChatMessage {...defaultProps} message={message} showAuthor currentUsername="other" />)

      const authorLabels = screen.getAllByText('Jane Doe')
      expect(authorLabels.length).toBeGreaterThanOrEqual(1)
      expect(screen.getByTestId('avatar')).toBeInTheDocument()
    })

    it('falls back to username when name is not set', () => {
      const message = createMockMessage({
        role: 'user',
        content: 'Hello',
        author: {
          id: 'user-1',
          username: 'jdoe',
        },
      })

      render(<ChatMessage {...defaultProps} message={message} showAuthor currentUsername="other" />)

      const authorLabels = screen.getAllByText('jdoe')
      expect(authorLabels.length).toBeGreaterThanOrEqual(1)
    })

    it('does not render author for current user messages', () => {
      const message = createMockMessage({
        role: 'user',
        content: 'My message',
        author: {
          id: 'user-1',
          username: 'me',
          name: 'Me',
        },
      })

      render(<ChatMessage {...defaultProps} message={message} showAuthor currentUsername="me" />)

      expect(screen.queryByTestId('avatar')).not.toBeInTheDocument()
    })

    it('does not render author for assistant messages', () => {
      const message = createMockMessage({
        role: 'assistant',
        content: 'Response',
        author: {
          id: 'user-1',
          username: 'jdoe',
          name: 'Jane Doe',
        },
      })

      render(<ChatMessage {...defaultProps} message={message} showAuthor />)

      expect(screen.queryByTestId('avatar')).not.toBeInTheDocument()
    })

    it('does not render author when showAuthor is false', () => {
      const message = createMockMessage({
        role: 'user',
        content: 'Hello',
        author: {
          id: 'user-1',
          username: 'jdoe',
          name: 'Jane Doe',
        },
      })

      render(<ChatMessage {...defaultProps} message={message} />)

      expect(screen.queryByTestId('avatar')).not.toBeInTheDocument()
    })

    it('left-aligns messages from other users', () => {
      const message = createMockMessage({
        role: 'user',
        content: 'Hello from other user',
        author: {
          id: 'user-2',
          username: 'other',
          name: 'Other User',
        },
      })

      const { container } = render(
        <ChatMessage {...defaultProps} message={message} showAuthor currentUsername="me" />,
      )

      // Other user's message should be left-aligned (flex-row, not flex-row-reverse)
      const flexContainer = container.querySelector('.flex-row')
      expect(flexContainer).toBeInTheDocument()
      expect(container.querySelector('.flex-row-reverse')).not.toBeInTheDocument()
    })

    it('right-aligns messages from current user', () => {
      const message = createMockMessage({
        role: 'user',
        content: 'Hello from me',
        author: {
          id: 'user-1',
          username: 'me',
          name: 'Me',
        },
      })

      const { container } = render(
        <ChatMessage {...defaultProps} message={message} showAuthor currentUsername="me" />,
      )

      // Current user's message should be right-aligned
      expect(container.querySelector('.flex-row-reverse')).toBeInTheDocument()
    })
  })

  describe('branch navigator', () => {
    it('shows branch navigator for assistant messages with siblings', () => {
      const parentMsg = createMockMessage({ id: 'parent', role: 'user' })
      const assistantMsg = createMockMessage({
        id: 'assistant-1',
        role: 'assistant',
        parentId: 'parent',
        content: 'Response 1',
      })
      const siblingMsg = createMockMessage({
        id: 'assistant-2',
        role: 'assistant',
        parentId: 'parent',
        content: 'Response 2',
      })

      render(
        <ChatMessage
          {...defaultProps}
          message={assistantMsg}
          allMessages={[parentMsg, assistantMsg, siblingMsg]}
          onNavigateBranch={vi.fn()}
        />,
      )

      expect(screen.getByTestId('branch-navigator')).toBeInTheDocument()
    })

    it('does not show branch navigator for user messages', () => {
      const userMsg = createMockMessage({
        role: 'user',
        content: 'User message',
      })

      render(
        <ChatMessage
          {...defaultProps}
          message={userMsg}
          allMessages={[userMsg]}
          onNavigateBranch={vi.fn()}
        />,
      )

      expect(screen.queryByTestId('branch-navigator')).not.toBeInTheDocument()
    })
  })
})

describe('turn duration row', () => {
  it('shows the duration when there is no reasoning text', () => {
    const message = createMockMessage({
      role: 'assistant',
      content: 'the answer',
      reasoningDuration: 18200,
    })

    render(<ChatMessage {...defaultProps} message={message} />)

    const label = screen.getByText(/Thought for/)
    expect(label).toBeInTheDocument()
    expect(label.closest('button')).toBeNull()
  })

  it('shows a tool call count when only tool parts carry the work', () => {
    const message = createMockMessage({
      role: 'assistant',
      content: 'the answer',
      parts: [
        {
          kind: 'tool_call',
          id: 'c1',
          name: 'search',
          args: '{}',
          status: 'ok',
        },
        {
          kind: 'tool_call',
          id: 'c2',
          name: 'read',
          args: '{}',
          status: 'ok',
        },
      ],
    })

    render(<ChatMessage {...defaultProps} message={message} />)

    const label = screen.getByText('Ran 2 tool calls')
    expect(label).toBeInTheDocument()
    expect(label.closest('button')).toBeNull()
  })

  it('keeps the reasoning row clickable when reasoning text exists', () => {
    const onOpenReasoning = vi.fn()
    const message = createMockMessage({
      role: 'assistant',
      content: 'the answer',
      reasoning: 'because of reasons',
      reasoningDuration: 4000,
    })

    render(<ChatMessage {...defaultProps} message={message} onOpenReasoning={onOpenReasoning} />)

    const label = screen.getByText(/Thought for/)
    const button = label.closest('button')
    expect(button).not.toBeNull()
    fireEvent.click(button!)
    expect(onOpenReasoning).toHaveBeenCalledWith('because of reasons', 4000)
  })
})

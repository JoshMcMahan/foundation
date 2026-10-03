import type { ChatMessage as Message } from '../types'
import {
  lastAssistantContent as getLastAssistantMessage,
  lastUserMessage as getLastUserMessage,
} from './useKeyboardShortcuts'

describe('Keyboard Shortcuts Utilities', () => {
  const createMessage = (
    role: 'user' | 'assistant' | 'tool',
    content?: string,
    id = `msg-${Math.random()}`,
  ): Message => ({
    id,
    role,
    content,
  })

  describe('getLastAssistantMessage', () => {
    it('returns null for empty messages', () => {
      expect(getLastAssistantMessage([])).toBeNull()
    })

    it('returns null when no assistant messages exist', () => {
      const messages = [createMessage('user', 'Hello'), createMessage('user', 'Another message')]
      expect(getLastAssistantMessage(messages)).toBeNull()
    })

    it('returns the last assistant message content', () => {
      const messages = [
        createMessage('user', 'Hello'),
        createMessage('assistant', 'First response'),
        createMessage('user', 'Follow up'),
        createMessage('assistant', 'Second response'),
      ]
      expect(getLastAssistantMessage(messages)).toBe('Second response')
    })

    it('skips assistant messages with no content', () => {
      const messages = [
        createMessage('assistant', 'Has content'),
        createMessage('assistant', ''),
        createMessage('assistant', undefined),
      ]
      expect(getLastAssistantMessage(messages)).toBe('Has content')
    })

    it('handles mixed message types', () => {
      const messages = [
        createMessage('user', 'Start'),
        createMessage('assistant', 'Response'),
        createMessage('tool', 'Tool result'),
        createMessage('user', 'Next question'),
      ]
      expect(getLastAssistantMessage(messages)).toBe('Response')
    })
  })

  describe('getLastUserMessage', () => {
    it('returns null for empty messages', () => {
      expect(getLastUserMessage([])).toBeNull()
    })

    it('returns null when no user messages exist', () => {
      const messages = [createMessage('assistant', 'Welcome'), createMessage('tool', 'Tool output')]
      expect(getLastUserMessage(messages)).toBeNull()
    })

    it('returns the last user message', () => {
      const messages = [
        createMessage('user', 'First', 'msg-1'),
        createMessage('assistant', 'Response'),
        createMessage('user', 'Second', 'msg-2'),
      ]
      const result = getLastUserMessage(messages)
      expect(result?.id).toBe('msg-2')
      expect(result?.content).toBe('Second')
    })

    it('returns full message object for editing', () => {
      const messages = [createMessage('user', 'Edit this', 'edit-msg')]
      const result = getLastUserMessage(messages)
      expect(result).toEqual({
        id: 'edit-msg',
        role: 'user',
        content: 'Edit this',
      })
    })
  })
})

describe('Keyboard Shortcut Behaviors', () => {
  describe('Edit Last Message (Arrow Up)', () => {
    it('should identify the correct message to edit', () => {
      const messages = [
        { id: '1', role: 'user' as const, content: 'First question' },
        { id: '2', role: 'assistant' as const, content: 'First answer' },
        { id: '3', role: 'user' as const, content: 'Second question' },
        { id: '4', role: 'assistant' as const, content: 'Second answer' },
      ]

      const lastUser = getLastUserMessage(messages)
      expect(lastUser?.id).toBe('3')
      expect(lastUser?.content).toBe('Second question')
    })

    it('should handle conversations with only user messages', () => {
      const messages = [{ id: '1', role: 'user' as const, content: 'Question without answer' }]

      const lastUser = getLastUserMessage(messages)
      expect(lastUser?.id).toBe('1')
    })
  })

  describe('Copy Last Response (Cmd+Shift+C)', () => {
    it('should identify the correct content to copy', () => {
      const messages = [
        { id: '1', role: 'user' as const, content: 'Question' },
        { id: '2', role: 'assistant' as const, content: 'The answer is 42' },
      ]

      const content = getLastAssistantMessage(messages)
      expect(content).toBe('The answer is 42')
    })

    it('should return null when no response exists', () => {
      const messages = [{ id: '1', role: 'user' as const, content: 'Waiting for response...' }]

      const content = getLastAssistantMessage(messages)
      expect(content).toBeNull()
    })
  })
})

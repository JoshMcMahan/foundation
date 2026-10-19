// @vitest-environment jsdom
import { act, fireEvent, renderHook } from '@testing-library/react'
import type { ChatMessage as Message } from '../types'
import { lastAssistantContent, replyText, useConversationShortcuts } from './useKeyboardShortcuts'

const toast = vi.hoisted(() => ({ success: vi.fn(), info: vi.fn(), error: vi.fn() }))
vi.mock('../../components/Toast', () => ({ toast }))
vi.mock('../utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../utils')>()),
  isMac: () => true,
}))

const agentReply: Message = {
  id: 'a1',
  role: 'assistant',
  content: null,
  parts: [
    { kind: 'text', text: 'Stopping gpu-a.' },
    { kind: 'tool_call', id: 'c1', name: 'Bash', args: '{}', status: 'ok' },
    { kind: 'text', text: 'It is stopped.' },
  ],
}

describe('replyText', () => {
  it("is a reply's content, or an agent turn's text parts", () => {
    expect(replyText({ id: 'm', role: 'assistant', content: 'Hello' })).toBe('Hello')
    expect(replyText(agentReply)).toBe('Stopping gpu-a.\n\nIt is stopped.')
  })

  it("finds the last reply's text through an agent turn", () => {
    expect(lastAssistantContent([{ id: 'u', role: 'user', content: 'stop' }, agentReply])).toBe(
      'Stopping gpu-a.\n\nIt is stopped.',
    )
  })
})

describe('useConversationShortcuts', () => {
  const press = (key: string) => fireEvent.keyDown(document, { key, metaKey: true, shiftKey: true })

  beforeEach(() => {
    toast.success.mockReset()
    toast.info.mockReset()
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
  })

  it('starts a new one, searches, and copies the last reply', async () => {
    const onNew = vi.fn()
    const onSearch = vi.fn()
    renderHook(() => useConversationShortcuts({ onNew, onSearch, lastReply: () => 'the reply' }))

    press('O')
    press('F')
    await act(async () => {
      press('C')
    })

    expect(onNew).toHaveBeenCalledTimes(1)
    expect(onSearch).toHaveBeenCalledTimes(1)
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('the reply')
    expect(toast.success).toHaveBeenCalled()
  })

  it('says there is nothing to copy without a reply', async () => {
    renderHook(() =>
      useConversationShortcuts({ onNew: vi.fn(), onSearch: vi.fn(), lastReply: () => null }),
    )
    await act(async () => {
      press('C')
    })
    expect(toast.info).toHaveBeenCalled()
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled()
  })

  it('does nothing while turned off', () => {
    const onNew = vi.fn()
    renderHook(() =>
      useConversationShortcuts({ enabled: false, onNew, onSearch: vi.fn(), lastReply: () => null }),
    )
    press('O')
    expect(onNew).not.toHaveBeenCalled()
  })
})

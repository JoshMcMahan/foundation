// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChatConfigProvider, resolveChatConfig } from '../../core/config'
import { defaultChatStrings } from '../../strings'
import ActivityLine from './ActivityLine'

describe('ActivityLine', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-22T10:02:13.000Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('counts up from when the turn began and shows the token totals', () => {
    render(
      <ActivityLine
        testId="activity"
        startedAt="2026-09-22T10:00:00.000Z"
        inputTokens={1234}
        outputTokens={512}
      />,
    )
    expect(screen.getByTestId('activity-meta')).toHaveTextContent('(2m 13s · ↑1.2K ↓512 tokens)')
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(screen.getByTestId('activity-meta')).toHaveTextContent('2m 15s')
  })

  it('shows one of the terminal status words, held for the turn', () => {
    const { rerender } = render(
      <ActivityLine testId="activity" startedAt="2026-09-22T10:00:00.000Z" />,
    )
    const word = () => screen.getByTestId('activity-word').textContent?.replace(/…$/, '') ?? ''
    expect(defaultChatStrings.activity.words).toContain(word())
    const first = word()
    rerender(
      <ActivityLine testId="activity" startedAt="2026-09-22T10:00:00.000Z" inputTokens={12} />,
    )
    expect(word()).toBe(first)
    expect(screen.getByTestId('activity-word')).toHaveTextContent(/…$/)
  })

  it('picks from the host’s own words, for a reader in another language', () => {
    render(
      <ChatConfigProvider
        value={resolveChatConfig({ strings: { activity: { words: ['Réflexion'] } } })}
      >
        <ActivityLine testId="activity" startedAt="2026-09-22T10:00:00.000Z" />
      </ChatConfigProvider>,
    )
    expect(screen.getByTestId('activity-word')).toHaveTextContent('Réflexion…')
  })

  it('lets the host name the activity, the way a running hook does', () => {
    render(<ActivityLine testId="activity" startedAt={null} word="Checking the goal" />)
    expect(screen.getByTestId('activity-word')).toHaveTextContent('Checking the goal…')
  })

  it('leaves out what it does not know', () => {
    render(<ActivityLine testId="activity" startedAt={null} />)
    expect(screen.queryByTestId('activity-meta')).toBeNull()
  })

  it('offers to stop the turn', () => {
    const onStop = vi.fn()
    render(<ActivityLine startedAt={null} onStop={onStop} />)
    fireEvent.click(screen.getByRole('button', { name: /stop/i }))
    expect(onStop).toHaveBeenCalledTimes(1)
  })

  it('has no stop button while the stop is in flight or when none is offered', () => {
    const { rerender } = render(<ActivityLine startedAt={null} />)
    expect(screen.queryByRole('button')).toBeNull()
    rerender(<ActivityLine startedAt={null} onStop={() => {}} stopping />)
    expect(screen.getByRole('button')).toBeDisabled()
  })
})

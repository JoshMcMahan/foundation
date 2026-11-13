// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { type StreamEffect, type TranscriptState, turnRunning } from './transcript'
import type { SessionDetail, SessionHistoryItem, SessionImageRef } from './types'
import {
  type SessionSendResult,
  type SessionSteerResult,
  type SessionWithdrawResult,
  useSessionTranscript,
} from './useTranscript'

const idle: SessionDetail = { status: 'idle', history: [], lastSeq: 0 }

function setup(send: (text: string) => Promise<SessionSendResult>) {
  const effects: StreamEffect[] = []
  const hook = renderHook(() =>
    useSessionTranscript({
      detail: idle,
      send,
      onEffect: (e) => effects.push(e),
    }),
  )
  return { hook, effects }
}

describe('useSessionTranscript', () => {
  it('shows a sent message at once and keeps it when the daemon accepts', async () => {
    const { hook } = setup(async () => ({ turnId: 't1' }))
    let refusal: string | null = 'unset'
    await act(async () => {
      refusal = await hook.result.current.sendMessage('hello')
    })
    expect(refusal).toBeNull()
    expect(hook.result.current.transcript?.messages.map((m) => m.content)).toEqual(['hello'])
    expect(hook.result.current.sending).toBe(false)
  })

  it('does not repeat its own message when the daemon echoes the turn', async () => {
    const { hook } = setup(async () => ({ turnId: 't1' }))
    await act(async () => {
      await hook.result.current.sendMessage('hello')
    })
    act(() => {
      hook.result.current.onEvent({
        seq: 1,
        type: 'user_message',
        content: 'hello',
        turnId: 't1',
      })
    })
    const users = [...(hook.result.current.transcript?.messages ?? [])].filter(
      (m) => m.role === 'user',
    )
    expect(users).toHaveLength(1)
  })

  it('drops a refused message and returns the refusal', async () => {
    const { hook } = setup(async () => ({ error: 'machine said no' }))
    let refusal: string | null = null
    await act(async () => {
      refusal = await hook.result.current.sendMessage('hello')
    })
    expect(refusal).toBe('machine said no')
    expect(hook.result.current.transcript?.messages).toEqual([])
    expect(turnRunning(hook.result.current.transcript)).toBe(false)
  })

  it('runs the turn while the daemon has yet to take the message', async () => {
    let accept: (result: SessionSendResult) => void = () => {}
    const { hook } = setup(
      () =>
        new Promise((resolve) => {
          accept = resolve
        }),
    )
    let sent: Promise<string | null> | undefined
    await act(async () => {
      sent = hook.result.current.sendMessage('hello')
    })
    expect(hook.result.current.sending).toBe(true)
    expect(turnRunning(hook.result.current.transcript)).toBe(true)

    await act(async () => {
      accept({ turnId: 't1' })
      await sent
    })
    expect(turnRunning(hook.result.current.transcript)).toBe(true)
  })

  it('reports the last applied seq as the resume cursor', () => {
    const { hook } = setup(async () => ({}))
    expect(hook.result.current.cursor()).toBe(0)
    act(() => {
      hook.result.current.onEvent({ seq: 7, type: 'chunk', content: 'a' })
    })
    expect(hook.result.current.cursor()).toBe(7)
  })

  it('never moves the cursor back when a refetch lags the stream', () => {
    const hook = renderHook(
      ({ detail }) =>
        useSessionTranscript({
          detail,
          send: async () => ({}),
          onEffect: () => {},
        }),
      { initialProps: { detail: idle } },
    )
    act(() => {
      hook.result.current.onEvent({ seq: 7, type: 'chunk', content: 'a' })
    })
    hook.rerender({ detail: { ...idle, history: [], lastSeq: 3 } })
    expect(hook.result.current.cursor()).toBe(7)
    expect(hook.result.current.transcript?.cursor).toBe(7)
  })

  describe('a refetch answered mid-turn', () => {
    const earlier: SessionHistoryItem[] = [{ kind: 'assistant', text: 'earlier reply' }]
    const shown = (transcript: TranscriptState | null) =>
      [
        ...(transcript?.messages ?? []),
        ...(transcript?.streaming ? [transcript.streaming] : []),
      ].map((m) =>
        m.role === 'user'
          ? m.content
          : (m.parts ?? []).map((p) => ('text' in p ? p.text : '')).join(''),
      )

    function resumeInactive(onEffect: (e: StreamEffect) => void = () => {}) {
      return renderHook(
        ({ detail }) =>
          useSessionTranscript({
            detail,
            send: async () => ({ turnId: 't1' }),
            onEffect,
          }),
        {
          initialProps: {
            detail: { status: 'idle', history: earlier } as SessionDetail,
          },
        },
      )
    }

    it('keeps a sent message the snapshot predates', async () => {
      const hook = resumeInactive()
      await act(async () => {
        await hook.result.current.sendMessage('did you make a pr')
      })
      hook.rerender({
        detail: { status: 'running', history: earlier, lastSeq: 100 },
      })
      act(() => {
        const { onEvent } = hook.result.current
        onEvent({
          seq: 101,
          type: 'user_message',
          turnId: 't1',
          content: 'did you make a pr',
        })
        onEvent({ seq: 102, type: 'chunk', content: 'No.' })
        onEvent({ seq: 103, type: 'done' })
      })
      expect(shown(hook.result.current.transcript)).toEqual([
        'earlier reply',
        'did you make a pr',
        'No.',
      ])
    })

    it('keeps frames that streamed before the snapshot arrived', async () => {
      const hook = resumeInactive()
      await act(async () => {
        await hook.result.current.sendMessage('did you make a pr')
      })
      act(() => {
        const { onEvent } = hook.result.current
        onEvent({
          seq: 101,
          type: 'user_message',
          turnId: 't1',
          content: 'did you make a pr',
        })
        onEvent({ seq: 102, type: 'chunk', content: 'No.' })
        onEvent({ seq: 103, type: 'done' })
      })
      hook.rerender({
        detail: { status: 'running', history: earlier, lastSeq: 100 },
      })
      expect(shown(hook.result.current.transcript)).toEqual([
        'earlier reply',
        'did you make a pr',
        'No.',
      ])
      expect(hook.result.current.cursor()).toBe(103)
    })

    it('keeps a sent message when a read from disk lands after the session it woke', async () => {
      const effects: StreamEffect[] = []
      const hook = resumeInactive((e) => effects.push(e))
      await act(async () => {
        await hook.result.current.sendMessage('merged it')
      })
      act(() => {
        const { onEvent } = hook.result.current
        onEvent({
          seq: 101,
          type: 'user_message',
          turnId: 't1',
          content: 'merged it',
        })
        onEvent({ seq: 102, type: 'chunk', content: 'Checking.' })
      })
      hook.rerender({ detail: { status: 'idle', history: earlier } })
      expect(shown(hook.result.current.transcript)).toEqual([
        'earlier reply',
        'merged it',
        'Checking.',
      ])
      expect(effects).toEqual([{ type: 'refetch' }])

      hook.rerender({
        detail: {
          status: 'running',
          turnId: 't1',
          lastSeq: 102,
          history: [
            ...earlier,
            { kind: 'user', text: 'merged it' },
            { kind: 'assistant', text: 'Checking.' },
          ],
        },
      })
      expect(shown(hook.result.current.transcript)).toEqual([
        'earlier reply',
        'merged it',
        'Checking.',
      ])
    })

    it('seeds from a second read from disk when nothing streamed since the first', () => {
      const effects: StreamEffect[] = []
      const hook = resumeInactive((e) => effects.push(e))
      act(() => {
        const { onEvent } = hook.result.current
        onEvent({ seq: 101, type: 'user_message', content: 'did you?' })
        onEvent({ seq: 102, type: 'chunk', content: 'No.' })
        onEvent({ seq: 103, type: 'done' })
      })
      const read: SessionHistoryItem[] = [
        ...earlier,
        { kind: 'user', text: 'did you?' },
        { kind: 'assistant', text: 'No.' },
        { kind: 'user', text: 'then do' },
        { kind: 'assistant', text: 'Done.' },
      ]
      hook.rerender({ detail: { status: 'idle', history: read } })
      expect(shown(hook.result.current.transcript)).toEqual(['earlier reply', 'did you?', 'No.'])
      hook.rerender({ detail: { status: 'idle', history: read } })
      expect(effects).toEqual([{ type: 'refetch' }])
      expect(shown(hook.result.current.transcript)).toEqual([
        'earlier reply',
        'did you?',
        'No.',
        'then do',
        'Done.',
      ])
    })
  })

  it('keeps a failed prompt and its error when a settings refetch replaces live history', async () => {
    const error = "You've hit your limit"
    const prompt = 'continue the task'
    const hook = renderHook(
      ({ detail }) =>
        useSessionTranscript({
          detail,
          send: async () => ({ turnId: 't1' }),
          onEffect: () => {},
        }),
      { initialProps: { detail: idle } },
    )
    await act(async () => {
      await hook.result.current.sendMessage(prompt)
    })
    act(() => {
      const { onEvent } = hook.result.current
      onEvent({ seq: 1, type: 'user_message', content: prompt, turnId: 't1' })
      onEvent({ seq: 2, type: 'error', content: error, turnId: 't1' })
    })
    const shown = () =>
      hook.result.current.transcript?.messages.map((m) => (m.role === 'user' ? m.content : m.parts))
    expect(shown()).toEqual([prompt, [{ kind: 'error', text: error }]])

    hook.rerender({
      detail: {
        status: 'idle',
        lastSeq: 2,
        history: [
          { kind: 'user', text: prompt },
          { kind: 'error', text: error, turnId: 't1' },
        ],
      },
    })
    expect(shown()).toEqual([prompt, [{ kind: 'error', text: error }]])
    expect(hook.result.current.transcript?.streaming).toBeNull()

    act(() => {
      hook.result.current.onEvent({
        seq: 3,
        type: 'error',
        content: error,
        turnId: 't2',
      })
    })
    expect(shown()).toEqual([
      prompt,
      [{ kind: 'error', text: error }],
      [{ kind: 'error', text: error }],
    ])
  })

  it('hands stream effects to the host', () => {
    const { hook, effects } = setup(async () => ({}))
    act(() => {
      hook.result.current.onEvent({ seq: 5, type: 'replay_truncated' })
    })
    expect(effects).toEqual([{ type: 'refetch' }])
  })
})

describe('useSessionTranscript while a turn runs', () => {
  function running(steer: (text: string) => Promise<SessionSteerResult>) {
    const send = vi.fn(async (_text: string): Promise<SessionSendResult> => ({ turnId: 't2' }))
    const hook = renderHook(() =>
      useSessionTranscript({ detail: idle, send, steer, onEffect: () => {} }),
    )
    act(() => {
      hook.result.current.onEvent({ seq: 1, type: 'chunk', content: 'working' })
    })
    return { hook, send }
  }

  it('steers plain text into the turn instead of queueing a turn', async () => {
    const steer = vi.fn(async () => ({ delivered: true }))
    const { hook, send } = running(steer)
    await act(async () => {
      await hook.result.current.sendMessage('also the docs')
    })
    expect(steer).toHaveBeenCalledWith('also the docs', undefined, undefined)
    expect(send).not.toHaveBeenCalled()
    expect(hook.result.current.transcript?.steered.map((m) => m.content)).toEqual(['also the docs'])
    expect(hook.result.current.transcript?.queued).toEqual([])
  })

  it('queues a turn when no turn took the text, or steering failed', async () => {
    for (const answer of [{ delivered: false }, { error: 'not found' }]) {
      const { hook, send } = running(async () => answer)
      await act(async () => {
        await hook.result.current.sendMessage('also the docs')
      })
      expect(send).toHaveBeenCalledWith('also the docs', undefined, undefined)
      expect(hook.result.current.transcript?.steered).toEqual([])
      expect(hook.result.current.transcript?.queued.map((m) => m.content)).toEqual([
        'also the docs',
      ])
    }
  })

  it('refuses instead of sending again when a steer got no answer', async () => {
    const { hook, send } = running(async () => ({ lost: 'connection lost' }))
    let refusal: string | null = null
    await act(async () => {
      refusal = await hook.result.current.sendMessage('also the docs')
    })
    expect(refusal).toBe('connection lost')
    expect(send).not.toHaveBeenCalled()
    expect(hook.result.current.sending).toBe(false)
    expect(hook.result.current.transcript?.steered).toEqual([])
  })

  it('sends commands and shell escapes as turns of their own, as the terminal does', async () => {
    const steer = vi.fn(async () => ({ delivered: true }))
    const { hook, send } = running(steer)
    await act(async () => {
      await hook.result.current.sendMessage('/compact')
      await hook.result.current.sendMessage('!ls')
      await hook.result.current.sendMessage('  /review')
    })
    expect(steer).not.toHaveBeenCalled()
    expect(send).toHaveBeenCalledTimes(3)
  })

  it('steers the images a message names along with its text', async () => {
    const steer = vi.fn(async () => ({ delivered: true }))
    const { hook, send } = running(steer)
    const images: SessionImageRef[] = [
      { placeholder: '[Image #1]', path: '/c/image-1.png', mime: 'image/png' },
    ]
    await act(async () => {
      await hook.result.current.sendMessage('this one [Image #1]', { images })
    })
    expect(steer).toHaveBeenCalledWith('this one [Image #1]', undefined, images)
    expect(send).not.toHaveBeenCalled()
  })

  describe('showing the images it sent', () => {
    const images: SessionImageRef[] = [
      { placeholder: '[Image #1]', path: '/c/image-1.png', mime: 'image/png' },
    ]
    const previews = [{ mime: 'image/png', data: 'iVBORw0KGgo=' }]
    const local = 'data:image/png;base64,iVBORw0KGgo='

    it('shows them on a steered message before the model is handed it', async () => {
      const { hook } = running(async () => ({ delivered: true }))
      await act(async () => {
        await hook.result.current.sendMessage('this one [Image #1]', {
          images,
          previews,
        })
      })
      expect(hook.result.current.transcript?.steered).toMatchObject([
        { attachments: [{ previewUrl: local }] },
      ])
    })

    it('shows them on a message queued behind the turn', async () => {
      const { hook } = running(async () => ({ delivered: true }))
      await act(async () => {
        await hook.result.current.sendMessage('this one [Image #1]', {
          steer: false,
          images,
          previews,
        })
      })
      expect(hook.result.current.transcript?.queued).toMatchObject([
        { attachments: [{ previewUrl: local }] },
      ])
    })

    it('keeps them on a message that falls back to a turn of its own', async () => {
      const { hook } = running(async () => ({ delivered: false }))
      await act(async () => {
        await hook.result.current.sendMessage('this one [Image #1]', {
          images,
          previews,
        })
      })
      expect(hook.result.current.transcript?.queued).toMatchObject([
        { attachments: [{ previewUrl: local }] },
      ])
    })

    it('keeps them through a refetch that predates the echo', async () => {
      const hook = renderHook(
        ({ detail }) =>
          useSessionTranscript({
            detail,
            send: async () => ({ turnId: 't2' }),
            steer: async () => ({ delivered: true }),
            onEffect: () => {},
          }),
        { initialProps: { detail: idle } },
      )
      act(() => {
        hook.result.current.onEvent({ seq: 1, type: 'chunk', content: 'hm' })
      })
      await act(async () => {
        await hook.result.current.sendMessage('this one [Image #1]', {
          images,
          previews,
        })
      })
      hook.rerender({ detail: { status: 'running', history: [], lastSeq: 1 } })
      expect(hook.result.current.transcript?.steered).toMatchObject([
        { attachments: [{ previewUrl: local }] },
      ])
    })

    it('gives way to the previews the echo brings', async () => {
      const { hook } = running(async () => ({ delivered: true }))
      await act(async () => {
        await hook.result.current.sendMessage('this one [Image #1]', {
          images,
          previews,
        })
      })
      act(() => {
        hook.result.current.onEvent({
          seq: 2,
          type: 'user_note',
          content: 'this one [Image #1]',
          images: [{ mime: 'image/jpeg', data: '/9j/' }],
        })
      })
      const { notes, steered } = hook.result.current.transcript!
      expect(steered).toEqual([])
      expect(notes).toHaveLength(1)
      expect(notes[0]?.attachments).toHaveLength(1)
      expect(notes[0]?.attachments).toMatchObject([{ previewUrl: 'data:image/jpeg;base64,/9j/' }])
    })

    it('keeps them when the echo brings none', async () => {
      const { hook } = running(async () => ({ delivered: true }))
      await act(async () => {
        await hook.result.current.sendMessage('this one [Image #1]', {
          images,
          previews,
        })
      })
      act(() => {
        hook.result.current.onEvent({
          seq: 2,
          type: 'user_note',
          content: 'this one [Image #1]',
        })
      })
      expect(hook.result.current.transcript?.notes).toMatchObject([
        { attachments: [{ previewUrl: local }] },
      ])
    })

    it('sends the machine only the references, never the previews', async () => {
      const steer = vi.fn(async () => ({ delivered: true }))
      const { hook } = running(steer)
      await act(async () => {
        await hook.result.current.sendMessage('this one [Image #1]', {
          images,
          previews,
        })
      })
      expect(steer).toHaveBeenCalledWith('this one [Image #1]', undefined, images)
    })
  })

  it('keeps a prompt a command resolved to out of the running turn', async () => {
    const steer = vi.fn(async () => ({ delivered: true }))
    const { hook, send } = running(steer)
    await act(async () => {
      await hook.result.current.sendMessage('draft the plan', { steer: false })
    })
    expect(steer).not.toHaveBeenCalled()
    expect(send).toHaveBeenCalledWith('draft the plan', undefined, undefined)
  })

  it('steers the pastes a message names along with its text', async () => {
    const steer = vi.fn(async () => ({ delivered: true }))
    const { hook } = running(steer)
    const paste = {
      placeholder: '[Pasted text #1 +900 lines]',
      id: 1,
      lines: 900,
      bytes: 90_000,
    }
    await act(async () => {
      await hook.result.current.sendMessage(`also ${paste.placeholder}`, {
        pastes: [paste],
      })
    })
    expect(steer).toHaveBeenCalledWith(`also ${paste.placeholder}`, [paste], undefined)
    expect(hook.result.current.transcript?.steered[0]?.pastes).toEqual([paste])
  })

  it('does not bring back queued messages an interrupt discarded when the page refetches', async () => {
    const hook = renderHook(
      ({ detail }) =>
        useSessionTranscript({
          detail,
          send: async () => ({ turnId: 't2', queued: true }),
          onEffect: () => {},
        }),
      { initialProps: { detail: idle } },
    )
    act(() => {
      hook.result.current.onEvent({ seq: 1, type: 'chunk', content: 'working' })
    })
    await act(async () => {
      await hook.result.current.sendMessage('second')
    })
    act(() => {
      hook.result.current.onEvent({
        seq: 2,
        type: 'notice',
        content: 'interrupted: discarded 1 queued message(s)',
      })
      hook.result.current.onEvent({
        seq: 3,
        type: 'error',
        content: 'stream error: context canceled',
      })
    })
    hook.rerender({
      detail: {
        status: 'idle',
        history: [{ kind: 'assistant', text: 'working' }],
        lastSeq: 3,
      },
    })
    const transcript = hook.result.current.transcript
    expect(transcript?.queued).toEqual([])
    expect(transcript?.messages.some((m) => m.content === 'second')).toBe(false)
  })
})

describe('useSessionTranscript before the page sees a turn start', () => {
  it('queues a message the daemon queued, though the page showed no turn', async () => {
    const replies: SessionSendResult[] = [
      { turnId: 't1', queued: false },
      { turnId: 't2', queued: true },
    ]
    const hook = renderHook(() =>
      useSessionTranscript({
        detail: idle,
        send: async () => replies.shift() ?? {},
        onEffect: () => {},
      }),
    )
    await act(async () => {
      await hook.result.current.sendMessage('first')
      await hook.result.current.sendMessage('second')
    })
    expect(hook.result.current.transcript?.messages.map((m) => m.content)).toEqual(['first'])
    expect(hook.result.current.transcript?.queued.map((m) => m.content)).toEqual(['second'])
  })

  it('leaves a message in place when its turn started before the reply said it was queued', async () => {
    let reply: (result: SessionSendResult) => void = () => {}
    const hook = renderHook(() =>
      useSessionTranscript({
        detail: idle,
        send: () =>
          new Promise<SessionSendResult>((resolve) => {
            reply = resolve
          }),
        onEffect: () => {},
      }),
    )
    let sent: Promise<string | null> = Promise.resolve(null)
    await act(async () => {
      sent = hook.result.current.sendMessage('second')
    })
    act(() => {
      hook.result.current.onEvent({
        seq: 1,
        type: 'user_message',
        content: 'second',
        turnId: 't2',
      })
    })
    await act(async () => {
      reply({ turnId: 't2', queued: true })
      await sent
    })
    expect(hook.result.current.transcript?.queued).toEqual([])
    expect(hook.result.current.transcript?.messages.map((m) => m.content)).toEqual(['second'])
  })
})

describe('useSessionTranscript taking back a queued message', () => {
  function queuedBehindTurn(withdraw: (turnId: string) => Promise<SessionWithdrawResult>) {
    const hook = renderHook(() =>
      useSessionTranscript({
        detail: idle,
        send: async () => ({ turnId: 'tn-2' }),
        withdraw,
        onEffect: () => {},
      }),
    )
    act(() => {
      hook.result.current.onEvent({ seq: 1, type: 'chunk', content: 'working' })
    })
    return hook
  }
  const queuedId = (hook: ReturnType<typeof queuedBehindTurn>) =>
    hook.result.current.transcript?.queued[0]?.id ?? ''

  it('removes it by the turn it was accepted as', async () => {
    const withdraw = vi.fn(async () => ({}))
    const hook = queuedBehindTurn(withdraw)
    await act(async () => {
      await hook.result.current.sendMessage('second')
    })
    const id = queuedId(hook)
    expect(hook.result.current.canRemoveQueued(id)).toBe(true)
    let refusal: string | null = 'unset'
    await act(async () => {
      refusal = await hook.result.current.removeQueued(id)
    })
    expect(refusal).toBeNull()
    expect(withdraw).toHaveBeenCalledWith('tn-2')
    expect(hook.result.current.transcript?.queued).toEqual([])
  })

  it('keeps it when its turn started first, and lets the echo place it', async () => {
    const hook = queuedBehindTurn(async () => ({
      error: 'its turn has started',
    }))
    await act(async () => {
      await hook.result.current.sendMessage('second')
    })
    const id = queuedId(hook)
    let refusal: string | null = null
    await act(async () => {
      refusal = await hook.result.current.removeQueued(id)
    })
    expect(refusal).toBe('its turn has started')
    act(() => {
      hook.result.current.onEvent({ seq: 2, type: 'done' })
      hook.result.current.onEvent({
        seq: 3,
        type: 'user_message',
        content: 'second',
        turnId: 'tn-2',
      })
    })
    expect(hook.result.current.transcript?.queued).toEqual([])
    expect(hook.result.current.transcript?.messages.map((m) => m.content)).toContain('second')
  })

  it('offers nothing to take back for a message that was not queued', async () => {
    const hook = renderHook(() =>
      useSessionTranscript({
        detail: idle,
        send: async () => ({ turnId: 'tn-1' }),
        withdraw: async () => ({}),
        onEffect: () => {},
      }),
    )
    await act(async () => {
      await hook.result.current.sendMessage('hello')
    })
    const sent = hook.result.current.transcript?.messages[0]?.id ?? ''
    expect(hook.result.current.canRemoveQueued(sent)).toBe(false)
  })
})

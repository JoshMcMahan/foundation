import { useCallback, useEffect, useRef, useState } from 'react'
import type { MessagePaste } from '../types'
import {
  appendOwnMessage,
  appendShellRun,
  appendSteeredMessage,
  applyStreamEvent,
  type CompactionNotice,
  dropMessage,
  type GoalNotice,
  type ImageUrl,
  initialTranscript,
  markQueued,
  pendingMessages,
  type RecapNotice,
  resolveApprovalEverywhere,
  type StreamEffect,
  type TranscriptState,
  type TranscriptWords,
  turnRunning,
} from './transcript'
import type { SessionDetail, SessionImage, SessionImageRef, SessionStreamEvent } from './types'

export type SessionSendResult =
  | { turnId?: string | undefined; queued?: boolean | undefined }
  | { error: string }

/** lost: no answer came, so the direction may have reached the turn. */
export type SessionSteerResult = { delivered: boolean } | { error: string } | { lost: string }

export type SessionWithdrawResult = { error?: string }

interface Unechoed {
  text: string
  pastes?: MessagePaste[] | undefined
  previews?: SessionImage[] | undefined
  turnId?: string
  /** Steered into the running turn; its echo is the user_note, not a turn. */
  steered?: boolean
}

// Bounds the frames kept for re-applying over a refetch; a turn's frames
// between two snapshots stay far below it.
const MAX_REPLAY_FRAMES = 5000

/** Matches the way the echo is recognised: by turn once the send has named it,
 *  by text before then. */
function echoedSend(unechoed: Map<string, Unechoed>, ev: SessionStreamEvent): string | undefined {
  if (ev.type !== 'user_message' && ev.type !== 'user_note') {
    return undefined
  }
  const steered = ev.type === 'user_note'
  for (const [localId, sent] of unechoed) {
    if (!!sent.steered !== steered) {
      continue
    }
    const echoed = sent.turnId ? sent.turnId === ev.turnId : sent.text === ev.content
    if (echoed) {
      return localId
    }
  }
  return undefined
}

/** Discarded, or placed by an older daemon's turn end: no echo is coming. */
function forgetSettled(
  unechoed: Map<string, Unechoed>,
  before: TranscriptState,
  after: TranscriptState,
) {
  const count = (s: TranscriptState) => s.notes.length + s.steered.length + s.queued.length
  if (count(after) >= count(before)) {
    return
  }
  const still = new Set(pendingMessages(after).map((m) => m.id))
  for (const m of pendingMessages(before)) {
    if (!still.has(m.id)) {
      unechoed.delete(m.id)
    }
  }
}

interface SendOptions {
  steer?: boolean
  pastes?: MessagePaste[] | undefined
  images?: SessionImageRef[] | undefined
  /** Drawn on the message until its echo brings the daemon's; a note can wait a whole tool call for that. */
  previews?: SessionImage[] | undefined
}

/** Holds the live transcript for one session. The host still owns the socket
 *  and the fetch: it feeds events to `onEvent` and posts through `send`. */
export function useSessionTranscript({
  sessionId,
  detail,
  send,
  steer,
  withdraw,
  onEffect,
  goalNotice,
  compactionNotice,
  recapNotice,
  words,
  imageUrl,
}: {
  /** The session shown, so frames from the conversation it cleared are dropped. */
  sessionId?: string | undefined
  detail: SessionDetail | undefined
  send: (
    text: string,
    pastes?: MessagePaste[],
    images?: SessionImageRef[],
  ) => Promise<SessionSendResult>
  /** Hands text to the running turn, as typing into a busy terminal does. */
  steer?: (
    text: string,
    pastes?: MessagePaste[],
    images?: SessionImageRef[],
  ) => Promise<SessionSteerResult>
  /** Takes back a queued message, by the turn it was accepted as. */
  withdraw?: (turnId: string) => Promise<SessionWithdrawResult>
  onEffect: (effect: StreamEffect) => void
  goalNotice?: GoalNotice
  compactionNotice?: CompactionNotice
  recapNotice?: RecapNotice
  words?: TranscriptWords
  imageUrl?: ImageUrl
}): {
  transcript: TranscriptState | null
  sending: boolean
  onEvent: (ev: SessionStreamEvent) => void
  /** Resolves to the refusal, or null once accepted; `steer: false` queues it. */
  sendMessage: (text: string, options?: SendOptions) => Promise<string | null>
  resolveApproval: (approvalId: string) => void
  noteShellRun: (command: string, output: string) => void
  /** Queued messages the daemon has named a turn for can be taken back. */
  canRemoveQueued: (id: string) => boolean
  /** Resolves to the refusal, or null once the message is gone. */
  removeQueued: (id: string) => Promise<string | null>
  /** Where a reconnect resumes from: the last seq applied, read outside render. */
  cursor: () => number
} {
  const [transcript, setTranscript] = useState<TranscriptState | null>(null)
  // The socket handler reads the ref outside React's render.
  const transcriptRef = useRef<TranscriptState | null>(null)
  const [sending, setSending] = useState(false)
  // The daemon echoes our own send back, and the echo can beat the response
  // that names the turn, so the text is remembered as well as the id.
  const ownTurnIds = useRef<Set<string>>(new Set())
  const ownTexts = useRef<Set<string>>(new Set())
  const ownSeq = useRef(0)
  // Sends the daemon has not echoed yet, and frames applied since the last
  // snapshot: a refetch answered mid-turn predates both, so seeding from it
  // alone would erase the message just sent and whatever streamed after it.
  const unechoed = useRef<Map<string, Unechoed>>(new Map())
  const appliedSinceSeed = useRef<SessionStreamEvent[]>([])
  const sendRef = useRef(send)
  const steerRef = useRef(steer)
  const withdrawRef = useRef(withdraw)
  const onEffectRef = useRef(onEffect)
  sendRef.current = send
  steerRef.current = steer
  withdrawRef.current = withdraw
  onEffectRef.current = onEffect
  const goalNoticeRef = useRef(goalNotice)
  goalNoticeRef.current = goalNotice
  const compactionNoticeRef = useRef(compactionNotice)
  compactionNoticeRef.current = compactionNotice
  const recapNoticeRef = useRef(recapNotice)
  recapNoticeRef.current = recapNotice
  const wordsRef = useRef(words)
  wordsRef.current = words
  const imageUrlRef = useRef(imageUrl)
  imageUrlRef.current = imageUrl

  useEffect(() => {
    if (!detail) {
      return
    }
    // A read from disk (no lastSeq) can predate the session a message adopted
    // since; seeding from it would erase the frames applied after, its echo too.
    const { lastSeq } = detail
    if (lastSeq === undefined && appliedSinceSeed.current.length > 0) {
      appliedSinceSeed.current = []
      onEffectRef.current({ type: 'refetch' })
      return
    }
    let next = initialTranscript(detail, {
      goalNotice: goalNoticeRef.current,
      compactionNotice: compactionNoticeRef.current,
      recapNotice: recapNoticeRef.current,
      words: wordsRef.current,
      imageUrl: imageUrlRef.current,
    })
    const replay = appliedSinceSeed.current.filter((ev) => ev.seq > (lastSeq ?? 0))
    appliedSinceSeed.current = replay
    for (const ev of replay) {
      // Replayed without the own-message sets: the seed has no optimistic copy
      // for an echo to stand in for.
      next = applyStreamEvent(next, ev, {
        goalNotice: goalNoticeRef.current,
        recapNotice: recapNoticeRef.current,
        words: wordsRef.current,
        imageUrl: imageUrlRef.current,
      }).state
    }
    for (const [localId, sent] of unechoed.current) {
      const { text, pastes, previews, steered } = sent
      next = steered
        ? appendSteeredMessage(next, text, localId, pastes, previews)
        : appendOwnMessage(next, text, localId, pastes, previews)
    }
    // A refetch can report a lastSeq behind frames already applied; resuming
    // from it would replay them.
    const cursor = Math.max(next.cursor, transcriptRef.current?.cursor ?? 0)
    next = cursor === next.cursor ? next : { ...next, cursor }
    transcriptRef.current = next
    setTranscript(next)
  }, [detail])

  const apply = useCallback((change: (state: TranscriptState) => TranscriptState) => {
    const current = transcriptRef.current
    if (!current) {
      return
    }
    const next = change(current)
    transcriptRef.current = next
    setTranscript(next)
  }, [])

  const onEvent = useCallback(
    (ev: SessionStreamEvent) => {
      const current = transcriptRef.current
      if (!current) {
        return
      }
      const echoOf = echoedSend(unechoed.current, ev)
      const { state, effects } = applyStreamEvent(current, ev, {
        ownTurnIds: ownTurnIds.current,
        ownTexts: ownTexts.current,
        sessionId,
        echoOf,
        goalNotice: goalNoticeRef.current,
        recapNotice: recapNoticeRef.current,
        words: wordsRef.current,
        imageUrl: imageUrlRef.current,
      })
      if (ev.type === 'replay_truncated') {
        appliedSinceSeed.current = []
      } else if (state.cursor > current.cursor) {
        appliedSinceSeed.current.push(ev)
        if (appliedSinceSeed.current.length > MAX_REPLAY_FRAMES) {
          appliedSinceSeed.current.shift()
        }
        if (echoOf) {
          unechoed.current.delete(echoOf)
        }
        forgetSettled(unechoed.current, current, state)
      }
      apply(() => state)
      for (const effect of effects) {
        onEffectRef.current(effect)
      }
    },
    [apply, sessionId],
  )

  /** True once the running turn took the text, or the refusal if it may have.
   *  Commands and shell escapes change the next turn, so like the terminal client they wait. */
  const trySteer = useCallback(
    async (text: string, { pastes, images, previews }: SendOptions) => {
      const steerTo = steerRef.current
      if (!steerTo || !turnRunning(transcriptRef.current) || /^[/!]/.test(text.trimStart())) {
        return false
      }
      ownSeq.current += 1
      const localId = `own-${ownSeq.current}`
      unechoed.current.set(localId, { text, pastes, previews, steered: true })
      apply((state) => appendSteeredMessage(state, text, localId, pastes, previews))
      const result = await steerTo(text, pastes, images)
      if ('delivered' in result && result.delivered) {
        return true
      }
      // No turn took it (it ended, or the daemon predates steering): it runs
      // as a turn of its own instead.
      unechoed.current.delete(localId)
      apply((state) => dropMessage(state, localId))
      // A turn of its own could run a direction that did land a second time.
      return 'lost' in result ? result.lost : false
    },
    [apply],
  )

  const sendMessage = useCallback(
    async (text: string, options: SendOptions = {}) => {
      const { pastes, images, previews } = options
      setSending(true)
      const steered = options.steer !== false && (await trySteer(text, options))
      if (steered) {
        setSending(false)
        return steered === true ? null : steered
      }
      ownTexts.current.add(text)
      ownSeq.current += 1
      const localId = `own-${ownSeq.current}`
      unechoed.current.set(localId, { text, pastes, previews })
      apply((state) => appendOwnMessage(state, text, localId, pastes, previews))
      const result = await sendRef.current(text, pastes, images)
      setSending(false)
      if ('error' in result) {
        // No echo is coming, and the text left in the set would swallow the
        // echo of the same words typed later in the terminal.
        ownTexts.current.delete(text)
        unechoed.current.delete(localId)
        apply((state) => dropMessage(state, localId))
        return result.error
      }
      // An echo that beat this response already placed the message.
      if (result.queued && unechoed.current.has(localId)) {
        apply((state) => markQueued(state, localId))
      }
      if (result.turnId) {
        ownTurnIds.current.add(result.turnId)
        ownTexts.current.delete(text)
        const pending = unechoed.current.get(localId)
        if (pending) {
          pending.turnId = result.turnId
        }
      }
      return null
    },
    [apply, trySteer],
  )

  const resolveApproval = useCallback(
    (approvalId: string) => apply((state) => resolveApprovalEverywhere(state, approvalId)),
    [apply],
  )

  const noteShellRun = useCallback(
    (command: string, output: string) => apply((state) => appendShellRun(state, command, output)),
    [apply],
  )

  const queuedTurn = useCallback((id: string) => {
    const sent = unechoed.current.get(id)
    const queued = transcriptRef.current?.queued.some((m) => m.id === id)
    return sent && !sent.steered && queued ? sent.turnId : undefined
  }, [])

  const canRemoveQueued = useCallback(
    (id: string) => !!withdrawRef.current && !!queuedTurn(id),
    [queuedTurn],
  )

  const removeQueued = useCallback(
    async (id: string) => {
      const turnId = queuedTurn(id)
      const withdrawFrom = withdrawRef.current
      if (!turnId || !withdrawFrom) {
        return null
      }
      const result = await withdrawFrom(turnId)
      if (result.error) {
        // Its turn started first; the echo brings it into the transcript.
        return result.error
      }
      unechoed.current.delete(id)
      ownTurnIds.current.delete(turnId)
      apply((state) => dropMessage(state, id))
      return null
    },
    [apply, queuedTurn],
  )

  const cursor = useCallback(() => transcriptRef.current?.cursor ?? 0, [])

  return {
    transcript,
    sending,
    onEvent,
    sendMessage,
    resolveApproval,
    noteShellRun,
    canRemoveQueued,
    removeQueued,
    cursor,
  }
}

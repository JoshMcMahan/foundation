import { useCallback, useEffect, useRef } from 'react'
import type { MessagePart } from '../types'
import type { ChatAction } from './chatReducer'

interface BackgroundStream {
  content: string
  reasoning: string
  parts: MessagePart[]
  messageId: string | null
  isActive: boolean
}

interface UseSSEStreamResult {
  /** Feed a chunk of text into the animation buffer */
  onStreamingChunk: (chunk: string) => void
  /** Start the animation loop for a conversation */
  startStreaming: (conversationId: string) => void
  /** Stop the animation loop, flush remaining content */
  stopAnimationLoop: () => { unrevealed: string }
  /** Resolves once the buffered text has been revealed, or after maxMs */
  drainReveal: (maxMs?: number) => Promise<void>
  /** Runs fn once the text received so far has been revealed */
  afterReveal: (fn: () => void) => void
  /** Reset all animation refs (used when navigating away) */
  resetAnimationRefs: () => void
  /** Ref to the target content buffer */
  targetStreamContentRef: React.RefObject<string>
  /** Ref tracking whether streaming is active */
  streamActiveRef: React.MutableRefObject<boolean>
  /** Ref tracking which conversation is being streamed */
  streamingConversationIdRef: React.MutableRefObject<string | null>
  /** Per-conversation background stream storage */
  backgroundStreamsRef: React.MutableRefObject<Map<string, BackgroundStream>>
  /** AbortController ref for canceling fetch requests */
  abortControllerRef: React.MutableRefObject<AbortController | null>
}

// Tokens arrive in bursts, so text is buffered and revealed a little every
// frame. The rate follows the backlog: it never falls below MIN_CHARS_PER_MS,
// and otherwise reveals what is waiting over about CATCH_UP_MS, so a fast
// model is tracked closely and the end of a reply never lands in one frame.
const MIN_CHARS_PER_MS = 0.12
const CATCH_UP_MS = 300
// At most one dispatch per ~60Hz frame; a 120Hz display reveals on every
// other frame, with the elapsed time measured from the last reveal.
const MIN_DISPATCH_MS = 15

// How far a reveal may run on to finish the word it stopped in. A word shown
// half-way wraps to the next line once it grows past the edge; revealed
// whole, it lands where it stays.
const WORD_RUN_ON = 16

/** Moves a reveal boundary to the end of the word it falls in, when that end is near. */
export function toWordEnd(text: string, end: number): number {
  if (end >= text.length || /\s/.test(text[end - 1] ?? ' ')) {
    return end
  }
  const limit = Math.min(text.length, end + WORD_RUN_ON)
  for (let i = end; i < limit; i++) {
    if (/\s/.test(text[i] ?? '')) {
      return i
    }
  }
  return end
}

/** Characters to reveal after dt ms with remaining characters buffered. */
export function revealCount(remaining: number, dt: number): number {
  if (remaining <= 0) {
    return 0
  }
  const rate = Math.max(MIN_CHARS_PER_MS, remaining / CATCH_UP_MS)
  return Math.min(remaining, Math.max(1, Math.round(rate * dt)))
}

export function useSSEStream(dispatch: React.Dispatch<ChatAction>): UseSSEStreamResult {
  const targetStreamContentRef = useRef('')
  const revealedLengthRef = useRef(0)
  const streamRafRef = useRef<number | null>(null)
  const streamActiveRef = useRef(false)
  const lastRevealTimeRef = useRef(0)
  const drainWaitersRef = useRef<Array<() => void>>([])
  // Work that has to wait for the text before it to show, such as a tool call
  // the model started after a sentence still being revealed.
  const pendingRef = useRef<Array<{ at: number; fn: () => void }>>([])
  // Track which conversation the streaming content is for (prevents cross-conversation pollution)
  const streamingConversationIdRef = useRef<string | null>(null)

  // Per-conversation streaming storage - allows resuming streams when returning to a conversation
  const backgroundStreamsRef = useRef<Map<string, BackgroundStream>>(new Map())

  const abortControllerRef = useRef<AbortController | null>(null)

  const runPending = useCallback((revealed: number) => {
    while (pendingRef.current.length && (pendingRef.current[0]?.at ?? 0) <= revealed) {
      pendingRef.current.shift()?.fn()
    }
  }, [])

  const settleDrain = useCallback(() => {
    const waiters = drainWaitersRef.current
    drainWaitersRef.current = []
    for (const resolve of waiters) {
      resolve()
    }
  }, [])

  const animateStreamContent = useCallback(() => {
    const now = performance.now()
    const target = targetStreamContentRef.current
    const revealed = revealedLengthRef.current
    const remaining = target.length - revealed
    const conversationId = streamingConversationIdRef.current

    if (remaining > 0 && conversationId) {
      if (!lastRevealTimeRef.current) {
        lastRevealTimeRef.current = now - MIN_DISPATCH_MS
      }
      const dt = now - lastRevealTimeRef.current
      if (dt >= MIN_DISPATCH_MS) {
        const newRevealed = toWordEnd(target, revealed + revealCount(remaining, dt))
        revealedLengthRef.current = newRevealed
        dispatch({
          type: 'APPEND_STREAMING_CONTENT',
          content: target.slice(revealed, newRevealed),
          conversationId,
        })
        lastRevealTimeRef.current = now
        runPending(newRevealed)
      }
    }

    const caughtUp = revealedLengthRef.current >= targetStreamContentRef.current.length
    if (caughtUp) {
      settleDrain()
      // A pause in the stream restarts the clock, so the next burst does
      // not arrive as if it had been waiting all along.
      lastRevealTimeRef.current = 0
    }
    if (streamActiveRef.current || !caughtUp) {
      streamRafRef.current = requestAnimationFrame(animateStreamContent)
    } else {
      streamRafRef.current = null
    }
  }, [dispatch, settleDrain, runPending])

  const onStreamingChunk = useCallback(
    (chunk: string) => {
      // Store in background stream regardless of whether UI is active
      // This allows resuming the stream when user returns to the conversation
      const convId = streamingConversationIdRef.current
      if (convId) {
        const bgStream = backgroundStreamsRef.current.get(convId)
        if (bgStream) {
          bgStream.content += chunk
        }
      }

      // Only update UI if streaming is still active for the current view
      // (user may have navigated away)
      if (!streamActiveRef.current) {
        return
      }

      targetStreamContentRef.current += chunk

      if (streamRafRef.current === null) {
        streamRafRef.current = requestAnimationFrame(animateStreamContent)
      }
    },
    [animateStreamContent],
  )

  const startStreaming = useCallback((conversationId: string) => {
    streamingConversationIdRef.current = conversationId
    streamActiveRef.current = true
  }, [])

  const resetAnimationRefs = useCallback(() => {
    streamActiveRef.current = false
    if (streamRafRef.current !== null) {
      cancelAnimationFrame(streamRafRef.current)
      streamRafRef.current = null
    }
    runPending(Number.POSITIVE_INFINITY)
    targetStreamContentRef.current = ''
    revealedLengthRef.current = 0
    lastRevealTimeRef.current = 0
    settleDrain()
  }, [settleDrain, runPending])

  const drainReveal = useCallback((maxMs = 1500) => {
    if (
      streamRafRef.current === null ||
      revealedLengthRef.current >= targetStreamContentRef.current.length
    ) {
      return Promise.resolve()
    }
    return new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, maxMs)
      drainWaitersRef.current.push(() => {
        clearTimeout(timer)
        resolve()
      })
    })
  }, [])

  const afterReveal = useCallback((fn: () => void) => {
    const at = targetStreamContentRef.current.length
    if (
      !streamActiveRef.current ||
      (revealedLengthRef.current >= at && pendingRef.current.length === 0)
    ) {
      fn()
      return
    }
    pendingRef.current.push({ at, fn })
  }, [])

  const stopAnimationLoop = useCallback(() => {
    const unrevealed = targetStreamContentRef.current.slice(revealedLengthRef.current)
    resetAnimationRefs()
    return { unrevealed }
  }, [resetAnimationRefs])

  // Clean up pending rAF on unmount
  useEffect(() => {
    return () => {
      if (streamRafRef.current !== null) {
        cancelAnimationFrame(streamRafRef.current)
      }
    }
  }, [])

  return {
    onStreamingChunk,
    startStreaming,
    stopAnimationLoop,
    drainReveal,
    afterReveal,
    resetAnimationRefs,
    targetStreamContentRef,
    streamActiveRef,
    streamingConversationIdRef,
    backgroundStreamsRef,
    abortControllerRef,
  }
}

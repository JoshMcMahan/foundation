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
  /** AbortController ref for cancelling fetch requests */
  abortControllerRef: React.MutableRefObject<AbortController | null>
}

export function useSSEStream(dispatch: React.Dispatch<ChatAction>): UseSSEStreamResult {
  // Smooth streaming text reveal. LLM APIs send tokens in bursts, so we
  // buffer incoming text and reveal it at a constant linear rate (~240
  // chars/sec). This fills gaps between bursts and creates a steady flow.
  // Dispatches are throttled to ~30fps to avoid excessive React re-renders.
  const targetStreamContentRef = useRef('')
  const revealedLengthRef = useRef(0)
  const streamRafRef = useRef<number | null>(null)
  const streamActiveRef = useRef(false)
  const lastFrameTimeRef = useRef(0)
  const lastDispatchTimeRef = useRef(0)
  // Track which conversation the streaming content is for (prevents cross-conversation pollution)
  const streamingConversationIdRef = useRef<string | null>(null)

  // Per-conversation streaming storage - allows resuming streams when returning to a conversation
  const backgroundStreamsRef = useRef<Map<string, BackgroundStream>>(new Map())

  const abortControllerRef = useRef<AbortController | null>(null)

  const animateStreamContent = useCallback(() => {
    const now = performance.now()
    const target = targetStreamContentRef.current
    const revealed = revealedLengthRef.current
    const remaining = target.length - revealed
    const conversationId = streamingConversationIdRef.current

    // Throttle React dispatches to ~30fps (every 32ms) to avoid
    // excessive re-renders while still looking smooth
    const timeSinceDispatch = now - lastDispatchTimeRef.current
    if (remaining > 0 && timeSinceDispatch >= 32 && conversationId) {
      // Time-based reveal for frame-rate independence
      const dt = lastFrameTimeRef.current ? now - lastFrameTimeRef.current : 32
      // Base rate: 0.24 chars/ms (~240 chars/sec). Enough to keep up with
      // most models while building a small buffer that smooths out pauses.
      // When buffer grows large (model is very fast), increase rate to
      // prevent falling too far behind.
      const charsPerMs = remaining > 360 ? 0.48 : 0.24
      const charsToReveal = Math.min(remaining, Math.max(1, Math.round(charsPerMs * dt)))
      const newRevealed = revealed + charsToReveal
      revealedLengthRef.current = newRevealed
      dispatch({
        type: 'APPEND_STREAMING_CONTENT',
        content: target.slice(revealed, newRevealed),
        conversationId,
      })
      lastDispatchTimeRef.current = now
    }

    lastFrameTimeRef.current = now

    // Keep loop alive while streaming or there's still content to reveal
    if (
      streamActiveRef.current ||
      revealedLengthRef.current < targetStreamContentRef.current.length
    ) {
      streamRafRef.current = requestAnimationFrame(animateStreamContent)
    } else {
      streamRafRef.current = null
      lastFrameTimeRef.current = 0
    }
  }, [dispatch])

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
    targetStreamContentRef.current = ''
    revealedLengthRef.current = 0
    lastFrameTimeRef.current = 0
    lastDispatchTimeRef.current = 0
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
    resetAnimationRefs,
    targetStreamContentRef,
    streamActiveRef,
    streamingConversationIdRef,
    backgroundStreamsRef,
    abortControllerRef,
  }
}

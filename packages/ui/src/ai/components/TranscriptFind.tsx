import {
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { fieldBox } from '../../components/fieldBox'
import { IconButton } from '../../components/IconButton'
import { cx } from '../../cx'
import { ChevronDownIcon, ChevronUpIcon, CloseIcon, SearchIcon } from '../../icons'
import { useChatConfig } from '../core/config'
import { FIND_IN_TRANSCRIPT_EVENT } from '../core/events'
import {
  findRanges,
  firstInView,
  MAX_MATCHES,
  revealRange,
  transcriptOf,
} from '../core/transcriptFind'
import { isMac } from '../utils'

// The ::highlight() names ai.css paints.
const MATCHES = 'transcript-find'
const CURRENT = 'transcript-find-current'

interface Found {
  ranges: Range[]
  current: number
}

// Painted with the CSS Custom Highlight API, so the transcript's DOM, which
// React owns, is never touched. A browser without it still counts and scrolls.
function paint({ ranges, current }: Found) {
  if (typeof CSS === 'undefined' || !('highlights' in CSS)) {
    return
  }
  const shown = ranges[current]
  if (!shown) {
    CSS.highlights.delete(MATCHES)
    CSS.highlights.delete(CURRENT)
    return
  }
  CSS.highlights.set(MATCHES, new Highlight(...ranges.filter((_, i) => i !== current)))
  const highlight = new Highlight(shown)
  highlight.priority = 1
  CSS.highlights.set(CURRENT, highlight)
}

/** Find in the transcript under root: ⌘F or FIND_IN_TRANSCRIPT_EVENT opens it,
 *  and it finds again as the transcript streams. */
export function useTranscriptFind(root: RefObject<HTMLElement | null>, enabled: boolean) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<Found>({ ranges: [], current: 0 })
  const [focusTick, setFocusTick] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const foundRef = useRef(found)

  const show = useCallback(() => {
    if (!inputRef.current) {
      const active = document.activeElement
      returnFocus.current = active instanceof HTMLElement ? active : null
    }
    setOpen(true)
    setFocusTick((n) => n + 1)
  }, [])

  const step = useCallback((by: 1 | -1) => {
    const { ranges, current } = foundRef.current
    const target = (current + by + ranges.length) % ranges.length
    const range = ranges[target]
    if (!range) {
      return
    }
    foundRef.current = { ranges, current: target }
    setFound(foundRef.current)
    revealRange(range)
  }, [])

  useEffect(() => {
    if (!enabled) {
      return
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(isMac() ? e.metaKey : e.ctrlKey) || e.altKey) {
        return
      }
      const key = e.key.toLowerCase()
      // ⇧⌘F is the conversation shortcuts' search, and a dialog keeps its own keys.
      if (
        key === 'f' &&
        !e.shiftKey &&
        !e.defaultPrevented &&
        !document.querySelector('[aria-modal="true"]')
      ) {
        e.preventDefault()
        show()
      } else if (key === 'g' && inputRef.current) {
        e.preventDefault()
        step(e.shiftKey ? -1 : 1)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener(FIND_IN_TRANSCRIPT_EVENT, show)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener(FIND_IN_TRANSCRIPT_EVENT, show)
    }
  }, [enabled, show, step])

  useEffect(() => {
    if (open && focusTick > 0) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [open, focusTick])

  useEffect(() => {
    if (!open) {
      setFound({ ranges: [], current: 0 })
      return
    }
    const transcript = transcriptOf(root.current)
    const ranges = transcript ? findRanges(transcript, query) : []
    const current = firstInView(ranges, transcript)
    setFound({ ranges, current })
    const range = ranges[current]
    if (range) {
      revealRange(range)
    }
  }, [open, query, root])

  // Streaming adds text and a remount replaces it. Find again, keeping the
  // reader's place rather than scrolling them away from what they are reading.
  useEffect(() => {
    const target = root.current
    if (!open || !query.trim() || !target) {
      return
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    const observer = new MutationObserver((records) => {
      const transcript = transcriptOf(target)
      // The bar's own count and the composer change too; only the messages,
      // or a remount above them, can change what matches.
      const changed = records.some(
        (r) => !transcript || transcript.contains(r.target) || r.target.contains(transcript),
      )
      if (timer || !changed) {
        return
      }
      timer = setTimeout(() => {
        timer = undefined
        const scope = transcriptOf(target)
        const ranges = scope ? findRanges(scope, query) : []
        setFound((prev) => ({
          ranges,
          current: Math.min(prev.current, Math.max(ranges.length - 1, 0)),
        }))
      }, 200)
    })
    observer.observe(target, { childList: true, subtree: true, characterData: true })
    return () => {
      observer.disconnect()
      clearTimeout(timer)
    }
  }, [open, query, root])

  // The highlights are the page's, not this view's: only clear what this view painted,
  // so another view mounting or unmounting leaves an open find's matches alone.
  const painted = useRef(false)
  useEffect(() => {
    foundRef.current = found
    if (found.ranges.length > 0 || painted.current) {
      paint(found)
      painted.current = found.ranges.length > 0
    }
  }, [found])
  useEffect(
    () => () => {
      if (painted.current) {
        paint({ ranges: [], current: 0 })
      }
    },
    [],
  )

  const close = useCallback(() => {
    setOpen(false)
    const target = returnFocus.current
    returnFocus.current = null
    if (target?.isConnected) {
      target.focus()
    }
  }, [])
  const next = useCallback(() => step(1), [step])
  const previous = useCallback(() => step(-1), [step])

  return {
    open: enabled && open,
    query,
    setQuery,
    total: found.ranges.length,
    current: found.current,
    next,
    previous,
    close,
    inputRef,
  }
}

export type TranscriptFind = ReturnType<typeof useTranscriptFind>

/** The find bar over the transcript, in line with its column. */
export function TranscriptFindBar({ find }: { find: TranscriptFind }) {
  const { strings } = useChatConfig()
  const t = strings.find
  if (!find.open) {
    return null
  }
  const { total, current } = find
  const count = !find.query.trim()
    ? ''
    : total === 0
      ? t.none
      : (total === MAX_MATCHES ? t.countCapped : t.count)(current + 1, total)

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      // Closes the bar, and only the bar: a running turn keeps going.
      e.preventDefault()
      find.close()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (e.shiftKey) {
        find.previous()
      } else {
        find.next()
      }
    }
  }

  return (
    <search
      aria-label={t.label}
      data-testid="transcript-find"
      className="block border-b theme-border bg-(--theme-panel-bg)"
    >
      <div className="mx-auto flex w-full max-w-[var(--chat-column,50rem)] items-center gap-1 px-4 py-2">
        <label
          className={cx(
            fieldBox({ size: 'sm', within: true, padded: false }),
            'flex flex-1 cursor-text items-center gap-2 px-2',
          )}
        >
          <SearchIcon aria-hidden="true" className="size-3 shrink-0 theme-muted-text" />
          <input
            ref={find.inputRef}
            type="text"
            value={find.query}
            onChange={(e) => find.setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            aria-label={t.label}
            placeholder={t.label}
            autoComplete="off"
            spellCheck={false}
            className="h-full min-w-0 flex-1 bg-transparent outline-none placeholder:text-(--theme-placeholder)"
          />
          <span
            role="status"
            data-testid="transcript-find-count"
            className="shrink-0 tabular-nums theme-muted-text"
          >
            {count}
          </span>
        </label>
        <IconButton
          icon={<ChevronUpIcon />}
          label={t.previous}
          variant="ghost"
          size="sm"
          disabled={total === 0}
          onClick={find.previous}
        />
        <IconButton
          icon={<ChevronDownIcon />}
          label={t.next}
          variant="ghost"
          size="sm"
          disabled={total === 0}
          onClick={find.next}
        />
        <IconButton
          icon={<CloseIcon />}
          label={t.close}
          variant="ghost"
          size="sm"
          onClick={find.close}
        />
      </div>
    </search>
  )
}

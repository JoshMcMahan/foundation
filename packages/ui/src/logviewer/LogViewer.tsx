import cx from 'classnames'
import { DateTime } from 'luxon'
import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useNotify, useOptionalWorkflowEngine, useStrings } from '../components/Provider'
import { TooltipInfo } from '../components/Tooltip'
import type { LogCommand, LogSegment, ProcessedLogLine } from '../engine'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClockIcon,
  CopyIcon,
  DownloadIcon,
  ExpandIcon,
  ShrinkIcon,
  XIcon,
} from '../icons'
import { highlightSegments, parseAnsiSegments, plainSegments } from './segments'

function LogSegments({ segments }: { segments: LogSegment[] }) {
  return segments.map((segment, i) =>
    segment.highlighted ? (
      // biome-ignore lint/suspicious/noArrayIndexKey: segments are positional
      <mark key={i} className={cx('search-highlight', segment.className)}>
        {segment.content}
      </mark>
    ) : segment.className ? (
      // biome-ignore lint/suspicious/noArrayIndexKey: segments are positional
      <span key={i} className={segment.className}>
        {segment.content}
      </span>
    ) : (
      // biome-ignore lint/suspicious/noArrayIndexKey: segments are positional
      <Fragment key={i}>{segment.content}</Fragment>
    ),
  )
}

// Memoized log line component for performance
const LogLine = memo(function LogLine({
  index,
  segments,
  lineNumbers,
  isSelected,
  lineHeight,
  onLineClick,
  searchTerm,
  command,
  groupDepth = 0,
  isGroupCollapsed,
  onGroupToggle,
  annotationLabels,
}: {
  index: number
  segments: LogSegment[]
  lineNumbers: boolean
  isSelected: boolean
  lineHeight: number
  onLineClick: (lineNum: number, e: React.MouseEvent) => void
  searchTerm: string
  command?: LogCommand | undefined
  groupDepth?: number
  isGroupCollapsed?: boolean | undefined
  onGroupToggle?: ((lineIndex: number) => void) | undefined
  annotationLabels: { error: string; warning: string; notice: string }
}) {
  const displaySegments = useMemo(
    () =>
      highlightSegments(command?.message ? plainSegments(command.message) : segments, searchTerm),
    [segments, searchTerm, command],
  )

  const annotationLabel = useMemo(() => {
    if (command?.type === 'error') {
      return <span className="text-red-500 font-semibold mr-1">{annotationLabels.error}</span>
    }
    if (command?.type === 'warning') {
      return <span className="text-yellow-500 font-semibold mr-1">{annotationLabels.warning}</span>
    }
    if (command?.type === 'notice') {
      return <span className="text-blue-500 font-semibold mr-1">{annotationLabels.notice}</span>
    }
    return null
  }, [command?.type, annotationLabels])

  const groupToggle =
    command?.type === 'group' && onGroupToggle
      ? () => {
          // A drag that selects the header text also fires a click on the row.
          if (window.getSelection()?.isCollapsed === false) {
            return
          }
          onGroupToggle(index)
        }
      : null

  const groupToggleProps = groupToggle
    ? {
        role: 'button' as const,
        tabIndex: 0,
        'aria-expanded': !isGroupCollapsed,
        onClick: groupToggle,
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.target !== e.currentTarget) {
            return
          }
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            groupToggle()
          }
        },
      }
    : undefined

  return (
    <div
      data-line-number={index + 1}
      {...groupToggleProps}
      className={cx(
        'flex items-start text-sm font-mono group',
        isSelected ? 'bg-(--theme-link)/15' : 'hover:bg-(--theme-hover)',
        'text-(--theme-app)',
        command?.type === 'error' && 'bg-red-500/10',
        command?.type === 'warning' && 'bg-yellow-500/10',
        command?.type === 'notice' && 'bg-blue-500/10',
        command?.type === 'debug' && 'opacity-60',
        command?.type === 'group' && 'bg-(--theme-hover) cursor-pointer',
      )}
      style={{
        minHeight: `${lineHeight}px`,
        lineHeight: `${lineHeight}px`,
        paddingLeft: groupDepth > 0 ? `${groupDepth * 16}px` : undefined,
      }}
    >
      {lineNumbers && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onLineClick(index + 1, e)
          }}
          className={cx(
            'inline-flex items-center justify-end w-14 pr-3 shrink-0 cursor-pointer select-none',
            'hover:underline hover:text-(--theme-link) transition-colors',
            'text-(--theme-muted-text-color)',
            isSelected && 'text-(--theme-link)',
          )}
        >
          {index + 1}
        </button>
      )}
      <pre
        className={cx(
          'grow text-left whitespace-pre m-0 py-0.5 pr-2 flex items-center',
          lineNumbers && 'pl-2 border-l border-(--theme-border)',
          command?.type === 'error' && 'border-l-red-500 border-l-2',
          command?.type === 'warning' && 'border-l-yellow-500 border-l-2',
          command?.type === 'notice' && 'border-l-blue-500 border-l-2',
          command?.type === 'group' && 'font-bold',
        )}
      >
        {command?.type === 'group' && (
          <span className="mr-1 shrink-0 inline-flex items-center">
            {isGroupCollapsed ? (
              <ChevronRightIcon className="w-3 h-3" />
            ) : (
              <ChevronDownIcon className="w-3 h-3" />
            )}
          </span>
        )}
        {annotationLabel}
        <span>
          <LogSegments segments={displaySegments} />
        </span>
      </pre>
    </div>
  )
})

type TimeRangeErrorKey =
  | 'invalidStartTime'
  | 'invalidEndTime'
  | 'endBeforeStart'
  | 'endInFuture'
  | ''

function validateTimeRange(from: string, to: string): TimeRangeErrorKey {
  if (from === '' && to === '') {
    return ''
  }
  const fromTime = from === '' ? null : DateTime.fromISO(from)
  const toTime = to === '' ? null : DateTime.fromISO(to)
  if (fromTime && !fromTime.isValid) {
    return 'invalidStartTime'
  }
  if (toTime && !toTime.isValid) {
    return 'invalidEndTime'
  }
  if (fromTime && toTime && toTime <= fromTime) {
    return 'endBeforeStart'
  }
  if (toTime && toTime > DateTime.now()) {
    return 'endInFuture'
  }
  return ''
}

const TopPaginationBanner = memo(function TopPaginationBanner({
  endOfLog,
  loadingTop,
  onLoadOlder,
}: {
  endOfLog: boolean
  loadingTop: boolean
  onLoadOlder: () => void
}) {
  const { logviewer: t } = useStrings()
  const baseCx = cx(
    'flex items-center justify-center gap-2 h-7 text-xs font-mono select-none',
    'text-[var(--theme-muted-text-color)]',
    'border-b border-[var(--theme-border)]',
  )

  if (endOfLog) {
    return <div className={cx(baseCx, 'opacity-70')}>{t.beginningOfLog}</div>
  }

  if (loadingTop) {
    return (
      <div className={baseCx}>
        <span
          className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin"
          aria-hidden
        />
        <span>{t.loadingOlderEntries}</span>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={onLoadOlder}
      className={cx(
        baseCx,
        'w-full hover:text-[var(--theme-app)] hover:bg-[var(--theme-hover)] transition-colors',
      )}
    >
      {t.loadOlderEntries}
    </button>
  )
})

export function LogViewer({
  log,
  height = 'unset',
  width,
  roundedBottom = false,
  lineNumbers = true,
  additionalLeftBarComponents = null,
  additionalRightBarComponents = null,
  additionalBottomLeftBarComponents = null,
  additionalBottomRightBarComponents = null,
  hideExpand = false,
  inline = false,
  contentClassName,
  enableWorkflowCommands: workflowCommandsRequested = false,
  onReachTop,
  loadingTop = false,
  endOfLog = false,
  prependedSignal = 0,
  enableTimeRangeFilter = false,
  onTimeRangeChange,
  initialTimeRangeFrom = '',
  initialTimeRangeTo = '',
}: {
  log: string
  height?: string | number
  width: string | number
  roundedBottom?: boolean
  lineNumbers?: boolean
  additionalLeftBarComponents?: React.ReactNode
  additionalRightBarComponents?: React.ReactNode
  additionalBottomLeftBarComponents?: React.ReactNode
  additionalBottomRightBarComponents?: React.ReactNode
  hideExpand?: boolean
  /** When true, renders all lines without virtualization or overflow scrolling */
  inline?: boolean
  /** Additional className for the log content area */
  contentClassName?: string
  /** When true, parses workflow commands and applies visual styling */
  enableWorkflowCommands?: boolean
  onReachTop?: (() => void) | undefined
  loadingTop?: boolean | undefined
  endOfLog?: boolean | undefined
  prependedSignal?: number | undefined
  enableTimeRangeFilter?: boolean
  onTimeRangeChange?: ((from: string, to: string) => void) | undefined
  initialTimeRangeFrom?: string | undefined
  initialTimeRangeTo?: string | undefined
}) {
  const engine = useOptionalWorkflowEngine(workflowCommandsRequested)
  // Workflow commands are engine semantics; without one the log renders plain.
  const enableWorkflowCommands = workflowCommandsRequested && engine !== undefined
  const notify = useNotify()
  const { common: tCommon, logviewer: t } = useStrings()
  const annotationLabels = useMemo(
    () => ({ error: t.error, warning: t.warning, notice: t.notice }),
    [t],
  )
  const [fullscreen, setFullscreen] = useState(false)
  const [follow, _setFollow] = useState(true)
  const followRef = useRef(true)
  // Keep ref in sync immediately so callbacks (ResizeObserver, rAF) always
  // read the latest value without waiting for a React re-render.
  const updateFollow = useCallback((value: boolean) => {
    followRef.current = value
    _setFollow(value)
  }, [])
  const [logUrl, setLogUrl] = useState('')
  const [fullParsedLog, setFullParsedLog] = useState<{ index: number; segments: LogSegment[] }[]>(
    [],
  )
  const [processedLines, setProcessedLines] = useState<ProcessedLogLine[]>([])
  const [rawLines, setRawLines] = useState<string[]>([])
  const [showDebug, setShowDebug] = useState(false)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<number>>(new Set())
  const [filter, setFilter] = useState('')
  const [timeRangeFrom, setTimeRangeFrom] = useState(initialTimeRangeFrom)
  const [timeRangeTo, setTimeRangeTo] = useState(initialTimeRangeTo)
  const [timeRangeOpen, setTimeRangeOpen] = useState(false)
  const timeRangePopoverRef = useRef<HTMLDivElement>(null)
  const timeRangeError = validateTimeRange(timeRangeFrom, timeRangeTo)

  useEffect(() => {
    setTimeRangeFrom(initialTimeRangeFrom)
  }, [initialTimeRangeFrom])
  useEffect(() => {
    setTimeRangeTo(initialTimeRangeTo)
  }, [initialTimeRangeTo])
  const [visibleStart, setVisibleStart] = useState(0)
  const [visibleEnd, setVisibleEnd] = useState(0)

  // Line selection state
  const [selectedLines, setSelectedLines] = useState<Set<number>>(new Set())
  const [lastClickedLine, setLastClickedLine] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)

  // Text highlight copy button state
  const [highlightCopyPosition, setHighlightCopyPosition] = useState<{
    x: number
    y: number
  } | null>(null)
  const [highlightedText, setHighlightedText] = useState('')

  const logContainerRef = useRef<HTMLDivElement>(null)
  const ansiCache = useRef<{ [line: string]: LogSegment[] }>({})
  const scrollAnimationRef = useRef<number | null>(null)
  const prevLogLengthRef = useRef<number>(0)
  // Set by the native wheel handler when the user scrolls up (deltaY < 0).
  // The scroll handler reads and resets this flag to decide whether to
  // disable follow mode. This avoids relying on scrollTop comparison which
  // is unreliable with dynamic content heights.
  const userScrollUpRef = useRef(false)
  const reachTopFiredRef = useRef(false)
  const prevScrollHeightRef = useRef(0)
  const prevPrependedSignalRef = useRef(prependedSignal)
  const pendingPrependRef = useRef(false)

  const LINE_HEIGHT = 20
  const OVERSCAN = 20 // Extra lines rendered above/below viewport for smooth scrolling

  // Handle line click for selection
  const handleLineClick = useCallback(
    (lineNum: number, e: React.MouseEvent) => {
      e.preventDefault()
      updateFollow(false)

      if (e.shiftKey && lastClickedLine !== null) {
        // Shift-click: select range
        const start = Math.min(lastClickedLine, lineNum)
        const end = Math.max(lastClickedLine, lineNum)
        const newSelected = new Set<number>()
        for (let i = start; i <= end; i++) {
          newSelected.add(i)
        }
        setSelectedLines(newSelected)
      } else {
        // Normal click: toggle single line or start new selection
        if (selectedLines.has(lineNum) && selectedLines.size === 1) {
          // Clicking the only selected line deselects it
          setSelectedLines(new Set())
        } else {
          // Select just this line
          const newSelected = new Set([lineNum])
          setSelectedLines(newSelected)
          setLastClickedLine(lineNum)
        }
      }
    },
    [lastClickedLine, selectedLines, updateFollow],
  )

  // Copy all logs to clipboard
  const copyAllLogs = useCallback(async () => {
    const text = rawLines.join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (_err) {
      notify.error('Failed to copy logs to clipboard')
    }
  }, [rawLines, notify])

  // Handle text highlight selection on mouse up
  const handleTextMouseUp = useCallback((e: React.MouseEvent) => {
    const selection = window.getSelection()
    const selectedText = selection?.toString().trim()

    if (selectedText && selectedText.length > 0) {
      // Position the button near the cursor
      setHighlightCopyPosition({ x: e.clientX, y: e.clientY })
      setHighlightedText(selectedText)
    } else {
      setHighlightCopyPosition(null)
      setHighlightedText('')
    }
  }, [])

  // Copy highlighted text to clipboard
  const copyHighlightedText = useCallback(async () => {
    if (!highlightedText) {
      return
    }

    try {
      await navigator.clipboard.writeText(highlightedText)
      notify.success('Text copied to clipboard')
      // Clear the selection and hide the button
      window.getSelection()?.removeAllRanges()
      setHighlightCopyPosition(null)
      setHighlightedText('')
    } catch (_err) {
      notify.error('Failed to copy text to clipboard')
    }
  }, [highlightedText, notify])

  // Hide highlight copy button when clicking outside or pressing escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      // Check if click is on the copy button itself
      const target = e.target as HTMLElement
      if (target.closest('[data-highlight-copy-button]')) {
        return
      }
      // Small delay to allow the copy action to complete
      setTimeout(() => {
        setHighlightCopyPosition(null)
        setHighlightedText('')
      }, 100)
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setHighlightCopyPosition(null)
        setHighlightedText('')
      }
    }

    if (highlightCopyPosition) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleKeyDown)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [highlightCopyPosition])

  useEffect(() => {
    if (!timeRangeOpen) {
      return
    }
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (timeRangePopoverRef.current?.contains(target)) {
        return
      }
      if (target.closest('[data-time-range-trigger]')) {
        return
      }
      setTimeRangeOpen(false)
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setTimeRangeOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKey)
    }
  }, [timeRangeOpen])

  // Copy selected lines to clipboard
  const copySelectedLines = useCallback(async () => {
    if (selectedLines.size === 0) {
      return
    }

    const sortedLines = Array.from(selectedLines).sort((a, b) => a - b)
    const text = sortedLines.map((ln) => rawLines[ln - 1] || '').join('\n')

    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (_err) {
      notify.error('Failed to copy selected logs to clipboard')
    }
  }, [selectedLines, rawLines, notify])

  const handleGroupToggle = useCallback((lineIndex: number) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(lineIndex)) {
        next.delete(lineIndex)
      } else {
        next.add(lineIndex)
      }
      return next
    })
  }, [])

  const parsedLog = useMemo(() => {
    const source = enableWorkflowCommands ? processedLines : fullParsedLog
    let filtered = source
    if (enableWorkflowCommands) {
      filtered = (filtered as ProcessedLogLine[]).filter((item) => {
        if (item.command?.type === 'endgroup') {
          return false
        }
        if (!showDebug && item.command?.type === 'debug') {
          return false
        }
        // Hide lines inside collapsed groups (but keep the group header itself)
        if (
          item.groupId !== undefined &&
          item.command?.type !== 'group' &&
          collapsedGroups.has(item.groupId)
        ) {
          return false
        }
        return true
      })
    }
    if (filter !== '') {
      const normalizedFilter = filter.toLowerCase()
      filtered = filtered.filter((item) => {
        const command = enableWorkflowCommands ? (item as ProcessedLogLine).command : undefined
        const displayedText = command?.message
          ? command.message
          : item.segments.map((segment) => segment.content).join('')
        return displayedText.toLowerCase().includes(normalizedFilter)
      })
    }
    return filtered
  }, [fullParsedLog, processedLines, filter, enableWorkflowCommands, showDebug, collapsedGroups])

  // Smooth scroll to bottom using requestAnimationFrame
  const smoothScrollToBottom = useCallback(() => {
    if (!logContainerRef.current) {
      return
    }

    // Cancel any pending animation
    if (scrollAnimationRef.current) {
      cancelAnimationFrame(scrollAnimationRef.current)
      scrollAnimationRef.current = null
    }

    const container = logContainerRef.current
    const targetScroll = container.scrollHeight - container.clientHeight
    const currentScroll = container.scrollTop
    const distance = targetScroll - currentScroll

    // If very close, just snap to bottom
    if (Math.abs(distance) < 5) {
      container.scrollTop = targetScroll
      return
    }

    // Smooth scroll with easing
    const startTime = performance.now()
    const duration = 150 // ms

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / duration, 1)

      // Ease out cubic
      const eased = 1 - (1 - progress) ** 3

      container.scrollTop = currentScroll + distance * eased

      if (progress < 1) {
        scrollAnimationRef.current = requestAnimationFrame(animate)
      } else {
        scrollAnimationRef.current = null
      }
    }

    scrollAnimationRef.current = requestAnimationFrame(animate)
  }, [])

  const scrollToTop = () => {
    logContainerRef.current?.scroll({ top: 0, left: 0, behavior: 'smooth' })
  }

  // Detect user-initiated scroll direction and cancel programmatic animation.
  // Registered as native passive listeners so the browser can scroll
  // immediately without waiting — React's onWheel is non-passive and blocks
  // native scrolling during momentum/trackpad input.
  useEffect(() => {
    const container = logContainerRef.current
    if (!container || inline) {
      return
    }

    const onWheel = (e: WheelEvent) => {
      // Flag upward scroll so the scroll handler can disable follow mode.
      // We don't use scrollTop comparison because dynamic content heights
      // cause scrollTop to fluctuate, creating false "scroll up" signals.
      if (e.deltaY < 0) {
        userScrollUpRef.current = true
      }
      if (scrollAnimationRef.current) {
        cancelAnimationFrame(scrollAnimationRef.current)
        scrollAnimationRef.current = null
      }
    }

    const onTouchStart = () => {
      // Touch = user taking control of scrolling
      userScrollUpRef.current = true
      if (scrollAnimationRef.current) {
        cancelAnimationFrame(scrollAnimationRef.current)
        scrollAnimationRef.current = null
      }
    }

    container.addEventListener('wheel', onWheel, { passive: true })
    container.addEventListener('touchstart', onTouchStart, { passive: true })
    return () => {
      container.removeEventListener('wheel', onWheel)
      container.removeEventListener('touchstart', onTouchStart)
    }
  }, [inline])

  const maybeFireReachTop = useCallback(
    (scrollTop: number) => {
      if (!onReachTop || loadingTop || endOfLog) {
        return
      }
      if (scrollTop < 50 && !reachTopFiredRef.current) {
        reachTopFiredRef.current = true
        onReachTop()
      } else if (scrollTop > 100) {
        reachTopFiredRef.current = false
      }
    },
    [onReachTop, loadingTop, endOfLog],
  )

  const handleLogScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, clientHeight, scrollHeight } = event.currentTarget

    // Skip follow toggle while a programmatic smooth-scroll animation is
    // running — the wheel handler above cancels the animation when the
    // user actively scrolls, so this only guards against reacting to our
    // own animation's scroll events.
    const isAnimating = scrollAnimationRef.current !== null

    const threshold = 2
    const atBottom = scrollHeight - clientHeight - scrollTop < threshold

    if (!isAnimating) {
      if (atBottom && !follow) {
        updateFollow(true)
      } else if (userScrollUpRef.current && follow) {
        // Only disable follow when the user physically scrolled up (wheel
        // deltaY < 0). We can't rely on scrollTop < oldScroll because
        // dynamic content heights cause scrollTop to fluctuate, which
        // creates false "scroll up" signals and makes follow flicker.
        updateFollow(false)
      }
      userScrollUpRef.current = false
    }

    maybeFireReachTop(scrollTop)

    // When following, don't update the visible range — it stays frozen at
    // the scroll-position-based values from when follow was enabled.  The
    // frozen visibleEnd already extends past parsedLog.length (due to
    // OVERSCAN), so new lines are included automatically.  Changing
    // visibleStart here would shift paddingTop and cause a visible jump.
    // The log processing effect extends visibleEnd when new data arrives.
    if (!followRef.current) {
      const visibleCount = Math.ceil(clientHeight / LINE_HEIGHT) + OVERSCAN * 2
      // Clamp startIndex so the rendered range always contains content and
      // can't overshoot parsedLog.length into an empty slice.
      const maxStart = Math.max(0, parsedLog.length - visibleCount)
      const startIndex = Math.min(
        maxStart,
        Math.max(0, Math.floor(scrollTop / LINE_HEIGHT) - OVERSCAN),
      )
      setVisibleStart(startIndex)
      setVisibleEnd(startIndex + visibleCount)
    }
  }

  // Process log changes efficiently
  useEffect(() => {
    if (!log) {
      return
    }

    const lines = log.split('\n')
    const cleanedLines = lines[lines.length - 1] === '' ? lines.slice(0, -1) : lines

    // Check if this is just new lines appended (not a full refresh)
    const isAppending = cleanedLines.length > prevLogLengthRef.current
    prevLogLengthRef.current = cleanedLines.length

    setRawLines(cleanedLines)
    const processed = cleanedLines.map((line, index) => {
      if (ansiCache.current[line] === undefined) {
        ansiCache.current[line] = parseAnsiSegments(line)
      }
      return { index, segments: ansiCache.current[line] }
    })
    setFullParsedLog(processed)

    if (enableWorkflowCommands && engine) {
      setProcessedLines(engine.processLogLines(processed, cleanedLines))
    }

    // While following, keep visibleEnd extended to cover all parsed lines so
    // newly-arrived content is rendered. We extend on every run (not only
    // when appending) because StrictMode's double-invocation of effects in
    // dev updates prevLogLengthRef on the first run, making the second run
    // observe isAppending=false even on initial mount.
    if (followRef.current && logContainerRef.current) {
      setVisibleEnd((prev) => Math.max(prev, cleanedLines.length))
      if (isAppending) {
        // Double-rAF ensures the DOM has been committed and painted before
        // we read scrollHeight. On first load the modal/container may not
        // have its final dimensions in the very first frame.
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            smoothScrollToBottom()
          })
        })
      }
    }

    const file = new Blob([log], { type: 'text/plaintext' })
    const url = URL.createObjectURL(file)
    setLogUrl(url)
    return () => {
      URL.revokeObjectURL(url)
      // Cleanup animation on unmount
      if (scrollAnimationRef.current) {
        cancelAnimationFrame(scrollAnimationRef.current)
      }
    }
  }, [log, smoothScrollToBottom, enableWorkflowCommands, engine])

  const parsedLogLengthRef = useRef(parsedLog.length)
  parsedLogLengthRef.current = parsedLog.length

  useEffect(() => {
    if (!logContainerRef.current) {
      return
    }

    // Only handles actual container resizes (fullscreen toggle, window resize).
    // Log data changes are handled by the log processing effect above.
    const observer = new ResizeObserver(() => {
      if (!logContainerRef.current) {
        return
      }
      // ResizeObserver fires synchronously on attach, which can happen before
      // parsedLogLengthRef has been populated by the log-processing effect on
      // the initial render. Skip this case so we don't clobber a pending
      // setVisibleEnd from the log effect with a stale 0.
      if (parsedLogLengthRef.current === 0) {
        return
      }
      const container = logContainerRef.current
      const clientHeight = container.clientHeight
      const visibleCount = Math.ceil(clientHeight / LINE_HEIGHT) + OVERSCAN * 2

      if (followRef.current) {
        // Only decrease visibleStart (render more lines above), never
        // increase it — increasing would shift paddingTop under the scroll
        // to the bottom below.
        const minStart = Math.max(0, parsedLogLengthRef.current - visibleCount)
        setVisibleStart((prev) => Math.min(prev, minStart))
        setVisibleEnd(parsedLogLengthRef.current)
        // Scroll after React commits the state update and the browser
        // paints, so smoothScrollToBottom reads correct scrollHeight.
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            smoothScrollToBottom()
          })
        })
      } else {
        const maxStart = Math.max(0, parsedLogLengthRef.current - visibleCount)
        const startIndex = Math.min(
          maxStart,
          Math.max(0, Math.floor(container.scrollTop / LINE_HEIGHT) - OVERSCAN),
        )
        setVisibleStart(startIndex)
        setVisibleEnd(startIndex + visibleCount)
      }
    })

    observer.observe(logContainerRef.current)

    return () => observer.disconnect()
  }, [smoothScrollToBottom])

  useLayoutEffect(() => {
    if (prependedSignal > prevPrependedSignalRef.current) {
      pendingPrependRef.current = true
    } else if (prependedSignal < prevPrependedSignalRef.current) {
      pendingPrependRef.current = false
    }
    prevPrependedSignalRef.current = prependedSignal
    if (!pendingPrependRef.current) {
      return
    }
    const container = logContainerRef.current
    if (!container) {
      return
    }
    const delta = container.scrollHeight - prevScrollHeightRef.current
    if (delta <= 0) {
      return
    }
    pendingPrependRef.current = false
    container.scrollTop += delta
    if (!followRef.current) {
      const visibleCount = Math.ceil(container.clientHeight / LINE_HEIGHT) + OVERSCAN * 2
      const maxStart = Math.max(0, parsedLog.length - visibleCount)
      const startIndex = Math.min(
        maxStart,
        Math.max(0, Math.floor(container.scrollTop / LINE_HEIGHT) - OVERSCAN),
      )
      setVisibleStart(startIndex)
      setVisibleEnd(startIndex + visibleCount)
    }
  }, [prependedSignal, parsedLog.length])

  useLayoutEffect(() => {
    if (logContainerRef.current) {
      prevScrollHeightRef.current = logContainerRef.current.scrollHeight
    }
  })

  const handleFilterChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const newFilter = event.target.value
    setFilter(newFilter)
    updateFollow(false)
    if (logContainerRef.current) {
      const clientHeight = logContainerRef.current.clientHeight
      const visibleCount = Math.ceil(clientHeight / LINE_HEIGHT) + OVERSCAN * 2
      setVisibleStart(0)
      setVisibleEnd(Math.min(parsedLog.length, visibleCount))
      scrollToTop()
    } else {
      setVisibleStart(0)
      setVisibleEnd(50)
    }
  }

  const ExpandButtonIcon = fullscreen ? ShrinkIcon : ExpandIcon
  const expandButtonText = fullscreen ? 'Collapse' : 'Expand'

  const paddingTop = visibleStart * LINE_HEIGHT
  const paddingBottom = Math.max(0, parsedLog.length - visibleEnd) * LINE_HEIGHT
  const visibleLogs = inline
    ? parsedLog // In inline mode, render all logs
    : parsedLog.slice(visibleStart, Math.min(parsedLog.length, visibleEnd))

  return (
    <div
      data-testid="logviewer-container"
      className={cx('flex flex-col grow', roundedBottom && 'rounded-lg')}
      style={
        !fullscreen
          ? { height: height, width: width }
          : {
              height: 'calc(100% - 50px)',
              width: '100%',
              position: 'fixed',
              left: 0,
              top: 50, // account for navbar
              zIndex: 9999,
            }
      }
    >
      {/* log viewer tool/top bar */}
      <div
        className={cx(
          'flex select-none items-center gap-x-2 p-2',
          inline
            ? 'bg-[var(--theme-panel-bg)] border-b border-[var(--theme-border)]'
            : 'theme-panel',
        )}
      >
        <div
          className={cx(
            'w-full flex flex-row gap-x-2 items-center',
            hideExpand && 'justify-between',
          )}
        >
          <div className="flex gap-x-2 w-full">
            {!inline && (
              <>
                <button
                  type="button"
                  className="btn btn-neutral"
                  onClick={() => {
                    scrollToTop()
                    updateFollow(false)
                  }}
                >
                  <ArrowUpIcon />
                  <span>{t.top}</span>
                </button>
                <button
                  type="button"
                  className="btn btn-neutral"
                  onClick={() => {
                    if (!follow) {
                      updateFollow(true)
                      setVisibleEnd((prev) => Math.max(prev, parsedLog.length))
                      requestAnimationFrame(() => {
                        smoothScrollToBottom()
                      })
                    } else {
                      updateFollow(false)
                    }
                  }}
                >
                  <ArrowDownIcon />
                  <span>{!follow ? 'Follow' : 'Following'}</span>
                </button>
              </>
            )}
            {/* Copy selected lines button */}
            {selectedLines.size > 0 ? (
              <div className="relative flex items-center h-full">
                <button type="button" className="btn btn-neutral" onClick={copySelectedLines}>
                  {copied ? <CheckIcon className="text-green-500" /> : <CopyIcon />}
                  <span>{copied ? tCommon.copied : t.copyLines(selectedLines.size)}</span>
                </button>
                <button
                  type="button"
                  aria-label={t.clearSelection}
                  className="absolute -top-1.5 -right-1.5 btn-neutral rounded-full p-1 border transition-colors shadow-sm cursor-pointer z-10"
                  onClick={() => setSelectedLines(new Set())}
                  title={t.clearSelection}
                >
                  <XIcon className="text-[10px]" />
                </button>
              </div>
            ) : (
              <button type="button" className="btn btn-neutral" onClick={copyAllLogs}>
                {copied ? <CheckIcon className="text-green-500" /> : <CopyIcon />}
                <span>{copied ? tCommon.copied : t.copyAll}</span>
              </button>
            )}
            {additionalLeftBarComponents}
            {enableWorkflowCommands && (
              <button
                type="button"
                className={cx('btn btn-neutral', showDebug && 'btn-active')}
                onClick={() => setShowDebug((prev) => !prev)}
              >
                <span>{showDebug ? t.hideDebug : t.showDebug}</span>
              </button>
            )}
            {enableTimeRangeFilter && (
              <div className="relative">
                <button
                  type="button"
                  data-time-range-trigger
                  className="btn btn-neutral"
                  onClick={() => setTimeRangeOpen((o) => !o)}
                >
                  <ClockIcon />
                  <span>{t.timeRange}</span>
                  {(timeRangeFrom !== '' || timeRangeTo !== '') && (
                    <span
                      title={t.timeRangeActive}
                      className="ml-1 px-1.5 py-0.5 text-[10px] rounded-full bg-[var(--theme-element)]/15 text-[var(--theme-element)]"
                    >
                      {t.timeRangeOn}
                    </span>
                  )}
                </button>
                {timeRangeOpen && (
                  <div
                    ref={timeRangePopoverRef}
                    className={cx(
                      'absolute top-full left-0 mt-1 z-50 w-80 p-3 rounded-lg shadow-lg',
                      'border border-[var(--theme-border)] bg-[var(--theme-panel-bg)]',
                      'flex flex-col gap-y-3',
                    )}
                  >
                    <div className="flex items-center gap-x-1.5">
                      <span className="text-xs font-semibold text-[var(--theme-app)]">
                        {t.filterByTimeRange}
                      </span>
                      <TooltipInfo text={t.timeRangeHelp} />
                    </div>
                    <label className="flex flex-col gap-y-1">
                      <span className="text-[11px] uppercase tracking-wide text-[var(--theme-muted-text-color)]">
                        {t.timeRangeFrom}
                      </span>
                      <input
                        type="datetime-local"
                        value={timeRangeFrom}
                        onChange={(e) => setTimeRangeFrom(e.target.value)}
                        className="rounded-md text-sm h-8 px-2 bg-[var(--theme-input-bg)] text-[var(--theme-input)] border border-[var(--theme-border)]"
                      />
                    </label>
                    <label className="flex flex-col gap-y-1">
                      <span className="text-[11px] uppercase tracking-wide text-[var(--theme-muted-text-color)]">
                        {t.timeRangeTo}
                      </span>
                      <input
                        type="datetime-local"
                        value={timeRangeTo}
                        onChange={(e) => setTimeRangeTo(e.target.value)}
                        className="rounded-md text-sm h-8 px-2 bg-[var(--theme-input-bg)] text-[var(--theme-input)] border border-[var(--theme-border)]"
                      />
                    </label>
                    {timeRangeError !== '' && (
                      <span className="text-[11px] text-red-500">{t[timeRangeError]}</span>
                    )}
                    <div className="flex gap-x-2">
                      <button
                        type="button"
                        disabled={timeRangeError !== ''}
                        className="btn btn-primary flex-1 justify-center"
                        onClick={() => {
                          onTimeRangeChange?.(timeRangeFrom, timeRangeTo)
                          setTimeRangeOpen(false)
                        }}
                      >
                        {t.apply}
                      </button>
                      {(timeRangeFrom !== '' || timeRangeTo !== '') && (
                        <button
                          type="button"
                          className="btn btn-neutral flex-1 justify-center"
                          onClick={() => {
                            setTimeRangeFrom('')
                            setTimeRangeTo('')
                            onTimeRangeChange?.('', '')
                            setTimeRangeOpen(false)
                          }}
                        >
                          {t.clear}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <input
            type="text"
            className="rounded-md text-sm h-8"
            placeholder={t.filterLogs}
            onChange={handleFilterChange}
          />
          <a href={logUrl} className={cx(!logUrl && 'disabled', 'btn btn-neutral')} download>
            <DownloadIcon />
            <span>{t.download}</span>
          </a>
          <button
            type="button"
            className={cx('btn btn-neutral', hideExpand && 'hidden')}
            onClick={() => setFullscreen((prev) => !prev)}
          >
            <ExpandButtonIcon />
            <span>{expandButtonText}</span>
          </button>
        </div>
        {additionalRightBarComponents}
      </div>
      {/* log viewer content */}
      <div
        data-testid="logviewer"
        role="none"
        className={cx(
          roundedBottom && 'rounded-b-lg',
          'w-full overflow-x-auto',
          !inline && 'h-full grow overflow-y-auto',
          !inline && 'bg-(--theme-muted-panel-bg)',
          contentClassName,
        )}
        style={
          inline
            ? undefined
            : {
                overflowY: 'auto',
                position: 'relative',
                overscrollBehavior: 'contain',
              }
        }
        ref={logContainerRef}
        onScroll={inline ? undefined : handleLogScroll}
        onMouseUp={handleTextMouseUp}
      >
        {!inline && onReachTop && (
          <TopPaginationBanner
            endOfLog={endOfLog}
            loadingTop={loadingTop}
            onLoadOlder={onReachTop}
          />
        )}
        <div className="min-w-max" style={inline ? undefined : { paddingTop, paddingBottom }}>
          {visibleLogs.map((item) => (
            <LogLine
              key={item.index}
              index={item.index}
              segments={item.segments}
              lineNumbers={lineNumbers}
              isSelected={selectedLines.has(item.index + 1)}
              lineHeight={LINE_HEIGHT}
              onLineClick={handleLineClick}
              searchTerm={filter}
              command={enableWorkflowCommands ? (item as ProcessedLogLine).command : undefined}
              groupDepth={enableWorkflowCommands ? (item as ProcessedLogLine).groupDepth : 0}
              isGroupCollapsed={
                enableWorkflowCommands && (item as ProcessedLogLine).command?.type === 'group'
                  ? collapsedGroups.has(item.index)
                  : undefined
              }
              onGroupToggle={enableWorkflowCommands ? handleGroupToggle : undefined}
              annotationLabels={annotationLabels}
            />
          ))}
        </div>
      </div>
      {/* Floating copy button for text highlight */}
      {highlightCopyPosition && highlightedText && (
        <button
          type="button"
          data-highlight-copy-button
          className={cx(
            'fixed z-[10000] flex items-center gap-1 px-2 py-1.5 text-xs font-medium',
            'rounded-md shadow-lg border cursor-pointer transition-colors duration-150',
            'bg-(--theme-panel-bg) border-(--theme-border) hover:bg-(--theme-hover) text-(--theme-app)',
          )}
          style={{
            left: highlightCopyPosition.x,
            top: highlightCopyPosition.y + 8,
            transform: 'translateX(-50%)',
          }}
          onClick={copyHighlightedText}
        >
          {copied ? (
            <>
              <CheckIcon className="text-green-500 w-3.5 h-3.5" />
              <span>{tCommon.copied}</span>
            </>
          ) : (
            <>
              <CopyIcon className="w-3.5 h-3.5" />
              <span>{tCommon.copy}</span>
            </>
          )}
        </button>
      )}
      {/* log viewer bottom bar (only with custom nodes) */}
      {(additionalBottomLeftBarComponents || additionalBottomRightBarComponents) && (
        <div className="flex theme-panel select-none items-center gap-x-2 p-2">
          <div
            className={cx(
              'w-full flex flex-row gap-x-2 items-center',
              hideExpand && 'justify-between',
            )}
          >
            <div className="flex gap-x-2 w-full">{additionalBottomLeftBarComponents}</div>
          </div>
          {additionalBottomRightBarComponents}
        </div>
      )}
    </div>
  )
}

import { useVirtualizer } from '@tanstack/react-virtual'
import { DateTime } from 'luxon'
import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Button } from '../components/Button'
import { buttonClasses } from '../components/buttonClasses'
import { DatePicker } from '../components/DatePicker'
import type { FloatingAnchor } from '../components/floating'
import { IconButton } from '../components/IconButton'
import { InfoTip } from '../components/InfoTip'
import { Loader } from '../components/Loader'
import { Popover } from '../components/Popover'
import { useOptionalWorkflowEngine, useStrings } from '../components/Provider'
import { SearchInput } from '../components/SearchInput'
import { useCopy } from '../components/useCopy'
import { cx } from '../cx'
import type { LogCommand, LogSegment, ProcessedLogLine } from '../engine'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClockIcon,
  CloseIcon,
  CopyIcon,
  DownloadIcon,
  ExpandIcon,
  ShrinkIcon,
} from '../icons'
import { highlightSegments, parseAnsiSegments, plainSegments } from './segments'

// A line's height before it is measured; a wrapped or annotated line is taller.
const LINE_HEIGHT = 20

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

type AnnotationType = 'error' | 'warning' | 'notice'

// The label is words, so it takes the status's text shade; the edge and the
// tint are graphics, which take its vivid shade.
const ANNOTATION_TONES: Record<AnnotationType, { label: string; row: string; edge: string }> = {
  error: {
    label: 'text-(--theme-error-text)',
    row: 'bg-(--theme-error-muted)',
    edge: 'border-l-2 border-l-(color:--theme-error)',
  },
  warning: {
    label: 'text-(--theme-warning-text)',
    row: 'bg-(--theme-warning-muted)',
    edge: 'border-l-2 border-l-(color:--theme-warning)',
  },
  notice: {
    label: 'text-(--theme-info-text)',
    row: 'bg-(--theme-info-muted)',
    edge: 'border-l-2 border-l-(color:--theme-info)',
  },
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
  selectLineLabel,
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
  annotationLabels: Record<AnnotationType, string>
  selectLineLabel: (line: number) => string
}) {
  const annotation = command?.type ? ANNOTATION_TONES[command.type as AnnotationType] : undefined
  const displaySegments = useMemo(
    () =>
      highlightSegments(command?.message ? plainSegments(command.message) : segments, searchTerm),
    [segments, searchTerm, command],
  )

  const annotationLabel = annotation && command && (
    <span className={cx('mr-1 font-semibold', annotation.label)}>
      {annotationLabels[command.type as AnnotationType]}
    </span>
  )

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

  const titleId = useId()

  // The pointer can toggle a group anywhere on its header; the keyboard and
  // assistive tech use the chevron's button, since the row also holds the line
  // number's button and one button can't hold another.
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: a pointer shortcut for the chevron's button
    // biome-ignore lint/a11y/useKeyWithClickEvents: the chevron's button takes the keys
    <div
      data-line-number={index + 1}
      onClick={groupToggle ?? undefined}
      className={cx(
        'flex items-start text-sm font-mono group',
        isSelected ? 'bg-(--theme-link)/15' : 'hover:bg-(--theme-hover)',
        'text-(--theme-app)',
        // A selected line shows its selection over its annotation's tint.
        !isSelected && annotation?.row,
        command?.type === 'debug' && 'opacity-60',
        command?.type === 'group' && 'bg-(--theme-hover) cursor-pointer',
      )}
      style={{ minHeight: `${lineHeight}px`, lineHeight: `${lineHeight}px` }}
    >
      {lineNumbers && (
        <button
          type="button"
          aria-label={selectLineLabel(index + 1)}
          aria-pressed={isSelected}
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
          lineNumbers && 'pl-2 border-l border-l-(color:--theme-border)',
          annotation?.edge,
          command?.type === 'group' && 'font-bold',
        )}
        // A group's lines indent their text, never the gutter, so line numbers stay in one column.
        style={
          groupDepth > 0
            ? { paddingInlineStart: `calc(${lineNumbers ? '0.5rem + ' : ''}${groupDepth * 16}px)` }
            : undefined
        }
      >
        {command?.type === 'group' &&
          (onGroupToggle ? (
            <button
              type="button"
              aria-expanded={!isGroupCollapsed}
              aria-labelledby={titleId}
              onClick={(e) => {
                e.stopPropagation()
                onGroupToggle(index)
              }}
              className="mr-1 inline-flex shrink-0 cursor-pointer items-center rounded focus-visible:outline-2 focus-visible:outline-(--theme-focus)"
            >
              {isGroupCollapsed ? (
                <ChevronRightIcon className="w-3 h-3 rtl:rotate-180" />
              ) : (
                <ChevronDownIcon className="w-3 h-3" />
              )}
            </button>
          ) : (
            <span className="mr-1 shrink-0 inline-flex items-center">
              <ChevronDownIcon className="w-3 h-3" />
            </span>
          ))}
        {annotationLabel}
        <span id={titleId}>
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
        <Loader inline decorative size={12} color="currentColor" />
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
  downloadName = 'log.txt',
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
  width?: string | number | undefined
  /** The file name Download saves the log under. */
  downloadName?: string | undefined
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
  const { common, logviewer: t } = useStrings()
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
  const timeRangeId = useId()
  const timeRangeError = validateTimeRange(timeRangeFrom, timeRangeTo)

  useEffect(() => {
    setTimeRangeFrom(initialTimeRangeFrom)
  }, [initialTimeRangeFrom])
  useEffect(() => {
    setTimeRangeTo(initialTimeRangeTo)
  }, [initialTimeRangeTo])
  // Line selection state
  const [selectedLines, setSelectedLines] = useState<Set<number>>(new Set())
  const [lastClickedLine, setLastClickedLine] = useState<number | null>(null)
  const { copy, copied } = useCopy()

  // Text the reader selected, offered for copying where the selection ended.
  const [selection, setSelection] = useState<{ text: string; at: FloatingAnchor } | null>(null)

  const logContainerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const ansiCache = useRef<{ [line: string]: LogSegment[] }>({})
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
    await copy(text, { quiet: true })
  }, [rawLines, copy])

  // Offers the selected text for copying, where the pointer let go.
  const handleTextMouseUp = useCallback((e: React.MouseEvent) => {
    const text = window.getSelection()?.toString().trim()
    const { clientX, clientY } = e
    setSelection(text ? { text, at: { clientX, clientY } } : null)
  }, [])

  const copySelection = useCallback(async () => {
    if (!selection) {
      return
    }
    if (await copy(selection.text)) {
      window.getSelection()?.removeAllRanges()
      setSelection(null)
    }
  }, [selection, copy])

  // Copy selected lines to clipboard
  const copySelectedLines = useCallback(async () => {
    if (selectedLines.size === 0) {
      return
    }

    const sortedLines = Array.from(selectedLines).sort((a, b) => a - b)
    const text = sortedLines.map((ln) => rawLines[ln - 1] || '').join('\n')

    await copy(text, { quiet: true })
  }, [selectedLines, rawLines, copy])

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

  const virtualizer = useVirtualizer({
    count: parsedLog.length,
    getScrollElement: () => logContainerRef.current,
    estimateSize: () => LINE_HEIGHT,
    overscan: 20,
    // The list sits below the load-older banner in the scrolling element.
    scrollMargin: listRef.current?.offsetTop ?? 0,
    getItemKey: (i) => parsedLog[i]?.index ?? i,
    enabled: !inline,
  })
  const parsedLogLengthRef = useRef(parsedLog.length)
  parsedLogLengthRef.current = parsedLog.length

  const scrollToEnd = useCallback(() => {
    const last = parsedLogLengthRef.current - 1
    if (last >= 0) {
      virtualizer.scrollToIndex(last, { align: 'end' })
    }
  }, [virtualizer])

  const scrollToTop = () => {
    logContainerRef.current?.scroll({ top: 0, left: 0, behavior: 'smooth' })
  }

  // Detect user-initiated scroll direction.
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
      // We don't use scrollTop comparison because measured row heights
      // make scrollTop shift, creating false "scroll up" signals.
      if (e.deltaY < 0) {
        userScrollUpRef.current = true
      }
    }

    // Touch = user taking control of scrolling
    const onTouchStart = () => {
      userScrollUpRef.current = true
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
    const atBottom = scrollHeight - clientHeight - scrollTop < 2
    if (atBottom && !follow) {
      updateFollow(true)
    } else if (userScrollUpRef.current && follow) {
      // Only the reader scrolling up stops following; a scroll of ours to the
      // end, or rows changing height as they are measured, don't.
      updateFollow(false)
    }
    userScrollUpRef.current = false
    maybeFireReachTop(scrollTop)
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

    if (followRef.current && isAppending) {
      // After the new rows render.
      requestAnimationFrame(scrollToEnd)
    }
  }, [log, scrollToEnd, enableWorkflowCommands, engine])

  // A resize, such as going fullscreen, keeps a followed log at its end.
  useEffect(() => {
    const container = logContainerRef.current
    if (!container || inline) {
      return
    }
    const observer = new ResizeObserver(() => {
      if (followRef.current) {
        scrollToEnd()
      }
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [inline, scrollToEnd])

  // biome-ignore lint/correctness/useExhaustiveDependencies: parsedLog.length re-runs it once the older lines have rendered.
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
    // Older lines came in above: keep the ones being read where they were.
    container.scrollTop += delta
  }, [prependedSignal, parsedLog.length])

  useLayoutEffect(() => {
    if (logContainerRef.current) {
      prevScrollHeightRef.current = logContainerRef.current.scrollHeight
    }
  })

  // Built on demand, not on every update: a followed log changes many times a
  // second, and each blob would copy the whole log.
  const downloadLog = () => {
    const url = URL.createObjectURL(new Blob([log], { type: 'text/plain' }))
    const a = document.createElement('a')
    a.href = url
    a.download = downloadName
    a.click()
    // After the click has handed the URL to the download.
    setTimeout(() => URL.revokeObjectURL(url))
  }

  // Escape leaves fullscreen, as it does a video's; an open popover inside
  // claims its own Escape first.
  useEffect(() => {
    if (!fullscreen) {
      return
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) {
        setFullscreen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullscreen])

  const handleFilterChange = (newFilter: string): void => {
    setFilter(newFilter)
    updateFollow(false)
    scrollToTop()
  }

  const ExpandButtonIcon = fullscreen ? ShrinkIcon : ExpandIcon
  const expandButtonText = fullscreen ? common.collapse : common.expand

  const rows = virtualizer.getVirtualItems()
  // Inline renders every line; otherwise only those in view, measured as they render.
  const visibleLogs = inline
    ? parsedLog.map((item, index) => ({ item, index }))
    : rows.flatMap((row) => {
        const item = parsedLog[row.index]
        return item ? [{ item, index: row.index }] : []
      })
  const offset = (rows[0]?.start ?? 0) - virtualizer.options.scrollMargin

  return (
    <div
      data-testid="logviewer-container"
      className={cx(
        'flex flex-col grow',
        roundedBottom && 'rounded-lg',
        // Over the page, below the host's top bar.
        fullscreen && 'fixed inset-x-0 bottom-0 top-(--app-inset-top,0px) z-(--layer-overlay)',
      )}
      style={fullscreen ? undefined : { height, width }}
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
        {/* A narrow viewer wraps its controls onto more rows rather than running
            them off the edge, and the filter takes whatever a row leaves it. */}
        <div className="flex w-full min-w-0 flex-wrap items-center gap-2">
          <div className="flex flex-auto flex-wrap gap-2">
            {!inline && (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<ArrowUpIcon />}
                  onClick={() => {
                    scrollToTop()
                    updateFollow(false)
                  }}
                >
                  {t.top}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<ArrowDownIcon />}
                  aria-pressed={follow}
                  onClick={() => {
                    if (!follow) {
                      updateFollow(true)
                      scrollToEnd()
                    } else {
                      updateFollow(false)
                    }
                  }}
                >
                  {follow ? t.following : t.follow}
                </Button>
              </>
            )}
            {/* Copy selected lines button */}
            {selectedLines.size > 0 ? (
              <div className="flex items-center gap-1">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={copied ? <CheckIcon className="text-(--theme-success)" /> : <CopyIcon />}
                  onClick={copySelectedLines}
                >
                  {copied ? common.copied : t.copyLines(selectedLines.size)}
                </Button>
                <IconButton
                  variant="ghost"
                  size="sm"
                  label={t.clearSelection}
                  icon={<CloseIcon />}
                  onClick={() => setSelectedLines(new Set())}
                />
              </div>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                icon={copied ? <CheckIcon className="text-(--theme-success)" /> : <CopyIcon />}
                onClick={copyAllLogs}
              >
                {copied ? common.copied : t.copyAll}
              </Button>
            )}
            {additionalLeftBarComponents}
            {enableWorkflowCommands && (
              <Button
                variant="secondary"
                size="sm"
                aria-pressed={showDebug}
                onClick={() => setShowDebug((prev) => !prev)}
              >
                {showDebug ? t.hideDebug : t.showDebug}
              </Button>
            )}
            {enableTimeRangeFilter && (
              <Popover
                open={timeRangeOpen}
                onOpenChange={setTimeRangeOpen}
                align="start"
                aria-label={t.filterByTimeRange}
                className="flex w-80 flex-col gap-y-3"
                trigger={
                  <button
                    type="button"
                    className={buttonClasses({ variant: 'secondary', size: 'sm' })}
                  >
                    <ClockIcon />
                    <span>{t.timeRange}</span>
                    {(timeRangeFrom !== '' || timeRangeTo !== '') && (
                      <span
                        title={t.timeRangeActive}
                        className="ml-1 px-1.5 py-0.5 text-[10px] rounded-full bg-[var(--theme-accent)]/15 text-[var(--theme-accent)]"
                      >
                        {t.timeRangeOn}
                      </span>
                    )}
                  </button>
                }
              >
                <div className="flex items-center gap-x-1.5">
                  <span className="text-xs font-semibold text-[var(--theme-app)]">
                    {t.filterByTimeRange}
                  </span>
                  <InfoTip text={t.timeRangeHelp} />
                </div>
                <div className="flex flex-col gap-y-1">
                  <span
                    id={`${timeRangeId}-timeRangeFrom`}
                    className="text-[11px] uppercase tracking-wide text-[var(--theme-muted-text-color)]"
                  >
                    {t.timeRangeFrom}
                  </span>
                  <DatePicker
                    withTime
                    aria-labelledby={`${timeRangeId}-timeRangeFrom`}
                    value={timeRangeFrom}
                    onValueChange={setTimeRangeFrom}
                  />
                </div>
                <div className="flex flex-col gap-y-1">
                  <span
                    id={`${timeRangeId}-timeRangeTo`}
                    className="text-[11px] uppercase tracking-wide text-[var(--theme-muted-text-color)]"
                  >
                    {t.timeRangeTo}
                  </span>
                  <DatePicker
                    withTime
                    aria-labelledby={`${timeRangeId}-timeRangeTo`}
                    value={timeRangeTo}
                    onValueChange={setTimeRangeTo}
                  />
                </div>
                {timeRangeError !== '' && (
                  <span role="alert" className="text-[11px] text-(--theme-error-text)">
                    {t[timeRangeError]}
                  </span>
                )}
                <div className="flex gap-x-2">
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={timeRangeError !== ''}
                    className="flex-1"
                    onClick={() => {
                      onTimeRangeChange?.(timeRangeFrom, timeRangeTo)
                      setTimeRangeOpen(false)
                    }}
                  >
                    {common.apply}
                  </Button>
                  {(timeRangeFrom !== '' || timeRangeTo !== '') && (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="flex-1"
                      onClick={() => {
                        setTimeRangeFrom('')
                        setTimeRangeTo('')
                        onTimeRangeChange?.('', '')
                        setTimeRangeOpen(false)
                      }}
                    >
                      {common.clear}
                    </Button>
                  )}
                </div>
              </Popover>
            )}
          </div>
          <SearchInput
            label={t.filterLogs}
            value={filter}
            onValueChange={handleFilterChange}
            className="min-w-40 flex-1 sm:w-48 sm:flex-none"
          />
          <Button
            variant="secondary"
            size="sm"
            icon={<DownloadIcon />}
            disabled={!log}
            onClick={downloadLog}
          >
            {common.download}
          </Button>
          {!hideExpand && (
            <Button
              variant="secondary"
              size="sm"
              icon={<ExpandButtonIcon />}
              onClick={() => setFullscreen((prev) => !prev)}
            >
              {expandButtonText}
            </Button>
          )}
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
        <div
          ref={listRef}
          className={cx(!inline && 'relative')}
          style={inline ? undefined : { height: virtualizer.getTotalSize() }}
        >
          {/* One layer of rows as wide as the widest, so every row's band spans it. */}
          <div
            className={cx('min-w-max', !inline && 'absolute top-0 left-0 min-w-full')}
            style={inline ? undefined : { transform: `translateY(${offset}px)` }}
          >
            {visibleLogs.map(({ item, index }) => (
              <div
                key={item.index}
                data-index={index}
                ref={inline ? undefined : virtualizer.measureElement}
              >
                <LogLine
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
                  selectLineLabel={t.selectLine}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
      {selection && (
        <Popover
          open
          onOpenChange={(open) => !open && setSelection(null)}
          at={selection.at}
          initialFocus="none"
          aria-label={common.copy}
          className="p-1"
        >
          <Button variant="ghost" size="xs" icon={<CopyIcon />} onClick={copySelection}>
            {common.copy}
          </Button>
        </Popover>
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

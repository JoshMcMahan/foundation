import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { cx } from '../cx'
import { DownloadIcon } from '../icons'
import { CopyButton } from './CopyButton'
import type { CodeToken } from './codeHighlight'
import { IconButton } from './IconButton'
import { useStrings } from './Provider'

export interface CodeBlockProps {
  /** The code, as it is copied and downloaded. */
  code: string
  /** The language to highlight it as, such as `yaml`; the header names it
   *  unless `title` says otherwise. Without it the code reads as plain text. */
  language?: string | undefined
  /** The header's text in place of the language, such as a file's name. */
  title?: ReactNode
  /** Names the code for assistive technology where `title` is not plain text;
   *  by default the title, or the language ("yaml code"). */
  label?: string | undefined
  /** Adds a download button that saves the code under this name. */
  filename?: string | undefined
  /** Controls of the host's own, before download and copy. */
  headerActions?: ReactNode
  /** The copy button; on by default. */
  copy?: boolean | undefined
  /** Numbers the lines; on by default when there is more than one. */
  lineNumbers?: boolean | undefined
  /** The first line's number, for an excerpt. */
  startLine?: number | undefined
  /** Breaks long lines instead of scrolling them sideways. */
  wrap?: boolean | undefined
  /** Grows to the height of its container and scrolls inside it, for a view
   *  that is the code, such as a tab. Without it the block is as tall as its
   *  code, up to `maxHeight`. */
  fill?: boolean | undefined
  /** The tallest it grows before it scrolls, as a CSS length or in pixels. */
  maxHeight?: number | string | undefined
  /** The code is still arriving: highlighting is not cached, and the block
   *  keeps its end in view while it is scrolled there. */
  streaming?: boolean | undefined
  /** On a phone, reaches past the host's content padding (`p-4`) to the
   *  container's edges, without corners, so long lines get the screen's width. */
  bleed?: boolean | undefined
  className?: string | undefined
}

interface Highlighted {
  source: string
  language: string
  lines: CodeToken[][]
}

// The highlighter loads with the first block that renders, never with the page.
function useHighlighted(source: string, language: string, streaming: boolean) {
  const [state, setState] = useState<Highlighted | null>(null)
  const latest = useRef({ source, language })
  latest.current = { source, language }
  useEffect(() => {
    let mounted = true
    // A result can land after newer code has come in, as one does while it
    // streams; it still colors the lines the newer code shares with it.
    const accept = (lines: CodeToken[][]) => {
      const now = latest.current
      if (mounted && now.language === language && now.source.startsWith(source)) {
        setState({ source, language, lines })
      }
    }
    import('./codeHighlight')
      .then(({ highlightCode }) => {
        const ready = highlightCode(source, language, streaming, accept)
        if (ready) {
          accept(ready)
        }
      })
      .catch(() => {})
    return () => {
      mounted = false
    }
  }, [source, language, streaming])
  return state
}

// Each line's tokens, or null for a line still shown plain: one not
// highlighted yet, or one that changed since it was.
function tokensFor(state: Highlighted | null, source: string, language: string, count: number) {
  const out: (CodeToken[] | null)[] = new Array(count).fill(null)
  if (!state || state.language !== language || !source.startsWith(state.source)) {
    return out
  }
  if (state.source === source) {
    if (state.lines.length === count) {
      return state.lines
    }
    return out
  }
  // The last line of an older result may have been cut short.
  const settled = Math.min(state.source.split('\n').length - 1, state.lines.length, count)
  for (let i = 0; i < settled; i++) {
    out[i] = state.lines[i] ?? null
  }
  return out
}

function isScrollable(el: HTMLElement) {
  return el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1
}

function downloadText(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  // After the click has handed the URL to the download.
  setTimeout(() => URL.revokeObjectURL(url))
}

/** Code to read on a page, such as a workflow's YAML: highlighted in the
 *  theme's code colors, with numbered lines, a copy button and, given a
 *  `filename`, a download button. Markdown's fenced code renders as one, so
 *  both read the same. */
export function CodeBlock({
  code,
  language = '',
  title,
  label,
  filename,
  headerActions,
  copy = true,
  lineNumbers,
  startLine = 1,
  wrap = false,
  fill = false,
  maxHeight,
  streaming = false,
  bleed = false,
  className,
}: CodeBlockProps) {
  const { common: t } = useStrings()
  // A final newline ends the last line rather than starting an empty one.
  const source = code.endsWith('\n') ? code.slice(0, -1) : code
  const lines = useMemo(() => source.split('\n'), [source])
  const highlighted = useHighlighted(source, language, streaming)
  const tokens = tokensFor(highlighted, source, language, lines.length)
  const numbered = lineNumbers ?? lines.length > 1
  const lastLine = startLine + lines.length - 1

  const body = useRef<HTMLDivElement>(null)
  const [scrollable, setScrollable] = useState(false)
  // Only a block that scrolls takes focus, so the keys can scroll it; one
  // that shows all of its code is no stop on the way through the page.
  useLayoutEffect(() => {
    const el = body.current
    if (!el) {
      return
    }
    setScrollable(isScrollable(el))
    if (typeof ResizeObserver === 'undefined') {
      return
    }
    const observer = new ResizeObserver(() => setScrollable(isScrollable(el)))
    observer.observe(el)
    if (el.firstElementChild) {
      observer.observe(el.firstElementChild)
    }
    return () => observer.disconnect()
  }, [])

  // While code streams in, the end stays in view unless the reader has
  // scrolled up to read.
  const atEnd = useRef(true)
  useLayoutEffect(() => {
    const el = body.current
    if (streaming && el && atEnd.current && source) {
      el.scrollTop = el.scrollHeight
    }
  }, [source, streaming])

  const name = label ?? (typeof title === 'string' ? title : t.codeOf(language))
  const heading = title ?? language
  const bodyStyle: CSSProperties = {}
  if (!fill && maxHeight !== undefined) {
    bodyStyle.maxHeight = typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight
  }
  const codeStyle = {
    counterReset: `line ${startLine - 1}`,
    // Wide enough for the longest number, and never narrower than two digits'
    // room, so short blocks keep one gutter.
    '--code-gutter': `max(1.5rem, ${String(lastLine).length}ch)`,
  } as CSSProperties

  return (
    <div
      data-code-block=""
      className={cx(
        // not-prose: an answer's typography styles every pre it holds.
        'not-prose flex flex-col overflow-hidden rounded-xl bg-(--theme-code-bg) text-(--theme-code-text) shadow-[0_0_0_1px_color-mix(in_oklab,var(--theme-app)_8%,transparent)]',
        fill && 'h-full min-h-0',
        bleed && 'max-sm:-mx-4 max-sm:rounded-none',
        className,
      )}
    >
      <div className="flex h-9 shrink-0 items-center gap-2 pr-1.5 pl-4">
        <div
          className={cx(
            'min-w-0 flex-1 truncate',
            // A host's title names the block, as a header does; the language alone is a caption.
            title === undefined
              ? 'text-xs text-(--theme-muted-text-color)'
              : 'text-[13px] font-medium text-(--theme-app)',
          )}
        >
          {heading}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {headerActions}
          {filename && (
            <IconButton
              label={t.download}
              icon={<DownloadIcon />}
              onClick={() => downloadText(code, filename)}
            />
          )}
          {copy && <CopyButton text={code} />}
        </div>
      </div>
      <div
        ref={body}
        dir="ltr"
        className={cx(
          'overflow-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--theme-focus)',
          fill && 'min-h-0 flex-1',
        )}
        style={bodyStyle}
        onScroll={(e) => {
          const el = e.currentTarget
          atEnd.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 4
        }}
        {...(scrollable ? { tabIndex: 0, role: 'region', 'aria-label': name } : {})}
      >
        <pre
          className={cx(
            'm-0 px-4 pt-0.5 pb-3.5 font-mono text-sm leading-[1.6]',
            wrap ? 'w-full' : 'w-max min-w-full',
          )}
        >
          <code className="block" style={codeStyle}>
            {lines.map((line, i) => (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: lines are positional
                key={i}
                className={cx(
                  'flex min-h-[1lh] items-baseline',
                  numbered &&
                    'before:mr-4 before:w-(--code-gutter) before:shrink-0 before:text-right before:font-mono before:text-[0.8125rem] before:text-(--theme-muted-text-color)/60 before:content-[counter(line)] before:[counter-increment:line]',
                )}
              >
                <span
                  className={cx(
                    'min-w-0',
                    wrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre',
                  )}
                >
                  {tokens[i]
                    ? tokens[i].map((token, j) => (
                        <span
                          // biome-ignore lint/suspicious/noArrayIndexKey: tokens are positional
                          key={j}
                          style={
                            token.color || token.fontStyle
                              ? { color: token.color, fontStyle: token.fontStyle }
                              : undefined
                          }
                        >
                          {token.content}
                        </span>
                      ))
                    : line}
                </span>
              </span>
            ))}
          </code>
        </pre>
      </div>
    </div>
  )
}

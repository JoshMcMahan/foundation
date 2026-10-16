import { lazy, Suspense } from 'react'
import type { Components, ControlsConfig } from 'streamdown'
import { cx } from '../cx'

export interface MarkdownProps {
  children: string
  /** Renders as text still arriving: a caret, and unfinished syntax left open. */
  isStreaming?: boolean
  /** The copy and download buttons on code blocks, tables and diagrams. */
  controls?: ControlsConfig
  /** Per-tag overrides of the rendered elements. */
  components?: Components
  httpsImagesOnly?: boolean
  /** Sets it at the page's text size, for Markdown inside other UI rather than a document of its own. */
  compact?: boolean
}

// Streamdown pulls in the whole shiki + katex stack (~230KB compressed), so it
// only loads when markdown actually renders instead of riding the layout chunk
// onto every page.
const MarkdownImpl = lazy(() => import('./MarkdownImpl'))

/** Markdown, with highlighted code, math and mermaid diagrams. Links leave in a
 *  new tab, and inline code breaks after path separators. */
export default function Markdown(props: MarkdownProps) {
  return (
    <Suspense
      fallback={
        <div
          className={cx(
            'markdown whitespace-pre-wrap text-start w-full',
            props.compact && 'markdown-compact',
          )}
        >
          {props.children}
        </div>
      }
    >
      <MarkdownImpl {...props} />
    </Suspense>
  )
}

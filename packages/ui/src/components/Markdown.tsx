import { lazy, Suspense } from 'react'
import type { ControlsConfig } from 'streamdown'

export interface MarkdownProps {
  children: string
  isStreaming?: boolean
  controls?: ControlsConfig
}

// Streamdown pulls in the whole shiki + katex stack (~230KB compressed), so it
// only loads when markdown actually renders instead of riding the layout chunk
// onto every page.
const MarkdownImpl = lazy(() => import('./MarkdownImpl'))

export default function Markdown(props: MarkdownProps) {
  return (
    <Suspense
      fallback={
        <div className="markdown whitespace-pre-wrap text-start w-full">{props.children}</div>
      }
    >
      <MarkdownImpl {...props} />
    </Suspense>
  )
}

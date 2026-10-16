import { type ReactNode, type RefObject, useEffect, useId, useRef, useState } from 'react'
import Markdown from '../components/Markdown'
import { useRunFile, useStrings, useWorkflowEngine } from '../components/Provider'
import { RunStatusIcon } from '../components/RunStatusIcon'
import { cx } from '../cx'
import { FileTextIcon } from '../icons'
import type { WorkflowJob, WorkflowStep } from './types'
import { jobLabel } from './util'

export interface StepSummarySource {
  /** The `subworkflows/<job>/step_<n>/` chain of a step inside a subworkflow; empty at the top level. */
  prefix: string
  job: string
  /** The job's name, after the names of the jobs whose subworkflows it runs in. */
  jobNames: string[]
  index: number
  step: WorkflowStep
}

// The step's dialog names a step the same way.
const SEPARATOR = ' › '

// A job still running has no completion time, so it follows every job that finished.
function completion(job: WorkflowJob): number {
  const millis = job.completedAt ? Date.parse(job.completedAt) : Number.NaN
  return Number.isNaN(millis) ? Number.POSITIVE_INFINITY : millis
}

/** The steps, subworkflows' included, that wrote a summary, in the order their jobs completed. */
export function stepSummarySources(jobs: Record<string, WorkflowJob>): StepSummarySource[] {
  const found: (StepSummarySource & { completedAt: number })[] = []
  const collect = (level: Record<string, WorkflowJob>, prefix: string, parents: string[]) => {
    for (const [job, value] of Object.entries(level)) {
      const jobNames = [...parents, jobLabel(job, value)]
      value.steps?.forEach((step, index) => {
        if (step.summary) {
          found.push({ prefix, job, jobNames, index, step, completedAt: completion(value) })
        }
        if (step.subworkflow?.jobs) {
          collect(step.subworkflow.jobs, `${prefix}subworkflows/${job}/step_${index}/`, jobNames)
        }
      })
    }
  }
  collect(jobs, '', [])
  // Array.prototype.sort is stable, so a job's summaries keep their step order.
  return found
    .sort((a, b) => a.completedAt - b.completedAt || 0)
    .map(({ completedAt: _, ...source }) => source)
}

/**
 * A run's step summaries, each on its own card headed by the job and step that wrote it, so a run
 * reads like a report under its graph. The job list beside the graph already shows the run's tree,
 * so the cards are flat.
 */
export function StepSummaries({
  runSlug,
  jobs,
  onOpenLog,
}: {
  runSlug: string
  jobs: Record<string, WorkflowJob>
  onOpenLog: (source: StepSummarySource) => void
}) {
  const { dag } = useStrings()
  const sources = stepSummarySources(jobs)
  if (sources.length === 0) {
    return null
  }
  return (
    <section aria-label={dag.stepSummaries} className="flex flex-col gap-3">
      {sources.map((source) => (
        <SummaryCard
          key={`${source.prefix}${source.job}:${source.index}`}
          runSlug={runSlug}
          source={source}
          onOpenLog={() => onOpenLog(source)}
        />
      ))}
    </section>
  )
}

function SummaryCard({
  runSlug,
  source,
  onOpenLog,
}: {
  runSlug: string
  source: StepSummarySource
  onOpenLog: () => void
}) {
  const { dag } = useStrings()
  const engine = useWorkflowEngine()
  const headingId = useId()
  const ref = useRef<HTMLElement>(null)
  const near = useNearViewport(ref)
  const path = engine
    .stepLogPath(source.prefix, source.job, source.index)
    .replace(/logs\.out$/, 'summary.md')
  const failed = source.step.status === 'failed'
  const job = source.jobNames.join(SEPARATOR)
  const step = engine.stepLabel(source.step, source.index)
  return (
    <article
      ref={ref}
      aria-labelledby={headingId}
      className={cx('panel min-w-0 rounded-lg border', failed && 'border-(--theme-error)')}
    >
      <div className="flex items-center gap-2 border-b px-4 py-2.5">
        <RunStatusIcon status={source.step.status} />
        {/* The job gives way first, since the step names the summary. */}
        <h3
          id={headingId}
          // Its parts sit in a flex row, which would run them together in its accessible name.
          aria-label={`${job}${SEPARATOR}${step}`}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-sm"
        >
          <span className="min-w-0 shrink-[2] truncate theme-muted-text" title={job}>
            {job}
          </span>
          <span className="shrink-0 theme-muted-text">{SEPARATOR}</span>
          <span className="min-w-0 truncate font-medium" title={step}>
            {step}
          </span>
        </h3>
        <button
          type="button"
          onClick={onOpenLog}
          aria-describedby={headingId}
          className="inline-flex shrink-0 items-center gap-1.5 rounded px-1.5 py-0.5 text-sm theme-muted-text transition-colors hover:bg-(--theme-hover) hover:text-(--theme-link)"
        >
          <FileTextIcon aria-hidden className="h-3.5 w-3.5" />
          <span className="max-sm:sr-only">{dag.logsTab}</span>
        </button>
      </div>
      <div className="px-4 py-3.5 sm:px-5">
        {/* A run can have many summaries; each is fetched as it nears the screen. */}
        <SummaryBody runSlug={runSlug} path={near ? path : null} />
      </div>
    </article>
  )
}

function SummaryBody({ runSlug, path }: { runSlug: string; path: string | null }) {
  const { dag } = useStrings()
  const { data, isLoading, error } = useRunFile(runSlug, path)
  if (path === null || (isLoading && data === undefined)) {
    return (
      <div role="status" aria-label={dag.loadingSummary} className="flex flex-col gap-2 py-1">
        {['w-2/3', 'w-1/2', 'w-5/6'].map((width) => (
          <div
            key={width}
            className={cx('h-3 rounded bg-(--theme-border) motion-safe:animate-pulse', width)}
          />
        ))}
      </div>
    )
  }
  if (error || data === undefined) {
    return <p className="text-sm theme-muted-text">{dag.summaryLoadFailed}</p>
  }
  return (
    <Clamped>
      <Markdown httpsImagesOnly compact>
        {data}
      </Markdown>
    </Clamped>
  )
}

// Two screens of margin, so a summary has usually loaded by the time it scrolls in.
function useNearViewport(ref: RefObject<HTMLElement | null>): boolean {
  const [near, setNear] = useState(typeof IntersectionObserver === 'undefined')
  useEffect(() => {
    const el = ref.current
    if (near || !el) {
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true)
        }
      },
      { rootMargin: '200% 0px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref, near])
  return near
}

// A long summary would push every card after it out of reach, so past a cap it opens on request.
function Clamped({ children }: { children: ReactNode }) {
  const { common } = useStrings()
  const ref = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [clipped, setClipped] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || expanded) {
      return
    }
    const measure = () => setClipped(el.scrollHeight > el.clientHeight + 1)
    // The box itself resizes whenever its content crosses the cap.
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    measure()
    return () => observer.disconnect()
  }, [expanded])
  return (
    <div className="flex flex-col gap-2">
      {/* Streamdown scrolls a table past 300px inside itself; here Show more is the one way a summary grows. */}
      <div
        ref={ref}
        className={cx(
          // A long word wraps anywhere, but a table cell keeps its number whole and the table scrolls.
          'min-w-0 [overflow-wrap:anywhere] [&_table]:[overflow-wrap:normal] [&_[data-streamdown=table-wrapper]>div]:max-h-none!',
          !expanded && 'max-h-[32rem] overflow-hidden',
          !expanded && clipped && 'mask-[linear-gradient(to_bottom,black_75%,transparent)]',
        )}
      >
        {children}
      </div>
      {(clipped || expanded) && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
          className="link w-fit text-sm font-medium"
        >
          {expanded ? common.showLess : common.showMore}
        </button>
      )}
    </div>
  )
}

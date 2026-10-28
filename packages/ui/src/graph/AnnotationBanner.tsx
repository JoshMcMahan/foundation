import { useId, useState } from 'react'
import { keyedByContent } from '../components/keys'
import { useStrings } from '../components/Provider'
import { type Tone, toneIcon, toneSurface, toneText } from '../components/tone'
import { cx } from '../cx'
import { ChevronRightIcon, ErrorIcon, InfoIcon, WarningIcon } from '../icons'
import type { WorkflowJob } from './types'

type AnnotationType = 'error' | 'warning' | 'notice'

interface CollectedAnnotation {
  type: AnnotationType
  message: string
  title?: string | undefined
  file?: string | undefined
  line?: number | undefined
  id?: string | undefined
  jobName: string
  stepName: string | undefined
  stepIndex: number
}

export interface AnnotationBannerProps {
  executedJobs: Record<string, WorkflowJob>
}

const typeOrder: Record<AnnotationType, number> = {
  error: 0,
  warning: 1,
  notice: 2,
}

// Each kind of annotation in its status tone: words in the text shade, icons in the vivid one.
const typeConfig: Record<AnnotationType, { icon: typeof ErrorIcon; tone: Tone }> = {
  error: { icon: ErrorIcon, tone: 'error' },
  warning: { icon: WarningIcon, tone: 'warning' },
  notice: { icon: InfoIcon, tone: 'info' },
}

function collectAnnotations(
  executedJobs: Record<string, WorkflowJob>,
  parentPath?: string,
): CollectedAnnotation[] {
  const annotations: CollectedAnnotation[] = []

  for (const [jobName, job] of Object.entries(executedJobs)) {
    const fullJobName = parentPath ? `${parentPath} > ${jobName}` : jobName
    const steps = job?.steps
    if (!Array.isArray(steps)) {
      continue
    }

    for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
      const step = steps[stepIndex]
      const stepAnnotations = step?.annotations
      if (Array.isArray(stepAnnotations)) {
        for (const annotation of stepAnnotations) {
          if (annotation?.message) {
            annotations.push({
              type: annotation.type || 'notice',
              message: annotation.message,
              title: annotation.title,
              file: annotation.file,
              line: annotation.line,
              id: annotation.id,
              jobName: fullJobName,
              stepName: step?.name,
              stepIndex,
            })
          }
        }
      }

      // Recurse into subworkflows
      const subJobs = step?.subworkflow?.jobs
      if (subJobs && typeof subJobs === 'object') {
        annotations.push(...collectAnnotations(subJobs, fullJobName))
      }
    }
  }

  annotations.sort((a, b) => (typeOrder[a.type] ?? 2) - (typeOrder[b.type] ?? 2))

  return annotations
}

export function AnnotationBanner({ executedJobs }: AnnotationBannerProps) {
  const [expanded, setExpanded] = useState(false)
  const { dag: t } = useStrings()
  const listId = useId()

  const annotations = collectAnnotations(executedJobs)
  if (annotations.length === 0) {
    return null
  }

  const counts = { error: 0, warning: 0, notice: 0 }
  for (const a of annotations) {
    counts[a.type]++
  }

  return (
    <div className="overflow-hidden rounded-lg border border-(--theme-border) bg-(--theme-panel-bg)">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={listId}
        // The badges are numbers beside icons; the name says what each counts.
        aria-label={t.annotationsLabel(counts)}
        onClick={() => setExpanded((prev) => !prev)}
        className={cx(
          'flex w-full items-center gap-3 px-4 py-2.5 text-left',
          'transition-colors hover:bg-(--theme-hover) motion-reduce:transition-none',
          'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--theme-focus)',
          expanded && 'border-b border-(--theme-border)',
        )}
      >
        <ChevronRightIcon
          className={cx(
            'size-3.5 shrink-0 text-(--theme-muted-text-color) transition-transform motion-reduce:transition-none',
            expanded && 'rotate-90',
          )}
        />
        <span className="text-sm font-medium text-(--theme-app)">{t.annotations}</span>
        <span aria-hidden className="flex items-center gap-1.5">
          {(['error', 'warning', 'notice'] as const).map((type) => {
            if (!counts[type]) {
              return null
            }
            const { icon: Icon, tone } = typeConfig[type]
            return (
              <span
                key={type}
                className={cx(
                  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium tabular-nums',
                  toneSurface[tone],
                )}
              >
                <Icon className={cx('size-3', toneIcon[tone])} />
                {counts[type]}
              </span>
            )
          })}
        </span>
      </button>

      {expanded && (
        <ul id={listId} className="max-h-[400px] divide-y divide-(--theme-border) overflow-y-auto">
          {keyedByContent(annotations, (a) => a.id ?? `${a.type}:${a.title}:${a.message}`).map(
            ({ key, item: annotation }) => {
              const { icon: Icon, tone } = typeConfig[annotation.type] || typeConfig.notice
              return (
                <li key={key} className="flex items-start gap-2.5 px-4 py-2 text-sm">
                  <Icon className={cx('mt-0.5 size-4 shrink-0', toneIcon[tone])} />
                  <div className="min-w-0 flex-1">
                    <span className={cx('font-medium', toneText[tone])}>
                      {annotation.title ||
                        t.annotationType[annotation.type] ||
                        t.annotationType.notice}
                      :
                    </span>{' '}
                    <span className="text-(--theme-app)">{annotation.message}</span>
                    <span className="ml-2 text-xs text-(--theme-muted-text-color)">
                      {t.annotationSource(
                        annotation.jobName,
                        annotation.stepName || t.stepNumber(annotation.stepIndex),
                      )}
                    </span>
                  </div>
                </li>
              )
            },
          )}
        </ul>
      )}
    </div>
  )
}

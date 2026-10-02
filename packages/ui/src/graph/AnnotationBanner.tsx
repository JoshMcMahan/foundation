import cx from 'classnames'
import { useState } from 'react'
import { keyedByContent } from '../components/keys'
import { ChevronDownIcon, ChevronRightIcon, ErrorIcon, InfoIcon, WarningIcon } from '../icons'
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

interface AnnotationBannerProps {
  executedJobs: Record<string, WorkflowJob> | null | undefined
}

const typeOrder: Record<AnnotationType, number> = {
  error: 0,
  warning: 1,
  notice: 2,
}

const typeConfig: Record<
  AnnotationType,
  {
    icon: typeof ErrorIcon
    label: string
    accentClass: string
    bgClass: string
    countBg: string
  }
> = {
  error: {
    icon: ErrorIcon,
    label: 'Error',
    accentClass: 'text-red-500',
    bgClass: 'bg-red-500/5 dark:bg-red-500/10',
    countBg: 'bg-red-500/15 text-red-700 dark:text-red-400',
  },
  warning: {
    icon: WarningIcon,
    label: 'Warning',
    accentClass: 'text-yellow-500',
    bgClass: 'bg-yellow-500/5 dark:bg-yellow-500/10',
    countBg: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400',
  },
  notice: {
    icon: InfoIcon,
    label: 'Notice',
    accentClass: 'text-blue-500',
    bgClass: 'bg-blue-500/5 dark:bg-blue-500/10',
    countBg: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  },
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

  if (!executedJobs) {
    return null
  }

  const annotations = collectAnnotations(executedJobs)
  if (annotations.length === 0) {
    return null
  }

  const counts = { error: 0, warning: 0, notice: 0 }
  for (const a of annotations) {
    counts[a.type]++
  }

  const ChevronIcon = expanded ? ChevronDownIcon : ChevronRightIcon

  return (
    <div
      className={cx(
        'rounded-lg border border-[var(--theme-border)] overflow-hidden',
        'bg-[var(--theme-panel-bg)]',
      )}
    >
      {/* Clickable header — always visible */}
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className={cx(
          'w-full flex items-center gap-3 px-4 py-2.5 text-left',
          'hover:bg-[var(--theme-hover)] transition-colors',
          expanded && 'border-b border-[var(--theme-border)]',
        )}
      >
        <ChevronIcon className="w-3.5 h-3.5 text-[var(--theme-muted-text-color)] shrink-0" />

        <span className="text-sm font-medium text-[var(--theme-panel-color)]">Annotations</span>

        {/* Count badges */}
        <div className="flex items-center gap-1.5">
          {(['error', 'warning', 'notice'] as const).map((type) => {
            if (!counts[type]) {
              return null
            }
            const config = typeConfig[type]
            const Icon = config.icon
            return (
              <span
                key={type}
                className={cx(
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
                  config.countBg,
                )}
              >
                <Icon className="w-3 h-3" />
                {counts[type]}
              </span>
            )
          })}
        </div>
      </button>

      {/* Annotation list — shown when expanded */}
      {expanded && (
        <div className="divide-y divide-[var(--theme-border)] max-h-[400px] overflow-y-auto">
          {keyedByContent(annotations, (a) => a.id ?? `${a.type}:${a.title}:${a.message}`).map(
            ({ key, item: annotation }) => {
              const config = typeConfig[annotation.type] || typeConfig.notice
              const Icon = config.icon

              return (
                <div
                  key={key}
                  className={cx('flex items-start gap-2.5 px-4 py-2 text-sm', config.bgClass)}
                >
                  <Icon className={cx('w-4 h-4 mt-0.5 shrink-0', config.accentClass)} />
                  <div className="flex-1 min-w-0">
                    <span className={cx('font-medium', config.accentClass)}>
                      {annotation.title || config.label}:
                    </span>{' '}
                    <span className="text-[var(--theme-panel-color)]">{annotation.message}</span>
                    <span className="text-[var(--theme-muted-text-color)] ml-2 text-xs">
                      in {annotation.jobName} &rarr;{' '}
                      {annotation.stepName || `step ${annotation.stepIndex}`}
                    </span>
                  </div>
                </div>
              )
            },
          )}
        </div>
      )}
    </div>
  )
}

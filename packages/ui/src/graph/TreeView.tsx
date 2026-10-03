import cx from 'classnames'
import { AnimatePresence, motion } from 'framer-motion'
import { DateTime } from 'luxon'
import { useCallback, useId, useMemo, useState } from 'react'
import { Indicator } from '../components/Indicator'
import { useRunFile, useSlots, useWorkflowEngine } from '../components/Provider'
import { toAbsHumanDuration } from '../duration'
import { ChevronRightIcon, LoaderIcon } from '../icons'
import { LogViewer } from '../logviewer'
import type { WorkflowJob as Job, WorkflowStep as Step } from './types'

interface TreeViewProps {
  jobs: Record<string, Job>
  workflowName: string
  runNumber: number
  slug: string
  expandedJobs: Set<string>
  setExpandedJobs: (jobs: Set<string>) => void
}

function getStepDuration(step: Step): string {
  if (!step.startedAt) {
    return ''
  }
  const start = DateTime.fromISO(step.startedAt)
  const end = step.completedAt ? DateTime.fromISO(step.completedAt) : DateTime.now()
  return toAbsHumanDuration(start, end)
}

function getJobDuration(job: Job): string {
  if (!job.startedAt) {
    return ''
  }
  const start = DateTime.fromISO(job.startedAt)
  const end = job.completedAt ? DateTime.fromISO(job.completedAt) : DateTime.now()
  return toAbsHumanDuration(start, end)
}

function formatJobLabel(jobName: string, job?: Job): string {
  const matrix = job?._matrix
  if (matrix?.originaljob) {
    const name = matrix.originaljob.charAt(0).toUpperCase() + matrix.originaljob.slice(1)
    return `${name} (${(matrix.index ?? 0) + 1}/${matrix.totalingroup ?? '?'})`
  }
  return (jobName.charAt(0).toUpperCase() + jobName.slice(1)).replace(/_/g, ' ')
}

// Inline log viewer component using the shared LogViewer
function InlineLogViewer({
  slug,
  jobName,
  stepIndex,
}: {
  slug: string
  jobName: string
  stepIndex: number
}) {
  const engine = useWorkflowEngine()
  const logPath = engine.stepLogPath('', jobName, stepIndex)
  const { data: logs, isLoading, error } = useRunFile(slug, logPath, { refreshInterval: 2000 })

  if (isLoading && !logs) {
    return (
      <div className="flex items-center gap-2 px-5 py-4 text-sm text-[var(--theme-muted-text-color)]">
        <LoaderIcon className="w-4 h-4" />
        <span>Loading logs...</span>
      </div>
    )
  }

  if (error || !logs) {
    return (
      <div className="px-5 py-4 text-sm text-[var(--theme-muted-text-color)] italic">
        No logs available
      </div>
    )
  }

  return (
    <div className="border-t border-[var(--theme-border)] ">
      <LogViewer
        log={logs}
        width="100%"
        height="unset"
        inline
        contentClassName="bg-[var(--theme-app-bg)]"
        enableWorkflowCommands
      />
    </div>
  )
}

function JobRow({
  jobName,
  job,
  isExpanded,
  onToggle,
  dependencies,
  workflowName,
  runNumber,
  slug,
  expandedJobs,
  onJobToggle,
  expandedSteps,
  onStepToggle,
}: {
  jobName: string
  job: Job
  isExpanded: boolean
  onToggle: () => void
  dependencies?: string[] | undefined
  workflowName: string
  runNumber: number
  slug: string
  expandedJobs: Set<string>
  onJobToggle: (jobKey: string) => void
  expandedSteps: Set<string>
  onStepToggle: (stepKey: string) => void
}) {
  const hasSteps = job.steps && job.steps.length > 0
  const duration = getJobDuration(job)
  const panelId = useId()

  return (
    <div className="border-b border-[var(--theme-border)] last:border-b-0">
      {/* Job Header */}
      <button
        type="button"
        aria-expanded={isExpanded}
        aria-controls={hasSteps ? panelId : undefined}
        className={cx(
          'flex items-center gap-3 px-5 py-3 transition-colors w-full text-left',
          job.status === 'skipped' || job.status === 'skipped-failed'
            ? 'cursor-default'
            : 'cursor-pointer',
          isExpanded && 'bg-[var(--theme-panel-bg)]',
        )}
        onClick={onToggle}
      >
        {/* Chevron */}
        <motion.div
          animate={{ rotate: isExpanded ? 90 : 0 }}
          transition={{ duration: 0.15 }}
          className={cx(
            'flex-shrink-0',
            hasSteps ? 'text-[var(--theme-muted-text-color)]' : 'invisible',
          )}
        >
          <ChevronRightIcon
            className={cx('w-4 h-4', isExpanded && 'text-[var(--theme-element)]')}
          />
        </motion.div>

        {/* Status Indicator */}
        <Indicator status={job.status} />

        {/* Job Info */}
        <div className="flex flex-col gap-1 min-w-0 flex-1">
          <span className="font-mono text-sm text-[var(--theme-app)] truncate">
            {formatJobLabel(jobName, job)}
          </span>
          {dependencies && dependencies.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-[var(--theme-muted-text-color)]">depends on:</span>
              {dependencies.map((dep) => (
                <span
                  key={dep}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--theme-muted-panel-bg)] text-[var(--theme-muted-text-color)]"
                >
                  {formatJobLabel(dep)}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Duration */}
        {duration && (
          <span className="font-mono text-xs text-[var(--theme-muted-text-color)] flex-shrink-0">
            {duration}
          </span>
        )}
      </button>

      {/* Nested Steps */}
      <AnimatePresence initial={false}>
        {isExpanded && hasSteps && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
            className="overflow-hidden"
            id={panelId}
          >
            <div className="ml-[38px] border-l-2 border-[var(--theme-border)]">
              {job.steps.map((step, index) => {
                const stepKey = `${jobName}:${index}`
                const isStepExpanded = expandedSteps.has(stepKey)
                return (
                  <StepRow
                    key={stepKey}
                    step={step}
                    index={index}
                    isExpanded={isStepExpanded}
                    onToggle={() => onStepToggle(stepKey)}
                    workflowName={workflowName}
                    runNumber={runNumber}
                    slug={slug}
                    jobName={jobName}
                    expandedJobs={expandedJobs}
                    onJobToggle={onJobToggle}
                    expandedSteps={expandedSteps}
                    onStepToggle={onStepToggle}
                  />
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function StepRow({
  step,
  index,
  isExpanded,
  onToggle,
  slug,
  jobName,
  expandedJobs,
  onJobToggle,
  expandedSteps,
  onStepToggle,
  depth = 0,
}: {
  step: Step
  index: number
  isExpanded: boolean
  onToggle: () => void
  workflowName: string
  runNumber: number
  slug: string
  jobName: string
  expandedJobs: Set<string>
  onJobToggle: (jobKey: string) => void
  expandedSteps: Set<string>
  onStepToggle: (stepKey: string) => void
  depth?: number
}) {
  const engine = useWorkflowEngine()
  const slots = useSlots()
  const duration = getStepDuration(step)
  const label = engine.stepLabel(step, index)
  const isSubworkflow = !!step.subworkflow
  const panelId = useId()

  // Get subworkflow jobs if this is a subworkflow step
  const subworkflowJobs = step.subworkflow?.jobs ?? null
  const subworkflowJobNames = subworkflowJobs
    ? Object.keys(subworkflowJobs).filter((name) => subworkflowJobs[name]?.if !== false)
    : []

  // Build dependencies map for subworkflow
  const subworkflowDependenciesMap = useMemo(() => {
    if (!subworkflowJobs) {
      return {}
    }
    const map: Record<string, string[]> = {}
    for (const subJobName of subworkflowJobNames) {
      const job = subworkflowJobs[subJobName]
      if (job?.needs && Array.isArray(job.needs) && job.needs.length > 0) {
        map[subJobName] = job.needs
      }
    }
    return map
  }, [subworkflowJobs, subworkflowJobNames])

  return (
    <div>
      <button
        type="button"
        aria-expanded={isExpanded}
        aria-controls={panelId}
        className={cx(
          'flex items-center gap-3 px-5 py-2.5 cursor-pointer transition-colors w-full text-left',
          isExpanded ? '' : 'hover:bg-[var(--theme-hover)]',
        )}
        onClick={onToggle}
      >
        {/* Chevron for expandable logs */}
        <motion.div
          animate={{ rotate: isExpanded ? 90 : 0 }}
          transition={{ duration: 0.15 }}
          className="flex-shrink-0 text-[var(--theme-muted-text-color)]"
        >
          <ChevronRightIcon
            className={cx('w-4 h-4', isExpanded && 'text-[var(--theme-element)]')}
          />
        </motion.div>

        {/* Status Indicator */}
        <Indicator status={step.status} />

        {/* Subworkflow Icon */}
        {isSubworkflow &&
          slots.workflowIcon?.({
            image: step.subworkflow?.image,
            type: step.subworkflow?.type,
            className: 'h-4 w-4 flex-shrink-0',
          })}

        {/* Step Name */}
        <span className="font-mono text-sm text-[var(--theme-app)] truncate flex-1">
          {label}
          {isSubworkflow && (
            <span className="ml-2 text-xs text-[var(--theme-muted-text-color)]">(subworkflow)</span>
          )}
        </span>

        {/* Duration */}
        {duration && (
          <span className="font-mono text-xs text-[var(--theme-muted-text-color)] flex-shrink-0">
            {duration}
          </span>
        )}
      </button>

      {/* Inline Logs (for non-subworkflow steps) */}
      <AnimatePresence initial={false}>
        {isExpanded && !isSubworkflow && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
            className="overflow-hidden"
            id={panelId}
          >
            <InlineLogViewer slug={slug} jobName={jobName} stepIndex={index} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Subworkflow Jobs (nested) */}
      <AnimatePresence initial={false}>
        {isExpanded && isSubworkflow && subworkflowJobNames.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
            className="overflow-hidden"
            id={panelId}
          >
            <div className="ml-[38px] border-l-2 border-[var(--theme-border)]">
              {subworkflowJobNames.map((subJobName) => {
                const subJob = subworkflowJobs?.[subJobName]
                if (!subJob) {
                  return null
                }
                const subJobKey = `${jobName}:${index}:${subJobName}`
                const isSubJobExpanded = expandedJobs.has(subJobKey)
                return (
                  <SubworkflowJobRow
                    key={subJobName}
                    jobName={subJobName}
                    job={subJob}
                    isExpanded={isSubJobExpanded}
                    onToggle={() => onJobToggle(subJobKey)}
                    dependencies={subworkflowDependenciesMap[subJobName]}
                    slug={slug}
                    parentJobName={jobName}
                    parentStepIndex={index}
                    expandedJobs={expandedJobs}
                    onJobToggle={onJobToggle}
                    expandedSteps={expandedSteps}
                    onStepToggle={onStepToggle}
                    depth={depth + 1}
                  />
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// Subworkflow job row - similar to JobRow but with path-based log retrieval
function SubworkflowJobRow({
  jobName,
  job,
  isExpanded,
  onToggle,
  dependencies,
  slug,
  parentJobName,
  parentStepIndex,
  subworkflowPrefix,
  expandedJobs,
  onJobToggle,
  expandedSteps,
  onStepToggle,
  depth,
}: {
  jobName: string
  job: Job
  isExpanded: boolean
  onToggle: () => void
  dependencies?: string[] | undefined
  slug: string
  parentJobName: string
  parentStepIndex: number
  subworkflowPrefix?: string
  expandedJobs: Set<string>
  onJobToggle: (jobKey: string) => void
  expandedSteps: Set<string>
  onStepToggle: (stepKey: string) => void
  depth: number
}) {
  const hasSteps = job.steps && job.steps.length > 0
  const duration = getJobDuration(job)
  // Build the subworkflow prefix path matching the DAG view format:
  // subworkflows/{parentJob}/step_{parentStep}/
  const nestedSubworkflowPrefix = `${subworkflowPrefix || ''}subworkflows/${parentJobName}/step_${parentStepIndex}/`
  const panelId = useId()

  return (
    <div className="border-b border-[var(--theme-border)] last:border-b-0">
      {/* Job Header */}
      <button
        type="button"
        aria-expanded={isExpanded}
        aria-controls={hasSteps ? panelId : undefined}
        className={cx(
          'flex items-center gap-3 px-5 py-3 transition-colors w-full text-left',
          job.status === 'skipped' || job.status === 'skipped-failed'
            ? 'cursor-default'
            : 'cursor-pointer',
          isExpanded && 'bg-[var(--theme-panel-bg)]',
        )}
        onClick={onToggle}
      >
        {/* Chevron */}
        <motion.div
          animate={{ rotate: isExpanded ? 90 : 0 }}
          transition={{ duration: 0.15 }}
          className={cx(
            'flex-shrink-0',
            hasSteps ? 'text-[var(--theme-muted-text-color)]' : 'invisible',
          )}
        >
          <ChevronRightIcon
            className={cx('w-4 h-4', isExpanded && 'text-[var(--theme-element)]')}
          />
        </motion.div>

        {/* Status Indicator */}
        <Indicator status={job.status} />

        {/* Job Info */}
        <div className="flex flex-col gap-1 min-w-0 flex-1">
          <span className="font-mono text-sm text-[var(--theme-app)] truncate">
            {formatJobLabel(jobName, job)}
          </span>
          {dependencies && dependencies.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-[var(--theme-muted-text-color)]">depends on:</span>
              {dependencies.map((dep) => (
                <span
                  key={dep}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--theme-muted-panel-bg)] text-[var(--theme-muted-text-color)]"
                >
                  {formatJobLabel(dep)}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Duration */}
        {duration && (
          <span className="font-mono text-xs text-[var(--theme-muted-text-color)] flex-shrink-0">
            {duration}
          </span>
        )}
      </button>

      {/* Nested Steps */}
      <AnimatePresence initial={false}>
        {isExpanded && hasSteps && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
            className="overflow-hidden"
            id={panelId}
          >
            <div className="ml-[38px] border-l-2 border-[var(--theme-border)]">
              {job.steps.map((step, index) => {
                const stepKey = `${nestedSubworkflowPrefix}${jobName}:${index}`
                const isStepExpanded = expandedSteps.has(stepKey)
                return (
                  <SubworkflowStepRow
                    key={stepKey}
                    step={step}
                    index={index}
                    isExpanded={isStepExpanded}
                    onToggle={() => onStepToggle(stepKey)}
                    slug={slug}
                    subworkflowPrefix={nestedSubworkflowPrefix}
                    jobName={jobName}
                    expandedJobs={expandedJobs}
                    onJobToggle={onJobToggle}
                    expandedSteps={expandedSteps}
                    onStepToggle={onStepToggle}
                    depth={depth}
                  />
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// Subworkflow step row - handles nested log paths
function SubworkflowStepRow({
  step,
  index,
  isExpanded,
  onToggle,
  slug,
  subworkflowPrefix,
  jobName,
  expandedJobs,
  onJobToggle,
  expandedSteps,
  onStepToggle,
  depth,
}: {
  step: Step
  index: number
  isExpanded: boolean
  onToggle: () => void
  slug: string
  subworkflowPrefix: string
  jobName: string
  expandedJobs: Set<string>
  onJobToggle: (jobKey: string) => void
  expandedSteps: Set<string>
  onStepToggle: (stepKey: string) => void
  depth: number
}) {
  const engine = useWorkflowEngine()
  const slots = useSlots()
  const duration = getStepDuration(step)
  const label = engine.stepLabel(step, index)
  const isSubworkflow = !!step.subworkflow
  const panelId = useId()

  // Get subworkflow jobs if this is a subworkflow step
  const subworkflowJobs = step.subworkflow?.jobs ?? null
  const subworkflowJobNames = subworkflowJobs
    ? Object.keys(subworkflowJobs).filter((name) => subworkflowJobs[name]?.if !== false)
    : []

  // Build dependencies map for subworkflow
  const subworkflowDependenciesMap = useMemo(() => {
    if (!subworkflowJobs) {
      return {}
    }
    const map: Record<string, string[]> = {}
    for (const subJobName of subworkflowJobNames) {
      const job = subworkflowJobs[subJobName]
      if (job?.needs && Array.isArray(job.needs) && job.needs.length > 0) {
        map[subJobName] = job.needs
      }
    }
    return map
  }, [subworkflowJobs, subworkflowJobNames])

  return (
    <div>
      <button
        type="button"
        aria-expanded={isExpanded}
        aria-controls={panelId}
        className={cx(
          'flex items-center gap-3 px-5 py-2.5 cursor-pointer transition-colors w-full text-left',
          isExpanded ? '' : 'hover:bg-[var(--theme-hover)]',
        )}
        onClick={onToggle}
      >
        {/* Chevron for expandable logs */}
        <motion.div
          animate={{ rotate: isExpanded ? 90 : 0 }}
          transition={{ duration: 0.15 }}
          className="flex-shrink-0 text-[var(--theme-muted-text-color)]"
        >
          <ChevronRightIcon
            className={cx('w-4 h-4', isExpanded && 'text-[var(--theme-element)]')}
          />
        </motion.div>

        {/* Status Indicator */}
        <Indicator status={step.status} />

        {/* Subworkflow Icon */}
        {isSubworkflow &&
          slots.workflowIcon?.({
            image: step.subworkflow?.image,
            type: step.subworkflow?.type,
            className: 'h-4 w-4 flex-shrink-0',
          })}

        {/* Step Name */}
        <span className="font-mono text-sm text-[var(--theme-app)] truncate flex-1">
          {label}
          {isSubworkflow && (
            <span className="ml-2 text-xs text-[var(--theme-muted-text-color)]">(subworkflow)</span>
          )}
        </span>

        {/* Duration */}
        {duration && (
          <span className="font-mono text-xs text-[var(--theme-muted-text-color)] flex-shrink-0">
            {duration}
          </span>
        )}
      </button>

      {/* Inline Logs (for non-subworkflow steps) */}
      <AnimatePresence initial={false}>
        {isExpanded && !isSubworkflow && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
            className="overflow-hidden"
            id={panelId}
          >
            <SubworkflowInlineLogViewer
              slug={slug}
              subworkflowPrefix={subworkflowPrefix}
              jobName={jobName}
              stepIndex={index}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Subworkflow Jobs (nested) */}
      <AnimatePresence initial={false}>
        {isExpanded && isSubworkflow && subworkflowJobNames.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
            className="overflow-hidden"
            id={panelId}
          >
            <div className="ml-[38px] border-l-2 border-[var(--theme-border)]">
              {subworkflowJobNames.map((subJobName) => {
                const subJob = subworkflowJobs?.[subJobName]
                if (!subJob) {
                  return null
                }
                const subJobKey = `${subworkflowPrefix}${jobName}:${index}:${subJobName}`
                const isSubJobExpanded = expandedJobs.has(subJobKey)
                return (
                  <SubworkflowJobRow
                    key={subJobName}
                    jobName={subJobName}
                    job={subJob}
                    isExpanded={isSubJobExpanded}
                    onToggle={() => onJobToggle(subJobKey)}
                    dependencies={subworkflowDependenciesMap[subJobName]}
                    slug={slug}
                    parentJobName={jobName}
                    parentStepIndex={index}
                    subworkflowPrefix={subworkflowPrefix}
                    expandedJobs={expandedJobs}
                    onJobToggle={onJobToggle}
                    expandedSteps={expandedSteps}
                    onStepToggle={onStepToggle}
                    depth={depth + 1}
                  />
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// Inline log viewer for subworkflow steps (uses path-based log retrieval)
function SubworkflowInlineLogViewer({
  slug,
  subworkflowPrefix,
  jobName,
  stepIndex,
}: {
  slug: string
  subworkflowPrefix: string
  jobName: string
  stepIndex: number
}) {
  const engine = useWorkflowEngine()
  const logPath = engine.stepLogPath(subworkflowPrefix, jobName, stepIndex)
  const { data: logs, isLoading, error } = useRunFile(slug, logPath, { refreshInterval: 2000 })

  if (isLoading && !logs) {
    return (
      <div className="flex items-center gap-2 px-5 py-4 text-sm text-[var(--theme-muted-text-color)]">
        <LoaderIcon className="w-4 h-4" />
        <span>Loading logs...</span>
      </div>
    )
  }

  if (error || !logs) {
    return (
      <div className="px-5 py-4 text-sm text-[var(--theme-muted-text-color)] italic">
        No logs available
      </div>
    )
  }

  return (
    <div className="border-t border-[var(--theme-border)]">
      <LogViewer
        log={logs}
        width="100%"
        height="unset"
        inline
        contentClassName="bg-[var(--theme-app-bg)]"
        enableWorkflowCommands
      />
    </div>
  )
}

export default function TreeView({
  jobs,
  workflowName,
  runNumber,
  slug,
  expandedJobs,
  setExpandedJobs,
}: TreeViewProps) {
  const engine = useWorkflowEngine()
  // Filter out jobs with if === false (same logic as DAG view)
  const visibleJobNames = useMemo(() => {
    return Object.keys(jobs).filter((jobName) => jobs[jobName]?.if !== false)
  }, [jobs])
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set())
  // Track expanded subworkflow jobs separately
  const [expandedSubworkflowJobs, setExpandedSubworkflowJobs] = useState<Set<string>>(new Set())

  const toggleJob = useCallback(
    (jobName: string) => {
      const newExpanded = new Set(expandedJobs)
      if (newExpanded.has(jobName)) {
        newExpanded.delete(jobName)
      } else {
        const status = jobs[jobName]?.status
        if (status === 'skipped' || status === 'skipped-failed') {
          return
        }
        newExpanded.add(jobName)
      }
      setExpandedJobs(newExpanded)
    },
    [expandedJobs, setExpandedJobs, jobs],
  )

  const toggleSubworkflowJob = useCallback((jobKey: string) => {
    setExpandedSubworkflowJobs((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(jobKey)) {
        newSet.delete(jobKey)
      } else {
        newSet.add(jobKey)
      }
      return newSet
    })
  }, [])

  const toggleStep = useCallback((stepKey: string) => {
    setExpandedSteps((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(stepKey)) {
        newSet.delete(stepKey)
      } else {
        newSet.add(stepKey)
      }
      return newSet
    })
  }, [])

  const expandAll = useCallback(() => {
    setExpandedJobs(new Set(visibleJobNames))
  }, [visibleJobNames, setExpandedJobs])

  const collapseAll = useCallback(() => {
    setExpandedJobs(new Set())
    setExpandedSteps(new Set())
    setExpandedSubworkflowJobs(new Set())
  }, [setExpandedJobs])

  const allExpanded = expandedJobs.size === visibleJobNames.length

  // Build dependencies map
  const dependenciesMap = useMemo(() => {
    const map: Record<string, string[]> = {}
    for (const jobName of visibleJobNames) {
      const job = jobs[jobName]
      if (job?.needs && Array.isArray(job.needs) && job.needs.length > 0) {
        map[jobName] = job.needs
      }
    }
    return map
  }, [jobs, visibleJobNames])

  return (
    <div className="flex flex-col">
      {/* Expand/Collapse All Button Header */}
      <div className="flex justify-end px-4 py-2 border-b border-[var(--theme-border)]">
        <button
          type="button"
          onClick={allExpanded ? collapseAll : expandAll}
          className="text-xs font-mono text-[var(--theme-muted-text-color)] hover:text-[var(--theme-app)] transition-colors px-3 py-1.5 border border-[var(--theme-border)] rounded"
        >
          {allExpanded ? 'Collapse all' : 'Expand all'}
        </button>
      </div>

      {/* Tree Content */}
      <div>
        {(() => {
          // Group matrix jobs under headers
          const matrixGroups: Record<string, { members: string[]; originaljob: string }> = {}
          for (const jobName of visibleJobNames) {
            const matrix = jobs[jobName]?._matrix
            if (matrix?.originaljob) {
              let group = matrixGroups[matrix.originaljob]
              if (!group) {
                group = { originaljob: matrix.originaljob, members: [] }
                matrixGroups[matrix.originaljob] = group
              }
              group.members.push(jobName)
            }
          }
          // Sort members by index
          for (const group of Object.values(matrixGroups)) {
            group.members.sort(
              (a, b) => (jobs[a]?._matrix?.index ?? 0) - (jobs[b]?._matrix?.index ?? 0),
            )
          }

          const rendered: React.ReactNode[] = []
          const seenMatrixGroups = new Set<string>()

          for (const jobName of visibleJobNames) {
            const job = jobs[jobName]
            if (!job) {
              continue
            }
            const matrixOrigin = job._matrix?.originaljob
            if (matrixOrigin) {
              if (seenMatrixGroups.has(matrixOrigin)) {
                continue
              }
              seenMatrixGroups.add(matrixOrigin)
              const group = matrixGroups[matrixOrigin]
              if (!group) {
                continue
              }
              const isGroupExpanded = expandedJobs.has(`matrix:${matrixOrigin}`)
              // Compute aggregate status
              const { aggStatus } = engine.matrixStatus(group.members.map((m) => jobs[m]?.status))
              rendered.push(
                <div
                  key={`matrix-${matrixOrigin}`}
                  className="border-b border-[var(--theme-border)]"
                >
                  <button
                    type="button"
                    aria-expanded={isGroupExpanded}
                    aria-controls={`matrix-panel-${matrixOrigin}`}
                    className="flex items-center gap-3 px-5 py-3 cursor-pointer transition-colors w-full text-left"
                    onClick={() => toggleJob(`matrix:${matrixOrigin}`)}
                  >
                    <motion.div
                      animate={{ rotate: isGroupExpanded ? 90 : 0 }}
                      transition={{ duration: 0.15 }}
                      className="flex-shrink-0 text-[var(--theme-muted-text-color)]"
                    >
                      <ChevronRightIcon
                        className={cx('w-4 h-4', isGroupExpanded && 'text-[var(--theme-element)]')}
                      />
                    </motion.div>
                    <Indicator status={aggStatus} />
                    <span className="font-mono text-sm text-[var(--theme-app)]">
                      Matrix: {matrixOrigin} ({group.members.length} jobs)
                    </span>
                  </button>
                  <AnimatePresence>
                    {isGroupExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="overflow-hidden pl-4"
                        id={`matrix-panel-${matrixOrigin}`}
                      >
                        {group.members.map((memberName) => {
                          const member = jobs[memberName]
                          return member ? (
                            <JobRow
                              key={memberName}
                              jobName={memberName}
                              job={member}
                              isExpanded={expandedJobs.has(memberName)}
                              onToggle={() => toggleJob(memberName)}
                              dependencies={dependenciesMap[memberName]}
                              workflowName={workflowName}
                              runNumber={runNumber}
                              slug={slug}
                              expandedJobs={expandedSubworkflowJobs}
                              onJobToggle={toggleSubworkflowJob}
                              expandedSteps={expandedSteps}
                              onStepToggle={toggleStep}
                            />
                          ) : null
                        })}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>,
              )
            } else {
              rendered.push(
                <JobRow
                  key={jobName}
                  jobName={jobName}
                  job={job}
                  isExpanded={expandedJobs.has(jobName)}
                  onToggle={() => toggleJob(jobName)}
                  dependencies={dependenciesMap[jobName]}
                  workflowName={workflowName}
                  runNumber={runNumber}
                  slug={slug}
                  expandedJobs={expandedSubworkflowJobs}
                  onJobToggle={toggleSubworkflowJob}
                  expandedSteps={expandedSteps}
                  onStepToggle={toggleStep}
                />,
              )
            }
          }
          return rendered
        })()}
      </div>
    </div>
  )
}

import cx from 'classnames'
import { AnimatePresence, motion } from 'framer-motion'
import { DateTime } from 'luxon'
import { useCallback, useId, useMemo, useState } from 'react'
import { Indicator } from '../components/Indicator'
import { useRunFile, useSlots, useWorkflowEngine } from '../components/Provider'
import { toAbsHumanDuration } from '../duration'
import { ChevronRightIcon, LoaderIcon } from '../icons'
import { LogViewer } from '../logviewer'
import { Collapse } from './Collapse'
import type { WorkflowJob as Job, WorkflowStep as Step } from './types'
import { jobLabel, toggled } from './util'

interface TreeViewProps {
  jobs: Record<string, Job>
  slug: string
  expandedJobs: Set<string>
  setExpandedJobs: (jobs: Set<string>) => void
}

function elapsed({ startedAt, completedAt }: Job | Step): string {
  if (!startedAt) {
    return ''
  }
  const end = completedAt ? DateTime.fromISO(completedAt) : DateTime.now()
  return toAbsHumanDuration(DateTime.fromISO(startedAt), end)
}

function Chevron({ open, hidden = false }: { open: boolean; hidden?: boolean }) {
  return (
    <motion.div
      animate={{ rotate: open ? 90 : 0 }}
      transition={{ duration: 0.15 }}
      className={cx('flex-shrink-0', hidden ? 'invisible' : 'text-[var(--theme-muted-text-color)]')}
    >
      <ChevronRightIcon className={cx('w-4 h-4', open && 'text-[var(--theme-element)]')} />
    </motion.div>
  )
}

// `prefix` is the log path of the subworkflow level a step runs in, empty at the top.
function StepLogs({
  slug,
  prefix,
  jobName,
  stepIndex,
}: {
  slug: string
  prefix: string
  jobName: string
  stepIndex: number
}) {
  const engine = useWorkflowEngine()
  const logPath = engine.stepLogPath(prefix, jobName, stepIndex)
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

// Expansion state shared by every row, at every subworkflow level. Keys carry
// the level's prefix, so a job or step name reused across levels stays distinct.
interface RowState {
  slug: string
  expandedJobs: Set<string>
  onJobToggle: (jobKey: string) => void
  expandedSteps: Set<string>
  onStepToggle: (stepKey: string) => void
}

function JobRow({
  jobName,
  job,
  isExpanded,
  onToggle,
  prefix,
  state,
}: {
  jobName: string
  job: Job
  isExpanded: boolean
  onToggle: () => void
  prefix: string
  state: RowState
}) {
  const hasSteps = !!job.steps?.length
  const dependencies = Array.isArray(job.needs) ? job.needs : []
  const duration = elapsed(job)
  const panelId = useId()

  return (
    <div className="border-b border-[var(--theme-border)] last:border-b-0">
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
        <Chevron open={isExpanded} hidden={!hasSteps} />
        <Indicator status={job.status} />
        <div className="flex flex-col gap-1 min-w-0 flex-1">
          <span className="font-mono text-sm text-[var(--theme-app)] truncate">
            {jobLabel(jobName, job)}
          </span>
          {dependencies.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-[var(--theme-muted-text-color)]">depends on:</span>
              {dependencies.map((dep) => (
                <span
                  key={dep}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--theme-muted-panel-bg)] text-[var(--theme-muted-text-color)]"
                >
                  {jobLabel(dep)}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex-1" />
        {duration && (
          <span className="font-mono text-xs text-[var(--theme-muted-text-color)] flex-shrink-0">
            {duration}
          </span>
        )}
      </button>

      <Collapse expanded={isExpanded && hasSteps} id={panelId}>
        <div className="ml-[38px] border-l-2 border-[var(--theme-border)]">
          {job.steps?.map((step, index) => {
            const stepKey = `${prefix}${jobName}:${index}`
            return (
              <StepRow
                key={stepKey}
                step={step}
                index={index}
                isExpanded={state.expandedSteps.has(stepKey)}
                onToggle={() => state.onStepToggle(stepKey)}
                prefix={prefix}
                jobName={jobName}
                state={state}
              />
            )
          })}
        </div>
      </Collapse>
    </div>
  )
}

function StepRow({
  step,
  index,
  isExpanded,
  onToggle,
  prefix,
  jobName,
  state,
}: {
  step: Step
  index: number
  isExpanded: boolean
  onToggle: () => void
  prefix: string
  jobName: string
  state: RowState
}) {
  const engine = useWorkflowEngine()
  const slots = useSlots()
  const duration = elapsed(step)
  const label = engine.stepLabel(step, index)
  const subworkflow = step.subworkflow
  const panelId = useId()

  const subworkflowJobs = subworkflow?.jobs ?? {}
  const subworkflowJobNames = Object.keys(subworkflowJobs).filter(
    (name) => subworkflowJobs[name]?.if !== false,
  )
  const subworkflowPrefix = `${prefix}subworkflows/${jobName}/step_${index}/`

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
        <Chevron open={isExpanded} />
        <Indicator status={step.status} />
        {subworkflow &&
          slots.workflowIcon?.({
            image: subworkflow.image,
            type: subworkflow.type,
            className: 'h-4 w-4 flex-shrink-0',
          })}
        <span className="font-mono text-sm text-[var(--theme-app)] truncate flex-1">
          {label}
          {subworkflow && (
            <span className="ml-2 text-xs text-[var(--theme-muted-text-color)]">(subworkflow)</span>
          )}
        </span>
        {duration && (
          <span className="font-mono text-xs text-[var(--theme-muted-text-color)] flex-shrink-0">
            {duration}
          </span>
        )}
      </button>

      <Collapse expanded={isExpanded && !subworkflow} id={panelId}>
        <StepLogs slug={state.slug} prefix={prefix} jobName={jobName} stepIndex={index} />
      </Collapse>

      <Collapse
        expanded={isExpanded && !!subworkflow && subworkflowJobNames.length > 0}
        id={panelId}
      >
        <div className="ml-[38px] border-l-2 border-[var(--theme-border)]">
          {subworkflowJobNames.map((subJobName) => {
            const subJob = subworkflowJobs[subJobName]
            if (!subJob) {
              return null
            }
            const subJobKey = `${prefix}${jobName}:${index}:${subJobName}`
            return (
              <JobRow
                key={subJobName}
                jobName={subJobName}
                job={subJob}
                isExpanded={state.expandedJobs.has(subJobKey)}
                onToggle={() => state.onJobToggle(subJobKey)}
                prefix={subworkflowPrefix}
                state={state}
              />
            )
          })}
        </div>
      </Collapse>
    </div>
  )
}

export default function TreeView({ jobs, slug, expandedJobs, setExpandedJobs }: TreeViewProps) {
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

  const rowState: RowState = {
    slug,
    expandedJobs: expandedSubworkflowJobs,
    onJobToggle: (jobKey) => setExpandedSubworkflowJobs((prev) => toggled(prev, jobKey)),
    expandedSteps,
    onStepToggle: (stepKey) => setExpandedSteps((prev) => toggled(prev, stepKey)),
  }

  const expandAll = useCallback(() => {
    setExpandedJobs(new Set(visibleJobNames))
  }, [visibleJobNames, setExpandedJobs])

  const collapseAll = useCallback(() => {
    setExpandedJobs(new Set())
    setExpandedSteps(new Set())
    setExpandedSubworkflowJobs(new Set())
  }, [setExpandedJobs])

  const allExpanded = expandedJobs.size === visibleJobNames.length

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
                    <Chevron open={isGroupExpanded} />
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
                              prefix=""
                              state={rowState}
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
                  prefix=""
                  state={rowState}
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

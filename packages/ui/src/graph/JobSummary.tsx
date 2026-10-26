import type { ReactNode } from 'react'
import { useNavigation, useSlots, useStrings, useWorkflowEngine } from '../components/Provider'
import { RunStatusIcon } from '../components/RunStatusIcon'
import { Tooltip } from '../components/Tooltip'
import { cx } from '../cx'
import { FileTextIcon, OpenInNewGraphIcon, SummaryIcon } from '../icons'
import { AddStepButton, EditableJobRow, EditableStepRow } from './editorRows'
import { Reveal } from './Reveal'
import { WarningMark } from './RunWarningsList'
import { rowKey, useWarningMarks } from './runWarnings'
import type { WorkflowJob, WorkflowSubworkflow } from './types'
import { jobLabel } from './util'

function UsesIcon({
  uses,
  subworkflow,
}: {
  uses?: string | undefined
  subworkflow: WorkflowSubworkflow
}) {
  const navigation = useNavigation()
  const slots = useSlots()
  const { jobActions } = useStrings()
  if (!uses || !slots.workflowIcon) {
    return null
  }
  const open = () => navigation.openStepSource(uses, subworkflow.sourceUrl)
  return (
    <Tooltip content={jobActions.openOriginalWorkflow}>
      <button
        type="button"
        aria-label={jobActions.openOriginalWorkflow}
        onClick={open}
        className="cursor-pointer"
      >
        {slots.workflowIcon({
          image: subworkflow.image,
          type: subworkflow.type,
          className: 'ml-1.5 h-[1.2em] w-[1.2em]',
        })}
      </button>
    </Tooltip>
  )
}

/** What a job list does when its jobs and steps are clicked, at one graph level. */
export interface JobHandlers {
  /** The level's `subworkflows/<job>/step_<n>/` chain, empty at the run's own jobs. */
  pathPrefix: string
  isStepsOpen: (jobName: string) => boolean
  onJobClick: (jobName: string) => void
  onStepClick: (jobName: string, stepIndex: number) => void
  onStepLogClick: (jobName: string, stepIndex: number) => void
  onStepSummaryClick: (jobName: string, stepIndex: number) => void
  // The secondary subworkflow action bound to the icon (the primary is the step
  // click); the icon opens the subworkflow in its own graph.
  onSubworkflowIcon: (jobName: string, stepIndex: number) => void
  renderSubworkflow: (jobName: string, stepIndex: number) => ReactNode
}

export function Joblist(
  inputs: JobHandlers & {
    jobs: Record<string, WorkflowJob>
    jobNames: string[]
    // Graph only: animate box width as steps reveal; off in the sidebar so long
    // names and icons wrap instead.
    growWidth?: boolean
    preview?: boolean
    editable?: boolean
    /** Steps take edits where their jobs don't, as a matrix's runs show its one job's steps. */
    editableSteps?: boolean
  },
) {
  const { dag, jobActions } = useStrings()
  const engine = useWorkflowEngine()
  const marks = useWarningMarks()
  const prefix = inputs.pathPrefix
  let rows = 0
  return inputs.jobNames.map((jobName) => {
    // Skip synthetic matrix group nodes — rendered by the caller, not Joblist
    if (inputs.jobs[jobName]?._matrixGroup) {
      return null
    }
    const first = rows++ === 0
    const job = inputs.jobs[jobName]
    const jobStatus = job?.status
    const label = jobLabel(jobName, job)
    const toggle = (
      <button
        type="button"
        aria-expanded={inputs.isStepsOpen(jobName)}
        data-run-row={rowKey(prefix, jobName)}
        onClick={() => inputs.onJobClick(jobName)}
        className={cx(
          'flex items-center gap-x-1.5 w-full text-left',
          jobStatus === 'skipped' || jobStatus === 'skipped-failed'
            ? 'cursor-default'
            : 'cursor-pointer',
        )}
      >
        {!inputs.preview && <RunStatusIcon status={jobStatus} />}
        <div className="font-medium">{label}</div>
        <WarningMark warnings={marks.under(rowKey(prefix, jobName))} />
      </button>
    )
    return (
      <div
        key={`job-${jobName}`}
        // Jobs that share a box are ruled apart, so two read as two rather than as one name on two
        // lines.
        className={cx(
          '-mx-8 px-8 py-1 select-none',
          !first && 'border-t-2 border-solid border-(--theme-border)',
        )}
      >
        {inputs.editable ? (
          <EditableJobRow job={jobName} label={label}>
            {toggle}
          </EditableJobRow>
        ) : (
          toggle
        )}
        <Reveal open={inputs.isStepsOpen(jobName)} growWidth={inputs.growWidth ?? false}>
          <div className="flex flex-col gap-y-0.5 mt-0.5">
            {(job?.steps || []).map((step, i) => {
              const stepLabel = engine.stepLabel(step, i)
              // A step's position in its job is its identity, as in its log path.
              const stepKey = `${jobName}:${i}`
              const subJobs = step.subworkflow?.jobs
              const canExpand = !!subJobs && Object.keys(subJobs).length > 0
              const stepButton = (
                <button
                  type="button"
                  data-run-row={rowKey(prefix, jobName, i)}
                  onClick={() => inputs.onStepClick(jobName, i)}
                  className={cx(
                    inputs.preview ? 'ml-1.5' : 'ml-4',
                    'gap-x-1.5 flex items-center text-left',
                  )}
                  data-testid={stepLabel}
                >
                  {inputs.preview ? '↳' : <RunStatusIcon status={step.status} />}
                  <div>{stepLabel}</div>
                  <WarningMark warnings={marks.under(rowKey(prefix, jobName, i))} />
                </button>
              )
              return (
                <div key={stepKey}>
                  <div
                    className={cx(
                      'flex items-center',
                      step.status === 'skipped' || step.status === 'skipped-failed'
                        ? 'cursor-default'
                        : 'cursor-pointer',
                    )}
                  >
                    {(inputs.editable || inputs.editableSteps) && !step.linkedStep ? (
                      <EditableStepRow
                        job={job?._matrix?.originaljob ?? jobName}
                        index={i}
                        label={stepLabel}
                      >
                        {stepButton}
                      </EditableStepRow>
                    ) : (
                      stepButton
                    )}
                    {step.summary && !inputs.preview && (
                      <Tooltip content={dag.hasSummary}>
                        <button
                          type="button"
                          aria-label={dag.hasSummary}
                          onClick={(e) => {
                            e.stopPropagation()
                            inputs.onStepSummaryClick(jobName, i)
                          }}
                          className="ml-1.5 shrink-0 text-(--theme-muted-text-color) hover:text-(--theme-link)"
                        >
                          <SummaryIcon className="w-[1.1em] h-[1.1em]" />
                        </button>
                      </Tooltip>
                    )}
                    {step.subworkflow && (
                      <>
                        <Tooltip content={jobActions.openSubworkflowLogs}>
                          <button
                            type="button"
                            aria-label={jobActions.openSubworkflowLogs}
                            onClick={(e) => {
                              e.stopPropagation()
                              inputs.onStepLogClick(jobName, i)
                            }}
                            className="link ml-1"
                          >
                            <FileTextIcon className="w-[1.2em] h-[1.2em]" />
                          </button>
                        </Tooltip>
                        <UsesIcon uses={step.uses} subworkflow={step.subworkflow} />
                        <Tooltip content={jobActions.openInNewGraph}>
                          <button
                            type="button"
                            aria-label={jobActions.openInNewGraph}
                            onClick={(e) => {
                              e.stopPropagation()
                              inputs.onSubworkflowIcon(jobName, i)
                            }}
                            className="link ml-1"
                          >
                            <OpenInNewGraphIcon className="w-[1.2em] h-[1.2em]" />
                          </button>
                        </Tooltip>
                      </>
                    )}
                  </div>
                  {canExpand && inputs.renderSubworkflow(jobName, i)}
                </div>
              )
            })}
            {inputs.editable && <AddStepButton job={jobName} />}
          </div>
        </Reveal>
      </div>
    )
  })
}

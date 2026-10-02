import type { ReactNode } from 'react'
import { Indicator } from '../components/Indicator'
import { useWorkflowEngine } from '../components/Provider'
import type { MatrixGroup, RunStatus } from '../engine'
import { Joblist } from './JobSummary'
import { Reveal } from './Reveal'
import type { WorkflowJob } from './types'

/** Matrix group item in the summary sidebar. */
export function MatrixGroupSummaryItem({
  matrixGroup,
  status,
  isExpanded,
  onToggle,
  jobs,
  isStepsOpen,
  onJobClick,
  onStepClick,
  onStepLogClick,
  onSubworkflowIcon,
  isSubworkflowExpanded,
  renderSubworkflow,
  preview,
}: {
  matrixGroup: MatrixGroup
  status: RunStatus
  isExpanded: boolean
  onToggle: () => void
  jobs: Record<string, WorkflowJob>
  isStepsOpen: (j: string) => boolean
  onJobClick: (j: string) => void
  onStepClick: (j: string, s: string | number) => void
  onStepLogClick: (j: string, s: number) => void
  onSubworkflowIcon: (j: string, s: number) => void
  isSubworkflowExpanded: (j: string, s: number) => boolean
  renderSubworkflow: (j: string, s: number) => ReactNode
  preview: boolean
}) {
  return (
    <div key={'matrix-' + matrixGroup.originaljob} className="py-1.5">
      <button
        type="button"
        aria-expanded={isExpanded}
        onClick={onToggle}
        className="cursor-pointer flex items-center gap-x-1.5 w-full text-left"
      >
        <Indicator status={status} />
        <div className="font-semibold">
          Matrix: {matrixGroup.originaljob}
          <span className="font-normal text-sm ml-1">({matrixGroup.members.length} jobs)</span>
        </div>
      </button>
      <Reveal open={isExpanded}>
        <div className="ml-3 mt-0.5">
          <Joblist
            jobs={jobs}
            jobNames={matrixGroup.members}
            onJobClick={onJobClick}
            isStepsOpen={isStepsOpen}
            onStepClick={onStepClick}
            onStepLogClick={onStepLogClick}
            onSubworkflowIcon={onSubworkflowIcon}
            isSubworkflowExpanded={isSubworkflowExpanded}
            renderSubworkflow={renderSubworkflow}
            preview={preview}
          />
        </div>
      </Reveal>
    </div>
  )
}

/** Matrix group node in the DAG visualization. */
export function MatrixGroupNode({
  matrixGroup,
  jobNames,
  idPrefix,
  isExpanded,
  onToggle,
  jobs,
  activeDists,
  onMouseEnter,
  onMouseLeave,
  hoveredRelated,
  animT,
  zBase,
  isStepsOpen,
  onJobClick,
  onStepClick,
  onStepLogClick,
  onSubworkflowIcon,
  isSubworkflowExpanded,
  renderSubworkflow,
  preview,
}: {
  matrixGroup: MatrixGroup
  jobNames: string[]
  idPrefix: string
  isExpanded: boolean
  onToggle: () => void
  jobs: Record<string, WorkflowJob>
  activeDists: Map<string, number> | null
  onMouseEnter: () => void
  onMouseLeave: () => void
  hoveredRelated: Set<string> | null
  animT: number
  zBase: number
  isStepsOpen: (j: string) => boolean
  onJobClick: (j: string) => void
  onStepClick: (j: string, s: string | number) => void
  onStepLogClick: (j: string, s: number) => void
  onSubworkflowIcon: (j: string, s: number) => void
  isSubworkflowExpanded: (j: string, s: number) => boolean
  renderSubworkflow: (j: string, s: number) => ReactNode
  preview: boolean
}) {
  const matrixName = matrixGroup.originaljob
  const matrixMembers = matrixGroup.members
  const { aggStatus, statusLabel } = useWorkflowEngine().matrixStatus(
    matrixMembers.map((m) => jobs[m]?.status),
  )

  return (
    <div
      key={'node_' + jobNames[0]}
      id={'node_' + idPrefix + jobNames[0]}
      role="none"
      className="relative m-24"
      style={{
        zIndex: (activeDists?.has(jobNames[0]!) ? 25 : 1) + zBase,
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onFocus={onMouseEnter}
      onBlur={onMouseLeave}
    >
      <div className="absolute inset-0 rounded-2xl bg-(--theme-panel-bg)" />
      <div
        className="relative border-solid shadow py-4 px-8 rounded-xl border-4 whitespace-nowrap bg-(--theme-panel-bg) text-2xl"
        style={{
          opacity: hoveredRelated && !hoveredRelated.has(jobNames[0]!) ? 0.5 : 1,
          transition: `opacity ${animT}s`,
        }}
      >
        <button
          type="button"
          aria-expanded={isExpanded}
          className="cursor-pointer w-full text-left"
          onClick={onToggle}
        >
          <div className="font-semibold text-md p-0.5">
            Matrix: {matrixName.length > 20 ? matrixName.slice(0, 20) + '...' : matrixName}
          </div>
          {!isExpanded && (
            <div className="mt-1 border-t border-(--theme-border) pt-1 flex items-center gap-x-1">
              <Indicator status={aggStatus} />
              <span>{statusLabel}</span>
            </div>
          )}
        </button>
        <Reveal open={isExpanded} growWidth={true}>
          <div className="mt-1 border-t border-(--theme-border) pt-1">
            <Joblist
              jobs={jobs}
              jobNames={matrixMembers}
              onJobClick={onJobClick}
              isStepsOpen={isStepsOpen}
              onStepClick={onStepClick}
              onStepLogClick={onStepLogClick}
              onSubworkflowIcon={onSubworkflowIcon}
              isSubworkflowExpanded={isSubworkflowExpanded}
              renderSubworkflow={renderSubworkflow}
              growWidth={true}
              preview={preview}
            />
          </div>
        </Reveal>
      </div>
    </div>
  )
}

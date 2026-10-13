import { memo } from 'react'
import { useStrings, useWorkflowEngine } from '../components/Provider'
import { RunStatusIcon } from '../components/RunStatusIcon'
import type { MatrixGroup, RunStatus } from '../engine'
import { EditableJobRow } from './editorRows'
import { GraphNode } from './GraphNode'
import { type JobHandlers, Joblist } from './JobSummary'
import { Reveal } from './Reveal'
import type { WorkflowJob } from './types'

/** Matrix group item in the summary sidebar. */
export function MatrixGroupSummaryItem({
  matrixGroup,
  status,
  isExpanded,
  onToggle,
  jobs,
  handlers,
  preview,
}: {
  matrixGroup: MatrixGroup
  status: RunStatus
  isExpanded: boolean
  onToggle: () => void
  jobs: Record<string, WorkflowJob>
  handlers: JobHandlers
  preview: boolean
}) {
  const { dag: t } = useStrings()
  return (
    <div className="py-1.5">
      <button
        type="button"
        aria-expanded={isExpanded}
        onClick={onToggle}
        className="cursor-pointer flex items-center gap-x-1.5 w-full text-left"
      >
        <RunStatusIcon status={status} />
        <div className="font-semibold">
          {t.matrixOf(matrixGroup.originaljob)}
          <span className="font-normal text-sm ml-1">
            ({t.jobCount(matrixGroup.members.length)})
          </span>
        </div>
      </button>
      <Reveal open={isExpanded}>
        <div className="ml-3 mt-0.5">
          <Joblist jobs={jobs} jobNames={matrixGroup.members} {...handlers} preview={preview} />
        </div>
      </Reveal>
    </div>
  )
}

/** Matrix group node in the DAG visualization. */
export const MatrixGroupNode = memo(function MatrixGroupNode({
  matrixGroup,
  jobNames,
  idPrefix,
  isExpanded,
  toggleMatrix,
  jobs,
  zBase,
  handlers,
  preview,
  editable = false,
  rowsAbove = 0,
}: {
  matrixGroup: MatrixGroup
  jobNames: string[]
  idPrefix: string
  isExpanded: boolean
  /** Opens or closes the matrix by its key, its path prefix and job. */
  toggleMatrix: (key: string) => void
  jobs: Record<string, WorkflowJob>
  zBase: number
  handlers: JobHandlers
  preview: boolean
  editable?: boolean
  /** Empty rows of its column above this node. */
  rowsAbove?: number
}) {
  const { dag: t } = useStrings()
  const matrixName = matrixGroup.originaljob
  const first = jobNames[0] ?? ''
  const matrixMembers = matrixGroup.members
  const { aggStatus, statusLabel } = useWorkflowEngine().matrixStatus(
    matrixMembers.map((m) => jobs[m]?.status),
  )
  const header = (
    <button
      type="button"
      aria-expanded={isExpanded}
      className="cursor-pointer w-full text-left"
      onClick={() => toggleMatrix(idPrefix + matrixName)}
    >
      <div className="font-semibold text-md p-0.5">
        {t.matrixOf(matrixName.length > 20 ? `${matrixName.slice(0, 20)}...` : matrixName)}
      </div>
      {!isExpanded && (
        <div className="mt-1 border-t border-(--theme-border) pt-1 flex items-center gap-x-1">
          {!preview && <RunStatusIcon status={aggStatus} />}
          <span>{preview ? t.jobCount(matrixMembers.length) : statusLabel}</span>
        </div>
      )}
    </button>
  )
  return (
    <GraphNode id={`node_${idPrefix}${first}`} job={first} rowsAbove={rowsAbove} zBase={zBase}>
      {editable ? (
        <EditableJobRow job={matrixName} label={t.matrixOf(matrixName)} badge={false}>
          {header}
        </EditableJobRow>
      ) : (
        header
      )}
      <Reveal open={isExpanded} growWidth={true}>
        <div className="mt-1 border-t border-(--theme-border) pt-1">
          <Joblist
            jobs={jobs}
            jobNames={matrixMembers}
            {...handlers}
            growWidth={true}
            preview={preview}
            editableSteps={editable}
          />
        </div>
      </Reveal>
    </GraphNode>
  )
})

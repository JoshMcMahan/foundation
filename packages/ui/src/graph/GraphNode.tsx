import { type FocusEvent, memo, type ReactNode } from 'react'
import { BoxGrip } from './editorRows'
import { emptyRowsStyle } from './gridSpacing'
import { type JobHandlers, Joblist } from './JobSummary'
import { useLineage, useLineageStore } from './lineage'
import type { WorkflowJob } from './types'

// A level dims what of it is outside the hovered job's lineage by a class on its wrapper, which only
// its own nodes and connectors answer to. Named by depth, a nested level's don't dim with the level
// around them. A class restyles just the elements its rule names, where a custom property set on the
// wrapper would restyle every element beneath it on each hover.
export const dimClasses = (depth: number) => ({
  level: `dag-dim-${depth}`,
  node: `dag-node-${depth}`,
  edge: `dag-edge-${depth}`,
})

/** The rules dimming a level at `depth`, hoisted into the page once for every level that deep. */
export function DimRules({ depth }: { depth: number }) {
  const { level, node, edge } = dimClasses(depth)
  return (
    <style href={`dependency-graph-dim-${depth}`} precedence="default">
      {`.${level} .${node}{opacity:.5}.${level} .${edge}{opacity:.3}`}
      {'@media (prefers-reduced-motion:reduce){.dag-fade{transition:none!important}}'}
    </style>
  )
}

/** Dims what of a graph level isn't in the hovered job's lineage, while one is hovered. */
export function setDimmed(wrapper: HTMLElement, depth: number, hovering: boolean) {
  wrapper.classList.toggle(dimClasses(depth).level, hovering)
}

interface NodeShell {
  id: string
  /** Empty rows of its column above this node. */
  rowsAbove: number
  zBase: number
}

/** One node of the graph: its jobs' box, raised above connectors while its lineage is shown. */
export function GraphNode({
  id,
  job,
  rowsAbove,
  zBase,
  children,
}: NodeShell & {
  /** The job hovering the node shows the lineage of. */
  job: string
  children: ReactNode
}) {
  const lineage = useLineageStore()
  // In the hovered lineage it doesn't dim; while the lineage shows, it's above the connectors.
  const highlight = useLineage((l) => l.node(job), 0)
  const enter = () => lineage?.hover(job)
  const leave = () => lineage?.hover(null)
  // Focus moving between a node's own buttons stays in the node, and its lineage stays shown.
  const blur = (e: FocusEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      leave()
    }
  }
  return (
    <div
      id={id}
      role="none"
      className="relative m-24"
      style={{ zIndex: (highlight > 0 ? 25 : 1) + zBase, ...emptyRowsStyle(rowsAbove) }}
      onMouseEnter={enter}
      onMouseLeave={leave}
      onFocus={enter}
      onBlur={blur}
    >
      <div className="absolute inset-0 rounded-2xl bg-(--theme-panel-bg)" />
      <div
        className={`${dimClasses(lineage?.depth ?? 0).node} dag-fade relative border-solid shadow py-4 px-8 rounded-xl border-4 whitespace-nowrap bg-(--theme-panel-bg) text-2xl`}
        style={{
          ...(highlight === 2 && { opacity: 1 }),
          ...(lineage?.fade && { transition: `opacity ${lineage.animT}s` }),
        }}
      >
        {children}
      </div>
    </div>
  )
}

/** A node of jobs that share their needs and dependents. */
export const JobNode = memo(function JobNode({
  jobNames,
  jobs,
  handlers,
  preview,
  editable,
  ...shell
}: NodeShell & {
  jobNames: string[]
  jobs: Record<string, WorkflowJob>
  handlers: JobHandlers
  preview: boolean
  editable: boolean
}) {
  return (
    <GraphNode {...shell} job={jobNames[0] ?? ''}>
      {editable && jobNames.length > 1 && <BoxGrip jobs={jobNames} />}
      <Joblist
        jobs={jobs}
        jobNames={jobNames}
        {...handlers}
        growWidth={true}
        preview={preview}
        editable={editable}
      />
    </GraphNode>
  )
})

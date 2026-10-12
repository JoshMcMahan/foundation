import cx from 'classnames'
import { DateTime } from 'luxon'
import React, {
  lazy,
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { flushSync } from 'react-dom'
import {
  type ReactZoomPanPinchContentRef,
  TransformComponent,
  TransformWrapper,
} from 'react-zoom-pan-pinch'
import { BareModal, modalPanelClasses } from '../components/BareModal'
import { IconButton } from '../components/IconButton'
import { Indicator } from '../components/Indicator'
import Loader from '../components/Loader'
import { useRunFile, useSlots, useStrings, useWorkflowEngine } from '../components/Provider'
import { TooltipInfo } from '../components/Tooltip'
import { toAbsHumanDuration } from '../duration'
import type { GraphLayout, LaidOutColumn, WorkflowEditing } from '../editing'
import type { MatrixGroup, RunStatus, WorkflowEngine } from '../engine'
import { initializeValues } from '../form/lib'
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DocumentIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from '../icons'
import { LogViewer } from '../logviewer'
import { AnnotationBanner } from './AnnotationBanner'
import { Collapse } from './Collapse'
import type { DependencyGraphEditor } from './editorApi'
import {
  BoxGrip,
  EdgeEnds,
  EdgeHitPath,
  EmptyGraphEditor,
  GraphEditorCanvas,
  NodePorts,
} from './editorRows'
import {
  EDITOR_HANDLE_CLASS,
  type GraphEditorApi,
  GraphEditorProvider,
  useGraphEditor,
  useSelectedEdges,
} from './graphEditorState'
import { emptyColumnsStyle, emptyRowsStyle } from './gridSpacing'
import { type JobHandlers, Joblist } from './JobSummary'
import { MatrixGroupNode, MatrixGroupSummaryItem } from './MatrixGroup'
import { Reveal } from './Reveal'
import TreeView from './TreeView'
import { isJobRecord, type RunLink, type WorkflowJob, type WorkflowStep } from './types'
import { jobLabel, NODE_CONNECTOR_Y, toggled } from './util'

export type ViewMode = 'dag' | 'tree'

function ViewToggle({
  viewMode,
  setViewMode,
}: {
  viewMode: ViewMode
  setViewMode: (mode: ViewMode) => void
}) {
  return (
    <div className="flex border border-[var(--theme-border)] rounded overflow-hidden">
      <button
        type="button"
        onClick={() => setViewMode('dag')}
        className={cx(
          'px-3 py-1.5 text-xs font-mono transition-colors',
          viewMode === 'dag'
            ? 'bg-[var(--theme-element)] text-[var(--theme-element-text)]'
            : 'text-[var(--theme-muted-text-color)] hover:text-[var(--theme-app)] hover:bg-[var(--theme-hover)]',
        )}
      >
        DAG
      </button>
      <button
        type="button"
        onClick={() => setViewMode('tree')}
        className={cx(
          'px-3 py-1.5 text-xs font-mono transition-colors',
          viewMode === 'tree'
            ? 'bg-[var(--theme-element)] text-[var(--theme-element-text)]'
            : 'text-[var(--theme-muted-text-color)] hover:text-[var(--theme-app)] hover:bg-[var(--theme-hover)]',
        )}
      >
        Tree
      </button>
    </div>
  )
}

const VIEW_BAR =
  'flex max-w-full flex-wrap items-center justify-end gap-0.5 rounded-md border theme-border bg-(--theme-panel-bg) p-0.5'

/** The graph's view buttons, the same wherever a graph is drawn. */
function GraphViewControls({
  history,
  expand,
  onReset,
  onZoom,
  zoomedAll,
}: {
  /** Back and forward between the graphs a run's subworkflows were opened in. */
  history?: { back?: (() => void) | undefined; forward?: (() => void) | undefined } | undefined
  expand?: { label: string; onClick: () => void } | undefined
  onReset: () => void
  onZoom: (direction: 1 | -1) => void
  /** The way the view can zoom no further, if it is at a limit. */
  zoomedAll: 'in' | 'out' | null
}) {
  const { dag } = useStrings()
  const chip =
    'flex h-7 cursor-pointer items-center whitespace-nowrap rounded px-2 text-xs theme-hover'
  return (
    <div className={VIEW_BAR}>
      {history && (
        <>
          <IconButton
            icon={<ChevronLeftIcon className="h-4 w-4" />}
            label={dag.previousGraph}
            size="sm"
            variant="ghost"
            disabled={!history.back}
            onClick={history.back}
          />
          <IconButton
            icon={<ChevronRightIcon className="h-4 w-4" />}
            label={dag.nextGraph}
            size="sm"
            variant="ghost"
            disabled={!history.forward}
            onClick={history.forward}
          />
          <div className="mx-0.5 h-5 w-px bg-(--theme-border)" />
        </>
      )}
      {expand && (
        <button type="button" className={chip} onClick={expand.onClick}>
          {expand.label}
        </button>
      )}
      <button type="button" className={chip} onClick={onReset}>
        {dag.resetView}
      </button>
      <div className="mx-0.5 h-5 w-px bg-(--theme-border)" />
      <IconButton
        icon={<ZoomOutIcon className="h-4 w-4" />}
        label={dag.zoomOut}
        size="sm"
        variant="ghost"
        disabled={zoomedAll === 'out'}
        onClick={() => onZoom(-1)}
      />
      <IconButton
        icon={<ZoomInIcon className="h-4 w-4" />}
        label={dag.zoomIn}
        size="sm"
        variant="ghost"
        disabled={zoomedAll === 'in'}
        onClick={() => onZoom(1)}
      />
    </div>
  )
}

// A preview has no run to list cleanup steps, so it appends each one as the
// POST step a run would show.
export const addCleanupSteps = ({ jobs }: { jobs: Record<string, WorkflowJob> }) => {
  const clonedJobs = structuredClone(jobs)

  for (const job in jobs) {
    const source = jobs[job]
    const cloned = clonedJobs[job]
    if (!source || !cloned) {
      continue
    }
    if (Array.isArray(source.steps)) {
      const sourceSteps = source.steps
      sourceSteps
        .slice()
        .reverse()
        .forEach((step, index) => {
          if (!step.cleanup) {
            return
          }
          const linkedName = step.name ? step.name : `Step ${sourceSteps.length - index - 1}`
          const newStep: WorkflowStep = {
            ...step,
            name: `POST ${linkedName}`,
            run: step.cleanup,
            linkedStep: `${sourceSteps.length - index - 1}`,
          }
          delete newStep.cleanup
          // index counts from the end, because the loop runs over the reversed steps.
          const clonedStep = cloned.steps[sourceSteps.length - index - 1]
          if (clonedStep) {
            delete clonedStep.cleanup
          }
          cloned.steps.push(newStep)
        })
    }
    const sourceCleanup = source.cleanup
    const clonedCleanup = cloned.cleanup
    if (Array.isArray(sourceCleanup) && clonedCleanup) {
      sourceCleanup
        .slice()
        .reverse()
        .forEach((step, index) => {
          if (!step.cleanup) {
            return
          }
          const linkedName = step.name ? step.name : `Cleanup ${sourceCleanup.length - index - 1}`
          const newStep: WorkflowStep = {
            ...step,
            name: `POST ${linkedName}`,
            run: step.cleanup,
            linkedStep: `${sourceCleanup.length - index - 1 + cloned.steps.length}`,
          }
          delete newStep.cleanup
          const clonedStep = clonedCleanup[sourceCleanup.length - index - 1]
          if (clonedStep) {
            delete clonedStep.cleanup
          }
          clonedCleanup.push(newStep)
        })
      for (const clonedStep of clonedCleanup) {
        clonedStep.linkedStep = '.'
      }
      cloned.steps = [...cloned.steps, ...clonedCleanup]
      delete cloned.cleanup
    }
  }

  return clonedJobs
}

const PREVIEW_PADDING = 24

interface PreviewView {
  scale: number
  offsetY: number
}

// The graph's outermost nodes, which hold any nested subgraph and clip one that's closing; all
// nodes if the structure changes. They sit at content > wrapper > flex > column > node.
function outerNodes(content: HTMLElement) {
  const top = content.querySelectorAll<HTMLElement>(':scope > div > div > div > div[id^="node_"]')
  return top.length > 0 ? top : content.querySelectorAll<HTMLElement>('[id^="node_"]')
}

// Bounds are measured in content space against the view captured on first
// layout, so panning never resizes the panel. Null until the graph has nodes
// and the library has applied its initial transform.
function measurePreviewHeight(
  content: HTMLElement | null,
  viewRef: React.RefObject<PreviewView | null>,
): number | null {
  const nodes = content ? outerNodes(content) : undefined
  const transform = content?.parentElement
    ? getComputedStyle(content.parentElement).transform
    : 'none'
  if (!content || !nodes?.length || transform === 'none') {
    return null
  }
  if (!viewRef.current) {
    const view = new DOMMatrixReadOnly(transform)
    viewRef.current = { scale: view.a, offsetY: view.f }
  }
  const { scale, offsetY } = viewRef.current
  let bottom = 0
  for (const node of nodes) {
    bottom = Math.max(bottom, offsetWithin(node, content).y + node.offsetHeight)
  }
  return Math.ceil(bottom * scale + offsetY + PREVIEW_PADDING)
}

// Position of `el` relative to `ancestor`, summed over the offsetParent chain.
// Lets each Subgraph level measure its nodes against its own container so nested
// graphs stay self-contained regardless of depth.
function offsetWithin(el: HTMLElement, ancestor: HTMLElement | null) {
  let x = 0
  let y = 0
  let cur: HTMLElement | null = el
  while (cur && cur !== ancestor) {
    x += cur.offsetLeft
    y += cur.offsetTop
    cur = cur.offsetParent as HTMLElement | null
  }
  return { x, y }
}

// Turn a namespaced subworkflow prefix (`subworkflows/{job}/step_{idx}/...`) back
// into the executedJobs walk path used to re-root the graph in "new graph" mode.
function parsePrefixToPath(prefix: string): (string | number)[] {
  const parts = prefix.split('/').filter(Boolean)
  const path: (string | number)[] = []
  for (let i = 0; i + 2 < parts.length; i += 3) {
    const name = parts[i + 1]
    const step = parts[i + 2]
    if (parts[i] === 'subworkflows' && name && step?.startsWith('step_')) {
      path.push(name, 'steps', Number(step.slice('step_'.length)), 'subworkflow', 'jobs')
    }
  }
  return path
}

// Jobs sharing a slot form one node only when they need, and are needed by, the same jobs, as a
// layout drawn afresh would group them; the rest take the rows below, the largest group staying.
function unitsOnly(
  columns: LaidOutColumn[],
  together: (a: string, b: string) => boolean,
): LaidOutColumn[] {
  return columns.map((col) => {
    const boxes: string[][] = []
    const rows: number[] = []
    let last = -1
    col.boxes.forEach((box, i) => {
      const groups: string[][] = []
      for (const job of box) {
        const group = groups.find((g) => together(g[0] ?? job, job))
        if (group) {
          group.push(job)
        } else {
          groups.push([job])
        }
      }
      const main = groups.reduce((a, b) => (b.length > a.length ? b : a))
      let row = Math.max(col.rows[i] ?? i, last + 1)
      for (const group of [main, ...groups.filter((g) => g !== main)]) {
        boxes.push(group)
        rows.push(row)
        last = row
        row += 1
      }
    })
    return { ...col, boxes, rows }
  })
}

// A matrix that ran as one job draws as that job, in the slot stored for its YAML job.
function withLoneMatrixSlots(
  { layoutPosition, mapLayout }: WorkflowEditing,
  layout: GraphLayout,
  jobs: Record<string, WorkflowJob>,
  matrixGroups: Record<string, MatrixGroup>,
): GraphLayout {
  const lone = Object.entries(jobs).flatMap(([name, job]) => {
    const original = job._matrix?.originaljob
    const slot = original && !matrixGroups[original] ? layoutPosition(layout, original) : undefined
    return slot && !layoutPosition(layout, name) ? [{ name, slot }] : []
  })
  if (lone.length === 0) {
    return layout
  }
  const next = mapLayout(layout, (position) => position)
  for (const { name, slot } of lone) {
    next[name] = slot
  }
  return next
}

// The jobs a level shows: those an `if` doesn't rule out, with each matrix
// collapsed into one synthetic job.
function displayJobsOf(
  engine: WorkflowEngine,
  jobs: Record<string, WorkflowJob>,
  matrixGroups: Record<string, MatrixGroup>,
) {
  const visibleJobs = structuredClone(jobs)
  for (const jobName of Object.keys(jobs)) {
    // Note that this will also evaluate hidden properly for some jobs with expressions in if property
    // for example will work as expected for expressons dependent on inputs, will NEVER hide jobs with if expressions dependent on job outputs
    if (jobs[jobName]?.if === false) {
      delete visibleJobs[jobName]
    }
  }

  // Collapse matrix groups into single synthetic nodes in the layout.
  // Expand/collapse is purely a rendering concern inside the node.
  engine.collapseMatrixGroups(matrixGroups, visibleJobs)
  return visibleJobs
}

// Topologically level `jobs` into columns and precompute hop distances, so each
// Subgraph can lay itself out.
export function computeGraphLayout(
  engine: WorkflowEngine,
  jobs: Record<string, WorkflowJob>,
  matrixGroups: Record<string, MatrixGroup>,
  layout?: GraphLayout,
) {
  const visibleJobs = displayJobsOf(engine, jobs, matrixGroups)

  const allDeps: Record<string, Set<string>> = {}
  for (const jobName of Object.keys(visibleJobs)) {
    allDeps[jobName] = engine.jobDependencies(jobName, visibleJobs, allDeps)
  }

  const filteredDeps: Record<string, string[]> = {}
  for (const jobName of Object.keys(visibleJobs)) {
    const needs = visibleJobs[jobName]?.needs
    // `build` and `build:any` name one job, which draws one connector.
    const oldNeeds: string[] = Array.isArray(needs)
      ? [
          ...new Set(
            needs.map((need) =>
              typeof need === 'string' && engine.editing ? engine.editing.needTarget(need) : need,
            ),
          ),
        ]
      : []
    const filtered = oldNeeds.filter((dep) => {
      return !oldNeeds.some((other) => {
        if (other === dep) {
          return false
        }
        return allDeps[other]?.has(dep) === true
      })
    })
    filteredDeps[jobName] = filtered.sort()
  }

  const depended_on: Record<string, string[]> = {}
  for (const jobName of Object.keys(visibleJobs)) {
    for (const dep of filteredDeps[jobName] ?? []) {
      depended_on[dep] ??= []
      depended_on[dep].push(jobName)
    }
  }
  for (const dependents of Object.values(depended_on)) {
    dependents.sort()
  }

  const unfinished = new Set(Object.keys(visibleJobs))
  const rootLevel: string[] = []
  const deps: string[][] = [rootLevel]
  for (const jobName of unfinished) {
    if (filteredDeps[jobName]?.length === 0) {
      rootLevel.push(jobName)
      unfinished.delete(jobName)
    }
  }

  let prevLen: number
  do {
    const toAppend: string[] = []
    // Each pass levels against the jobs left at its start.
    const pending = new Set(unfinished)
    prevLen = pending.size
    for (const jobName of pending) {
      if ((filteredDeps[jobName] ?? []).every((dep) => !pending.has(dep))) {
        toAppend.push(jobName)
        unfinished.delete(jobName)
      }
    }
    if (toAppend.length > 0) {
      deps.push(toAppend)
    }
  } while (prevLen !== unfinished.size)

  // Jobs share a box when they need, and are needed by, the same jobs.
  const together = (head: string, jobName: string): boolean => {
    const depsA = depended_on[head]
    const depsB = depended_on[jobName]
    const depsA2 = filteredDeps[head]
    const depsB2 = filteredDeps[jobName]
    return (
      ((!depsA && !depsB) || (!!depsA && !!depsB && depsA.length === depsB.length)) &&
      ((!depsA2 && !depsB2) || (!!depsA2 && !!depsB2 && depsA2.length === depsB2.length)) &&
      (!depsA || depsA.every((dep, i) => dep === depsB?.[i])) &&
      (!depsA2 || depsA2.every((dep, i) => dep === depsB2?.[i]))
    )
  }
  const alone = (job: string) => !!visibleJobs[job]?._matrixGroup
  // A stored layout groups jobs by the slot they were put in, and keeps each box's row.
  const editing = engine.editing
  const laidOut =
    layout && editing?.hasLayout(layout)
      ? unitsOnly(
          editing.boxesFromLayout(
            Object.keys(visibleJobs),
            filteredDeps,
            withLoneMatrixSlots(editing, layout, visibleJobs, matrixGroups),
            { together, alone },
          ),
          together,
        )
      : null
  const finalDeps: string[][][] = laidOut ? laidOut.map((col) => col.boxes) : []
  if (!laidOut) {
    deps.forEach((col) => {
      const toAppend: string[][] = []
      while (col.length > 0) {
        const head = col[0]
        if (head === undefined) {
          break
        }
        const grouped = [head]
        const toRm = [0]
        col.slice(1).forEach((jobName, j) => {
          // Never group matrix nodes with other jobs
          if (!alone(head) && !alone(jobName) && together(head, jobName)) {
            grouped.push(jobName)
            toRm.push(j + 1)
          }
        })
        col.splice(0, col.length, ...col.filter((_, i) => !toRm.includes(i)))
        toAppend.push(grouped)
      }
      finalDeps.push(toAppend)
    })
  }

  // Only the root column can be empty: when every job needs another (its needs
  // may name hidden jobs), the first pass above levels them instead.
  if (finalDeps[0]?.length === 0) {
    finalDeps.shift()
    laidOut?.shift()
  }

  // BFS from each node to compute hop distances to ancestors and descendants
  const ancestorDists: Record<string, Map<string, number>> = {}
  const descendantDists: Record<string, Map<string, number>> = {}
  const jobNames = Object.keys(visibleJobs)
  // Build reverse dep map for downstream BFS
  const reverseDeps: Record<string, string[]> = {}
  for (const [job, depList] of Object.entries(filteredDeps)) {
    for (const dep of depList) {
      if (!reverseDeps[dep]) {
        reverseDeps[dep] = []
      }
      reverseDeps[dep].push(job)
    }
  }
  for (const start of jobNames) {
    // BFS upstream (ancestors)
    const aDist = new Map<string, number>()
    const q1: [string, number][] = [[start, 0]]
    for (let next = q1.shift(); next; next = q1.shift()) {
      const [job, d] = next
      for (const dep of filteredDeps[job] ?? []) {
        if (!aDist.has(dep)) {
          aDist.set(dep, d + 1)
          q1.push([dep, d + 1])
        }
      }
    }
    ancestorDists[start] = aDist
    // BFS downstream (descendants)
    const dDist = new Map<string, number>()
    const q2: [string, number][] = [[start, 0]]
    for (let next = q2.shift(); next; next = q2.shift()) {
      const [job, d] = next
      for (const child of reverseDeps[job] ?? []) {
        if (!dDist.has(child)) {
          dDist.set(child, d + 1)
          q2.push([child, d + 1])
        }
      }
    }
    descendantDists[start] = dDist
  }

  return {
    dependencyCols: finalDeps,
    /** Each box's row; above a box, rows the layout leaves empty stay as space. */
    rowSlots: laidOut
      ? laidOut.map((col) => col.rows)
      : finalDeps.map((col) => col.map((_, i) => i)),
    /** Each column's number; between two drawn columns, numbers skipped stay as space. */
    colSlots: laidOut ? laidOut.map((col) => col.column) : finalDeps.map((_, i) => i),
    directDeps: filteredDeps,
    displayJobs: visibleJobs,
    ancestorDists,
    descendantDists,
  }
}

// One level's job list handlers. The graph and the summary sidebar share them and
// differ only in how they show an expanded subworkflow (renderWell).
function jobHandlers({
  engine,
  jobs,
  displayJobs,
  pathPrefix,
  stepsOpen,
  toggleSteps,
  expandedSubworkflows,
  toggleSubworkflow,
  openInNewGraph,
  setSublogOpen,
  renderWell,
  editStep,
}: {
  engine: WorkflowEngine
  jobs: Record<string, WorkflowJob>
  displayJobs: Record<string, WorkflowJob>
  pathPrefix: string
  stepsOpen: Set<string>
  toggleSteps: (key: string) => void
  expandedSubworkflows: Set<string>
  toggleSubworkflow: (key: string) => void
  openInNewGraph: (prefix: string, job: string, step: number) => void
  setSublogOpen: (path: string) => void
  renderWell: (
    subJobs: Record<string, WorkflowJob>,
    subPrefix: string,
    expanded: boolean,
  ) => ReactNode
  /** On an editable graph, a step opens for editing instead of its log. */
  editStep?: ((job: string, step: number) => void) | undefined
}): JobHandlers {
  const isStepsOpen = (j: string) => stepsOpen.has(pathPrefix + j)
  const subworkflowKey = (j: string, s: number) => `${pathPrefix}${j}:${s}`
  const openLog = (j: string, s: number) => setSublogOpen(engine.stepLogPath(pathPrefix, j, s))
  return {
    isStepsOpen,
    onJobClick: (j) => {
      const status = jobs[j]?.status ?? displayJobs[j]?.status
      if (!isStepsOpen(j) && (status === 'skipped' || status === 'skipped-failed')) {
        return
      }
      toggleSteps(pathPrefix + j)
    },
    onStepClick: (j, s) => {
      const step = jobs[j]?.steps?.[s]
      if (step?.status === 'skipped' || step?.status === 'skipped-failed') {
        return
      }
      // Cleanup steps the preview appends as POST steps aren't YAML steps.
      if (editStep && !step?.linkedStep) {
        editStep(jobs[j]?._matrix?.originaljob ?? j, s)
        return
      }
      if (step?.subworkflow) {
        toggleSubworkflow(subworkflowKey(j, s))
      } else {
        openLog(j, s)
      }
    },
    onStepLogClick: openLog,
    onSubworkflowIcon: (j, s) => openInNewGraph(pathPrefix, j, s),
    renderSubworkflow: (j, s) => {
      const subJobs = jobs[j]?.steps?.[s]?.subworkflow?.jobs
      if (!subJobs) {
        return null
      }
      return renderWell(
        subJobs,
        `${pathPrefix}subworkflows/${j}/step_${s}/`,
        expandedSubworkflows.has(subworkflowKey(j, s)),
      )
    },
  }
}

// Inline-expanded subworkflow: shrinks each nested level to 0.8 (compounding, via
// `zoom` so the layout box shrinks too) and re-fits the graph once the reveal
// settles. Uses the same Reveal as job steps and matrix members (grid-row height +
// measured width, overflow clipped while animating); the zoom sits on a child so
// Reveal measures the well's true footprint. The parent's connectors are
// re-measured across the reveal by the connector nudge.
function SubworkflowWell({
  expanded,
  onSettled,
  className,
  children,
}: {
  expanded: boolean
  onSettled: () => void
  className: string
  children: ReactNode
}) {
  return (
    <Reveal open={expanded} growWidth onSettled={onSettled}>
      <div className={className} style={{ zoom: 0.8 }}>
        {children}
      </div>
    </Reveal>
  )
}

// Each nested level lifts every z-indexed piece it renders (nodes, connectors,
// dots) by depth * this, so an inline subgraph stacks entirely above its parent
// node's background instead of its base lines disappearing behind it. Large
// enough to clear one level's full z range; accumulates with depth.
const SUBGRAPH_Z_STEP = 100
// The editor loads only where a graph is edited, so runs and previews don't carry it.
const GraphEditorOverlays = lazy(() => import('./GraphEditor'))
const CONNECTOR_COLOR = 'var(--theme-border)'
const HIGHLIGHT_COLOR = 'var(--theme-element)'
const FIT_ANIMATION_MS = 300

// Resolves once a whole frame passes with none of `els` resizing (observing brings one delivery
// at once, so a still layout resolves too). A reveal follows a nested one's width a frame later.
function sizesSettled(els: Element[]) {
  return new Promise<void>((resolve) => {
    let frame = 0
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          observer.disconnect()
          resolve()
        })
      })
    })
    for (const el of els) {
      observer.observe(el)
    }
  })
}

// The transitions sizing a box as it opens or closes: Reveal's row height and its width.
function sizingTransitions(el: HTMLElement) {
  return el
    .getAnimations({ subtree: true })
    .filter(
      (animation) =>
        animation instanceof CSSTransition &&
        (animation.transitionProperty === 'grid-template-rows' ||
          animation.transitionProperty === 'width'),
    )
}

// The least shift that brings [start, end] inside [low, high]; none when it can't all fit, so the view stays.
export function intoView(start: number, end: number, low: number, high: number) {
  if (end - start > high - low) {
    return 0
  }
  if (start < low) {
    return low - start
  }
  return end > high ? high - end : 0
}
// A held job outlives only the edit it was held for; a later fit, such as a resize, refits.
const HOLD_MS = 2000
// An exponent of the scale, so presses in and out change it by the same factor.
const ZOOM_STEP = 0.25

// One level of the dependency graph: lays out its own jobs into columns, draws
// its own connectors, and recurses into an inline-expanded subworkflow as a
// nested Subgraph. Node ids are namespaced by pathPrefix so reused job names
// across levels never collide, and connectors are measured against this level's
// own wrapper. Rendered inside the top-level pan/zoom surface.
function Subgraph({
  jobs,
  pathPrefix,
  depth,
  preview,
  animT,
  expandedSubworkflows,
  toggleSubworkflow,
  openInNewGraph,
  setSublogOpen,
  invalidateConnectors,
  requestFit,
  stepsOpen,
  toggleSteps,
  matrixOpen,
  toggleMatrix,
  onReady,
  layout,
  editable = false,
}: {
  jobs: Record<string, WorkflowJob>
  pathPrefix: string
  depth: number
  preview: boolean
  animT: number
  expandedSubworkflows: Set<string>
  toggleSubworkflow: (key: string) => void
  openInNewGraph: (prefix: string, job: string, step: number) => void
  setSublogOpen: (path: string) => void
  invalidateConnectors: () => void
  requestFit: () => void
  stepsOpen: Set<string>
  toggleSteps: (key: string) => void
  matrixOpen: Set<string>
  toggleMatrix: (key: string) => void
  onReady?: () => void
  layout?: GraphLayout | undefined
  editable?: boolean
}) {
  const engine = useWorkflowEngine()
  const wrapperRef = useRef<HTMLDivElement>(null)
  const editorApi = useGraphEditor()
  const selectedEdges = useSelectedEdges(editable ? editorApi : null)
  const zBase = depth * SUBGRAPH_Z_STEP
  const [hoveredJob, setHoveredJob] = useState<string | null>(null)
  const lastHoveredDistancesRef = useRef<Map<string, number> | null>(null)
  const maxHoveredDistRef = useRef(0)
  const retractPathLensRef = useRef<Map<string, number>>(new Map())

  const matrixGroups = useMemo(() => engine.matrixGroups(jobs), [engine, jobs])
  // A subworkflow drawn inside another graph places its jobs by their `position`, as its own graph
  // does.
  const placed = useMemo(
    () => layout ?? (depth > 0 ? positionsOf(jobs) : undefined),
    [layout, depth, jobs],
  )
  const {
    dependencyCols,
    rowSlots,
    colSlots,
    directDeps,
    displayJobs,
    ancestorDists,
    descendantDists,
  } = useMemo(
    () => computeGraphLayout(engine, jobs, matrixGroups, placed),
    [engine, jobs, matrixGroups, placed],
  )

  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!editable || !editorApi || !wrapper) {
      return
    }
    editorApi.registerGrid({
      wrapper,
      cols: dependencyCols,
      rows: rowSlots,
      columns: colSlots,
    })
    return () => editorApi.registerGrid(null)
  }, [editable, editorApi, dependencyCols, rowSlots, colSlots])

  // Map of job → hop distance from hovered node (union of ancestors + descendants)
  const hoveredDistances = useMemo(() => {
    if (!hoveredJob) {
      return null
    }
    const dist = new Map<string, number>()
    dist.set(hoveredJob, 0)
    const ancestors = ancestorDists[hoveredJob]
    if (ancestors) {
      for (const [k, v] of ancestors) {
        dist.set(k, v)
      }
    }
    const descendants = descendantDists[hoveredJob]
    if (descendants) {
      for (const [k, v] of descendants) {
        dist.set(k, v)
      }
    }
    return dist
  }, [hoveredJob, ancestorDists, descendantDists])

  // Keep last distances for draw-out direction/delay when unhighlighting
  if (hoveredDistances) {
    lastHoveredDistancesRef.current = hoveredDistances
    maxHoveredDistRef.current = Math.max(...hoveredDistances.values())
  }
  // Active distances — persists after unhover for draw-out direction and node z-index
  const activeDists = hoveredDistances ?? lastHoveredDistancesRef.current

  // Clear stale ref after retract animation completes
  useEffect(() => {
    if (hoveredJob || !lastHoveredDistancesRef.current) {
      return
    }
    const maxDelay = maxHoveredDistRef.current * animT + animT
    const timer = setTimeout(
      () => {
        lastHoveredDistancesRef.current = null
        maxHoveredDistRef.current = 0
        invalidateConnectors()
      },
      maxDelay * 1000 + 200,
    )
    return () => clearTimeout(timer)
  }, [hoveredJob, invalidateConnectors, animT])

  const hoveredRelated = useMemo(() => {
    if (!hoveredDistances) {
      return null
    }
    return new Set(hoveredDistances.keys())
  }, [hoveredDistances])

  // Nodes are measured from the live DOM during render, so force one repaint once
  // this level's layout is committed and whenever its size changes (data load,
  // inline expansion). invalidateConnectors re-renders every level top-down.
  // biome-ignore lint/correctness/useExhaustiveDependencies: dependencyCols is the layout change that re-measures connectors.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      invalidateConnectors()
      onReady?.()
    })
    return () => cancelAnimationFrame(raf)
  }, [dependencyCols, invalidateConnectors, onReady])
  useEffect(() => {
    const el = wrapperRef.current
    if (!el) {
      return
    }
    const ro = new ResizeObserver(() => invalidateConnectors())
    ro.observe(el)
    return () => ro.disconnect()
  }, [invalidateConnectors])

  // A step/matrix/subworkflow reveal shifts sibling boxes; when it doesn't change
  // this level's overall size the ResizeObserver never fires, leaving connectors
  // measured from the pre-reveal layout until an unrelated re-measure (e.g. hover).
  // So re-measure across the reveal and at settle directly. For step/matrix reveals
  // the box layer is memoized so this only re-renders the connector SVGs; while a
  // subworkflow is expanded its live nested graph re-renders too.
  const didRevealMountRef = useRef(false)
  // biome-ignore lint/correctness/useExhaustiveDependencies: the reveal state is the trigger to re-measure, not an input.
  useEffect(() => {
    if (!didRevealMountRef.current) {
      didRevealMountRef.current = true
      return
    }
    let raf = 0
    const start = performance.now()
    const tick = () => {
      // Re-measure and commit connectors synchronously within the rAF frame, so
      // the arcs paint at the same box positions this frame instead of landing a
      // frame behind the CSS-driven boxes.
      flushSync(() => invalidateConnectors())
      if (performance.now() - start < 260) {
        raf = requestAnimationFrame(tick)
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [stepsOpen, matrixOpen, expandedSubworkflows, invalidateConnectors])

  // The box layer (node boxes + their steps) doesn't change when connectors are
  // invalidated — only positions move, which CSS handles — so build it in a
  // stable factory and reuse the memoized element across connector-only
  // re-renders. When a subworkflow is expanded in this subtree the boxes contain
  // a live nested graph that must keep animating, so fall back to a fresh build
  // for those frames.
  const buildBoxLayer = useCallback(() => {
    const handlers = jobHandlers({
      engine,
      jobs,
      displayJobs,
      pathPrefix,
      stepsOpen,
      toggleSteps,
      expandedSubworkflows,
      toggleSubworkflow: (key) => {
        toggleSubworkflow(key)
        requestAnimationFrame(invalidateConnectors)
      },
      openInNewGraph,
      setSublogOpen,
      editStep: editable && editorApi ? (j, s) => editorApi.editStep(j, s) : undefined,
      renderWell: (subJobs, subPrefix, expanded) => (
        <SubworkflowWell
          expanded={expanded}
          onSettled={requestFit}
          className="my-2 rounded-lg border-4 border-(--theme-border)"
        >
          <NestedSubgraph
            jobs={subJobs}
            pathPrefix={subPrefix}
            depth={depth + 1}
            preview={preview}
            animT={animT}
            expandedSubworkflows={expandedSubworkflows}
            toggleSubworkflow={toggleSubworkflow}
            openInNewGraph={openInNewGraph}
            setSublogOpen={setSublogOpen}
            invalidateConnectors={invalidateConnectors}
            requestFit={requestFit}
            stepsOpen={stepsOpen}
            toggleSteps={toggleSteps}
            matrixOpen={matrixOpen}
            toggleMatrix={toggleMatrix}
          />
        </SubworkflowWell>
      ),
    })
    return (
      <div className="flex relative">
        {dependencyCols.map((col, c) => {
          return (
            <div
              key={col[0]?.[0]}
              style={emptyColumnsStyle(
                (colSlots[c] ?? c) - (c === 0 ? 0 : (colSlots[c - 1] ?? c - 1) + 1),
              )}
            >
              {col.map((jobNames, i) => {
                const first = jobNames[0]
                if (first === undefined) {
                  return null
                }
                const matrixGroup = displayJobs[first]?._matrixGroup
                const rowsAbove =
                  (rowSlots[c]?.[i] ?? i) - (i === 0 ? 0 : (rowSlots[c]?.[i - 1] ?? i - 1) + 1)

                if (matrixGroup) {
                  return (
                    <MatrixGroupNode
                      key={`node_${first}`}
                      matrixGroup={matrixGroup}
                      jobNames={jobNames}
                      idPrefix={pathPrefix}
                      isExpanded={matrixOpen.has(pathPrefix + matrixGroup.originaljob)}
                      onToggle={() => toggleMatrix(pathPrefix + matrixGroup.originaljob)}
                      jobs={jobs}
                      activeDists={activeDists}
                      onMouseEnter={() => setHoveredJob(first)}
                      onMouseLeave={() => setHoveredJob(null)}
                      hoveredRelated={hoveredRelated}
                      animT={animT}
                      zBase={zBase}
                      handlers={handlers}
                      preview={preview}
                      editable={editable}
                      rowsAbove={rowsAbove}
                    />
                  )
                }
                return (
                  <div
                    key={`node_${first}`}
                    id={`node_${pathPrefix}${first}`}
                    role="none"
                    className="relative m-24"
                    style={{
                      zIndex: (activeDists?.has(first) ? 25 : 1) + zBase,
                      ...emptyRowsStyle(rowsAbove),
                    }}
                    onMouseEnter={() => setHoveredJob(first)}
                    onMouseLeave={() => setHoveredJob(null)}
                    onFocus={() => setHoveredJob(first)}
                    onBlur={() => setHoveredJob(null)}
                  >
                    <div className="absolute inset-0 rounded-2xl bg-(--theme-panel-bg)" />
                    <div
                      className="relative border-solid shadow py-4 px-8 rounded-xl border-4 whitespace-nowrap bg-(--theme-panel-bg) text-2xl"
                      style={{
                        opacity: hoveredRelated && !hoveredRelated.has(first) ? 0.5 : 1,
                        transition: `opacity ${animT}s`,
                      }}
                    >
                      {editable && jobNames.length > 1 && <BoxGrip jobs={jobNames} />}
                      <Joblist
                        jobs={displayJobs}
                        jobNames={jobNames}
                        {...handlers}
                        growWidth={true}
                        preview={preview}
                        editable={editable}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    )
  }, [
    dependencyCols,
    rowSlots,
    colSlots,
    displayJobs,
    jobs,
    stepsOpen,
    matrixOpen,
    expandedSubworkflows,
    hoveredRelated,
    activeDists,
    animT,
    zBase,
    preview,
    pathPrefix,
    depth,
    toggleSteps,
    toggleSubworkflow,
    toggleMatrix,
    openInNewGraph,
    setSublogOpen,
    engine,
    invalidateConnectors,
    requestFit,
    editable,
    editorApi,
  ])
  const memoizedBoxLayer = useMemo(() => buildBoxLayer(), [buildBoxLayer])
  // A live nested graph exists in this subtree only if an expanded subworkflow
  // key falls under this level's path prefix.
  const hasLiveNestedGraph = Array.from(expandedSubworkflows).some((k) => k.startsWith(pathPrefix))

  if (!dependencyCols[0]?.length) {
    return null
  }

  return (
    <div ref={wrapperRef} className="relative">
      {(() => {
        const wrapper = wrapperRef.current
        const gid = (name: string) => document.getElementById(`node_${pathPrefix}${name}`)
        const ox = (el: HTMLElement) => offsetWithin(el, wrapper).x
        // Y position where connectors attach to a node
        const nodeConnectorY = (el: HTMLElement) => offsetWithin(el, wrapper).y + NODE_CONNECTOR_Y

        // A box's jobs share their needs and dependents, so its first job's needs are the box's, and a
        // need on a job further down a box is also one on its first, which draws it.
        const depsOf = (head: string) => directDeps[head] ?? []

        // Compute column gap (static distance between adjacent column edges)
        let colGap = 32 // fallback
        if (dependencyCols.length >= 2) {
          const col0 = gid(dependencyCols[0]?.[0]?.[0] ?? '')
          const col1 = gid(dependencyCols[1]?.[0]?.[0] ?? '')
          if (col0 && col1) {
            colGap = ox(col1) - (ox(col0) + col0.offsetWidth)
          }
        }
        // With columns left empty, the first two may be far apart; bends fit the narrowest gap.
        if (colSlots.some((column, c) => column !== c)) {
          for (let c = 1; c < dependencyCols.length; c++) {
            const left = gid(dependencyCols[c - 1]?.[0]?.[0] ?? '')
            const right = gid(dependencyCols[c]?.[0]?.[0] ?? '')
            if (left && right) {
              colGap = Math.min(colGap, ox(right) - (ox(left) + left.offsetWidth))
            }
          }
        }

        // Compute global arc radius: quarter of the minimum nonzero
        // vertical distance across all connectors in the graph.
        let minAdy = Number.POSITIVE_INFINITY
        for (const col of dependencyCols) {
          for (const jobNames of col) {
            const first = jobNames[0]
            if (first === undefined) {
              continue
            }
            for (const dep of depsOf(first)) {
              const s = gid(dep)
              const e = gid(first)
              if (!s || !e) {
                continue
              }
              const dy = Math.abs(nodeConnectorY(e) - nodeConnectorY(s))
              if (dy > 0 && dy < minAdy) {
                minAdy = dy
              }
            }
          }
        }
        const MAX_ARC_R = 16
        const arcR = Math.min(
          minAdy === Number.POSITIVE_INFINITY ? MAX_ARC_R : minAdy / 4,
          colGap / 2, // arc can't exceed half the column gap
          MAX_ARC_R,
        )

        // The editor's connector circles on both sides of every node; where a
        // connector below already draws the dot, the circle leaves it showing.
        const ports = (jobNames: string[]) => {
          const [head] = jobNames
          const el = head === undefined ? null : gid(head)
          if (head === undefined || !el) {
            return null
          }
          const y = nodeConnectorY(el)
          const wiredIn = depsOf(head).some((dep) => gid(dep))
          const wiredOut = dependencyCols.some((c) =>
            c.some(([other = '']) => depsOf(other).includes(head) && !!gid(other)),
          )
          return (
            <NodePorts
              jobs={jobNames}
              left={{ x: ox(el) + 2, y }}
              right={{ x: ox(el) + el.offsetWidth - 2, y }}
              drawLeft={!wiredIn}
              drawRight={!wiredOut}
              zIndex={40 + zBase}
            />
          )
        }

        // Every connector's pointer target, in one layer the size of the graph.
        const hits: ReactNode[] = []
        const connectors = dependencyCols.map((col) => (
          <React.Fragment key={col[0]?.[0]}>
            {col.map((jobNames) => {
              const first = jobNames[0]
              if (first === undefined) {
                return null
              }
              return (
                <React.Fragment key={first}>
                  {editable && ports(jobNames)}
                  {depsOf(first).map((dep) => {
                    const isHighlighted = hoveredRelated?.has(first) && hoveredRelated?.has(dep)
                    // Each hop from the hovered node delays the animation by animT
                    const depDist = activeDists?.get(dep) ?? 0
                    const targetDist = activeDists?.get(first) ?? 0
                    const closerDist = Math.min(depDist, targetDist)
                    const connectorDelay = closerDist * animT
                    const retractDelay = (maxHoveredDistRef.current - closerDist) * animT
                    const drawRightToLeft = targetDist < depDist
                    const start = gid(dep)
                    const end = gid(first)
                    if (!start || !end) {
                      return null
                    }
                    const x1 = ox(start) + start.offsetWidth - 2
                    const y1 = nodeConnectorY(start)
                    const x2 = ox(end) + 2
                    const y2 = nodeConnectorY(end)
                    const selected = selectedEdges.some(
                      (edge) => edge.from === dep && edge.to === first,
                    )
                    const dy = y2 - y1
                    const ady = Math.abs(dy)

                    let pathD: string
                    let pathLen: number
                    let pathDReversed: string
                    const r = arcR
                    if (ady === 0) {
                      // Straight horizontal line
                      pathD = `M ${x1} ${y1} L ${x2} ${y2}`
                      pathDReversed = `M ${x2} ${y2} L ${x1} ${y1}`
                      pathLen = x2 - x1
                    } else {
                      // 5 components: horizontal + arc + vertical + arc + horizontal
                      const s = dy > 0 ? 1 : -1
                      // Trailing horizontal is fixed (colGap/2 - r from target)
                      // Leading horizontal absorbs extra distance for multi-column spans
                      const hTrail = colGap / 2 - r
                      const ax2end = x2 - hTrail // where arc 2 ends
                      const ax = ax2end - 2 * r // where arc 1 starts
                      const sw1 = dy > 0 ? 1 : 0
                      const sw2 = dy > 0 ? 0 : 1
                      pathD = [
                        `M ${x1} ${y1}`,
                        `L ${ax} ${y1}`,
                        `A ${r} ${r} 0 0 ${sw1} ${ax + r} ${y1 + s * r}`,
                        `L ${ax + r} ${y2 - s * r}`,
                        `A ${r} ${r} 0 0 ${sw2} ${ax2end} ${y2}`,
                        `L ${x2} ${y2}`,
                      ].join(' ')
                      // Reversed: same points in reverse order, sweep flags flipped
                      pathDReversed = [
                        `M ${x2} ${y2}`,
                        `L ${ax2end} ${y2}`,
                        `A ${r} ${r} 0 0 ${sw1} ${ax + r} ${y2 - s * r}`,
                        `L ${ax + r} ${y1 + s * r}`,
                        `A ${r} ${r} 0 0 ${sw2} ${ax} ${y1}`,
                        `L ${x1} ${y1}`,
                      ].join(' ')
                      const arcLen = (Math.PI * r) / 2
                      const vSeg = Math.max(0, ady - 2 * r)
                      pathLen = ax - x1 + arcLen + vSeg + arcLen + (x2 - ax2end)
                    }

                    if (editable) {
                      hits.push(
                        <React.Fragment key={`${dep}→${first}`}>
                          {selected && (
                            <path
                              d={pathD}
                              stroke="var(--theme-element)"
                              strokeWidth="10"
                              fill="transparent"
                            />
                          )}
                          <EdgeHitPath d={pathD} edge={{ from: dep, to: first }} />
                        </React.Fragment>,
                      )
                    }
                    return (
                      <React.Fragment key={dep}>
                        {/* Dots: background square + inner dot — above nodes */}
                        <svg
                          aria-hidden="true"
                          overflow="visible"
                          className="absolute pointer-events-none"
                          style={{
                            zIndex:
                              (isHighlighted || (activeDists?.has(dep) && activeDists?.has(first))
                                ? 30
                                : 10) + zBase,
                          }}
                        >
                          {/* Background square (panel color) — creates gap between inner dot and node edge */}
                          <rect
                            x={x1 - 16}
                            y={y1 - 16}
                            width={32}
                            height={32}
                            fill="var(--theme-panel-bg)"
                          />
                          <rect
                            x={x2 - 16}
                            y={y2 - 16}
                            width={32}
                            height={32}
                            fill="var(--theme-panel-bg)"
                          />
                          {/* Inner filled dot — start */}
                          <circle
                            cx={x1}
                            cy={y1}
                            r="8"
                            fill={isHighlighted ? HIGHLIGHT_COLOR : CONNECTOR_COLOR}
                            style={{
                              opacity: hoveredRelated && !isHighlighted ? 0.3 : 1,
                              transition: isHighlighted
                                ? `fill ${animT}s ${depDist * animT}s, opacity 0s`
                                : `fill ${animT}s ${(maxHoveredDistRef.current - depDist) * animT}s, opacity 0s`,
                            }}
                          />
                          {/* Inner filled dot — end */}
                          <circle
                            cx={x2}
                            cy={y2}
                            r="8"
                            fill={isHighlighted ? HIGHLIGHT_COLOR : CONNECTOR_COLOR}
                            style={{
                              opacity: hoveredRelated && !isHighlighted ? 0.3 : 1,
                              transition: isHighlighted
                                ? `fill ${animT}s ${targetDist * animT}s, opacity 0s`
                                : `fill ${animT}s ${(maxHoveredDistRef.current - targetDist) * animT}s, opacity 0s`,
                            }}
                          />
                        </svg>
                        <svg
                          aria-hidden="true"
                          overflow="visible"
                          className="absolute pointer-events-none"
                          style={{ zIndex: (isHighlighted ? 20 : -1) + zBase }}
                        >
                          {/* Background mask — always full opacity, clears overlapping lines behind */}
                          <path
                            d={pathD}
                            stroke="var(--theme-panel-bg)"
                            strokeWidth="6"
                            fill="transparent"
                          />
                          {/* Base colored path */}
                          <path
                            d={pathD}
                            stroke={CONNECTOR_COLOR}
                            strokeWidth="6"
                            fill="transparent"
                            style={{
                              opacity: hoveredRelated && !isHighlighted ? 0.3 : 1,
                              transition: `opacity 0s`,
                            }}
                          />
                        </svg>
                        {/* Blue overlay — draws in via dashoffset, above nodes */}
                        <svg
                          aria-hidden="true"
                          overflow="visible"
                          className="absolute pointer-events-none"
                          style={{ zIndex: 20 + zBase }}
                        >
                          {/* Draw-in: always mounted so transition can animate from hidden to visible */}
                          <path
                            d={drawRightToLeft ? pathDReversed : pathD}
                            fill="transparent"
                            style={{
                              stroke: HIGHLIGHT_COLOR,
                              strokeWidth: 6,
                              strokeDasharray: `${pathLen} ${pathLen}`,
                              strokeDashoffset: isHighlighted ? 0 : pathLen,
                              opacity: isHighlighted ? 1 : 0,
                              transition: isHighlighted
                                ? `stroke-dashoffset ${animT}s ease ${connectorDelay}s, opacity 0s ease ${connectorDelay}s`
                                : 'stroke-dashoffset 0s, opacity 0s',
                            }}
                          />
                          {/* Draw-out: only rendered during highlight or active retract */}
                          {(() => {
                            const connKey = `${dep}→${first}`
                            if (isHighlighted) {
                              retractPathLensRef.current.set(connKey, pathLen)
                            }
                            const isRetracting =
                              !isHighlighted && !!activeDists?.has(dep) && !!activeDists?.has(first)
                            if (!isHighlighted && !isRetracting) {
                              return null
                            }
                            const frozenLen = retractPathLensRef.current.get(connKey) ?? pathLen
                            return (
                              <path
                                d={drawRightToLeft ? pathDReversed : pathD}
                                fill="transparent"
                                style={{
                                  stroke: HIGHLIGHT_COLOR,
                                  strokeWidth: 6,
                                  strokeDasharray: `${frozenLen} ${frozenLen}`,
                                  strokeDashoffset: isHighlighted ? 0 : frozenLen,
                                  opacity: isHighlighted ? 0 : 1,
                                  transition: isHighlighted
                                    ? 'stroke-dashoffset 0s, opacity 0s'
                                    : `stroke-dashoffset ${animT}s ease ${retractDelay}s, opacity 0s`,
                                }}
                              />
                            )
                          })()}
                        </svg>
                        {editable && selected && (
                          <EdgeEnds
                            edge={{ from: dep, to: first }}
                            start={{ x: x1, y: y1 }}
                            end={{ x: x2, y: y2 }}
                            zIndex={45 + zBase}
                          />
                        )}
                      </React.Fragment>
                    )
                  })}
                </React.Fragment>
              )
            })}
          </React.Fragment>
        ))
        return (
          <>
            {connectors}
            {editable && (
              // Level with the nodes, which still draw over it, and above the columns laid out around them.
              <svg
                role="none"
                overflow="visible"
                className="absolute pointer-events-none"
                width={wrapper?.offsetWidth}
                height={wrapper?.offsetHeight}
                style={{ zIndex: 1 + zBase }}
              >
                {hits}
              </svg>
            )}
          </>
        )
      })()}
      {hasLiveNestedGraph ? buildBoxLayer() : memoizedBoxLayer}
      {editable && <GraphEditorCanvas />}
    </div>
  )
}

// A level renders its nested levels through this module binding, which hooks see as stable.
const NestedSubgraph = Subgraph

// Recursive summary-sidebar list: renders each job (or matrix group) and, for an
// expanded subworkflow step, an indented title + nested SidebarJobs. Mirrors the
// graph's Subgraph but as a plain list; shares the same namespaced expand state,
// so a subworkflow open in the sidebar is also open in the graph (and vice
// versa). The "open in new graph" arrow (onOpenInNewGraph) is the only full switch.
function SidebarJobs({
  jobs,
  pathPrefix,
  preview,
  stepsOpen,
  toggleSteps,
  expandedSubworkflows,
  toggleSubworkflow,
  matrixOpen,
  toggleMatrix,
  openInNewGraph,
  setSublogOpen,
}: {
  jobs: Record<string, WorkflowJob>
  pathPrefix: string
  preview: boolean
  stepsOpen: Set<string>
  toggleSteps: (key: string) => void
  expandedSubworkflows: Set<string>
  toggleSubworkflow: (key: string) => void
  matrixOpen: Set<string>
  toggleMatrix: (key: string) => void
  openInNewGraph: (prefix: string, job: string, step: number) => void
  setSublogOpen: (path: string) => void
}) {
  const engine = useWorkflowEngine()
  const displayJobs = useMemo(
    () => displayJobsOf(engine, jobs, engine.matrixGroups(jobs)),
    [engine, jobs],
  )
  const handlers = jobHandlers({
    engine,
    jobs,
    displayJobs,
    pathPrefix,
    stepsOpen,
    toggleSteps,
    expandedSubworkflows,
    toggleSubworkflow,
    openInNewGraph,
    setSublogOpen,
    // No graph or connectors here, just the nested job list, indented.
    renderWell: (subJobs, subPrefix, expanded) => (
      <Collapse expanded={expanded}>
        <div className="ml-6 mt-0.5 border-l border-(--theme-border) pl-4">
          <SidebarJobs
            jobs={subJobs}
            pathPrefix={subPrefix}
            preview={preview}
            stepsOpen={stepsOpen}
            toggleSteps={toggleSteps}
            expandedSubworkflows={expandedSubworkflows}
            toggleSubworkflow={toggleSubworkflow}
            matrixOpen={matrixOpen}
            toggleMatrix={toggleMatrix}
            openInNewGraph={openInNewGraph}
            setSublogOpen={setSublogOpen}
          />
        </div>
      </Collapse>
    ),
  })

  // Matrix members are keyed `originaljob-N`, but the collapsed group node is keyed
  // by the bare originaljob; fold members onto their group key so each matrix
  // renders once as a group (like the graph), not one row per member. A matrix that
  // ran as one job has no group, so its job is listed as it is.
  const seenMatrixGroups = new Set<string>()
  const orderedKeys = Object.keys(jobs).flatMap((jobName) => {
    const originaljob = jobs[jobName]?._matrix?.originaljob
    if (!originaljob || !displayJobs[originaljob]?._matrixGroup) {
      return [jobName]
    }
    if (seenMatrixGroups.has(originaljob)) {
      return []
    }
    seenMatrixGroups.add(originaljob)
    return [originaljob]
  })

  return (
    <>
      {orderedKeys.map((jobName) => {
        const mg = displayJobs[jobName]?._matrixGroup
        if (mg) {
          return (
            <MatrixGroupSummaryItem
              key={`matrix-${pathPrefix}${mg.originaljob}`}
              matrixGroup={mg}
              status={displayJobs[jobName]?.status ?? ''}
              isExpanded={matrixOpen.has(pathPrefix + mg.originaljob)}
              onToggle={() => toggleMatrix(pathPrefix + mg.originaljob)}
              jobs={jobs}
              handlers={handlers}
              preview={preview}
            />
          )
        }
        return (
          <Joblist
            key={`job-${pathPrefix}${jobName}`}
            jobs={jobs}
            jobNames={[jobName]}
            {...handlers}
            preview={preview}
          />
        )
      })}
    </>
  )
}

const RUN_STATUSES = [
  'started',
  'running',
  'completed',
  'error',
  'failed',
  'canceled',
  'skipped',
  'faulted',
  'canceling',
  'skipped-failed',
  '',
] as const satisfies readonly RunStatus[]

function toStatus(value: string | undefined): NonNullable<RunStatus> {
  return RUN_STATUSES.find((status) => status === value) ?? ''
}

interface GraphRun {
  id?: string | undefined
  number?: number | undefined
  slug?: string | undefined
  workflowName?: string | undefined
  status?: string | undefined
  statusReason?: string | undefined
  createdAt?: string | undefined
  completedAt?: string | undefined
  executedJobs?: Record<string, unknown> | undefined
  links?: Record<string, RunLink> | undefined
}

function walkJobPath(
  root: Record<string, WorkflowJob>,
  path: (string | number)[],
): Record<string, WorkflowJob> {
  let cursor: unknown = root
  for (const key of path) {
    if (typeof cursor !== 'object' || cursor === null) {
      return {}
    }
    cursor = Object.getOwnPropertyDescriptor(cursor, String(key))?.value
  }
  return isJobRecord(cursor) ? cursor : {}
}

export default function DependencyGraph({
  run,
  preview = false,
  removeBorder,
  viewMode = 'dag',
  setViewMode,
  layout,
  editor,
  yamlJobs,
  inputs,
  workflow,
  fixedHeight,
}: {
  run: GraphRun
  preview?: boolean
  removeBorder?: boolean | undefined
  viewMode?: ViewMode
  setViewMode?: (mode: ViewMode) => void
  layout?: GraphLayout | undefined
  editor?: DependencyGraphEditor | undefined
  yamlJobs?: Record<string, unknown> | undefined
  inputs?: Record<string, unknown> | undefined
  /** The workflow as written, for what the editor's expressions can read. */
  workflow?: Record<string, unknown> | undefined
  fixedHeight?: string | undefined
}) {
  const engine = useWorkflowEngine()
  // Animation timing constant (seconds) — controls line draw, dot transitions, and stagger delay
  const animT = 0.125
  // Zoom limits for auto-fit and user panning
  const minScale = 0.2
  const maxScale = 0.6
  const rootJobs = isJobRecord(run.executedJobs) ? run.executedJobs : {}
  const runNumber = run.number ?? 0
  const runSlug = run.slug ?? ''
  const workflowName = run.workflowName ?? ''
  const runStatus = toStatus(run.status)
  const [sublogOpen, setSublogOpen] = useState<string>('')
  // Which jobs have their step list open, keyed by namespaced path
  // (`${pathPrefix}${jobName}`). A Set so multiple jobs — across nesting levels —
  // can be open at once, which is what makes "Expand all" able to reveal everything.
  const [stepsOpen, setStepsOpen] = useState<Set<string>>(new Set())
  const [expandedSubworkflows, setExpandedSubworkflows] = useState<Set<string>>(new Set())
  const containerRef = useRef<HTMLDivElement>(null)
  const graphContentRef = useRef<HTMLDivElement>(null)
  const transformRef = useRef<ReactZoomPanPinchContentRef | null>(null)
  const [, forceRerender] = useState(0)
  const invalidateConnectors = useCallback(() => forceRerender((c) => c + 1), [])
  const [windowSize, setWindowSize] = useState(() => ({
    w: typeof window !== 'undefined' ? window.innerWidth : 800,
    h: typeof window !== 'undefined' ? window.innerHeight : 600,
  }))
  useEffect(() => {
    // Using a state for window size to trigger re-render and connector recalculation on resize
    const onResize = () => setWindowSize({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  // Size the DAG panel to fit the remaining viewport below its top edge so the
  // graph always fits on screen without page scrolling at any window size or zoom.
  // A ref callback captures the element on mount, and a ResizeObserver on its
  // parent re-measures the top offset whenever siblings above (summary,
  // annotations) grow or wrap. The height is then derived from the current
  // windowSize on every render.
  const [topOffset, setTopOffset] = useState<number | null>(null)
  const topObserverRef = useRef<ResizeObserver | null>(null)
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null)
  const setContainerElement = useCallback(
    (el: HTMLDivElement | null) => {
      containerRef.current = el
      setContainerEl(el)
      topObserverRef.current?.disconnect()
      topObserverRef.current = null
      if (!el || preview) {
        return
      }
      const measure = () => {
        const cur = containerRef.current
        if (!cur) {
          return
        }
        setTopOffset((prev) => {
          const next = cur.getBoundingClientRect().top
          return prev === next ? prev : next
        })
      }
      requestAnimationFrame(measure)
      const parent = el.parentElement
      if (parent) {
        const ro = new ResizeObserver(measure)
        ro.observe(parent)
        topObserverRef.current = ro
      }
    },
    [preview],
  )
  const containerHeight = topOffset !== null ? Math.max(windowSize.h - topOffset - 16, 160) : null

  // A preview has no viewport to fill (embedded previews, docs examples), so
  // its panel is only as tall as the graph. The transform library mounts its
  // content after the first commit, so the observer watches the panel and the
  // measurement retries until the graph is up.
  const [previewHeight, setPreviewHeight] = useState<number | null>(null)
  const previewViewRef = useRef<PreviewView | null>(null)
  useEffect(() => {
    const container = containerRef.current
    if (!preview || !container || fixedHeight) {
      return
    }
    let raf = 0
    let attempts = 0
    const measure = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const next = measurePreviewHeight(graphContentRef.current, previewViewRef)
        if (next === null) {
          if (attempts++ < 120) {
            measure()
          }
          return
        }
        attempts = 0
        setPreviewHeight((prev) => (prev === next ? prev : next))
      })
    }
    measure()
    const observer = new MutationObserver(measure)
    observer.observe(container, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [preview, fixedHeight])

  const { dag: dagStrings } = useStrings()
  const slots = useSlots()
  const [executedJobsPath, setExecutedJobsPath] = useState<(string | number)[][]>([[]])
  const [executedJobsPathIdx, setExecutedJobsPathIdx] = useState<number>(0)
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set())
  // Which matrix groups are expanded, keyed by namespaced path
  // (`${pathPrefix}${originaljob}`). Shared by graph nodes and the sidebar so
  // "Expand all" can open matrices at every nesting level.
  const [matrixOpen, setMatrixOpen] = useState<Set<string>>(new Set())
  // Tick every second while the run is still active so the runtime counter stays fresh
  const isRunFinished =
    !!run.completedAt ||
    run.status === 'completed' ||
    run.status === 'error' ||
    run.status === 'canceled'
  const [now, setNow] = useState(() => DateTime.now())
  useEffect(() => {
    if (isRunFinished) {
      return
    }
    const timer = setInterval(() => setNow(DateTime.now()), 1000)
    return () => clearInterval(timer)
  }, [isRunFinished])
  const currentPath = executedJobsPath[executedJobsPathIdx] ?? []
  const jobs = walkJobPath(rootJobs, currentPath)
  const root = currentPath.length === 0
  // Jobs keep their place on the graph in their own `position`; a host's layout, when it holds any,
  // is the root's.
  const placed = useMemo(
    () =>
      root && engine.editing?.hasLayout(layout)
        ? layout
        : positionsOf(root ? (yamlJobs ?? jobs) : jobs),
    [engine, root, layout, yamlJobs, jobs],
  )
  const [editorApi, setEditorApi] = useState<GraphEditorApi | null>(null)
  const editorOverlays = editor ? (
    <Suspense fallback={null}>
      <GraphEditorOverlays
        editor={editor}
        jobs={jobs}
        yamlJobs={yamlJobs}
        inputs={inputs}
        workflow={workflow}
        layout={placed}
        container={containerEl}
        onApi={setEditorApi}
      />
    </Suspense>
  ) : null

  const resetGraph = useCallback(() => {
    setSublogOpen('')
    setStepsOpen(new Set())
    setExpandedSubworkflows(new Set())
    setMatrixOpen(new Set())
  }, [])

  const openInNewGraph = useCallback(
    (prefix: string, job: string, step: number) => {
      resetGraph()
      setExecutedJobsPath((prev) => [
        [...parsePrefixToPath(prefix), job, 'steps', step, 'subworkflow', 'jobs'],
        ...prev.slice(executedJobsPathIdx, 10),
      ])
      setExecutedJobsPathIdx(0)
    },
    [executedJobsPathIdx, resetGraph],
  )

  const toggleSubworkflow = useCallback((key: string) => {
    setExpandedSubworkflows((prev) => toggled(prev, key))
  }, [])

  const toggleSteps = useCallback(
    (key: string) => {
      setStepsOpen((prev) => toggled(prev, key))
      requestAnimationFrame(invalidateConnectors)
    },
    [invalidateConnectors],
  )

  const toggleMatrix = useCallback(
    (key: string) => {
      setMatrixOpen((prev) => toggled(prev, key))
      requestAnimationFrame(invalidateConnectors)
    },
    [invalidateConnectors],
  )

  const {
    data: sublogs,
    isLoading: sublogsLoading,
    error: sublogsError,
  } = useRunFile(runSlug, sublogOpen || null, preview ? undefined : { refreshInterval: 2000 })

  // Runs executed before the redacted sibling existed only have the raw script.
  useEffect(() => {
    if (
      sublogOpen.endsWith('/script-unstable-redacted.sh') &&
      !sublogsLoading &&
      (sublogsError || !sublogs)
    ) {
      setSublogOpen(sublogOpen.replace(/script-unstable-redacted\.sh$/, 'script-unstable.sh'))
    }
  }, [sublogOpen, sublogs, sublogsError, sublogsLoading])

  const [sublogJob = '', sublogStepDir] = sublogOpen.split('/').slice(-3, -1)
  const sublogStep = sublogStepDir === undefined ? undefined : (sublogStepDir.split('_')[1] ?? '')
  // Paging needs a path naming a job and step. A subworkflow's general log is its
  // parent step's log so it qualifies; a run's own logs.out has no step_ to read.
  const sublogIsStep = sublogStep !== undefined
  const sublogStepData = sublogIsStep ? jobs[sublogJob]?.steps[Number(sublogStep)] : undefined
  const logName = sublogIsStep
    ? `Job: ${jobLabel(sublogJob)} \nStep: ${sublogStepData?.name || `Step ${sublogStep}`}`
    : ''
  const sublogIsSubworkflow = !!sublogStepData?.subworkflow
  // The step's log and its script sit side by side; the toggle swaps one for the other.
  const sublogFileStart = sublogOpen.lastIndexOf('/') + 1
  const sublogShowsLog = sublogOpen.slice(sublogFileStart) === 'logs.out'

  const matrixGroups = useMemo(() => engine.matrixGroups(jobs), [engine, jobs])
  const { dependencyCols } = useMemo(
    () => computeGraphLayout(engine, jobs, matrixGroups),
    [engine, jobs, matrixGroups],
  )

  // A job held for a connection, where it was on screen, which the next fit keeps it at instead.
  const held = useRef<{ job: string; x: number; y: number; at: number } | null>(null)
  // Once the user pans or zooms the editor's view, its edits keep that view until Fit refits it.
  const viewed = useRef(false)
  const nodeOf = useCallback((job: string) => {
    const row = [
      ...(containerRef.current?.querySelectorAll<HTMLElement>('[data-dag-job]') ?? []),
    ].find((el) => el.dataset['dagJob'] === job)
    return row?.closest<HTMLElement>('[id^="node_"]') ?? row ?? null
  }, [])
  const hold = useCallback(
    (job: string) => {
      const content = graphContentRef.current
      const transform = transformRef.current
      const node = nodeOf(job)
      if (!content || !transform || !node) {
        return
      }
      const { positionX, positionY, scale } = transform.instance.state
      const pos = offsetWithin(node, content)
      held.current = {
        job,
        x: positionX + pos.x * scale,
        y: positionY + pos.y * scale,
        at: performance.now(),
      }
    },
    [nodeOf],
  )

  // Auto-fit: zoom and center graph to fill container
  const fitGraph = useCallback(
    (animationMs = 0) => {
      const container = containerRef.current
      const content = graphContentRef.current
      const transform = transformRef.current
      if (!container || !content || !transform) {
        return
      }
      // Fit to the outermost nodes so nested subgraphs don't shrink the whole view when expanded.
      const nodes = outerNodes(content)
      if (nodes.length === 0) {
        return
      }
      let minX = Number.POSITIVE_INFINITY
      let minY = Number.POSITIVE_INFINITY
      let maxX = 0
      let maxY = 0
      for (const node of nodes) {
        const el = node as HTMLElement
        const pos = offsetWithin(el, content)
        minX = Math.min(minX, pos.x)
        minY = Math.min(minY, pos.y)
        maxX = Math.max(maxX, pos.x + el.offsetWidth)
        maxY = Math.max(maxY, pos.y + el.offsetHeight)
      }
      const graphW = maxX - minX
      const graphH = maxY - minY
      const containerW = container.clientWidth
      const containerH = container.clientHeight
      const margin = Math.min(containerW, containerH) * 0.05
      const pending = held.current
      held.current = null
      const kept = pending && performance.now() - pending.at < HOLD_MS
      const node = kept ? nodeOf(pending.job) : null
      const viewing = editor && viewed.current && animationMs === 0
      if ((pending && node) || viewing) {
        const { positionX, positionY, scale: current } = transform.instance.state
        const pos = pending && node ? offsetWithin(node, content) : null
        const x = pending && pos ? pending.x - pos.x * current : positionX
        const y = pending && pos ? pending.y - pos.y * current : positionY
        transform.setTransform(x, y, current, 0)
        // Kept still unless a graph that fits the panel is partly outside it; then the least pan that shows it.
        const dx = intoView(x + minX * current, x + maxX * current, margin, containerW - margin)
        const dy = intoView(y + minY * current, y + maxY * current, margin, containerH - margin)
        requestAnimationFrame(() => {
          if (dx !== 0 || dy !== 0) {
            transform.setTransform(x + dx, y + dy, current, FIT_ANIMATION_MS, 'easeOut')
          }
          invalidateConnectors()
        })
        return
      }
      if (graphW === 0 || graphH === 0) {
        return
      }
      const scaleW = (containerW - margin * 2) / graphW
      const scaleH = (containerH - margin * 2) / graphH
      const scale = Math.min(Math.max(Math.min(scaleW, scaleH), minScale), maxScale)
      const offsetX = margin - minX * scale
      const offsetY = margin - minY * scale
      if (animationMs > 0) {
        // Let the library animate the pan/zoom. Nodes and connectors both sit inside
        // the transformed element, so they move together and stay aligned.
        transform.setTransform(offsetX, offsetY, scale, animationMs, 'easeOut')
        return
      }
      // Apply transform directly to the DOM for instant update (no library async delay)
      const wrapperEl = container.querySelector('.react-transform-component') as HTMLElement
      if (wrapperEl) {
        wrapperEl.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`
      }
      // Tell the library after paint so it doesn't overwrite our direct DOM change
      requestAnimationFrame(() => {
        transform.setTransform(offsetX, offsetY, scale, 0)
        invalidateConnectors()
      })
    },
    [invalidateConnectors, nodeOf, editor],
  )

  // Boxes open and close over CSS transitions, so a fit before they end measures them mid-way:
  // zoomed in too far after opening, out too far after closing.
  const fitWhenSettled = useCallback(async () => {
    const container = containerRef.current
    const content = graphContentRef.current
    if (!container || !content) {
      return
    }
    // A box whose content widens as it opens restarts its width transition, so look again.
    let running = sizingTransitions(content)
    while (running.length > 0) {
      await Promise.allSettled(running.map((transition) => transition.finished))
      running = sizingTransitions(content)
    }
    // A preview's panel follows its graph a frame behind, and the fit measures the panel.
    const panelHeight =
      preview && !fixedHeight ? measurePreviewHeight(content, previewViewRef) : null
    if (panelHeight !== null) {
      flushSync(() => setPreviewHeight(panelHeight))
    }
    // The pan/zoom library cancels a running animation whenever the graph or its panel resizes.
    await sizesSettled([container, content, ...outerNodes(content)])
    invalidateConnectors()
    fitGraph(FIT_ANIMATION_MS)
  }, [fitGraph, invalidateConnectors, preview, fixedHeight])

  const centerOn = useCallback((el: HTMLElement) => {
    const container = containerRef.current
    const content = graphContentRef.current
    const transform = transformRef.current
    if (!container || !content || !transform) {
      return
    }
    const { scale } = transform.instance.state
    const pos = offsetWithin(el, content)
    transform.setTransform(
      container.clientWidth / 2 - (pos.x + el.offsetWidth / 2) * scale,
      container.clientHeight / 2 - (pos.y + el.offsetHeight / 2) * scale,
      scale,
      FIT_ANIMATION_MS,
      'easeOut',
    )
  }, [])

  // A problem picked from any pane's list brings its job, or step, into view selected.
  const registerShow = editor?.registerShow
  useEffect(() => {
    if (!editorApi) {
      return
    }
    editorApi.registerView({ hold })
    return () => editorApi.registerView(null)
  }, [editorApi, hold])
  useEffect(() => {
    if (!registerShow || !editorApi) {
      return
    }
    return registerShow(({ job, step }) => {
      const row = [
        ...(containerRef.current?.querySelectorAll<HTMLElement>('[data-dag-job]') ?? []),
      ].find((el) => el.dataset['dagJob'] === job)
      if (job === undefined || !row) {
        return false
      }
      if (step !== undefined) {
        setStepsOpen((prev) => new Set(prev).add(job))
      }
      editorApi.focus(step === undefined ? { job } : { job, step })
      // After the steps it may have just opened are laid out.
      requestAnimationFrame(() => centerOn(row.closest<HTMLElement>('[id^="node_"]') ?? row))
      if (step === undefined) {
        editorApi.editJob(job)
      } else {
        editorApi.editStep(job, step)
      }
      return true
    })
  }, [registerShow, editorApi, centerOn])

  // The view opens at its closest zoom, which a fit never passes.
  const [zoomedAll, setZoomedAll] = useState<'in' | 'out' | null>('in')
  const onTransform = useCallback(
    (_: unknown, { scale }: { scale: number }) => {
      setZoomedAll(scale >= maxScale - 0.001 ? 'in' : scale <= minScale + 0.001 ? 'out' : null)
      invalidateConnectors()
    },
    [invalidateConnectors],
  )

  // The transform's wrapper grows with the graph, so zoom about the middle of what the panel shows.
  const moved = useCallback(() => {
    viewed.current = true
    invalidateConnectors()
  }, [invalidateConnectors])
  const zoomBy = useCallback((step: number) => {
    const container = containerRef.current
    const transform = transformRef.current
    if (!container || !transform) {
      return
    }
    viewed.current = true
    const { positionX, positionY, scale } = transform.instance.state
    const next = Math.min(maxScale, Math.max(minScale, scale * Math.exp(step)))
    const x = container.clientWidth / 2
    const y = container.clientHeight / 2
    transform.setTransform(
      x - ((x - positionX) / scale) * next,
      y - ((y - positionY) / scale) * next,
      next,
      FIT_ANIMATION_MS,
      'easeOut',
    )
  }, [])

  // biome-ignore lint/correctness/useExhaustiveDependencies: a resized window or a re-rooted graph re-fits the view.
  useEffect(() => {
    if (preview) {
      return
    }
    const raf = requestAnimationFrame(() => fitGraph())
    return () => cancelAnimationFrame(raf)
  }, [preview, fitGraph, windowSize, executedJobsPathIdx])

  const nestingDepth = currentPath.length / 5
  const levelPrefixes: string[] = []
  for (let i = 0; i < nestingDepth; i++) {
    levelPrefixes.push(`subworkflows/${currentPath[5 * i]}/step_${currentPath[5 * i + 2]}/`)
  }
  const pathAppend = levelPrefixes.join('')
  // For subworkflows, the "general log" is the parent step's log file
  // (the new executor doesn't create a logs.out at the subworkflow root)
  let generalLogPath = 'logs.out'
  if (nestingDepth > 0) {
    const lastJob = String(currentPath[5 * (nestingDepth - 1)] ?? '')
    const lastStep = currentPath[5 * (nestingDepth - 1) + 2] ?? ''
    generalLogPath = engine.stepLogPath(levelPrefixes.slice(0, -1).join(''), lastJob, lastStep)
  }

  // A failed fetch, an end reason, and a truly empty log need distinct wording.
  const missingLogText = sublogIsSubworkflow
    ? 'Subworkflows generally have no logs/scripts at this level.\nClick on the "Open in new graph" icon on the subworkflow step to open the subworkflow graph.'
    : sublogsError
      ? dagStrings.logLoadFailed
      : ((sublogOpen === generalLogPath ? dagStrings.statusReason(run.statusReason) : undefined) ??
        dagStrings.noLogFound)

  const currentSublog =
    sublogOpen === ''
      ? ''
      : preview
        ? engine.toYaml(sublogStepData)
        : sublogsError || !sublogs
          ? missingLogText
          : sublogs

  // Recomputed from the live job tree (honors `if` after e.g. a retry).
  const expansionKeys = useMemo(
    () => engine.expansionKeys(jobs, pathAppend),
    [engine, jobs, pathAppend],
  )
  const hasExpandable =
    expansionKeys.subworkflowKeys.length > 0 || expansionKeys.matrixKeys.length > 0
  const allExpanded =
    hasExpandable &&
    expansionKeys.subworkflowKeys.every((k) => expandedSubworkflows.has(k)) &&
    expansionKeys.matrixKeys.every((k) => matrixOpen.has(k))
  const resetView = () => {
    if (currentPath.length > 0) {
      resetGraph()
      setExecutedJobsPath([[], ...executedJobsPath.slice(executedJobsPathIdx, 10)])
      setExecutedJobsPathIdx(0)
    } else {
      viewed.current = false
      fitGraph(FIT_ANIMATION_MS)
    }
  }
  const toggleExpandAll = () => {
    // Committed now, so the boxes' transitions have started when fitWhenSettled looks for them.
    flushSync(() => {
      if (allExpanded) {
        setExpandedSubworkflows(new Set())
        setStepsOpen(new Set())
        setMatrixOpen(new Set())
      } else {
        // Open every subworkflow, the step list of each containing job, and every
        // matrix group so members (and their subworkflows) are actually revealed.
        setExpandedSubworkflows(new Set(expansionKeys.subworkflowKeys))
        setStepsOpen(new Set(expansionKeys.jobKeys))
        setMatrixOpen(new Set(expansionKeys.matrixKeys))
      }
    })
    void fitWhenSettled()
  }

  const nextStep = useCallback(
    (backward: boolean) => {
      const sublogSplit = sublogOpen.split('/')
      let job = sublogSplit[sublogSplit.length - 3] ?? ''
      let step = parseInt((sublogSplit[sublogSplit.length - 2] ?? '').slice(5), 10)
      const jobArr = Object.keys(jobs)
      let idx = jobArr.indexOf(job)
      if (backward) {
        if (0 < step) {
          step -= 1
        } else {
          if (idx === 0) {
            idx = jobArr.length
          }
          job = jobArr[idx - 1] ?? ''
          step = (jobs[job]?.steps.length ?? 0) - 1
        }
      } else {
        if ((jobs[job]?.steps.length ?? 0) - 1 > step) {
          step += 1
        } else {
          if (idx === jobArr.length - 1) {
            idx = -1
          }
          job = jobArr[idx + 1] ?? ''
          step = 0
        }
      }
      setSublogOpen(
        `${sublogSplit.slice(0, -3).join('/')}/${job}/step_${step}/${sublogSplit.slice(-1)[0]}`,
      )
    },
    [jobs, sublogOpen],
  )

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        nextStep(false)
      } else if (e.key === 'ArrowLeft') {
        nextStep(true)
      }
    },
    [nextStep],
  )

  useEffect(() => {
    if (!sublogIsStep) {
      return
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown, sublogIsStep])

  // The sidebar isn't part of the connector layout, so keep it out of the
  // per-frame re-renders that connector invalidation triggers during graph
  // animations; it only needs to re-render when its own inputs change.
  const summarySidebar = useMemo(
    () => (
      <SidebarJobs
        jobs={jobs}
        pathPrefix={pathAppend}
        preview={preview}
        stepsOpen={stepsOpen}
        toggleSteps={toggleSteps}
        expandedSubworkflows={expandedSubworkflows}
        toggleSubworkflow={toggleSubworkflow}
        matrixOpen={matrixOpen}
        toggleMatrix={toggleMatrix}
        openInNewGraph={openInNewGraph}
        setSublogOpen={setSublogOpen}
      />
    ),
    [
      jobs,
      pathAppend,
      preview,
      stepsOpen,
      toggleSteps,
      expandedSubworkflows,
      toggleSubworkflow,
      matrixOpen,
      toggleMatrix,
      openInNewGraph,
    ],
  )

  if (!dependencyCols[0]?.length) {
    return editor ? (
      <GraphEditorProvider value={editorApi}>
        <EmptyGraphEditor
          containerRef={setContainerElement}
          overlays={editorOverlays}
          height={fixedHeight ?? '240px'}
          removeBorder={removeBorder}
        />
      </GraphEditorProvider>
    ) : undefined
  }

  const startDt = run.createdAt ? DateTime.fromISO(run.createdAt) : now
  const endDt = run.completedAt ? DateTime.fromISO(run.completedAt) : now
  const runtime = toAbsHumanDuration(startDt, endDt)

  const additionalBottomLeftBarComponents = sublogIsStep ? (
    <>
      <button type="button" className="btn btn-neutral" onClick={() => nextStep(true)}>
        <ArrowLeftIcon />
        <span>Prev</span>
      </button>
      <button type="button" className="btn btn-neutral" onClick={() => nextStep(false)}>
        <ArrowRightIcon />
        <span>Next</span>
      </button>
      <span className="pt-0.5 whitespace-pre-wrap text-xs">{logName}</span>
    </>
  ) : undefined

  const additionalBottomRightBarComponents =
    (!preview || sublogIsSubworkflow) && sublogIsStep ? (
      <button
        type="button"
        className="btn btn-neutral"
        onClick={() => {
          if (sublogIsSubworkflow) {
            openInNewGraph(pathAppend, sublogJob, parseInt(sublogStep ?? '', 10))
            setSublogOpen('')
          } else {
            setSublogOpen(
              sublogOpen.slice(0, sublogFileStart) +
                (sublogShowsLog ? 'script-unstable-redacted.sh' : 'logs.out'),
            )
          }
        }}
      >
        <span>
          {sublogIsSubworkflow ? 'Open Subworkflow' : sublogShowsLog ? 'Show Script' : 'Show Logs'}
        </span>
      </button>
    ) : undefined

  const graph = (
    <div className="flex flex-col lg:flex-row w-full">
      {!preview && (
        <div className="hidden lg:block lg:w-[280px] flex-shrink-0 lg:mr-1">
          {slots.runSessions && (
            <div className="mb-4 overflow-y-auto">
              {slots.runSessions({
                runId: run.id ?? '',
                runNumber,
                runActive: engine.isRunActive(run.status),
                links: run.links,
              })}
            </div>
          )}
          <div className="font-bold flex items-center gap-x-2">
            Summary
            <button
              type="button"
              aria-label="General log"
              onClick={() => setSublogOpen(generalLogPath)}
              className="link"
            >
              <DocumentIcon className="w-4 h-4" />
            </button>
          </div>
          <div className="mx-4 mb-4 overflow-y-auto">{summarySidebar}</div>
        </div>
      )}
      <div
        className={cx(preview ? 'w-full' : 'flex-1 min-w-0 mt-2', 'h-full flex flex-col gap-y-2')}
      >
        {!preview && (
          <div className="panel w-full border rounded-lg px-4 py-2 flex flex-wrap items-center gap-x-16 gap-y-2">
            <div className="flex flex-col">
              <div className="text-xs">{dagStrings.workflow}</div>
              <div className="text-sm font-semibold flex items-center gap-x-1">{workflowName}</div>
            </div>
            <div className="flex flex-col">
              <div className="text-xs">{dagStrings.run}</div>
              <div className="text-sm font-semibold flex items-center gap-x-1">{runNumber}</div>
            </div>
            <div className="flex flex-col">
              <div className="text-xs">{dagStrings.status}</div>
              <div className="text-sm font-semibold flex items-center gap-x-1">
                <TooltipInfo
                  className="flex items-center gap-x-1"
                  text={dagStrings.statusReason(run.statusReason) ?? ''}
                >
                  <Indicator status={runStatus} />
                  {dagStrings.statusLabel(runStatus)}
                </TooltipInfo>
              </div>
            </div>
            <div className="flex flex-col">
              <div className="text-xs">{dagStrings.runtime}</div>
              <div className="text-sm font-semibold flex items-center gap-x-1">{runtime}</div>
            </div>
            <div className="flex flex-col">
              <div className="text-xs">{dagStrings.submitted}</div>
              <div className="text-sm font-semibold flex items-center gap-x-1">
                {startDt.toLocaleString(DateTime.DATETIME_SHORT)}
              </div>
            </div>
            {/* Spacer */}
            <div className="flex-1" />
            {/* View Mode Toggle */}
            {setViewMode && (
              <ViewToggle
                viewMode={viewMode}
                setViewMode={(mode) => {
                  if (mode === 'dag') {
                    setStepsOpen(new Set())
                    requestAnimationFrame(fitGraph)
                  }
                  setViewMode(mode)
                }}
              />
            )}
          </div>
        )}
        {!preview && <AnnotationBanner executedJobs={jobs} />}
        {viewMode === 'tree' && !preview ? (
          <div className="panel w-full border">
            <TreeView
              jobs={jobs}
              slug={runSlug}
              expandedJobs={expandedJobs}
              setExpandedJobs={setExpandedJobs}
            />
          </div>
        ) : (
          <div
            ref={setContainerElement}
            tabIndex={editor ? -1 : undefined}
            className={cx(
              'panel w-full overflow-hidden relative',
              removeBorder ? 'border-none' : 'border',
              editor && 'outline-none',
            )}
            style={{
              height:
                fixedHeight ??
                (containerHeight !== null
                  ? `${containerHeight}px`
                  : previewHeight !== null
                    ? `${Math.min(previewHeight, windowSize.h * 0.62)}px`
                    : '62vh'),
              minHeight: previewHeight !== null && !fixedHeight ? 0 : 160,
            }}
          >
            <TransformWrapper
              ref={transformRef}
              minScale={minScale}
              maxScale={maxScale}
              initialScale={maxScale}
              {...(editor ? { panning: { excluded: [EDITOR_HANDLE_CLASS] } } : {})}
              doubleClick={{ disabled: true }}
              limitToBounds={false}
              onInit={() => {
                setTimeout(invalidateConnectors, 0)
              }}
              onPanning={moved}
              onPinch={moved}
              onTransform={onTransform}
              onWheel={moved}
              onZoom={invalidateConnectors}
            >
              {() => (
                <>
                  <div className="absolute z-10 top-2 right-2 flex max-w-[calc(100%-1rem)] flex-col items-end gap-y-1">
                    <GraphViewControls
                      history={
                        executedJobsPath.length > 1
                          ? {
                              back:
                                executedJobsPathIdx + 1 < executedJobsPath.length
                                  ? () => {
                                      resetGraph()
                                      setExecutedJobsPathIdx(executedJobsPathIdx + 1)
                                    }
                                  : undefined,
                              forward:
                                executedJobsPathIdx > 0
                                  ? () => {
                                      resetGraph()
                                      setExecutedJobsPathIdx(executedJobsPathIdx - 1)
                                    }
                                  : undefined,
                            }
                          : undefined
                      }
                      expand={
                        hasExpandable
                          ? {
                              label: allExpanded ? dagStrings.collapseAll : dagStrings.expandAll,
                              onClick: toggleExpandAll,
                            }
                          : undefined
                      }
                      onReset={resetView}
                      onZoom={(direction) => zoomBy(direction * ZOOM_STEP)}
                      zoomedAll={zoomedAll}
                    />
                  </div>
                  <TransformComponent>
                    <div
                      ref={graphContentRef}
                      className="flex relative mr-[8000px]"
                      style={{ minHeight: 4000 }}
                    >
                      <Subgraph
                        key={`sg-${executedJobsPathIdx}-${pathAppend}`}
                        jobs={jobs}
                        pathPrefix={pathAppend}
                        depth={0}
                        preview={preview}
                        animT={animT}
                        expandedSubworkflows={expandedSubworkflows}
                        toggleSubworkflow={toggleSubworkflow}
                        openInNewGraph={openInNewGraph}
                        setSublogOpen={setSublogOpen}
                        invalidateConnectors={invalidateConnectors}
                        requestFit={fitWhenSettled}
                        stepsOpen={stepsOpen}
                        toggleSteps={toggleSteps}
                        matrixOpen={matrixOpen}
                        toggleMatrix={toggleMatrix}
                        onReady={fitGraph}
                        layout={placed}
                        editable={!!editorApi && currentPath.length === 0}
                      />
                    </div>
                  </TransformComponent>
                </>
              )}
            </TransformWrapper>
            {editorOverlays}
          </div>
        )}
      </div>
      <BareModal
        open={sublogOpen !== ''}
        onClose={() => setSublogOpen('')}
        align="center"
        className={cx(modalPanelClasses, 'max-h-full overflow-y-auto p-4 sm:p-6')}
      >
        <div className="flex w-full">
          {sublogsLoading && (!sublogs || !runNumber) ? (
            <Loader text={dagStrings.loadingLogs} size={70} textSize={18} />
          ) : preview ? (
            <div>
              {slots.yamlViewer?.({
                value: currentSublog,
                height: window.innerHeight / 1.4,
                width: window.innerWidth / 1.4,
                contentKey: `editor_${sublogOpen}`,
              }) ?? (
                <pre
                  className="h-full overflow-auto text-xs p-4"
                  style={{
                    height: window.innerHeight / 1.4,
                    width: window.innerWidth / 1.4,
                  }}
                >
                  {currentSublog}
                </pre>
              )}
              <div className="flex theme-panel select-none items-center gap-x-2 p-2">
                <div className="w-full flex flex-row gap-x-2 items-center">
                  <div className="flex gap-x-2 w-full">{additionalBottomLeftBarComponents}</div>
                </div>
                {additionalBottomRightBarComponents}
              </div>
            </div>
          ) : (
            <LogViewer
              log={currentSublog.slice(-100000)}
              height={windowSize.h / 1.2}
              width={windowSize.w / 1.2}
              hideExpand={true}
              additionalBottomLeftBarComponents={additionalBottomLeftBarComponents}
              additionalBottomRightBarComponents={additionalBottomRightBarComponents}
              enableWorkflowCommands
            />
          )}
        </div>
      </BareModal>
    </div>
  )
  return <GraphEditorProvider value={editorApi}>{graph}</GraphEditorProvider>
}

const isSlot = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0

/** Each job's place on the graph from its `position`; none when no job has one. */
function positionsOf(jobs: Record<string, unknown>): GraphLayout | undefined {
  const layout: GraphLayout = Object.create(null)
  let any = false
  for (const [name, job] of Object.entries(jobs)) {
    const { position, _matrix } = isJobRecord(job) ? (job as Record<string, unknown>) : {}
    const { column, row } = isJobRecord(position) ? (position as Record<string, unknown>) : {}
    // A run copies a matrix job's `position` into each of its runs, which draw as one node under
    // the job's own name.
    const original = isJobRecord(_matrix)
      ? (_matrix as Record<string, unknown>)['originaljob']
      : undefined
    const key = typeof original === 'string' && original ? original : name
    if (isSlot(column) && isSlot(row) && !(key in layout)) {
      layout[key] = { column, row }
      any = true
    }
  }
  return any ? layout : undefined
}

/** Jobs as a run evaluates them before it starts: each `strategy`, and a `needs` expression, from the inputs' defaults. */
function withRunExpressions(
  engine: WorkflowEngine,
  jobs: Record<string, WorkflowJob>,
  workflowInputs: Record<string, unknown> | undefined,
): Record<string, WorkflowJob> {
  let values: Record<string, unknown> | undefined
  const evaluate = (obj: Record<string, unknown>) => {
    values ??= defaultInputValues(engine, workflowInputs)
    return engine.evaluate({ inputs: values, obj })
  }
  const out: Record<string, WorkflowJob> = {}
  for (const [name, job] of Object.entries(jobs)) {
    const { strategy, needs } = job as unknown as Record<string, unknown>
    const next: Record<string, unknown> = { ...job }
    if (
      engine.editing &&
      isJobRecord(strategy) &&
      engine.inputDependencies(strategy).hasExpressions
    ) {
      next['strategy'] = evaluate(strategy)
    }
    if (typeof needs === 'string' && engine.inputDependencies(needs).hasExpressions) {
      const evaluated = evaluate({ needs })['needs']
      if (Array.isArray(evaluated) && evaluated.every((need) => typeof need === 'string')) {
        next['needs'] = evaluated
      }
    }
    out[name] = next as unknown as WorkflowJob
  }
  return out
}

/** The input values a run started without any gets: each one's default. */
function defaultInputValues(
  engine: WorkflowEngine,
  workflowInputs: Record<string, unknown> | undefined,
): Record<string, unknown> {
  try {
    const fields = prefilled(engine.convertInputs(workflowInputs ?? {})) as Record<string, unknown>
    const initial = initializeValues(fields) ?? {}
    return engine.evaluate({ inputs: initial, obj: initial })
  } catch {
    // Half-typed inputs, such as a dropdown option still null, can throw; expressions then see none.
    return {}
  }
}

// The form leaves a string's default for its field to show, where a run fills a blank input from it.
function prefilled(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(prefilled)
  }
  if (!isJobRecord(value)) {
    return value
  }
  const field: Record<string, unknown> = Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, prefilled(entry)]),
  )
  return 'type' in field && 'default' in field ? { ...field, prefillDefault: true } : field
}

export function DependencyGraphPreview(inputs: {
  yml?: Record<string, unknown>
  removeBorder?: boolean
  layout?: GraphLayout | undefined
  editor?: DependencyGraphEditor | undefined
  /** A fixed panel height; without one the panel is only as tall as the graph. */
  height?: string | undefined
}) {
  const engine = useWorkflowEngine()
  const { editing } = engine
  const ymlJobs = inputs.yml?.['jobs']
  const jobs = isJobRecord(ymlJobs) ? ymlJobs : {}
  // A page loads the expression runtime on first use, so only jobs a run evaluates first load it. Only
  // an engine that edits expands a matrix, so a strategy needs evaluating only with one.
  const evaluates = useMemo(
    () =>
      Object.values(jobs).some((job) => {
        const { strategy, needs } = job as unknown as Record<string, unknown>
        return engine.inputDependencies({ strategy: editing ? strategy : undefined, needs })
          .hasExpressions
      }),
    [engine, editing, jobs],
  )
  const [ready, setReady] = useState(() => engine.isReady())
  useEffect(() => {
    if (!evaluates) {
      return
    }
    engine.init()
    const unsubscribe = engine.onReady(setReady)
    setReady(engine.isReady())
    return unsubscribe
  }, [engine, evaluates])
  const on = inputs.yml?.['on']
  const execute = isJobRecord(on) ? (on as Record<string, unknown>)['execute'] : undefined
  const executeInputs = isJobRecord(execute)
    ? (execute as Record<string, unknown>)['inputs']
    : undefined
  const workflowInputs = isJobRecord(executeInputs)
    ? (executeInputs as Record<string, unknown>)
    : undefined
  const editable = !!inputs.editor
  const executedJobs = useMemo(() => {
    // A run's graph leaves out a job whose `if` is false; the editor draws every job it edits.
    const drawn = editable
      ? Object.fromEntries(
          Object.entries(jobs).map(([name, job]) => {
            const { if: condition, ...rest } = job
            return [name, condition === false ? rest : job]
          }),
        )
      : jobs
    const withCleanup = addCleanupSteps({ jobs: drawn })
    const evaluated = ready ? withRunExpressions(engine, withCleanup, workflowInputs) : withCleanup
    // A run lists a matrix's runs as jobs of their own; without an engine that edits, it stays one.
    return editing ? editing.expandMatrixJobs(evaluated) : evaluated
  }, [engine, editing, ready, editable, jobs, workflowInputs])
  return (
    <DependencyGraph
      run={{
        executedJobs,
        number: 0,
        workflowName: '',
      }}
      preview={true}
      removeBorder={inputs.removeBorder}
      layout={inputs.layout}
      editor={inputs.editor}
      yamlJobs={jobs}
      inputs={workflowInputs}
      workflow={inputs.yml}
      fixedHeight={inputs.height}
    />
  )
}

import cx from 'classnames'
import { DateTime } from 'luxon'
import React, { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import {
  type ReactZoomPanPinchContentRef,
  TransformComponent,
  TransformWrapper,
} from 'react-zoom-pan-pinch'
import { BareModal, modalPanelClasses } from '../components/BareModal'
import { Indicator } from '../components/Indicator'
import Loader from '../components/Loader'
import { useRunFile, useSlots, useStrings, useWorkflowEngine } from '../components/Provider'
import { TooltipInfo } from '../components/Tooltip'
import { toAbsHumanDuration } from '../duration'
import type { MatrixGroup, RunStatus, WorkflowEngine } from '../engine'
import { ArrowLeftIcon, ArrowRightIcon, DocumentIcon } from '../icons'
import { LogViewer } from '../logviewer'
import { AnnotationBanner } from './AnnotationBanner'
import { Collapse } from './Collapse'
import { Joblist } from './JobSummary'
import { MatrixGroupNode, MatrixGroupSummaryItem } from './MatrixGroup'
import { Reveal } from './Reveal'
import TreeView from './TreeView'
import { isJobRecord, type RunLink, type WorkflowJob, type WorkflowStep } from './types'

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

// Copied from js workflow start endpoint, which will be removed
const addCleanupSteps = ({ jobs }: { jobs: Record<string, WorkflowJob> }) => {
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
          const clonedStep = cloned.steps[index]
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
          const clonedStep = clonedCleanup[index]
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

// Position of `el` relative to `ancestor`, summed over the offsetParent chain.
// Lets each Subgraph level measure its nodes against its own container so nested
// graphs stay self-contained regardless of depth.
const PREVIEW_PADDING = 24

interface PreviewView {
  scale: number
  offsetY: number
}

// Bounds are measured in content space against the view captured on first
// layout, so panning never resizes the panel. Null until the graph has nodes
// and the library has applied its initial transform.
function measurePreviewHeight(
  content: HTMLElement | null,
  viewRef: React.RefObject<PreviewView | null>,
): number | null {
  const nodes = content?.querySelectorAll<HTMLElement>('[id^="node_"]')
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

// Topologically level `jobs` into columns and precompute hop distances. Lifted
// from the old in-component effect so each Subgraph can lay itself out.
function computeGraphLayout(
  engine: WorkflowEngine,
  jobs: Record<string, WorkflowJob>,
  matrixGroups: Record<string, MatrixGroup>,
) {
  const visibleJobs = structuredClone(jobs)
  for (const jobName of Object.keys(jobs ?? {})) {
    // Note that this will also evaluate hidden properly for some jobs with expressions in if property
    // for example will work as expected for expressons dependent on inputs, will NEVER hide jobs with if expressions dependent on job outputs
    if (jobs[jobName]?.if === false) {
      delete visibleJobs[jobName]
    }
  }

  // Collapse matrix groups into single synthetic nodes in the layout.
  // Expand/collapse is purely a rendering concern inside the node.
  engine.collapseMatrixGroups(matrixGroups, visibleJobs)

  const allDeps: Record<string, Set<string>> = {}
  for (const jobName of Object.keys(visibleJobs)) {
    allDeps[jobName] = engine.jobDependencies(jobName, visibleJobs, allDeps)
  }

  const filteredDeps: Record<string, string[]> = {}
  for (const jobName of Object.keys(visibleJobs)) {
    const needs = visibleJobs[jobName]?.needs
    const oldNeeds: string[] = Array.isArray(needs) ? needs : []
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
  Object.keys(visibleJobs).forEach((jobName) => {
    if (filteredDeps[jobName] && Array.isArray(filteredDeps[jobName])) {
      filteredDeps[jobName].forEach((dep) => {
        if (depended_on[dep]) {
          depended_on[dep].push(jobName)
        } else {
          depended_on[dep] = [jobName]
        }
      })
    }
  })

  Object.keys(visibleJobs).forEach((jobName) => {
    if (depended_on[jobName]) {
      depended_on[jobName].sort()
    }
  })

  const unfinished = structuredClone(visibleJobs)
  const rootLevel: string[] = []
  const deps: string[][] = [rootLevel]
  Object.keys(visibleJobs).forEach((jobName) => {
    if (filteredDeps[jobName]?.length === 0) {
      rootLevel.push(jobName)
      delete unfinished[jobName]
    }
  })

  let prevLen: number
  do {
    const toAppend: string[] = []
    const unfinishedArr = Object.keys(unfinished)
    prevLen = unfinishedArr.length
    unfinishedArr.forEach((jobName) => {
      if ((filteredDeps[jobName] ?? []).every((dep) => !unfinishedArr.includes(dep))) {
        toAppend.push(jobName)
        delete unfinished[jobName]
      }
    })
    if (toAppend.length > 0) {
      deps.push(toAppend)
    }
  } while (prevLen !== Object.keys(unfinished).length)

  const finalDeps: string[][][] = []
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
        if (visibleJobs[head]?._matrixGroup || visibleJobs[jobName]?._matrixGroup) {
          return
        }
        const depsA = depended_on[head]
        const depsB = depended_on[jobName]
        const depsA2 = filteredDeps[head]
        const depsB2 = filteredDeps[jobName]
        if ((!depsA && !depsB) || (depsA && depsB && depsA.length === depsB.length)) {
          if ((!depsA2 && !depsB2) || (depsA2 && depsB2 && depsA2.length === depsB2.length)) {
            if (
              (!depsA || depsA.every((dep, i) => dep === depsB?.[i])) &&
              (!depsA2 || depsA2.every((dep, i) => dep === depsB2?.[i]))
            ) {
              grouped.push(jobName)
              toRm.push(j + 1)
            }
          }
        }
      })
      col.splice(0, col.length, ...col.filter((_, i) => !toRm.includes(i)))
      toAppend.push(grouped)
    }
    finalDeps.push(toAppend)
  })

  while (finalDeps.length > 0) {
    const first = finalDeps[0]
    if (!first) {
      break
    }
    if (first.length === 0) {
      finalDeps.splice(0, 1)
      continue
    }
    if (first[0]?.length !== 0) {
      break
    }
    while (first.length > 0 && first[0]?.length === 0) {
      first.splice(0, 1)
    }
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
    while (q1.length > 0) {
      const [job, d] = q1.shift()!
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
    while (q2.length > 0) {
      const [job, d] = q2.shift()!
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
    directDeps: filteredDeps,
    displayJobs: visibleJobs,
    ancestorDists,
    descendantDists,
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
const FIT_ANIMATION_MS = 300

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
}) {
  const engine = useWorkflowEngine()
  const wrapperRef = useRef<HTMLDivElement>(null)
  const zBase = depth * SUBGRAPH_Z_STEP
  const [hoveredJob, setHoveredJob] = useState<string | null>(null)
  const lastHoveredDistancesRef = useRef<Map<string, number> | null>(null)
  const maxHoveredDistRef = useRef(0)
  const retractPathLensRef = useRef<Map<string, number>>(new Map())

  const matrixGroups = useMemo(() => engine.matrixGroups(jobs), [engine, jobs])
  const { dependencyCols, directDeps, displayJobs, ancestorDists, descendantDists } = useMemo(
    () => computeGraphLayout(engine, jobs, matrixGroups),
    [engine, jobs, matrixGroups],
  )

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
    const isStepsOpen = (j: string) => stepsOpen.has(pathPrefix + j)
    const onJobClick = (j: string) => {
      const status = jobs[j]?.status ?? displayJobs[j]?.status
      if (!isStepsOpen(j) && (status === 'skipped' || status === 'skipped-failed')) {
        return
      }
      toggleSteps(pathPrefix + j)
    }
    const expandInline = (j: string, s: number) => {
      toggleSubworkflow(`${pathPrefix}${j}:${s}`)
      requestAnimationFrame(invalidateConnectors)
    }
    const openNew = (j: string, s: number) => openInNewGraph(pathPrefix, j, s)
    const onStepClick = (j: string, s: string | number) => {
      const stepStatus = jobs[j]?.steps?.[+s]?.status
      if (stepStatus === 'skipped' || stepStatus === 'skipped-failed') {
        return
      }
      if (jobs[j]?.steps[+s]?.subworkflow) {
        expandInline(j, +s)
      } else {
        setSublogOpen(engine.stepLogPath(pathPrefix, j, s))
      }
    }
    const onStepLogClick = (j: string, s: number) =>
      setSublogOpen(engine.stepLogPath(pathPrefix, j, s))
    const onSubworkflowIcon = (j: string, s: number) => openNew(j, s)
    const isSubworkflowExpanded = (j: string, s: number) =>
      expandedSubworkflows.has(`${pathPrefix}${j}:${s}`)
    const renderSubworkflow = (j: string, s: number): ReactNode => {
      const subJobs = jobs[j]?.steps?.[s]?.subworkflow?.jobs
      if (!subJobs) {
        return null
      }
      return (
        <SubworkflowWell
          expanded={isSubworkflowExpanded(j, s)}
          onSettled={requestFit}
          className="my-2 rounded-lg border-4 border-(--theme-border)"
        >
          <NestedSubgraph
            jobs={subJobs}
            pathPrefix={`${pathPrefix}subworkflows/${j}/step_${s}/`}
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
      )
    }
    return (
      <div className="flex relative">
        {dependencyCols.map((col) => {
          return (
            <div key={col[0]?.[0]}>
              {col.map((jobNames) => {
                const matrixGroup = displayJobs[jobNames[0]!]?._matrixGroup

                if (matrixGroup) {
                  return (
                    <MatrixGroupNode
                      key={'node_' + jobNames[0]}
                      matrixGroup={matrixGroup}
                      jobNames={jobNames}
                      idPrefix={pathPrefix}
                      isExpanded={matrixOpen.has(pathPrefix + matrixGroup.originaljob)}
                      onToggle={() => toggleMatrix(pathPrefix + matrixGroup.originaljob)}
                      jobs={jobs}
                      activeDists={activeDists}
                      onMouseEnter={() => setHoveredJob(jobNames[0]!)}
                      onMouseLeave={() => setHoveredJob(null)}
                      hoveredRelated={hoveredRelated}
                      animT={animT}
                      zBase={zBase}
                      isStepsOpen={isStepsOpen}
                      onJobClick={onJobClick}
                      onStepClick={onStepClick}
                      onStepLogClick={onStepLogClick}
                      onSubworkflowIcon={onSubworkflowIcon}
                      isSubworkflowExpanded={isSubworkflowExpanded}
                      renderSubworkflow={renderSubworkflow}
                      preview={preview}
                    />
                  )
                }
                return (
                  <div
                    key={'node_' + jobNames[0]}
                    id={'node_' + pathPrefix + jobNames[0]}
                    role="none"
                    className="relative m-24"
                    style={{
                      zIndex: (activeDists?.has(jobNames[0]!) ? 25 : 1) + zBase,
                    }}
                    onMouseEnter={() => setHoveredJob(jobNames[0]!)}
                    onMouseLeave={() => setHoveredJob(null)}
                    onFocus={() => setHoveredJob(jobNames[0]!)}
                    onBlur={() => setHoveredJob(null)}
                  >
                    <div className="absolute inset-0 rounded-2xl bg-(--theme-panel-bg)" />
                    <div
                      className="relative border-solid shadow py-4 px-8 rounded-xl border-4 whitespace-nowrap bg-(--theme-panel-bg) text-2xl"
                      style={{
                        opacity: hoveredRelated && !hoveredRelated.has(jobNames[0]!) ? 0.5 : 1,
                        transition: `opacity ${animT}s`,
                      }}
                    >
                      <Joblist
                        jobs={displayJobs}
                        jobNames={jobNames}
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
  ])
  const memoizedBoxLayer = useMemo(() => buildBoxLayer(), [buildBoxLayer])
  // A live nested graph exists in this subtree only if an expanded subworkflow
  // key falls under this level's path prefix.
  const hasLiveNestedGraph = Array.from(expandedSubworkflows).some((k) => k.startsWith(pathPrefix))

  if (
    !Array.isArray(dependencyCols) ||
    dependencyCols.length === 0 ||
    !Array.isArray(dependencyCols[0]) ||
    dependencyCols[0].length === 0 ||
    !Array.isArray(dependencyCols[0][0]) ||
    dependencyCols[0][0].length === 0
  ) {
    return null
  }

  return (
    <div ref={wrapperRef} className="relative">
      {(() => {
        const wrapper = wrapperRef.current
        const gid = (name: string) => document.getElementById('node_' + pathPrefix + name)
        const ox = (el: HTMLElement) => offsetWithin(el, wrapper).x
        // Y position where connectors attach to a node
        const nodeConnectorY = (el: HTMLElement) => offsetWithin(el, wrapper).y + 37

        // Compute column gap (static distance between adjacent column edges)
        let colGap = 32 // fallback
        if (dependencyCols.length >= 2) {
          const col0 = gid(dependencyCols[0]?.[0]?.[0] ?? '')
          const col1 = gid(dependencyCols[1]?.[0]?.[0] ?? '')
          if (col0 && col1) {
            colGap = ox(col1) - (ox(col0) + col0.offsetWidth)
          }
        }

        // Compute global arc radius: quarter of the minimum nonzero
        // vertical distance across all connectors in the graph.
        let minAdy = Number.POSITIVE_INFINITY
        for (const col of dependencyCols) {
          for (const jobNames of col) {
            for (const dep of directDeps[jobNames[0]!] ?? []) {
              const s = gid(dep)
              const e = gid(jobNames[0]!)
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

        return dependencyCols.map((col) => (
          <React.Fragment key={col[0]?.[0]}>
            {col.map((jobNames) => (
              <React.Fragment key={jobNames[0]}>
                {(directDeps[jobNames[0]!] ?? []).map((dep) => {
                  const isHighlighted =
                    hoveredRelated?.has(jobNames[0]!) && hoveredRelated?.has(dep)
                  const baseColor = 'var(--theme-border)'
                  // Compute animation delay for this connector
                  const depDist = activeDists?.get(dep) ?? 0
                  const targetDist = activeDists?.get(jobNames[0]!) ?? 0
                  const hopDelay = animT
                  const closerDist = Math.min(depDist, targetDist)
                  const connectorDelay = closerDist * hopDelay
                  const retractDelay = (maxHoveredDistRef.current - closerDist) * hopDelay
                  const drawRightToLeft = targetDist < depDist
                  const start = gid(dep)
                  const end = gid(jobNames[0]!)
                  if (!start || !end) {
                    return null
                  }
                  const x1 = ox(start) + start.offsetWidth - 2
                  const y1 = nodeConnectorY(start)
                  const x2 = ox(end) + 2
                  const y2 = nodeConnectorY(end)
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

                  return (
                    <React.Fragment key={dep}>
                      {/* Dots: background square + inner dot — above nodes */}
                      <svg
                        aria-hidden="true"
                        overflow="visible"
                        className="absolute pointer-events-none"
                        style={{
                          zIndex:
                            (isHighlighted ||
                            (activeDists?.has(dep) && activeDists?.has(jobNames[0]!))
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
                          fill={isHighlighted ? '#3B82F6' : baseColor}
                          style={{
                            opacity: hoveredRelated && !isHighlighted ? 0.3 : 1,
                            transition: isHighlighted
                              ? `fill ${animT}s ${depDist * hopDelay}s, opacity 0s`
                              : `fill ${animT}s ${(maxHoveredDistRef.current - depDist) * hopDelay}s, opacity 0s`,
                          }}
                        />
                        {/* Inner filled dot — end */}
                        <circle
                          cx={x2}
                          cy={y2}
                          r="8"
                          fill={isHighlighted ? '#3B82F6' : baseColor}
                          style={{
                            opacity: hoveredRelated && !isHighlighted ? 0.3 : 1,
                            transition: isHighlighted
                              ? `fill ${animT}s ${targetDist * hopDelay}s, opacity 0s`
                              : `fill ${animT}s ${(maxHoveredDistRef.current - targetDist) * hopDelay}s, opacity 0s`,
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
                          stroke={baseColor}
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
                            stroke: '#3B82F6',
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
                          const connKey = `${dep}→${jobNames[0]}`
                          if (isHighlighted) {
                            retractPathLensRef.current.set(connKey, pathLen)
                          }
                          const isRetracting =
                            !isHighlighted &&
                            !!activeDists?.has(dep) &&
                            !!activeDists?.has(jobNames[0]!)
                          if (!isHighlighted && !isRetracting) {
                            return null
                          }
                          const frozenLen = retractPathLensRef.current.get(connKey) ?? pathLen
                          return (
                            <path
                              d={drawRightToLeft ? pathDReversed : pathD}
                              fill="transparent"
                              style={{
                                stroke: '#3B82F6',
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
                    </React.Fragment>
                  )
                })}
              </React.Fragment>
            ))}
          </React.Fragment>
        ))
      })()}
      {hasLiveNestedGraph ? buildBoxLayer() : memoizedBoxLayer}
    </div>
  )
}

// A level renders its nested levels through this module binding, which hooks see as stable.
const NestedSubgraph = Subgraph

// Animated indented container for an inline-expanded subworkflow in the summary
// sidebar (no graph/connectors — just a nested job list).
function SidebarWell({ expanded, children }: { expanded: boolean; children: ReactNode }) {
  return (
    <Collapse expanded={expanded} releaseOverflow={false}>
      {children}
    </Collapse>
  )
}

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
  const matrixGroups = useMemo(() => engine.matrixGroups(jobs), [engine, jobs])
  const { displayJobs } = useMemo(
    () => computeGraphLayout(engine, jobs, matrixGroups),
    [engine, jobs, matrixGroups],
  )

  const isStepsOpen = (j: string) => stepsOpen.has(pathPrefix + j)
  const onJobClick = (j: string) => {
    const status = jobs[j]?.status ?? displayJobs[j]?.status
    if (!isStepsOpen(j) && (status === 'skipped' || status === 'skipped-failed')) {
      return
    }
    toggleSteps(pathPrefix + j)
  }
  const expandInline = (j: string, s: number) => toggleSubworkflow(`${pathPrefix}${j}:${s}`)
  const openNew = (j: string, s: number) => openInNewGraph(pathPrefix, j, s)
  const onStepClick = (j: string, s: string | number) => {
    const stepStatus = jobs[j]?.steps?.[+s]?.status
    if (stepStatus === 'skipped' || stepStatus === 'skipped-failed') {
      return
    }
    if (jobs[j]?.steps[+s]?.subworkflow) {
      expandInline(j, +s)
    } else {
      setSublogOpen(engine.stepLogPath(pathPrefix, j, s))
    }
  }
  const onStepLogClick = (j: string, s: number) =>
    setSublogOpen(engine.stepLogPath(pathPrefix, j, s))
  const onSubworkflowIcon = (j: string, s: number) => openNew(j, s)
  const isSubworkflowExpanded = (j: string, s: number) =>
    expandedSubworkflows.has(`${pathPrefix}${j}:${s}`)

  const renderSubworkflow = (j: string, s: number): ReactNode => {
    const subJobs = jobs[j]?.steps?.[s]?.subworkflow?.jobs
    if (!subJobs) {
      return null
    }
    return (
      <SidebarWell expanded={isSubworkflowExpanded(j, s)}>
        <div className="ml-6 mt-0.5 border-l border-(--theme-border) pl-4">
          <SidebarJobs
            jobs={subJobs}
            pathPrefix={`${pathPrefix}subworkflows/${j}/step_${s}/`}
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
      </SidebarWell>
    )
  }

  // Matrix members are keyed `originaljob-N`, but the collapsed group node is keyed
  // by the bare originaljob; fold members onto their group key so each matrix
  // renders once as a group (like the graph), not one row per member.
  const seenMatrixGroups = new Set<string>()
  const orderedKeys = Object.keys(jobs).flatMap((jobName) => {
    const originaljob = jobs[jobName]?._matrix?.originaljob
    if (!originaljob) {
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
              key={'matrix-' + pathPrefix + mg.originaljob}
              matrixGroup={mg}
              status={displayJobs[jobName]?.status ?? ''}
              isExpanded={matrixOpen.has(pathPrefix + mg.originaljob)}
              onToggle={() => toggleMatrix(pathPrefix + mg.originaljob)}
              jobs={jobs}
              isStepsOpen={isStepsOpen}
              onJobClick={onJobClick}
              onStepClick={onStepClick}
              onStepLogClick={onStepLogClick}
              onSubworkflowIcon={onSubworkflowIcon}
              isSubworkflowExpanded={isSubworkflowExpanded}
              renderSubworkflow={renderSubworkflow}
              preview={preview}
            />
          )
        }
        return (
          <Joblist
            key={'job-' + pathPrefix + jobName}
            jobs={jobs}
            jobNames={[jobName]}
            onJobClick={onJobClick}
            isStepsOpen={isStepsOpen}
            onStepClick={onStepClick}
            onStepLogClick={onStepLogClick}
            onSubworkflowIcon={onSubworkflowIcon}
            isSubworkflowExpanded={isSubworkflowExpanded}
            renderSubworkflow={renderSubworkflow}
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
  initialScale = 1,
  removeBorder,
  viewMode = 'dag',
  setViewMode,
}: {
  run: GraphRun
  preview?: boolean
  initialScale?: number
  removeBorder?: boolean | undefined
  viewMode?: ViewMode
  setViewMode?: (mode: ViewMode) => void
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
  const setContainerElement = useCallback(
    (el: HTMLDivElement | null) => {
      containerRef.current = el
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
    if (!preview || !container) {
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
  }, [preview])

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
  const jobs = walkJobPath(rootJobs, executedJobsPath[executedJobsPathIdx] ?? [])

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
    setExpandedSubworkflows((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }, [])

  const toggleSteps = useCallback(
    (key: string) => {
      setStepsOpen((prev) => {
        const next = new Set(prev)
        if (next.has(key)) {
          next.delete(key)
        } else {
          next.add(key)
        }
        return next
      })
      requestAnimationFrame(invalidateConnectors)
    },
    [invalidateConnectors],
  )

  const toggleMatrix = useCallback(
    (key: string) => {
      setMatrixOpen((prev) => {
        const next = new Set(prev)
        if (next.has(key)) {
          next.delete(key)
        } else {
          next.add(key)
        }
        return next
      })
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

  const jobAndStep = sublogOpen.split('/').slice(-3, -1)
  if (jobAndStep.length > 1) {
    jobAndStep[1] = jobAndStep[1]!.split('_')[1] ?? ''
  }
  // Paging needs a path naming a job and step. A subworkflow's general log is its
  // parent step's log so it qualifies; a run's own logs.out has no step_ to read.
  const sublogIsStep = jobAndStep.length > 1
  const logName =
    jobAndStep.length > 1
      ? 'Job: ' +
        (jobAndStep[0]![0]!.toUpperCase() + jobAndStep[0]!.slice(1)).replace(/_/g, ' ') +
        ' \nStep: ' +
        (jobs[jobAndStep[0]!]?.steps[Number(jobAndStep[1])]?.name || 'Step ' + jobAndStep[1])
      : ''
  const sublogIsSubworkflow =
    jobAndStep.length > 1 && jobs[jobAndStep[0]!]?.steps[Number(jobAndStep[1])]?.subworkflow

  const matrixGroups = useMemo(() => engine.matrixGroups(jobs), [engine, jobs])
  const { dependencyCols } = useMemo(
    () => computeGraphLayout(engine, jobs, matrixGroups),
    [engine, jobs, matrixGroups],
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
      // Fit to the outermost (depth-0) nodes so nested subgraphs don't shrink the
      // whole view when expanded; fall back to all nodes if the structure changes.
      // Depth-0 nodes sit at content > wrapper > flex > column > node.
      const topNodes = content.querySelectorAll(':scope > div > div > div > div[id^="node_"]')
      const nodes = topNodes.length > 0 ? topNodes : content.querySelectorAll('[id^="node_"]')
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
      if (graphW === 0 || graphH === 0) {
        return
      }
      const margin = Math.min(containerW, containerH) * 0.05
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
    [invalidateConnectors],
  )

  // Animated re-fit for user-triggered view changes (inline expand/collapse
  // settle, reset on the main graph). Re-root and initial fits stay instant.
  const animatedFit = useCallback(() => fitGraph(FIT_ANIMATION_MS), [fitGraph])

  // biome-ignore lint/correctness/useExhaustiveDependencies: a resized window or a re-rooted graph re-fits the view.
  useEffect(() => {
    if (preview) {
      return
    }
    const raf = requestAnimationFrame(() => fitGraph())
    return () => cancelAnimationFrame(raf)
  }, [preview, fitGraph, windowSize, executedJobsPathIdx])

  const currentPath = executedJobsPath[executedJobsPathIdx] ?? []
  const nestingDepth = currentPath.length / 5
  let pathAppend = ''
  for (let i = 0; i < nestingDepth; i++) {
    pathAppend += `subworkflows/${currentPath[5 * i]}/step_${currentPath[5 * i + 2]?.toString()}/`
  }
  // For subworkflows, the "general log" is the parent step's log file
  // (the new executor doesn't create a logs.out at the subworkflow root)
  let generalLogPath = 'logs.out'
  if (nestingDepth > 0) {
    let parentPrefix = ''
    for (let i = 0; i < nestingDepth - 1; i++) {
      parentPrefix += `subworkflows/${currentPath[5 * i]}/step_${currentPath[5 * i + 2]?.toString()}/`
    }
    const lastJob = String(currentPath[5 * (nestingDepth - 1)] ?? '')
    const lastStep = currentPath[5 * (nestingDepth - 1) + 2] ?? ''
    generalLogPath = engine.stepLogPath(parentPrefix, lastJob, lastStep)
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
        ? engine.toYaml(jobs[jobAndStep[0]!]?.steps[Number(jobAndStep[1])])
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
  const toggleExpandAll = () => {
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
    // Reset the view after the instant (matrix / step-list) growth; expanding
    // subworkflows re-fit again via their own onSettled as they animate.
    requestAnimationFrame(() => {
      invalidateConnectors()
      fitGraph()
    })
  }

  const nextStep = useCallback(
    (backward: boolean) => {
      const sublogSplit = sublogOpen.split('/')
      let job = sublogSplit[sublogSplit.length - 3] ?? ''
      let step = parseInt(sublogSplit[sublogSplit.length - 2]!.slice(5), 10)
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
        sublogSplit.slice(0, -3).join('/') + `/${job}/step_${step}/` + sublogSplit.slice(-1)[0],
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

  if (
    !Array.isArray(dependencyCols) ||
    dependencyCols.length === 0 ||
    !Array.isArray(dependencyCols[0]) ||
    dependencyCols[0].length === 0 ||
    !Array.isArray(dependencyCols[0][0]) ||
    dependencyCols[0][0].length === 0
  ) {
    return undefined
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
    (!preview || sublogIsSubworkflow) && sublogOpen && sublogIsStep ? (
      <button
        type="button"
        className="btn btn-neutral"
        onClick={() => {
          if (sublogIsSubworkflow) {
            openInNewGraph(pathAppend, jobAndStep[0]!, parseInt(jobAndStep[1]!, 10))
            setSublogOpen('')
          } else {
            setSublogOpen(
              sublogOpen.split('/').slice(-1)[0] === 'logs.out'
                ? [...sublogOpen.split('/').slice(0, -1), 'script-unstable-redacted.sh'].join('/')
                : [...sublogOpen.split('/').slice(0, -1), 'logs.out'].join('/'),
            )
          }
        }}
      >
        <span>
          {sublogIsSubworkflow
            ? 'Open Subworkflow'
            : sublogOpen.split('/').slice(-1)[0] === 'logs.out'
              ? 'Show Script'
              : 'Show Logs'}
        </span>
      </button>
    ) : undefined

  return (
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
                {startDt ? startDt.toLocaleString(DateTime.DATETIME_SHORT) : ''}
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
                  setViewMode?.(mode)
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
              workflowName={workflowName}
              runNumber={runNumber}
              slug={runSlug}
              expandedJobs={expandedJobs}
              setExpandedJobs={setExpandedJobs}
            />
          </div>
        ) : (
          <div
            ref={setContainerElement}
            className={
              'panel w-full ' +
              (removeBorder ? 'border-none' : 'border') +
              ' overflow-hidden relative'
            }
            style={{
              height:
                containerHeight !== null
                  ? `${containerHeight}px`
                  : previewHeight !== null
                    ? `${Math.min(previewHeight, windowSize.h * 0.62)}px`
                    : '62vh',
              minHeight: previewHeight !== null ? 0 : 160,
            }}
          >
            <TransformWrapper
              ref={transformRef}
              minScale={minScale}
              maxScale={maxScale}
              initialScale={maxScale}
              doubleClick={{ disabled: true }}
              limitToBounds={false}
              onInit={() => {
                setTimeout(invalidateConnectors, 0)
              }}
              onPanning={invalidateConnectors}
              onPinch={invalidateConnectors}
              onTransform={invalidateConnectors}
              onWheel={invalidateConnectors}
              onZoom={invalidateConnectors}
            >
              {() => (
                <>
                  <div className="absolute z-10 top-2 right-2 flex flex-col items-end gap-y-1">
                    {hasExpandable && (
                      <button
                        type="button"
                        className="btn btn-info cursor-pointer h-6"
                        onClick={toggleExpandAll}
                      >
                        {allExpanded ? dagStrings.collapseAll : dagStrings.expandAll}
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-info w-21 cursor-pointer h-6"
                      aria-label="Reset view"
                      onClick={() => {
                        if ((executedJobsPath[executedJobsPathIdx]?.length ?? 0) > 0) {
                          resetGraph()
                          setExecutedJobsPath([
                            [],
                            ...executedJobsPath.slice(executedJobsPathIdx, 10),
                          ])
                          setExecutedJobsPathIdx(0)
                        } else {
                          fitGraph(FIT_ANIMATION_MS)
                        }
                      }}
                    >
                      Reset View
                    </button>
                    {executedJobsPath.length > 1 && (
                      <div className="flex">
                        <button
                          type="button"
                          onClick={() => {
                            if (executedJobsPath.length > executedJobsPathIdx + 1) {
                              resetGraph()
                              setExecutedJobsPathIdx(executedJobsPathIdx + 1)
                            }
                          }}
                          className="btn btn-info mr-1 cursor-pointer w-10 h-6"
                        >
                          &lt;
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (executedJobsPathIdx - 1 >= 0) {
                              resetGraph()
                              setExecutedJobsPathIdx(executedJobsPathIdx - 1)
                            }
                          }}
                          className="btn btn-info cursor-pointer w-10 h-6"
                        >
                          &gt;
                        </button>
                      </div>
                    )}
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
                        requestFit={animatedFit}
                        stepsOpen={stepsOpen}
                        toggleSteps={toggleSteps}
                        matrixOpen={matrixOpen}
                        toggleMatrix={toggleMatrix}
                        onReady={fitGraph}
                      />
                    </div>
                  </TransformComponent>
                </>
              )}
            </TransformWrapper>
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
                contentKey: 'editor_' + sublogOpen,
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
              log={currentSublog?.length > 1000 ? currentSublog.slice(-100000) : currentSublog}
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
}

export function DependencyGraphPreview(inputs: {
  yml?: Record<string, unknown>
  initialScale?: number
  removeBorder?: boolean
}) {
  const ymlJobs = inputs.yml?.['jobs']
  return (
    <DependencyGraph
      run={{
        executedJobs: addCleanupSteps({
          jobs: isJobRecord(ymlJobs) ? ymlJobs : {},
        }),
        number: 0,
        workflowName: '',
      }}
      preview={true}
      initialScale={inputs.initialScale || 1}
      removeBorder={inputs.removeBorder}
    />
  )
}

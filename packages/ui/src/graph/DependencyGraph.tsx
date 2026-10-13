import { clsx as cx } from 'clsx'
import { DateTime } from 'luxon'
import {
  createContext,
  Fragment,
  lazy,
  memo,
  type ReactNode,
  Suspense,
  useCallback,
  useContext,
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
import { IconButton } from '../components/IconButton'
import { Indicator } from '../components/Indicator'
import { InfoTip } from '../components/InfoTip'
import Loader from '../components/Loader'
import { Modal } from '../components/Modal'
import { useRunFile, useSlots, useStrings, useWorkflowEngine } from '../components/Provider'
import { toAbsHumanDuration } from '../duration'
import type { GraphLayout } from '../editing'
import type { RunStatus, WorkflowEngine } from '../engine'
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
import { ConnectorLayers } from './Connectors'
import { type Box, type DrawnEdge, routeConnectors, sameBoxes } from './connectorGeometry'
import type { DependencyGraphEditor } from './editorApi'
import { EdgeEnds, EdgeHitPath, EmptyGraphEditor, GraphEditorCanvas, NodePorts } from './editorRows'
import { DimRules, JobNode, setDimmed } from './GraphNode'
import {
  EDITOR_HANDLE_CLASS,
  type EdgeSelection,
  type GraphEditorApi,
  GraphEditorProvider,
  useGraphEditor,
  useSelectedEdges,
} from './graphEditorState'
import {
  type ComputedGraphLayout,
  computeGraphLayout,
  displayJobsOf,
  hopDistances,
  positionsOf,
} from './graphLayout'
import { emptyColumnsStyle } from './gridSpacing'
import { type JobHandlers, Joblist } from './JobSummary'
import { Lineage, LineageContext } from './lineage'
import { MatrixGroupNode, MatrixGroupSummaryItem } from './MatrixGroup'
import { Reveal } from './Reveal'
import { Store, useStore } from './store'
import TreeView from './TreeView'
import { isJobRecord, type RunLink, type WorkflowJob, type WorkflowStep } from './types'
import { jobLabel, NODE_CONNECTOR_Y, toggled } from './util'
import {
  type Bounds,
  FIT_MAX_SCALE,
  fitMargin,
  fitView,
  intoView,
  MAX_SCALE,
  MIN_SCALE,
  type View,
  wheelFactor,
  ZOOM_STEP,
  zoomAround,
  zoomLimit,
} from './viewport'

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

// The most nodes a level fades as a hover dims them; a larger level dims them at once.
const FADE_NODES = 300
// The editor loads only where a graph is edited, so runs and previews don't carry it.
const GraphEditorOverlays = lazy(() => import('./GraphEditor'))
const FIT_ANIMATION_MS = 300

// Bumped whenever connectors must be measured again, which every level follows: a level re-renders
// for it however its parents are memoized, and nothing else does, the graph's panel included.
class ConnectorClock extends Store {
  bump = () => this.notify()
}
const ConnectorClockContext = createContext<ConnectorClock | null>(null)

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

// A held job outlives only the edit it was held for; a later fit, such as a resize, refits.
const HOLD_MS = 2000

// Slots a layout leaves empty before the i-th of `slots`, which hold slot numbers in order.
const skippedBefore = (slots: number[] | undefined, i: number) =>
  (slots?.[i] ?? i) - (i === 0 ? 0 : (slots?.[i - 1] ?? i - 1) + 1)

// Each node's box within a level's wrapper, keyed by its first job, read from the DOM in one pass.
function measureBoxes(cols: string[][][], pathPrefix: string, wrapper: HTMLElement) {
  const boxes = new Map<string, Box>()
  for (const col of cols) {
    for (const [head] of col) {
      const el = head === undefined ? null : document.getElementById(`node_${pathPrefix}${head}`)
      if (head !== undefined && el) {
        boxes.set(head, { ...offsetWithin(el, wrapper), width: el.offsetWidth })
      }
    }
  }
  return boxes
}

// A level's connectors and the boxes they were routed between.
interface Routed {
  boxes: Map<string, Box>
  directDeps: Record<string, string[]>
  edges: DrawnEdge[]
}

type SubgraphProps = {
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
  /** This level laid out already, which the root's panel reads too. */
  graph?: ComputedGraphLayout | undefined
  editable?: boolean
}

// One level of the dependency graph: lays out its own jobs into columns, draws
// its own connectors, and recurses into an inline-expanded subworkflow as a
// nested Subgraph. Node ids are namespaced by pathPrefix so reused job names
// across levels never collide, and connectors are measured against this level's
// own wrapper. Rendered inside the top-level pan/zoom surface.
const Subgraph = memo(function Subgraph({
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
  graph,
  editable = false,
}: SubgraphProps) {
  const engine = useWorkflowEngine()
  // Read so this level re-renders, and so re-measures its connectors, when they're invalidated.
  useStore(useContext(ConnectorClockContext), (clock) => clock.version, 0)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const routedRef = useRef<Routed | null>(null)
  const editorApi = useGraphEditor()
  const selectedEdges = useSelectedEdges(editable ? editorApi : null)
  const zBase = depth * SUBGRAPH_Z_STEP

  // A subworkflow drawn inside another graph places its jobs by their `position`, as its own graph
  // does.
  const placed = useMemo(
    () => layout ?? (depth > 0 ? positionsOf(jobs) : undefined),
    [layout, depth, jobs],
  )
  const { dependencyCols, rowSlots, colSlots, directDeps, dependents, displayJobs } = useMemo(
    () => graph ?? computeGraphLayout(engine, jobs, engine.matrixGroups(jobs), placed),
    [graph, engine, jobs, placed],
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

  // The hovered job's lineage, walked only when hovered. Its nodes, connectors and dots follow it
  // themselves, so hovering re-renders neither this level nor what it leaves unchanged.
  const lineage = useMemo(
    () =>
      new Lineage((job) => hopDistances(job, directDeps, dependents), {
        animT,
        depth,
        // Every node fading is a layer to composite, which past a few hundred stalls the hover.
        fade: dependencyCols.reduce((n, col) => n + col.length, 0) <= FADE_NODES,
      }),
    [directDeps, dependents, animT, depth, dependencyCols],
  )
  useEffect(() => {
    const wrapper = wrapperRef.current
    const dim = () => wrapper && setDimmed(wrapper, lineage.depth, lineage.hovering)
    dim()
    const unsubscribe = lineage.subscribe(dim)
    return () => {
      unsubscribe()
      lineage.dispose()
    }
  }, [lineage])

  // Nodes are measured from the live DOM during render, so force one repaint once
  // this level's layout is committed and whenever its size changes (data load,
  // inline expansion). invalidateConnectors re-renders every level.
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
  // So re-measure across the reveal and at settle directly. The nodes are memoized,
  // so this re-renders only the connectors.
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

  const handlers = useMemo(
    () =>
      jobHandlers({
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
      }),
    [
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
      editable,
      editorApi,
      requestFit,
      depth,
      preview,
      animT,
      invalidateConnectors,
      matrixOpen,
      toggleMatrix,
    ],
  )

  // The nodes move only by CSS as boxes open, so re-measuring connectors reuses them.
  const nodes = useMemo(
    () => (
      <div className="flex relative">
        {dependencyCols.map((col, c) => (
          <div key={col[0]?.[0]} style={emptyColumnsStyle(skippedBefore(colSlots, c))}>
            {col.map((jobNames, i) => {
              const first = jobNames[0]
              if (first === undefined) {
                return null
              }
              const shell = { rowsAbove: skippedBefore(rowSlots[c], i), zBase }
              const matrixGroup = displayJobs[first]?._matrixGroup
              return matrixGroup ? (
                <MatrixGroupNode
                  key={`node_${first}`}
                  {...shell}
                  matrixGroup={matrixGroup}
                  jobNames={jobNames}
                  idPrefix={pathPrefix}
                  isExpanded={matrixOpen.has(pathPrefix + matrixGroup.originaljob)}
                  toggleMatrix={toggleMatrix}
                  jobs={jobs}
                  handlers={handlers}
                  preview={preview}
                  editable={editable}
                />
              ) : (
                <JobNode
                  key={`node_${first}`}
                  {...shell}
                  id={`node_${pathPrefix}${first}`}
                  jobNames={jobNames}
                  jobs={displayJobs}
                  handlers={handlers}
                  preview={preview}
                  editable={editable}
                />
              )
            })}
          </div>
        ))}
      </div>
    ),
    [
      dependencyCols,
      rowSlots,
      colSlots,
      displayJobs,
      jobs,
      matrixOpen,
      zBase,
      preview,
      pathPrefix,
      toggleMatrix,
      handlers,
      editable,
    ],
  )

  if (!dependencyCols[0]?.length) {
    return null
  }

  // On the first render there's nothing laid out to measure yet; the frame after draws connectors.
  const wrapper = wrapperRef.current
  const measured = wrapper
    ? measureBoxes(dependencyCols, pathPrefix, wrapper)
    : new Map<string, Box>()
  // Most re-measures, a frame of another level's reveal or an editor's, find nothing moved, and
  // keep the connectors as they were, which their layers then skip rendering.
  const last = routedRef.current
  const routed =
    last && last.directDeps === directDeps && sameBoxes(last.boxes, measured)
      ? last
      : {
          boxes: measured,
          directDeps,
          edges: routeConnectors(
            dependencyCols,
            colSlots.some((column, c) => column !== c),
            directDeps,
            measured,
            NODE_CONNECTOR_Y,
          ),
        }
  routedRef.current = routed
  const { boxes, edges } = routed

  return (
    <div ref={wrapperRef} className="relative">
      <LineageContext value={lineage}>
        <DimRules depth={depth} />
        <ConnectorLayers edges={edges} zBase={zBase} />
        {editable && (
          <EditorEdges
            edges={edges}
            cols={dependencyCols}
            boxes={boxes}
            selected={selectedEdges}
            zBase={zBase}
            size={
              wrapper ? { width: wrapper.offsetWidth, height: wrapper.offsetHeight } : undefined
            }
          />
        )}
        {nodes}
      </LineageContext>
      {editable && <GraphEditorCanvas />}
    </div>
  )
})

// A level renders its nested levels through this module binding, which hooks see as stable.
const NestedSubgraph = Subgraph

// The editor's connector circles on both sides of every node, where no connector already draws the
// dot; the selected connectors' handles; and every connector's pointer target, in one layer the size
// of the graph.
function EditorEdges({
  edges,
  cols,
  boxes,
  selected,
  zBase,
  size,
}: {
  edges: DrawnEdge[]
  cols: string[][][]
  boxes: Map<string, Box>
  selected: EdgeSelection[]
  zBase: number
  size: { width: number; height: number } | undefined
}) {
  const wiredIn = new Set(edges.map((edge) => edge.to))
  const wiredOut = new Set(edges.map((edge) => edge.from))
  const chosen = new Set(selected.map((edge) => `${edge.from}→${edge.to}`))
  return (
    <>
      {cols.flatMap((col) =>
        col.map((jobNames) => {
          const [head] = jobNames
          const box = head === undefined ? undefined : boxes.get(head)
          if (head === undefined || !box) {
            return null
          }
          const y = box.y + NODE_CONNECTOR_Y
          return (
            <NodePorts
              key={head}
              jobs={jobNames}
              left={{ x: box.x + 2, y }}
              right={{ x: box.x + box.width - 2, y }}
              drawLeft={!wiredIn.has(head)}
              drawRight={!wiredOut.has(head)}
              zIndex={40 + zBase}
            />
          )
        }),
      )}
      {edges.map(
        ({ from, to, start, end }) =>
          chosen.has(`${from}→${to}`) && (
            <EdgeEnds
              key={`${from}→${to}`}
              edge={{ from, to }}
              start={start}
              end={end}
              zIndex={45 + zBase}
            />
          ),
      )}
      {/* Level with the nodes, which still draw over it, and above the columns laid out around them. */}
      <svg
        role="none"
        overflow="visible"
        className="absolute pointer-events-none"
        width={size?.width}
        height={size?.height}
        style={{ zIndex: 1 + zBase }}
      >
        {edges.map(({ from, to, path }) => (
          <Fragment key={`${from}→${to}`}>
            {chosen.has(`${from}→${to}`) && (
              <path d={path.d} stroke="var(--theme-element)" strokeWidth="10" fill="transparent" />
            )}
            <EdgeHitPath d={path.d} edge={{ from, to }} />
          </Fragment>
        ))}
      </svg>
    </>
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

// The time a run has taken, ticking each second until it finishes. Its own component, so the tick
// re-renders only this.
function RunTime({
  start,
  end,
  finished,
}: {
  start: DateTime
  end: DateTime | undefined
  finished: boolean
}) {
  const [now, setNow] = useState(() => DateTime.now())
  const ticking = !end && !finished
  useEffect(() => {
    if (!ticking) {
      return
    }
    const timer = setInterval(() => setNow(DateTime.now()), 1000)
    return () => clearInterval(timer)
  }, [ticking])
  return toAbsHumanDuration(start, end ?? now)
}

// The outermost nodes' extent in content space, so an expanded nested subgraph doesn't change it.
function graphBounds(content: HTMLElement): Bounds | null {
  const nodes = outerNodes(content)
  if (nodes.length === 0) {
    return null
  }
  const bounds = {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: 0,
    maxY: 0,
  }
  for (const node of nodes) {
    const { x, y } = offsetWithin(node, content)
    bounds.minX = Math.min(bounds.minX, x)
    bounds.minY = Math.min(bounds.minY, y)
    bounds.maxX = Math.max(bounds.maxX, x + node.offsetWidth)
    bounds.maxY = Math.max(bounds.maxY, y + node.offsetHeight)
  }
  return bounds
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
  const [clock] = useState(() => new ConnectorClock())
  const invalidateConnectors = clock.bump
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
  // A run not yet submitted counts from when it was first shown.
  const [shownAt] = useState(() => DateTime.now())
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

  // The root level, laid out once for its Subgraph and to know whether there's a graph to draw.
  const rootGraph = useMemo(
    () => computeGraphLayout(engine, jobs, engine.matrixGroups(jobs), placed),
    [engine, jobs, placed],
  )
  const { dependencyCols } = rootGraph

  // A job held for a connection, where it was on screen, which the next fit keeps it at instead.
  const held = useRef<{ job: string; x: number; y: number; at: number } | null>(null)
  // Once the user pans or zooms the editor's view, its edits keep that view until Fit refits it.
  const viewed = useRef(false)
  // A job's row on the graph, or none while it isn't drawn.
  const rowOf = useCallback(
    (job: string) =>
      [...(containerRef.current?.querySelectorAll<HTMLElement>('[data-dag-job]') ?? [])].find(
        (el) => el.dataset['dagJob'] === job,
      ) ?? null,
    [],
  )
  const nodeOf = useCallback(
    (job: string) => {
      const row = rowOf(job)
      return row?.closest<HTMLElement>('[id^="node_"]') ?? row
    },
    [rowOf],
  )
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

  // Auto-fit: zoom and pan so the whole graph fills the panel.
  const fitGraph = useCallback(
    (animationMs = 0) => {
      const container = containerRef.current
      const content = graphContentRef.current
      const transform = transformRef.current
      const bounds = content ? graphBounds(content) : null
      if (!container || !content || !transform || !bounds) {
        return
      }
      const panel = { width: container.clientWidth, height: container.clientHeight }
      const pending = held.current
      held.current = null
      const kept = pending && performance.now() - pending.at < HOLD_MS
      const node = kept ? nodeOf(pending.job) : null
      const viewing = editor && viewed.current && animationMs === 0
      if ((pending && node) || viewing) {
        const { positionX, positionY, scale } = transform.instance.state
        const pos = pending && node ? offsetWithin(node, content) : null
        const x = pending && pos ? pending.x - pos.x * scale : positionX
        const y = pending && pos ? pending.y - pos.y * scale : positionY
        transform.setTransform(x, y, scale, 0)
        // Kept still unless a graph that fits the panel is partly outside it; then the least pan that shows it.
        const margin = fitMargin(panel)
        const dx = intoView(
          x + bounds.minX * scale,
          x + bounds.maxX * scale,
          margin,
          panel.width - margin,
        )
        const dy = intoView(
          y + bounds.minY * scale,
          y + bounds.maxY * scale,
          margin,
          panel.height - margin,
        )
        if (dx !== 0 || dy !== 0) {
          requestAnimationFrame(() =>
            transform.setTransform(x + dx, y + dy, scale, FIT_ANIMATION_MS, 'easeOut'),
          )
        }
        return
      }
      const view = fitView(bounds, panel)
      if (!view) {
        return
      }
      if (animationMs > 0) {
        // Let the library animate the pan/zoom. Nodes and connectors both sit inside
        // the transformed element, so they move together and stay aligned.
        transform.setTransform(view.x, view.y, view.scale, animationMs, 'easeOut')
        return
      }
      // Apply transform directly to the DOM for instant update (no library async delay)
      const wrapperEl = container.querySelector<HTMLElement>('.react-transform-component')
      if (wrapperEl) {
        wrapperEl.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`
      }
      // Tell the library after paint so it doesn't overwrite our direct DOM change
      requestAnimationFrame(() => transform.setTransform(view.x, view.y, view.scale, 0))
    },
    [nodeOf, editor],
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
      const row = job === undefined ? null : rowOf(job)
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
  }, [registerShow, editorApi, centerOn, rowOf])

  // Connectors sit in the transformed content, so panning and zooming never re-measure them.
  const [zoomedAll, setZoomedAll] = useState(() => zoomLimit(FIT_MAX_SCALE))
  const onTransform = useCallback(
    (_: unknown, { scale }: { scale: number }) => setZoomedAll(zoomLimit(scale)),
    [],
  )
  const moved = useCallback(() => {
    viewed.current = true
  }, [])
  const zoomTo = useCallback((view: View, animationMs: number) => {
    viewed.current = true
    transformRef.current?.setTransform(view.x, view.y, view.scale, animationMs, 'easeOut')
  }, [])
  const currentView = () => {
    const state = transformRef.current?.instance.state
    return state ? { x: state.positionX, y: state.positionY, scale: state.scale } : null
  }
  // The transform's wrapper grows with the graph, so zoom about the middle of what the panel shows.
  const zoomBy = (step: number) => {
    const container = containerRef.current
    const view = currentView()
    if (container && view) {
      const middle = { x: container.clientWidth / 2, y: container.clientHeight / 2 }
      zoomTo(zoomAround(view, middle, Math.exp(step)), FIT_ANIMATION_MS)
    }
  }
  // The library's wheel adds a fixed step to the scale, which crosses a wide range of zoom in a notch
  // when zoomed out and crawls when zoomed in; this one scales it by a factor, about the pointer.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the panel is the trigger to find the wrapper.
  useEffect(() => {
    const wrapper = transformRef.current?.instance.wrapperComponent
    if (!wrapper) {
      return
    }
    const onWheel = (event: WheelEvent) => {
      const view = currentView()
      if (!view) {
        return
      }
      event.preventDefault()
      const rect = wrapper.getBoundingClientRect()
      const at = { x: event.clientX - rect.left, y: event.clientY - rect.top }
      zoomTo(zoomAround(view, at, wheelFactor(event)), 0)
    }
    wrapper.addEventListener('wheel', onWheel, { passive: false })
    return () => wrapper.removeEventListener('wheel', onWheel)
  }, [containerEl, zoomTo])

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

  const startDt = run.createdAt ? DateTime.fromISO(run.createdAt) : shownAt

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
                <InfoTip
                  className="flex items-center gap-x-1"
                  text={dagStrings.statusReason(run.statusReason) ?? ''}
                >
                  <Indicator status={runStatus} />
                  {dagStrings.statusLabel(runStatus)}
                </InfoTip>
              </div>
            </div>
            <div className="flex flex-col">
              <div className="text-xs">{dagStrings.runtime}</div>
              <div className="text-sm font-semibold flex items-center gap-x-1">
                <RunTime
                  start={startDt}
                  end={run.completedAt ? DateTime.fromISO(run.completedAt) : undefined}
                  finished={
                    run.status === 'completed' ||
                    run.status === 'error' ||
                    run.status === 'canceled'
                  }
                />
              </div>
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
              minScale={MIN_SCALE}
              maxScale={MAX_SCALE}
              initialScale={FIT_MAX_SCALE}
              wheel={{ disabled: true }}
              {...(editor ? { panning: { excluded: [EDITOR_HANDLE_CLASS] } } : {})}
              doubleClick={{ disabled: true }}
              limitToBounds={false}
              onInit={() => {
                setTimeout(invalidateConnectors, 0)
              }}
              onPanning={moved}
              onPinch={moved}
              onTransform={onTransform}
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
                    <ConnectorClockContext value={clock}>
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
                          graph={rootGraph}
                          editable={!!editorApi && currentPath.length === 0}
                        />
                      </div>
                    </ConnectorClockContext>
                  </TransformComponent>
                </>
              )}
            </TransformWrapper>
            {editorOverlays}
          </div>
        )}
      </div>
      <Modal
        open={sublogOpen !== ''}
        onClose={() => setSublogOpen('')}
        aria-label={logName.replace(/\s+/g, ' ') || sublogOpen.slice(sublogFileStart)}
        align="center"
        className="max-h-full overflow-y-auto p-4 sm:p-6"
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
      </Modal>
    </div>
  )
  return <GraphEditorProvider value={editorApi}>{graph}</GraphEditorProvider>
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

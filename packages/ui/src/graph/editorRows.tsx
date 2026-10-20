import { type ReactNode, useEffect, useMemo, useRef } from 'react'
import type { FloatingAnchor } from '../components/floating'
import { useProblemText } from '../components/Provider'
import { Tooltip } from '../components/Tooltip'
import { cx } from '../cx'
import { AddIcon, DragHandleIcon, MoreIcon, WarningIcon } from '../icons'
import type { EditorProblem } from './editorApi'
import { MarqueeBox, type Point, place } from './editorPrimitives'
import {
  type DragPayload,
  EDITOR_HANDLE_CLASS,
  type EdgeSelection,
  type GraphEditorApi,
  labelsOf,
  NO_SELECTION,
  type PortSide,
  problemsIn,
  sameEdge,
  sameStep,
  selectionBounds,
  useGraphEditor,
  useSelectedEdges,
  useUi,
} from './graphEditorState'

/** Drop indicators, the connection line and the selection, drawn in the graph's own coordinates. */
export function GraphEditorCanvas() {
  const api = useGraphEditor()
  const drag = useUi(api, (state) => state.drag, null)
  const selection = useUi(api, (state) => state.selection, NO_SELECTION)
  const marquee = useUi(api, (state) => state.marquee, null)
  if (!api || (!drag && !marquee && selection.length === 0)) {
    return null
  }
  const target = drag?.target ?? null
  const indicator =
    target?.kind === 'slot' || (target?.kind === 'steps' && !target.around)
      ? target.indicator
      : null
  const outline = target?.kind === 'steps' && target.around ? target.indicator : null
  const refused =
    (target?.kind === 'slot' && target.blocked) || (target?.kind === 'steps' && !!target.problem)
  return (
    <div className="pointer-events-none absolute inset-0" style={{ zIndex: 60 }}>
      {marquee && <MarqueeBox box={marquee} />}
      {!marquee && drag?.payload.kind !== 'jobs' && <SelectionBox api={api} />}
      {indicator && (
        <div
          className={cx(
            'absolute rounded-full',
            refused ? 'bg-(--theme-error)' : 'bg-(--theme-accent)',
          )}
          style={place(indicator)}
        />
      )}
      {outline && (
        <div
          className={cx(
            'absolute rounded-md border-4',
            refused ? 'border-(--theme-error)' : 'border-(--theme-accent)',
          )}
          style={{
            left: outline.left - 8,
            top: outline.top - 4,
            width: outline.right - outline.left + 16,
            height: outline.bottom - outline.top + 8,
          }}
        />
      )}
      {(target?.kind === 'connect' || target?.kind === 'merge') && (
        <div
          className={cx(
            'absolute rounded-md border-4',
            (target.kind === 'connect' ? target.edits : target.valid)
              ? 'border-(--theme-accent)'
              : 'border-(--theme-error)',
          )}
          style={{
            left: target.box.left - 8,
            top: target.box.top - 4,
            width: target.box.right - target.box.left + 16,
            height: target.box.bottom - target.box.top + 8,
          }}
        />
      )}
      {drag?.payload.kind === 'connect' && drag.origin && drag.content && (
        <svg aria-hidden="true" overflow="visible" className="absolute left-0 top-0">
          <line
            x1={drag.origin.x}
            y1={drag.origin.y}
            x2={drag.content.x}
            y2={drag.content.y}
            stroke={
              target?.kind === 'connect' && !target.edits
                ? 'var(--theme-error)'
                : 'var(--theme-accent)'
            }
            strokeWidth={6}
            strokeDasharray="16 10"
          />
        </svg>
      )}
    </div>
  )
}

/** One outline around the selected jobs, with a grip to move them all and circles to connect them. */
function SelectionBox({ api }: { api: GraphEditorApi }) {
  const t = api.t
  const grid = api.grid()
  const jobs = api.selected()
  const bounds = grid ? selectionBounds(grid.wrapper, jobs) : null
  if (!grid || !bounds) {
    return null
  }
  // Dragging the grip moves the selection as if by its top-left job.
  const anchor = grid.cols.flat(2).find((job) => jobs.includes(job))
  const y = bounds.connectorY
  return (
    <>
      <div
        className="absolute rounded-xl border-2 border-dashed border-(--theme-accent)"
        style={place(bounds)}
      />
      <PortCircle
        side="in"
        at={{ x: bounds.left, y }}
        draw
        jobs={jobs}
        port="selection"
        hint={t.selectionInHint}
      />
      <PortCircle
        side="out"
        at={{ x: bounds.right, y }}
        draw
        jobs={jobs}
        port="selection"
        hint={t.selectionOutHint}
      />
      {/* After the circles, whose squares would otherwise cover the bottom of its ring. */}
      <Tooltip content={t.moveSelectionHint}>
        <button
          type="button"
          aria-label={t.moveSelectionHint}
          className={cx(
            EDITOR_HANDLE_CLASS,
            'pointer-events-auto absolute flex h-8 w-8 cursor-grab items-center justify-center rounded-full border-4 border-(--theme-accent) bg-(--theme-panel-bg)',
          )}
          style={{ left: bounds.left - 16, top: bounds.top - 16 }}
          onPointerDown={(e) =>
            api.startDrag(e, {
              kind: 'jobs',
              jobs,
              label: labelsOf(jobs),
              ...(anchor ? { anchor } : {}),
            })
          }
        >
          <DragHandleIcon className="h-5 w-5" />
        </button>
      </Tooltip>
    </>
  )
}

/** A multi-job box's handle for moving all its jobs at once. */
export function BoxGrip({ jobs }: { jobs: string[] }) {
  const api = useGraphEditor()
  if (!api) {
    return null
  }
  const t = api.t
  return (
    <Tooltip content={t.moveBoxHint}>
      <button
        type="button"
        aria-label={t.moveBoxHint}
        className={cx(
          EDITOR_HANDLE_CLASS,
          // Centered on the border line, straight above the node's left circle.
          'absolute -left-[18px] -top-[18px] flex h-8 w-8 cursor-grab items-center justify-center rounded-full border-4 theme-border bg-(--theme-panel-bg)',
        )}
        onPointerDown={(e) => api.startDrag(e, { kind: 'jobs', jobs, label: labelsOf(jobs) })}
      >
        <DragHandleIcon className="h-5 w-5" />
      </button>
    </Tooltip>
  )
}

const onBadge = (target: EventTarget) =>
  target instanceof Element && !!target.closest('[data-problem-badge]')

/** A step's problems, or a job's with its steps', listed on hover; a click shows the first one's line. */
const NO_PROBLEMS: EditorProblem[] = []

function ProblemBadge({ api, job, step }: { api: GraphEditorApi; job: string; step?: number }) {
  const t = api.t
  // The list itself, which changes only when the problems do: filtering it in the selector would
  // run for every row on every store change, a drag's pointer moves included.
  const problems = useUi(api, (state) => state.problems, NO_PROBLEMS)
  const problemText = useProblemText()
  // A job's badge also lists its steps' problems, which stay in view while its steps are closed.
  const mine = useMemo(
    () =>
      step === undefined
        ? problems.filter((problem) => problem.job === job)
        : problemsIn(problems, job, step),
    [problems, job, step],
  )
  const messages = mine.map(problemText).join('\n')
  const line = mine[0]?.line ?? 0
  if (!messages) {
    return null
  }
  return (
    <Tooltip content={messages}>
      <button
        type="button"
        data-problem-badge=""
        aria-label={t.problemCount(mine.length)}
        className="cursor-pointer rounded p-0.5 text-(--theme-error) hover:bg-(--theme-muted-panel-bg)"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          api.reveal({ line })
        }}
      >
        <WarningIcon className="h-[0.9em] w-[0.9em]" />
      </button>
    </Tooltip>
  )
}

/** What a job or step row does in the editor: drag, shift-click to select, a menu, its problems. */
function EditableRow({
  api,
  selected,
  flagged,
  data,
  className,
  drag,
  toggle,
  reveal,
  openMenu,
  menuLabel,
  menuClassName,
  iconClassName,
  badges,
  children,
}: {
  api: GraphEditorApi
  selected: boolean
  flagged: boolean
  data: Record<string, string | number>
  className: string
  drag: () => DragPayload
  /** Toggles the row in the selection, and says whether it is selected after. */
  toggle: () => boolean
  reveal: () => void
  openMenu: (at: FloatingAnchor) => void
  menuLabel: string
  menuClassName: string
  iconClassName: string
  badges: ReactNode
  children: ReactNode
}) {
  return (
    <div
      role="none"
      {...data}
      {...(selected ? { 'data-selected': '' } : {})}
      className={cx(
        EDITOR_HANDLE_CLASS,
        // Room between the label and its ring, without moving the label or widening the node.
        '-mx-0.5 px-0.5',
        className,
        selected && 'bg-(--theme-accent)/15',
        flagged ? 'ring-2 ring-(--theme-error)' : selected && 'ring-2 ring-(--theme-accent)',
      )}
      onPointerDown={(e) => {
        if (e.shiftKey) {
          // Keeps shift-click from extending a text selection.
          e.preventDefault()
        }
        api.startDrag(e, drag())
      }}
      onClickCapture={(e) => {
        if (onBadge(e.target)) {
          return
        }
        if (e.shiftKey) {
          e.preventDefault()
          e.stopPropagation()
          if (!toggle()) {
            return
          }
        }
        reveal()
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        openMenu(e)
      }}
    >
      {children}
      {badges}
      <button
        type="button"
        aria-label={menuLabel}
        className={cx(
          'cursor-pointer rounded theme-muted-text opacity-0 transition-opacity hover:bg-(--theme-muted-panel-bg) focus-visible:opacity-100',
          menuClassName,
        )}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          openMenu(e.currentTarget)
        }}
      >
        <MoreIcon className={iconClassName} />
      </button>
    </div>
  )
}

/** A job row made draggable, with its menu and matrix badge; shift-click selects it. */
export function EditableJobRow({
  job,
  label,
  badge = true,
  children,
}: {
  job: string
  label: string
  badge?: boolean
  children: ReactNode
}) {
  const api = useGraphEditor()
  const selected = useUi(api, (state) => state.selection.includes(job), false)
  const flagged = useUi(api, (state) => problemsIn(state.problems, job).length > 0, false)
  if (!api) {
    return children
  }
  const t = api.t
  return (
    <EditableRow
      api={api}
      selected={selected}
      flagged={flagged}
      data={{ 'data-dag-job': job }}
      className="group/row relative flex cursor-grab items-center gap-x-2 rounded-md [&>button:first-child]:w-auto [&>button:first-child]:flex-1"
      drag={() => {
        const selection = api.selected()
        return selection.length > 1 && selection.includes(job)
          ? {
              kind: 'jobs',
              jobs: selection,
              anchor: job,
              label: labelsOf(selection),
            }
          : { kind: 'jobs', jobs: [job], label }
      }}
      toggle={() => {
        api.toggleSelected(job)
        return api.store.get().selection.includes(job)
      }}
      reveal={() => api.reveal({ job })}
      openMenu={(at) => api.openJobMenu(at, job)}
      menuLabel={t.jobActions}
      menuClassName="p-1 group-hover/row:opacity-100"
      iconClassName="h-[1em] w-[1em]"
      badges={
        <>
          <ProblemBadge api={api} job={job} />
          {badge && api.isMatrixJob(job) && (
            <span className="rounded-full border-2 theme-border px-2 text-[1rem] theme-muted-text">
              {t.matrixBadge}
            </span>
          )}
        </>
      }
    >
      {children}
    </EditableRow>
  )
}

/** One connector circle: dragging it connects `jobs`, dropping on it connects to them. */
function PortCircle({
  side,
  at,
  draw,
  jobs,
  port,
  hint,
  zIndex,
}: {
  side: PortSide
  at: Point
  /** False where a connector already draws the dot, so only the hover shows. */
  draw: boolean
  jobs: string[]
  port: string
  hint: string
  zIndex?: number
}) {
  const api = useGraphEditor()
  // Booleans, not the drag itself: a drag is a new object on every pointer move, and every
  // circle in the graph would re-render with it.
  const anyDrag = useUi(api, (state) => state.drag !== null, false)
  const dragging = useUi(
    api,
    ({ drag }) =>
      drag?.payload.kind === 'connect' && drag.payload.port === port && drag.payload.side === side,
    false,
  )
  if (!api) {
    return null
  }
  return (
    // A hint popping up over the drop target mid-drag would hide the graph.
    <Tooltip content={hint} disabled={anyDrag}>
      <span
        role="none"
        data-dag-port={side}
        {...(port === 'selection' ? { 'data-dag-selection': '' } : { 'data-dag-node': jobs[0] })}
        className={cx(
          EDITOR_HANDLE_CLASS,
          'group/port pointer-events-auto absolute flex h-8 w-8 cursor-crosshair items-center justify-center',
        )}
        style={{
          left: at.x - 16,
          top: at.y - 16,
          ...(zIndex === undefined ? {} : { zIndex }),
        }}
        onPointerDown={(e) =>
          api.startDrag(e, {
            kind: 'connect',
            from: jobs,
            side,
            label: labelsOf(jobs),
            port,
          })
        }
      >
        {draw && <span className="absolute inset-0 bg-(--theme-panel-bg)" />}
        <span
          className={cx(
            'relative h-4 w-4 rounded-full group-hover/port:bg-(--theme-accent)',
            dragging ? 'bg-(--theme-accent)' : draw && 'bg-(--theme-border)',
          )}
        />
      </span>
    </Tooltip>
  )
}

/**
 * A node's connector circles, where the graph draws its connector dots. Drag from the
 * right one to add jobs that depend on the node, from the left one to add what it needs.
 */
export function NodePorts({
  jobs,
  left,
  right,
  drawLeft,
  drawRight,
  zIndex,
}: {
  jobs: string[]
  left: Point
  right: Point
  drawLeft: boolean
  drawRight: boolean
  zIndex: number
}) {
  const api = useGraphEditor()
  if (!api) {
    return null
  }
  const t = api.t
  const port = `node:${jobs[0]}`
  return (
    <>
      <PortCircle
        side="in"
        at={left}
        draw={drawLeft}
        jobs={jobs}
        port={port}
        hint={t.connectInHint}
        zIndex={zIndex}
      />
      <PortCircle
        side="out"
        at={right}
        draw={drawRight}
        jobs={jobs}
        port={port}
        hint={t.connectOutHint}
        zIndex={zIndex}
      />
    </>
  )
}

/** A step row made draggable within its job, with its menu. */
export function EditableStepRow({
  job,
  index,
  label,
  children,
}: {
  job: string
  index: number
  label: string
  children: ReactNode
}) {
  const api = useGraphEditor()
  const selected = useUi(
    api,
    (state) => state.steps.some((ref) => ref.job === job && ref.index === index),
    false,
  )
  const flagged = useUi(api, (state) => problemsIn(state.problems, job, index).length > 0, false)
  if (!api) {
    return children
  }
  const t = api.t
  return (
    <EditableRow
      api={api}
      selected={selected}
      flagged={flagged}
      data={{ 'data-dag-step-job': job, 'data-dag-step': index }}
      className="group/step flex cursor-grab items-center gap-x-1 rounded"
      drag={() => {
        const steps = api.selectedSteps()
        return selected && steps.length > 1
          ? { kind: 'steps', steps, label: t.stepCount(steps.length) }
          : { kind: 'steps', steps: [{ job, index }], label }
      }}
      toggle={() => {
        api.toggleStep({ job, index })
        return api.store.get().steps.some((ref) => sameStep(ref, { job, index }))
      }}
      reveal={() => api.reveal({ job, step: index })}
      openMenu={(at) => api.openStepMenu(at, job, index)}
      menuLabel={t.stepActions}
      menuClassName="p-0.5 group-hover/step:opacity-100"
      iconClassName="h-[0.9em] w-[0.9em]"
      badges={<ProblemBadge api={api} job={job} step={index} />}
    >
      {children}
    </EditableRow>
  )
}

export function AddStepButton({ job }: { job: string }) {
  const api = useGraphEditor()
  if (!api) {
    return null
  }
  const t = api.t
  return (
    <button
      type="button"
      className="ml-1.5 flex cursor-pointer items-center gap-x-1.5 text-left theme-muted-text hover:text-(--theme-link)"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation()
        api.addStep(job)
      }}
    >
      <AddIcon className="h-[0.8em] w-[0.8em]" />
      {t.addStep}
    </button>
  )
}

/** Connector hit area: a click selects the dependency, shift adds it, a right-click opens its menu. */
export function EdgeHitPath({ d, edge }: { d: string; edge: EdgeSelection }) {
  const api = useGraphEditor()
  const selected = useSelectedEdges(api).some((other) => sameEdge(other, edge))
  if (!api) {
    return null
  }
  const t = api.t
  return (
    // biome-ignore lint/a11y/useSemanticElements: an SVG connector can't be a <button>; it is the pointer target for its dependency.
    <path
      role="button"
      tabIndex={0}
      aria-label={t.dependencyOf(edge.from, edge.to)}
      aria-pressed={selected}
      data-dag-edge-from={edge.from}
      data-dag-edge-to={edge.to}
      d={d}
      stroke="transparent"
      strokeWidth={28}
      fill="none"
      className={cx(
        EDITOR_HANDLE_CLASS,
        'outline-none focus-visible:[stroke:color-mix(in_srgb,var(--theme-accent)_35%,transparent)]',
      )}
      style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
      onClick={(e) => api.selectEdge(edge, e.shiftKey)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          api.selectEdge(edge, e.shiftKey)
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        api.openEdgeMenu(e, edge)
      }}
    />
  )
}

/** A selected connector's two ends; dragging one onto another job or node moves that end there. */
export function EdgeEnds({
  edge,
  start,
  end,
  zIndex,
}: {
  edge: EdgeSelection
  start: Point
  end: Point
  zIndex: number
}) {
  const api = useGraphEditor()
  const anyDrag = useUi(api, (state) => state.drag !== null, false)
  if (!api) {
    return null
  }
  const t = api.t
  const inUse = api.edgeInUse(edge)
  const handle = (side: 'from' | 'to', at: Point, fixed: Point) => (
    <Tooltip
      key={side}
      content={inUse ? t.dependencyInUse : t.moveDependencyEnd}
      disabled={anyDrag}
    >
      <span
        role="none"
        data-dag-edge-end={side}
        className={cx(
          EDITOR_HANDLE_CLASS,
          'pointer-events-auto absolute flex h-8 w-8 items-center justify-center',
          inUse ? 'cursor-not-allowed' : 'cursor-grab',
        )}
        style={{ left: at.x - 16, top: at.y - 16, zIndex }}
        onPointerDown={(e) => {
          if (!inUse) {
            api.startEdgeEnd(e, edge, side, fixed)
          }
        }}
      >
        <span className="h-5 w-5 rounded-full border-4 border-(--theme-accent) bg-(--theme-panel-bg)" />
      </span>
    </Tooltip>
  )
  return (
    <>
      {handle('from', start, end)}
      {handle('to', end, start)}
    </>
  )
}

/** Shown in place of the graph when the workflow has no jobs yet. */
/** The canvas of a graph with no jobs, which takes the graph's keys, so undo and paste still work. */
export function EmptyGraphEditor({
  containerRef,
  overlays,
  height,
  removeBorder,
}: {
  containerRef: (el: HTMLDivElement | null) => void
  overlays: ReactNode
  height: string
  removeBorder?: boolean | undefined
}) {
  const own = useRef<HTMLDivElement | null>(null)
  // Deleting the last job takes focus with it; the canvas picks it up so the next key lands here.
  useEffect(() => {
    if (document.activeElement === document.body) {
      own.current?.focus({ preventScroll: true })
    }
  }, [])
  return (
    <div
      ref={(el) => {
        own.current = el
        containerRef(el)
      }}
      tabIndex={-1}
      className={cx(
        'panel relative w-full overflow-hidden outline-none',
        removeBorder ? 'border-none' : 'border',
      )}
      style={{ height }}
    >
      {overlays}
    </div>
  )
}

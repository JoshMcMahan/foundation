import {
  createContext,
  type PointerEvent as ReactPointerEvent,
  useContext,
  useSyncExternalStore,
} from 'react'
import type { GraphEdit, GraphSlot, NeedRef, NudgeDirection, StepRef } from '../editing'
import type { EditorProblem, RevealTarget } from './editorApi'
import type { Box, Point, Store } from './editorPrimitives'
import type { GraphEditorStrings } from './editorStrings'
import { jobLabel, NODE_CONNECTOR_Y } from './util'

/** Pointer-downs on this class drag editor items instead of panning the graph. */
export const EDITOR_HANDLE_CLASS = 'dag-editor-handle'

/** A node's left circle takes dependencies; its right circle gives them. */
export type PortSide = 'in' | 'out'

export type ConnectPayload = {
  kind: 'connect'
  from: string[]
  side: PortSide
  label: string
  /** The circle dragged from: `node:<head job>`, or `selection`. */
  port: string
  /** An end of a connector being moved: its needs go on the drop, and the line starts at its other end. */
  replaces?: NeedRef[]
  origin?: Point
}

export type DragPayload =
  /** `anchor` lands where the drag drops; the other jobs keep their offsets from it. */
  | { kind: 'jobs'; jobs: string[]; label: string; anchor?: string }
  | { kind: 'new'; matrix: boolean; label: string }
  | ConnectPayload
  | { kind: 'steps'; steps: StepRef[]; label: string }

export type DropTarget =
  /** `blocked` when the move would cut a need an expression of a moved job reads. */
  | { kind: 'slot'; slot: GraphSlot; indicator: Box; blocked?: boolean }
  | { kind: 'trash' }
  /** `edits` is null when the drop can't connect. */
  | { kind: 'connect'; edits: GraphEdit[] | null; box: Box }
  /** Dragged jobs join `into`'s node, taking its needs; `valid` is false when that would loop. */
  | { kind: 'merge'; into: string; jobs: string[]; valid: boolean; box: Box }
  /** Steps land at `index` of `job`; `around` outlines a job whose steps aren't shown, `problem` refuses the drop. */
  | {
      kind: 'steps'
      job: string
      index: number
      indicator: Box
      around?: boolean
      problem?: string
    }

export interface DragView {
  payload: DragPayload
  client: Point
  content: Point | null
  origin: Point | null
  target: DropTarget | null
}

/** A job or step being added: `yml` is the workflow as if `edit` were applied, which the dialog's first save does. */
export interface Addition {
  edit: GraphEdit
  yml: string
}

export type Dialog =
  | { kind: 'job'; job: string; addition?: Addition }
  | { kind: 'step'; job: string; index: number; addition?: Addition }

export const labelsOf = (jobs: string[]) => jobs.map((job) => jobLabel(job)).join(', ')

/** A drawn connector, named by the head jobs of the boxes it joins. */
export interface EdgeSelection {
  from: string
  to: string
}

export interface UiState {
  drag: DragView | null
  /** Selected connectors. Jobs, steps and connectors are never selected together. */
  edges: EdgeSelection[]
  dialog: Dialog | null
  selection: string[]
  steps: StepRef[]
  problems: EditorProblem[]
  /** The box being dragged out on empty space, in content coordinates. */
  marquee: Box | null
}

export const NO_SELECTION: string[] = []
export const NO_STEPS: StepRef[] = []
export const NO_EDGES: EdgeSelection[] = []
export const NO_PROBLEMS: EditorProblem[] = []

// The problems in a job itself, or in one of its steps.
export const problemsIn = (problems: EditorProblem[], job: string, step?: number) =>
  problems.filter((problem) => problem.job === job && problem.step === step)

export const sameStep = (a: StepRef, b: StepRef) => a.job === b.job && a.index === b.index

export type UiStore = Store<UiState>

/** The drawn grid of the level being edited; `rows` holds each box's row, `columns` each column's number. */
export interface GraphGrid {
  wrapper: HTMLDivElement
  cols: string[][][]
  rows: number[][]
  columns: number[]
}

/** What the editor asks of the graph's view. */
export interface GraphView {
  /** Keeps `job` where it is on screen through the next layout change, rather than refitting. */
  hold: (job: string) => void
}

export interface GraphEditorApi {
  store: UiStore
  /** The editor's strings, so what the graph draws for it needn't load them itself. */
  t: GraphEditorStrings
  isMatrixJob: (job: string) => boolean
  startDrag: (e: ReactPointerEvent, payload: DragPayload) => void
  openJobMenu: (x: number, y: number, job: string) => void
  openStepMenu: (x: number, y: number, job: string, index: number) => void
  openEdgeMenu: (x: number, y: number, edge: EdgeSelection) => void
  /**
   * Selects a connector alone, or with `add` adds it to the selected connectors or takes it out;
   * selected jobs or steps give way to it.
   */
  selectEdge: (edge: EdgeSelection, add: boolean) => void
  /** Whether an expression reads one of a connector's needs, so it can't be removed or moved. */
  edgeInUse: (edge: EdgeSelection) => boolean
  /** Starts moving one end of a connector; `fixed` is its other end, in the graph's own pixels. */
  startEdgeEnd: (
    e: ReactPointerEvent,
    edge: EdgeSelection,
    end: 'from' | 'to',
    fixed: Point,
  ) => void
  /** Removes the selected jobs, steps and connectors; false when nothing is selected. */
  deleteSelection: () => boolean
  /** Opens the dialog of the one selected job or step, reporting whether there was one. */
  editSelection: () => boolean
  addJob: (matrix: boolean) => void
  addStep: (job: string) => void
  editJob: (job: string) => void
  editStep: (job: string, index: number) => void
  registerGrid: (grid: GraphGrid | null) => void
  grid: () => GraphGrid | null
  registerView: (view: GraphView | null) => void
  /** The selected jobs that still exist. */
  selected: () => string[]
  /** Adds a job to the selected jobs or takes it out; selected steps or connectors give way to it. */
  toggleSelected: (job: string) => void
  /** The selected steps that still exist. */
  selectedSteps: () => StepRef[]
  /** Adds a step to the selected steps or takes it out; selected jobs or connectors give way to it. */
  toggleStep: (step: StepRef) => void
  /** Puts the selected jobs or steps on the clipboard, as YAML; null when nothing is selected. */
  copySelection: () => string | null
  /** Adds the jobs or steps in `text` near `pointer`; false when `text` holds neither. */
  paste: (text: string, pointer: Point | null) => boolean
  /** Moves the selected jobs one slot; false when no jobs are selected. */
  nudge: (direction: NudgeDirection) => boolean
  reveal: (target: RevealTarget) => void
  /** Selects a job, or one of its steps, alone. */
  focus: (target: { job: string; step?: number }) => void
}

const EditorContext = createContext<GraphEditorApi | null>(null)

export const GraphEditorProvider = EditorContext.Provider

export function useGraphEditor(): GraphEditorApi | null {
  return useContext(EditorContext)
}

const noopSubscribe = () => () => {}

export function useUi<T>(
  api: GraphEditorApi | null,
  select: (state: UiState) => T,
  fallback: T,
): T {
  const snapshot = () => (api ? select(api.store.get()) : fallback)
  return useSyncExternalStore(api ? api.store.subscribe : noopSubscribe, snapshot, snapshot)
}

export function useSelectedEdges(api: GraphEditorApi | null): EdgeSelection[] {
  return useUi(api, (state) => state.edges, NO_EDGES)
}

export const sameEdge = (a: EdgeSelection, b: EdgeSelection) => a.from === b.from && a.to === b.to

export function toContent(wrapper: HTMLElement, client: Point): Point {
  const rect = wrapper.getBoundingClientRect()
  const scale = wrapper.offsetWidth > 0 ? rect.width / wrapper.offsetWidth : 1
  return { x: (client.x - rect.left) / scale, y: (client.y - rect.top) / scale }
}

export function contentBox(wrapper: HTMLElement, el: Element): Box {
  const rect = wrapper.getBoundingClientRect()
  const scale = wrapper.offsetWidth > 0 ? rect.width / wrapper.offsetWidth : 1
  const r = el.getBoundingClientRect()
  return {
    left: (r.left - rect.left) / scale,
    top: (r.top - rect.top) / scale,
    right: (r.right - rect.left) / scale,
    bottom: (r.bottom - rect.top) / scale,
  }
}

const SELECTION_PAD = 12
// Past a node's edge by more than a circle's width, so the two sets of circles never touch.
const SELECTION_SIDE_PAD = 36

/**
 * The outline around the selected jobs, in content coordinates: as tall as their rows and
 * as wide as their nodes, so its circles sit clear of the nodes' own.
 */
export function selectionBounds(
  wrapper: HTMLElement,
  jobs: string[],
): (Box & { connectorY: number }) | null {
  const found = jobs.flatMap((job) => {
    const row = wrapper.querySelector(`[data-dag-job="${CSS.escape(job)}"]`)
    const node = row?.closest('[id^="node_"]')
    const first = node?.querySelector('[data-dag-job]')
    return row && node && first
      ? [
          {
            row: contentBox(wrapper, row),
            node: contentBox(wrapper, node),
            first: contentBox(wrapper, first),
          },
        ]
      : []
  })
  if (found.length === 0) {
    return null
  }
  // The circles go level with the nodes' own: where a node's connectors would meet a row were
  // it the node's first, halfway between the top and bottom rows.
  const connectors = found.map((f) => f.node.top + NODE_CONNECTOR_Y + f.row.top - f.first.top)
  return {
    left: Math.min(...found.map((f) => f.node.left)) - SELECTION_SIDE_PAD,
    top: Math.min(...found.map((f) => f.row.top)) - SELECTION_PAD,
    right: Math.max(...found.map((f) => f.node.right)) + SELECTION_SIDE_PAD,
    bottom: Math.max(...found.map((f) => f.row.bottom)) + SELECTION_PAD,
    connectorY: (Math.min(...connectors) + Math.max(...connectors)) / 2,
  }
}

import cx from 'classnames'
import {
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { IconButton } from '../components/IconButton'
import { useWorkflowEditing } from '../components/Provider'
import type {
  GraphEdit,
  GraphEditResult,
  GraphLayout,
  GraphPosition,
  GraphSlot,
  NeedRef,
  NudgeDirection,
  StepRef,
} from '../editing'
import {
  AddIcon,
  CloseIcon,
  DuplicateIcon,
  EditIcon,
  GridIcon,
  LinkIcon,
  RefreshIcon,
  TrashIcon,
} from '../icons'
import { type RowMenuItem, useRowMenu } from '../list/RowContextMenu'
import { type DependencyGraphEditor, overlaps, typing } from './editorApi'
import { AddChip, BarDivider, DragLabel, EditorBar } from './editorChrome'
import { asRecord, openOnAddOf } from './editorFields'
import {
  type Box,
  createStore,
  type Point,
  reclaimFocus,
  returningFocus,
  trackDrag,
  useFocusAfterDialog,
  usePressOutside,
} from './editorPrimitives'
import { type GraphEditorStrings, useGraphEditorStrings } from './editorStrings'
import { JobDialog, StepDialog } from './GraphEditorDialogs'
import {
  type ConnectPayload,
  contentBox,
  type DragPayload,
  type DropTarget,
  EDITOR_HANDLE_CLASS,
  type EdgeSelection,
  type GraphEditorApi,
  type GraphGrid,
  type GraphView,
  labelsOf,
  NO_EDGES,
  NO_PROBLEMS,
  NO_SELECTION,
  NO_STEPS,
  type PortSide,
  sameEdge,
  sameStep,
  selectionBounds,
  toContent,
  type UiState,
  useUi,
} from './graphEditorState'
import { COLUMN_PITCH, SLOT_PITCH } from './gridSpacing'
import { refusalText } from './refusalText'
import { MOD_KEY, type ShortcutGroup } from './ShortcutsButton'
import type { WorkflowJob } from './types'
import { jobLabel } from './util'

// Content px past the outermost boxes that opens a new first or last column.
const EDGE_ZONE = 48
const INDICATOR = 6

// What this page copied last, so pasting it back keeps the jobs' arrangement.
let copied: {
  text: string
  jobs?: string[]
  offsets?: Record<string, GraphPosition>
  steps?: StepRef[]
} | null = null

const createUiStore = () =>
  createStore<UiState>({
    drag: null,
    edges: NO_EDGES,
    dialog: null,
    selection: NO_SELECTION,
    steps: NO_STEPS,
    problems: NO_PROBLEMS,
    marquee: null,
  })
const ROW_GAP = 96

function forgetSteps(api: GraphEditorApi) {
  if (api.store.get().steps.length > 0) {
    api.store.set({ steps: NO_STEPS })
  }
}

function withoutRefs(needs: Record<string, string[]>, refs: NeedRef[]): Record<string, string[]> {
  if (refs.length === 0) {
    return needs
  }
  const out: Record<string, string[]> = Object.create(null)
  for (const [job, list] of Object.entries(needs)) {
    out[job] = list.filter((need) => !refs.some((ref) => ref.job === job && ref.need === need))
  }
  return out
}

// Whether connecting `edits` would only put back the needs `refs` names.
function restores(
  edits: GraphEdit[],
  refs: NeedRef[],
  needTarget: (need: string) => string,
): boolean {
  const pairs = edits.flatMap((e) => (e.type === 'connect' ? [e] : []))
  return (
    pairs.length === refs.length &&
    pairs.every((pair) =>
      refs.some((ref) => ref.job === pair.to && needTarget(ref.need) === pair.from),
    )
  )
}

function isMatrix(job: unknown): boolean {
  const strategy = (job as { strategy?: { matrix?: unknown } } | undefined)?.strategy
  return strategy?.matrix !== undefined && strategy.matrix !== null
}

function stepsOf(job: unknown): unknown[] {
  const steps = (job as { steps?: unknown } | undefined)?.steps
  return Array.isArray(steps) ? steps : []
}

function boxOf(cols: string[][][], job: string): string[] {
  for (const col of cols) {
    for (const box of col) {
      if (box.includes(job)) {
        return box
      }
    }
  }
  return [job]
}

// Where the anchor of dragged jobs would land. Null when the drop would change nothing.
function slotAt(
  grid: GraphGrid,
  client: Point,
  moving: { jobs: string[]; anchor: string } | null,
): DropTarget | null {
  const { wrapper, cols } = grid
  const p = toContent(wrapper, client)
  const columns = cols.map((col, c) => {
    const boxes = col.flatMap((box) => {
      const el = document.getElementById(`node_${box[0]}`)
      return el ? [contentBox(wrapper, el)] : []
    })
    return {
      boxes,
      left: Math.min(...boxes.map((b) => b.left)),
      right: Math.max(...boxes.map((b) => b.right)),
      number: grid.columns[c] ?? c,
    }
  })
  const drawn = columns.flatMap((c) => c.boxes)
  if (drawn.length === 0) {
    return null
  }
  const top = Math.min(...drawn.map((b) => b.top))
  const bottom = Math.max(...drawn.map((b) => b.bottom))

  let origin: {
    col: number
    box: number
    row: number
    whole: boolean
    alone: boolean
  } | null = null
  for (const [c, col] of cols.entries()) {
    for (const [index, box] of col.entries()) {
      if (moving && box.includes(moving.anchor)) {
        const whole = box.every((job) => moving.jobs.includes(job))
        const only = whole && moving.jobs.length === box.length
        origin = {
          col: c,
          box: index,
          row: grid.rows[c]?.[index] ?? index,
          whole,
          alone: only && col.length === 1,
        }
      }
    }
  }
  const line = (left: number, right: number, y: number): Box => ({
    left,
    right,
    top: y - INDICATOR / 2,
    bottom: y + INDICATOR / 2,
  })
  // Negative above the top row; moveJobs then moves every row down to make room.
  const pointerRow = Math.floor(p.y / SLOT_PITCH)

  const insertAt = (c: number, x: number): DropTarget | null => {
    if (origin?.alone && (c === origin.col || c === origin.col + 1)) {
      return null
    }
    const last = columns[columns.length - 1]?.number ?? -1
    return {
      kind: 'slot',
      slot: {
        column: columns[c]?.number ?? last + 1,
        row: 0,
        insertColumn: true,
      },
      indicator: {
        left: x - INDICATOR / 2,
        right: x + INDICATOR / 2,
        top,
        bottom,
      },
    }
  }
  const emptyColumn = (number: number, left: number): DropTarget => ({
    kind: 'slot',
    slot: { column: number, row: pointerRow },
    indicator: line(
      left + ROW_GAP,
      left + COLUMN_PITCH - ROW_GAP,
      ROW_GAP / 2 + pointerRow * SLOT_PITCH,
    ),
  })
  // Empty rows, above, between or below a column's boxes, take the job as they are; a line
  // between two adjacent boxes pushes the lower one down.
  const rowSlot = (c: number): DropTarget | null => {
    const col = columns[c]
    if (!col) {
      return null
    }
    const rows = grid.rows[c] ?? []
    const own = origin?.col === c ? origin : null
    const at = (row: number, y: number): DropTarget | null =>
      own?.whole && (row === own.row || (row === own.row + 1 && rows.includes(row)))
        ? null
        : {
            kind: 'slot',
            slot: { column: col.number, row },
            indicator: line(col.left, col.right, y),
          }
    if (p.y < 0) {
      return at(pointerRow, ROW_GAP / 2 + pointerRow * SLOT_PITCH)
    }
    let above = -1
    let edge = 0
    for (const [i, box] of col.boxes.entries()) {
      const row = rows[i] ?? i
      if (p.y < box.top) {
        const empty = row - above - 1
        if (empty > 0) {
          const band = Math.min(empty - 1, Math.max(0, Math.floor((p.y - edge) / SLOT_PITCH)))
          return at(above + 1 + band, edge + ROW_GAP / 2 + band * SLOT_PITCH)
        }
        return at(row, i === 0 ? box.top - ROW_GAP / 2 : (edge + box.top) / 2)
      }
      if (p.y <= box.bottom) {
        // Over the dragged jobs' own box: a whole box stays; one pulled out goes above or below it.
        if (own?.whole && own.box === i) {
          return null
        }
        return p.y < (box.top + box.bottom) / 2
          ? at(row, box.top - ROW_GAP / 2)
          : at(row + 1, box.bottom + ROW_GAP / 2)
      }
      above = row
      edge = box.bottom
    }
    const band = Math.max(0, Math.floor((p.y - edge) / SLOT_PITCH))
    return at(above + 1 + band, edge + ROW_GAP / 2 + band * SLOT_PITCH)
  }

  for (let c = 0; c < columns.length; c++) {
    const col = columns[c]
    if (!col || col.boxes.length === 0) {
      continue
    }
    if (p.x < col.left) {
      const prev = columns[c - 1]
      if (!prev) {
        // Left of the first column: each column's width further out leaves another empty.
        if (p.x >= col.left - EDGE_ZONE) {
          return rowSlot(c)
        }
        const away = Math.ceil((col.left - EDGE_ZONE - p.x) / COLUMN_PITCH)
        return emptyColumn(col.number - away, col.left - ROW_GAP - away * COLUMN_PITCH)
      }
      const empty = col.number - prev.number - 1
      if (empty > 0) {
        // Across empty columns, the one under the pointer takes the job.
        const start = prev.right + ROW_GAP
        if (p.x < start) {
          return rowSlot(c - 1)
        }
        if (p.x >= col.left - ROW_GAP) {
          return rowSlot(c)
        }
        const band = Math.min(empty - 1, Math.floor((p.x - start) / COLUMN_PITCH))
        return emptyColumn(prev.number + 1 + band, start + band * COLUMN_PITCH)
      }
      const third = (col.left - prev.right) / 3
      if (p.x < prev.right + third) {
        return rowSlot(c - 1)
      }
      if (p.x > col.left - third) {
        return rowSlot(c)
      }
      return insertAt(c, (prev.right + col.left) / 2)
    }
    if (p.x <= col.right) {
      return rowSlot(c)
    }
  }
  const last = columns[columns.length - 1]
  if (!last || p.x <= last.right + EDGE_ZONE) {
    return rowSlot(columns.length - 1)
  }
  // Right of the last column, likewise.
  const away = Math.ceil((p.x - last.right - EDGE_ZONE) / COLUMN_PITCH)
  return emptyColumn(last.number + away, last.right + ROW_GAP + (away - 1) * COLUMN_PITCH)
}

// Where steps dropped or pasted at `client` land: among the steps of the job under the pointer,
// or after them over the job's name or over a node holding only that job.

// A matrix job draws its steps once per run: the copy a step row is in is the largest box around it
// holding no other copy of that step.
function copyOf(stepRow: HTMLElement, wrapper: HTMLElement): HTMLElement {
  const selector = `[data-dag-step-job="${CSS.escape(stepRow.dataset['dagStepJob'] ?? '')}"][data-dag-step="${CSS.escape(stepRow.dataset['dagStep'] ?? '')}"]`
  let copy = stepRow
  for (let el = stepRow.parentElement; el && el !== wrapper; el = el.parentElement) {
    if (el.querySelectorAll(selector).length > 1) {
      break
    }
    copy = el
  }
  return copy
}
function stepDropAt(
  grid: GraphGrid,
  client: Point,
  hit: Element | null,
  stepCount: (job: string) => number,
): { job: string; index: number; indicator: Box; around: boolean } | null {
  const { wrapper } = grid
  const stepRow = hit?.closest<HTMLElement>('[data-dag-step-job]')
  const jobRow = stepRow ? null : hit?.closest<HTMLElement>('[data-dag-job]')
  const on = stepRow || jobRow ? null : nodeAt(hit, grid)
  const box = on ? boxOf(grid.cols, on.head) : []
  const job =
    stepRow?.dataset['dagStepJob'] ??
    jobRow?.dataset['dagJob'] ??
    (box.length === 1 ? box[0] : undefined)
  if (!job) {
    return null
  }
  const rows = [
    ...(stepRow ? copyOf(stepRow, wrapper) : wrapper).querySelectorAll<HTMLElement>(
      `[data-dag-step-job="${CSS.escape(job)}"]`,
    ),
  ]
    .map((row) => ({
      index: Number(row.dataset['dagStep']),
      box: contentBox(wrapper, row),
    }))
    .filter((row) => row.box.bottom > row.box.top)
    .sort((a, b) => a.index - b.index)
  if (rows.length === 0) {
    const row = wrapper.querySelector<HTMLElement>(`[data-dag-job="${CSS.escape(job)}"]`)
    const around = row ?? on?.el
    return around
      ? {
          job,
          index: stepCount(job),
          indicator: contentBox(wrapper, around),
          around: true,
        }
      : null
  }
  const p = toContent(wrapper, client)
  const below = stepRow ? rows.find((r) => (r.box.top + r.box.bottom) / 2 >= p.y) : undefined
  const index = below
    ? below.index
    : stepRow
      ? (rows[rows.length - 1]?.index ?? -1) + 1
      : stepCount(job)
  const before = [...rows].reverse().find((r) => r.index < index)
  const after = rows.find((r) => r.index >= index)
  const y = !before
    ? (after?.box.top ?? 0) - 2
    : !after
      ? before.box.bottom + 2
      : (before.box.bottom + after.box.top) / 2
  return {
    job,
    index,
    indicator: {
      left: Math.min(...rows.map((r) => r.box.left)),
      right: Math.max(...rows.map((r) => r.box.right)),
      top: y - 2,
      bottom: y + 2,
    },
    around: false,
  }
}

// Pointer-downs on these keep their own meaning; elsewhere shift + drag draws a selection box.
const NOT_EMPTY = `.${EDITOR_HANDLE_CLASS}, button, a, input, textarea, select, label, [role="menu"], [role="dialog"]`

const ARROWS: Record<string, NudgeDirection | undefined> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
}

// Liang–Barsky clipping: whether any part of the segment from a to b is in the box.
function segmentInBox(a: Point, b: Point, box: Box): boolean {
  let low = 0
  let high = 1
  const clip = (p: number, q: number) => {
    if (p === 0) {
      return q >= 0
    }
    const t = q / p
    if (p < 0) {
      low = Math.max(low, t)
    } else {
      high = Math.min(high, t)
    }
    return low <= high
  }
  const dx = b.x - a.x
  const dy = b.y - a.y
  return (
    clip(-dx, a.x - box.left) &&
    clip(dx, box.right - a.x) &&
    clip(-dy, a.y - box.top) &&
    clip(dy, box.bottom - a.y)
  )
}

const CONNECTOR_SAMPLE = 6

// Each editable connector's line on screen, as points along its path.
function connectorLines(container: HTMLElement): { edge: EdgeSelection; points: Point[] }[] {
  return [...container.querySelectorAll<SVGPathElement>('path[data-dag-edge-from]')].map((path) => {
    const edge = {
      from: path.getAttribute('data-dag-edge-from') ?? '',
      to: path.getAttribute('data-dag-edge-to') ?? '',
    }
    const matrix = path.getScreenCTM()
    const length = path.getTotalLength()
    if (!matrix || !(length > 0)) {
      return { edge, points: [] }
    }
    const count = Math.ceil(length / CONNECTOR_SAMPLE)
    const points = Array.from({ length: count + 1 }, (_, i) => {
      const p = path.getPointAtLength((length * i) / count)
      return {
        x: matrix.a * p.x + matrix.c * p.y + matrix.e,
        y: matrix.b * p.x + matrix.d * p.y + matrix.f,
      }
    })
    return { edge, points }
  })
}

const lineInBox = (points: Point[], box: Box) =>
  points.some((point, i) => segmentInBox(points[i - 1] ?? point, point, box))

type Picked = Pick<UiState, 'selection' | 'steps' | 'edges'>

// A box adds to what's selected; with nothing yet, it takes jobs, else steps, else connectors.
function boxSelection(
  base: Picked,
  touched: { jobs: string[]; steps: StepRef[]; edges: EdgeSelection[] },
): Picked {
  const kind =
    (base.selection.length > 0 && 'jobs') ||
    (base.steps.length > 0 && 'steps') ||
    (base.edges.length > 0 && 'edges') ||
    (touched.jobs.length > 0 && 'jobs') ||
    (touched.steps.length > 0 && 'steps') ||
    (touched.edges.length > 0 && 'edges')
  const added = <T,>(kept: T[], more: T[], same: (a: T, b: T) => boolean) => [
    ...kept,
    ...more.filter((item) => !kept.some((other) => same(other, item))),
  ]
  return {
    selection:
      kind === 'jobs' ? added(base.selection, touched.jobs, (a, b) => a === b) : NO_SELECTION,
    steps: kind === 'steps' ? added(base.steps, touched.steps, sameStep) : NO_STEPS,
    edges: kind === 'edges' ? added(base.edges, touched.edges, sameEdge) : NO_EDGES,
  }
}

// The top-level node an element is on; a nested graph's node defers to the node hosting it.
function nodeAt(
  hit: Element | null | undefined,
  grid: GraphGrid,
): { head: string; el: HTMLElement } | null {
  const heads = new Set(grid.cols.flat().map((box) => box[0]))
  for (
    let el = hit?.closest<HTMLElement>('[id^="node_"]');
    el;
    el = el.parentElement?.closest<HTMLElement>('[id^="node_"]')
  ) {
    const head = el.id.slice('node_'.length)
    if (heads.has(head)) {
      return { head, el }
    }
  }
  return null
}

/**
 * Editor state, handlers and overlays for a DependencyGraph given `editor`.
 * `yamlJobs` are the jobs as written, before previews expand matrices.
 */
function useGraphEditorState({
  editor,
  jobs,
  yamlJobs,
  inputs,
  workflow,
  layout,
  container,
}: {
  editor: DependencyGraphEditor
  jobs: Record<string, WorkflowJob>
  yamlJobs: Record<string, unknown> | undefined
  inputs: Record<string, unknown> | undefined
  workflow: Record<string, unknown> | undefined
  layout: GraphLayout | undefined
  container: HTMLDivElement | null
}): { api: GraphEditorApi; overlays: ReactNode } {
  const t = useGraphEditorStrings()
  const [store] = useState(createUiStore)
  const gridRef = useRef<GraphGrid | null>(null)
  const viewRef = useRef<GraphView | null>(null)
  const trashRef = useRef<HTMLDivElement>(null)
  const source: Record<string, unknown> = yamlJobs ?? jobs
  const latest = useRef({ editor, source, layout, container })
  // Set during render, so the api reads this render's jobs rather than the last one's.
  latest.current = { editor, source, layout, container }
  const rowMenu = useRowMenu()
  const openMenu = useMemo(
    () => returningFocus(rowMenu.openMenu, () => latest.current.container),
    [rowMenu.openMenu],
  )
  const contextMenu = rowMenu.contextMenu
  useFocusAfterDialog(store, () => latest.current.container)
  const editing = useWorkflowEditing()

  const api = useMemo<GraphEditorApi>(() => {
    const {
      applyGraphEdit,
      batchOf,
      dependsOn,
      jobNeeds,
      jobsYaml,
      layoutFromCols,
      layoutPosition,
      moveJobs,
      needInUse,
      needTarget,
      snippetKind,
      stepMoveProblem,
      stepsYaml,
    } = editing
    // Other edits can renumber steps, so only step moves and pastes keep the step selection;
    // undo, redo and the dialogs' saves drop it too.
    const edit = (graphEdit: GraphEdit) => {
      const result = latest.current.editor?.onEdit(graphEdit)
      reclaimFocus(latest.current.container)
      if (
        store.get().steps.length > 0 &&
        graphEdit.type !== 'moveSteps' &&
        graphEdit.type !== 'pasteSteps'
      ) {
        store.set({ steps: NO_STEPS })
      }
      return result
    }
    const materialize = () =>
      layoutFromCols(
        gridRef.current?.cols ?? [],
        latest.current.layout,
        gridRef.current?.rows,
        gridRef.current?.columns,
      )
    const needs = () => jobNeeds(latest.current.source)
    const selected = () =>
      store.get().selection.filter((job) => Object.hasOwn(latest.current.source, job))
    const stepCount = (job: string) => stepsOf(latest.current.source[job]).length
    const selectedSteps = () => store.get().steps.filter((ref) => ref.index < stepCount(ref.job))
    // A drag asks about each job it passes over once.
    const problems = new Map<string, string | undefined>()
    const stepProblem = (refs: StepRef[], job: string) => {
      if (!problems.has(job)) {
        const yml = latest.current.editor?.readSource?.()
        let problem: string | undefined
        try {
          const reason = yml === undefined ? undefined : stepMoveProblem(yml, refs, job)
          problem = reason && refusalText(t, editing, reason)
        } catch {
          problem = undefined
        }
        problems.set(job, problem)
      }
      return problems.get(job)
    }
    const editJob = (job: string) => store.set({ dialog: { kind: 'job', job } })
    const editStep = (job: string, index: number) =>
      store.set({ dialog: { kind: 'step', job, index } })
    // Adding opens the dialog on the workflow as it would be; only its first save adds.
    const preview = (graphEdit: GraphEdit): GraphEditResult | null => {
      const yml = latest.current.editor?.readSource?.()
      if (yml === undefined) {
        return null
      }
      try {
        return applyGraphEdit({ yml, layout: latest.current.layout }, graphEdit)
      } catch {
        return null
      }
    }
    // `into` puts the new job in that job's node, with its needs.
    const addJob = (graphEdit: GraphEdit, into?: string) => {
      const join = (created: string): GraphEdit =>
        joinInto([created], into ?? '') ?? {
          type: 'groupJobs',
          jobs: [created],
          into: into ?? '',
          layout: materialize(),
        }
      const created = preview(graphEdit)?.created
      const addition: GraphEdit | undefined = created
        ? into
          ? { type: 'batch', edits: [graphEdit, join(created)] }
          : graphEdit
        : undefined
      const next = addition ? preview(addition) : null
      if (addition && latest.current.editor?.openOnAdd === false) {
        edit(addition)
        return
      }
      if (created && addition && next) {
        store.set({
          dialog: {
            kind: 'job',
            job: created,
            addition: { edit: addition, yml: next.yml },
          },
        })
        return
      }
      // Without the source to look ahead in, the job's name is the one the edit will give it,
      // so joining the node goes in the same edit and can't be left half done.
      const name = into ? editing.newJobName(Object.keys(latest.current.source)) : undefined
      const result = edit(name ? { type: 'batch', edits: [graphEdit, join(name)] } : graphEdit)
      const added = name ?? result?.created
      if (result && added && latest.current.editor?.openOnAdd !== false) {
        editJob(added)
      }
    }
    const addStep = (job: string) => {
      const graphEdit: GraphEdit = { type: 'addStep', job }
      const index = stepsOf(latest.current.source[job]).length
      if (latest.current.editor?.openOnAdd === false) {
        edit(graphEdit)
        return
      }
      const next = preview(graphEdit)
      if (next) {
        store.set({
          dialog: {
            kind: 'step',
            job,
            index,
            addition: { edit: graphEdit, yml: next.yml },
          },
        })
      } else if (edit(graphEdit)) {
        editStep(job, index)
      }
    }
    // The edits that make `jobs` one unit with the node `box`: all its jobs need what its connectors
    // draw, and what needs one needs them all. Null on a loop or a cut need an expression reads.
    const joinEdits = (jobs: string[], box: string[]): GraphEdit[] | null => {
      const source = latest.current.source
      const all = needs()
      const head = box[0] ?? ''
      const listed = (job: string) => {
        const raw = (source[job] as { needs?: unknown } | undefined)?.needs
        return raw === undefined || raw === null || Array.isArray(raw)
      }
      if (
        isMatrix(source[head]) ||
        !box.every(listed) ||
        jobs.some((job) => isMatrix(source[job]) || !listed(job))
      ) {
        return null
      }
      const node = [...box, ...jobs]
      const own = (job: string) => all[job] ?? []
      const dropped = box.flatMap((member) =>
        own(member)
          .filter((need) => jobs.includes(needTarget(need)))
          .map((need) => ({ job: member, need })),
      )
      const drawn = [...new Set(box.flatMap(own).map(needTarget))].filter(
        (dep) => !node.includes(dep),
      )
      const replaced = jobs.flatMap((job) =>
        own(job)
          .filter((need) => !drawn.includes(needTarget(need)))
          .map((need) => ({ job, need })),
      )
      const before = withoutRefs(all, [...dropped, ...replaced])
      const targets = (job: string) => (before[job] ?? []).map(needTarget)
      const dependents = Object.keys(before).filter(
        (job) => !node.includes(job) && targets(job).some((dep) => node.includes(dep)),
      )
      const after: Record<string, string[]> = { ...before }
      for (const job of node) {
        after[job] = drawn
      }
      for (const job of dependents) {
        after[job] = [...new Set([...targets(job), ...node])]
      }
      // No need of the node may wait on one of its jobs, no two of its jobs on each other, and
      // nothing it now feeds may feed it back.
      const loops =
        node.some((job) => drawn.some((dep) => dependsOn(before, dep, job))) ||
        node.some((a) => node.some((b) => a !== b && dependsOn(after, a, b))) ||
        [...node, ...dependents].some((job) => dependsOn(after, job, job))
      if (loops || needInUse(source, [...dropped, ...replaced])) {
        return null
      }
      // Each job's needs after the disconnect, the joining ones' being the head's.
      const has = (job: string) =>
        (box.includes(job) && job !== head ? before[job] : before[head])?.map(needTarget) ?? []
      return [
        ...(dropped.length > 0 ? [{ type: 'disconnect' as const, needs: dropped }] : []),
        { type: 'groupJobs', jobs, into: head, layout: materialize() },
        ...node.flatMap((job) =>
          drawn
            .filter((dep) => !has(job).includes(dep))
            .map((dep) => ({ type: 'connect' as const, from: dep, to: job })),
        ),
        ...dependents.flatMap((job) =>
          node
            .filter((member) => !targets(job).includes(member))
            .map((member) => ({ type: 'connect' as const, from: member, to: job })),
        ),
      ]
    }
    const joinInto = (jobs: string[], into: string): GraphEdit | null => {
      const edits = joinEdits(jobs, boxOf(gridRef.current?.cols ?? [], into))
      return edits && batchOf(edits)
    }
    // Every new need between the dragged node and the drop; null if any would need itself or loop.
    const connectEdits = (payload: ConnectPayload, jobs: string[]): GraphEdit[] | null => {
      const [deps, dependents] =
        payload.side === 'out' ? [payload.from, jobs] : [jobs, payload.from]
      const all = withoutRefs(needs(), payload.replaces ?? [])
      const edits: GraphEdit[] = []
      for (const to of dependents) {
        const raw = (latest.current.source[to] as { needs?: unknown } | undefined)?.needs
        for (const from of deps) {
          if ((all[to] ?? []).some((need) => needTarget(need) === from)) {
            continue
          }
          if (
            from === to ||
            !(raw === undefined || raw === null || Array.isArray(raw)) ||
            dependsOn(all, from, to)
          ) {
            return null
          }
          edits.push({ type: 'connect', from, to })
        }
      }
      return edits.length > 0 ? edits : null
    }
    // The jobs connected from move and the ones connected to stay; a moved connector end, held by
    // neither, moves the jobs gaining needs past them. `moved` are the needs a moved end replaces.
    const connectWith = (
      edits: GraphEdit[],
      acting?: Pick<ConnectPayload, 'from' | 'side'>,
      moved: NeedRef[] = [],
    ) => {
      const ends = (end: 'from' | 'to') => [
        ...new Set(edits.flatMap((e) => (e.type === 'connect' ? [e[end]] : []))),
      ]
      const dependents = ends('to')
      const left = acting?.side === 'out' && moved.length === 0
      const place: GraphEdit = left
        ? {
            type: 'placeBeforeDependents',
            jobs: acting.from,
            dependents,
            layout: materialize(),
          }
        : { type: 'placeAfterNeeds', jobs: dependents, layout: materialize() }
      const still = (left ? dependents : ends('from'))[0]
      if (still !== undefined) {
        viewRef.current?.hold(still)
      }
      return edit({
        type: 'batch',
        edits: [
          ...(moved.length > 0 ? [{ type: 'disconnect' as const, needs: moved }] : []),
          ...edits,
          place,
        ],
      })
    }

    const findTarget = (payload: DragPayload, client: Point): DropTarget | null => {
      const grid = gridRef.current
      const trash = trashRef.current?.getBoundingClientRect()
      if (
        payload.kind === 'jobs' &&
        trash &&
        client.x >= trash.left &&
        client.x <= trash.right &&
        client.y >= trash.top &&
        client.y <= trash.bottom
      ) {
        return { kind: 'trash' }
      }
      if (!grid) {
        return null
      }
      // Past the graph's edge the slots run on out of sight, so a release over the page drops nothing.
      const hit = document.elementFromPoint(client.x, client.y)
      const view = grid.wrapper.closest('.react-transform-wrapper')
      if (view && hit && !view.contains(hit)) {
        return null
      }
      if (payload.kind === 'connect') {
        // A moved end dropped back where it was changes nothing, so it isn't a drop.
        const connecting = (jobs: string[], box: Box): DropTarget | null => {
          const edits = connectEdits(payload, jobs)
          return payload.replaces && edits && restores(edits, payload.replaces, needTarget)
            ? null
            : { kind: 'connect', edits, box }
        }
        const port = hit?.closest<HTMLElement>('[data-dag-port]')
        const bounds =
          port?.dataset['dagSelection'] !== undefined
            ? selectionBounds(grid.wrapper, selected())
            : null
        if (bounds) {
          return connecting(selected(), bounds)
        }
        const head = port?.dataset['dagNode']
        const node = head ? document.getElementById(`node_${head}`) : null
        if (head && node) {
          return connecting(boxOf(grid.cols, head), contentBox(grid.wrapper, node))
        }
        const row = hit?.closest<HTMLElement>('[data-dag-job]')
        const job = row?.dataset['dagJob']
        if (row && job) {
          return connecting([job], contentBox(grid.wrapper, row))
        }
        // Anywhere else on a node counts as its circles.
        const on = nodeAt(hit, grid)
        return on ? connecting(boxOf(grid.cols, on.head), contentBox(grid.wrapper, on.el)) : null
      }
      if (payload.kind === 'steps') {
        const at = stepDropAt(grid, client, hit, stepCount)
        if (!at) {
          return null
        }
        const indices = payload.steps.map((ref) => ref.index).sort((a, b) => a - b)
        const first = indices[0] ?? 0
        const last = indices[indices.length - 1] ?? 0
        // A block dropped at its own place changes nothing.
        if (
          payload.steps.every((ref) => ref.job === at.job) &&
          last - first === indices.length - 1 &&
          at.index >= first &&
          at.index <= last + 1
        ) {
          return null
        }
        const problem = stepProblem(payload.steps, at.job)
        return { kind: 'steps', ...at, ...(problem ? { problem } : {}) }
      }
      const moving =
        payload.kind === 'jobs'
          ? { jobs: payload.jobs, anchor: payload.anchor ?? payload.jobs[0] ?? '' }
          : null
      // Over another node, the dragged jobs join it rather than take a row.
      const on = nodeAt(hit, grid)
      const box = on ? boxOf(grid.cols, on.head) : []
      if (on && !moving?.jobs.some((job) => box.includes(job))) {
        const jobs = moving?.jobs ?? []
        return {
          kind: 'merge',
          into: on.head,
          jobs,
          valid: (payload.kind !== 'new' || !payload.matrix) && joinEdits(jobs, box) !== null,
          box: contentBox(grid.wrapper, on.el),
        }
      }
      const slot = slotAt(grid, client, moving)
      if (slot?.kind === 'slot' && moving) {
        const { cuts } = moveJobs(materialize(), needs(), moving.jobs, slot.slot, moving.anchor)
        if (needInUse(latest.current.source, cuts)) {
          return { ...slot, blocked: true }
        }
      }
      return slot
    }

    const drop = (payload: DragPayload, target: DropTarget | null) => {
      switch (payload.kind) {
        case 'jobs':
          if (target?.kind === 'trash') {
            edit({ type: 'deleteJob', jobs: payload.jobs })
            store.set({
              selection: store.get().selection.filter((job) => !payload.jobs.includes(job)),
            })
          } else if (target?.kind === 'merge') {
            const joined = target.valid ? joinInto(target.jobs, target.into) : null
            if (joined) {
              edit(joined)
            }
          } else if (target?.kind === 'slot' && !target.blocked) {
            edit({
              type: 'move',
              jobs: payload.jobs,
              to: target.slot,
              layout: materialize(),
              ...(payload.anchor ? { anchor: payload.anchor } : {}),
            })
          }
          return
        case 'new':
          if (target?.kind === 'merge') {
            if (target.valid) {
              addJob({ type: 'addJob', ...(payload.matrix ? { matrix: true } : {}) }, target.into)
            }
          } else if (target?.kind === 'slot') {
            addJob({
              type: 'addJob',
              ...(payload.matrix ? { matrix: true } : {}),
              to: target.slot,
              layout: materialize(),
            })
          } else if ((gridRef.current?.cols.length ?? 0) === 0) {
            addJob({
              type: 'addJob',
              ...(payload.matrix ? { matrix: true } : {}),
            })
          }
          return
        case 'connect':
          if (target?.kind === 'connect' && target.edits) {
            const moved = payload.replaces ?? []
            const result = connectWith(target.edits, payload, moved)
            if (result && moved.length > 0) {
              store.set({ edges: NO_EDGES })
            }
          }
          return
        case 'steps':
          if (target?.kind === 'steps' && !target.problem) {
            const kept =
              payload.steps.length > 1 ||
              selectedSteps().some((ref) => payload.steps.some((step) => sameStep(ref, step)))
            const result = edit({
              type: 'moveSteps',
              steps: payload.steps,
              job: target.job,
              index: target.index,
            })
            store.set({
              steps: kept && result?.steps ? result.steps : NO_STEPS,
            })
          }
      }
    }

    const startDrag = (e: ReactPointerEvent, payload: DragPayload) => {
      if (e.button !== 0) {
        return
      }
      e.stopPropagation()
      problems.clear()
      const grid = gridRef.current
      let origin: Point | null = null
      if (payload.kind === 'connect' && payload.origin) {
        origin = payload.origin
      } else if (payload.kind === 'connect' && grid) {
        const r = e.currentTarget.getBoundingClientRect()
        origin = toContent(grid.wrapper, {
          x: (r.left + r.right) / 2,
          y: (r.top + r.bottom) / 2,
        })
      }
      trackDrag(
        { x: e.clientX, y: e.clientY },
        {
          escape: true,
          holdText: 'drag',
          swallowClick: 'drag',
          onMove: (client) =>
            store.set({
              drag: {
                payload,
                client,
                content: gridRef.current ? toContent(gridRef.current.wrapper, client) : null,
                origin,
                target: findTarget(payload, client),
              },
            }),
          onEnd: (client, dragged) => {
            if (dragged) {
              const target = findTarget(payload, client)
              store.set({ drag: null })
              drop(payload, target)
            }
          },
          onCancel: () => store.set({ drag: null }),
        },
      )
    }

    // The jobs `job` could come to need ('in') or be needed by ('out'), for connecting without a drag.
    const connectMenu = (job: string, side: PortSide, label: string) => {
      const items = Object.keys(latest.current.source).flatMap((other): RowMenuItem[] => {
        const edits =
          other === job
            ? null
            : connectEdits({ kind: 'connect', from: [job], side, label: job, port: '' }, [other])
        // Named as the graph names it, so the menu and the nodes read the same.
        return edits
          ? [
              {
                kind: 'action',
                label: jobLabel(other),
                onSelect: () => connectWith(edits, { from: [job], side }),
              },
            ]
          : []
      })
      return items.length > 0
        ? [{ kind: 'submenu' as const, label, icon: <LinkIcon />, items }]
        : []
    }
    const openJobMenu = (x: number, y: number, job: string) => {
      const matrix = isMatrix(latest.current.source[job])
      const items: RowMenuItem[] = [
        {
          kind: 'action',
          label: matrix ? t.editMatrix : t.editJob,
          icon: matrix ? <GridIcon /> : <EditIcon />,
          onSelect: () => editJob(job),
        },
        {
          kind: 'action',
          label: t.duplicate,
          icon: <DuplicateIcon />,
          onSelect: () => edit({ type: 'duplicateJob', job, layout: materialize() }),
        },
        {
          kind: 'action',
          label: t.addStep,
          icon: <AddIcon />,
          onSelect: () => addStep(job),
        },
        matrix
          ? {
              kind: 'action',
              label: t.removeMatrix,
              icon: <CloseIcon />,
              onSelect: () => edit({ type: 'setMatrix', job, variables: null }),
            }
          : {
              kind: 'action',
              label: t.makeMatrix,
              icon: <GridIcon />,
              onSelect: () =>
                edit({
                  type: 'setMatrix',
                  job,
                  variables: [['value', [1, 2]]],
                }),
            },
        ...connectMenu(job, 'in', t.menuDependsOn),
        ...connectMenu(job, 'out', t.menuNeededBy),
        { kind: 'divider' },
        {
          kind: 'action',
          label: t.deleteJob,
          icon: <TrashIcon />,
          destructive: true,
          onSelect: () => edit({ type: 'deleteJob', jobs: [job] }),
        },
      ]
      openMenu(x, y, items)
    }

    const openStepMenu = (x: number, y: number, job: string, index: number) => {
      openMenu(x, y, [
        {
          kind: 'action',
          label: t.editStep,
          icon: <EditIcon />,
          onSelect: () => editStep(job, index),
        },
        {
          kind: 'action',
          label: t.deleteStep,
          icon: <TrashIcon />,
          destructive: true,
          onSelect: () => edit({ type: 'deleteStep', job, index }),
        },
      ])
    }

    // The needs a drawn connector stands for: every job of its target box on every job of its source box.
    const edgeRefs = (edge: EdgeSelection): NeedRef[] => {
      const cols = gridRef.current?.cols ?? []
      const deps = boxOf(cols, edge.from)
      const all = needs()
      return boxOf(cols, edge.to).flatMap((job) =>
        (all[job] ?? [])
          .filter((need) => deps.includes(needTarget(need)))
          .map((need) => ({ job, need })),
      )
    }
    const refsInUse = (refs: NeedRef[]) => !!needInUse(latest.current.source, refs)
    const selectEdge = (edge: EdgeSelection, add: boolean) => {
      const { edges, selection, steps } = store.get()
      if (!add || steps.length > 0 || selection.length > 0) {
        store.set({ edges: [edge], selection: NO_SELECTION, steps: NO_STEPS })
      } else {
        store.set({
          edges: edges.some((other) => sameEdge(other, edge))
            ? edges.filter((other) => !sameEdge(other, edge))
            : [...edges, edge],
        })
      }
    }
    const startEdgeEnd = (
      e: ReactPointerEvent,
      edge: EdgeSelection,
      end: 'from' | 'to',
      fixed: Point,
    ) => {
      const refs = edgeRefs(edge)
      if (refs.length === 0 || refsInUse(refs)) {
        return
      }
      // Moving the target end keeps the source box's jobs as the needs; moving the source end keeps the target's.
      const jobs = boxOf(gridRef.current?.cols ?? [], end === 'to' ? edge.from : edge.to)
      startDrag(e, {
        kind: 'connect',
        from: jobs,
        side: end === 'to' ? 'out' : 'in',
        label: labelsOf(jobs),
        port: `edge:${edge.from}:${edge.to}`,
        replaces: refs,
        origin: fixed,
      })
    }
    const editSelection = (): boolean => {
      const { selection, steps } = store.get()
      const [step] = steps
      if (steps.length === 1 && step && selection.length === 0) {
        editStep(step.job, step.index)
        return true
      }
      const [job] = selection
      if (selection.length === 1 && job && steps.length === 0) {
        editJob(job)
        return true
      }
      return false
    }

    const deleteSelection = (): boolean => {
      const jobs = selected()
      const gone = (job: string) => jobs.includes(job)
      const refs = store
        .get()
        .edges.flatMap(edgeRefs)
        .filter((ref) => !gone(ref.job) && !gone(needTarget(ref.need)))
      // Later steps of a job go first, so the earlier ones keep their places.
      const steps = selectedSteps()
        .filter((ref) => !gone(ref.job))
        .sort((a, b) => b.index - a.index)
      const edits: GraphEdit[] = [
        ...(refs.length > 0 ? [{ type: 'disconnect' as const, needs: refs }] : []),
        ...steps.map((ref) => ({
          type: 'deleteStep' as const,
          job: ref.job,
          index: ref.index,
        })),
        ...(jobs.length > 0 ? [{ type: 'deleteJob' as const, jobs }] : []),
      ]
      const only = edits.length === 1 ? edits[0] : undefined
      if (edits.length === 0) {
        return false
      }
      if (edit(only ?? { type: 'batch', edits })) {
        store.set({ selection: NO_SELECTION, steps: NO_STEPS, edges: NO_EDGES })
      }
      return true
    }

    const openEdgeMenu = (x: number, y: number, edge: EdgeSelection) => {
      const cols = gridRef.current?.cols ?? []
      const deps = boxOf(cols, edge.from)
      const targets = boxOf(cols, edge.to)
      const refs = edgeRefs(edge)
      const inUse = refsInUse(refs)
      const items: RowMenuItem[] = [
        {
          kind: 'action',
          label: t.removeDependency,
          icon: <TrashIcon />,
          destructive: true,
          disabled: inUse,
          tooltip: inUse ? t.dependencyInUse : undefined,
          onSelect: () => edit({ type: 'disconnect', needs: refs }),
        },
      ]
      if (deps.length === 1 && isMatrix(latest.current.source[edge.from])) {
        const any = refs.length > 0 && refs.every((r) => r.need.endsWith(':any'))
        items.unshift({
          kind: 'action',
          label: t.waitForAny,
          icon: <GridIcon />,
          selected: any,
          onSelect: () =>
            edit({
              type: 'setNeedAny',
              jobs: targets,
              dep: edge.from,
              any: !any,
            }),
        })
      }
      if (!store.get().edges.some((other) => sameEdge(other, edge))) {
        selectEdge(edge, false)
      }
      openMenu(x, y, items)
    }

    const copySelection = (): string | null => {
      const yml = latest.current.editor?.readSource?.()
      if (yml === undefined) {
        return null
      }
      const steps = selectedSteps()
      if (steps.length > 0) {
        const text = stepsYaml(yml, steps)
        copied = { text, steps }
        return text
      }
      const layout = materialize()
      const at = (job: string) => layoutPosition(layout, job) ?? { column: 0, row: 0 }
      // The top-left job first; the others keep their offsets from it.
      const jobs = selected().sort((a, b) => at(a).column - at(b).column || at(a).row - at(b).row)
      const origin = jobs[0] ? at(jobs[0]) : undefined
      if (!origin) {
        return null
      }
      const text = jobsYaml(yml, jobs)
      copied = {
        text,
        jobs,
        offsets: Object.fromEntries(
          jobs.map((job) => [
            job,
            {
              column: at(job).column - origin.column,
              row: at(job).row - origin.row,
            },
          ]),
        ),
      }
      return text
    }

    const paste = (text: string, pointer: Point | null): boolean => {
      const kind = snippetKind(text)
      const grid = gridRef.current
      const memo = copied?.text === text ? copied : null
      if (kind === 'jobs') {
        const layout = materialize()
        let to: GraphSlot | undefined
        const slot = pointer && grid ? slotAt(grid, pointer, null) : null
        if (slot?.kind === 'slot') {
          to = slot.slot
        } else if (memo?.jobs?.every((job) => layoutPosition(layout, job))) {
          // Off the graph, the copies go below the jobs they copy.
          const first = layoutPosition(layout, memo.jobs[0] ?? '')
          const bottom = Math.max(...memo.jobs.map((job) => layoutPosition(layout, job)?.row ?? 0))
          to = first ? { column: first.column, row: bottom + 1 } : undefined
        }
        const result = edit({
          type: 'pasteJobs',
          yaml: text,
          ...(to ? { to, layout } : {}),
          ...(memo?.offsets ? { offsets: memo.offsets } : {}),
        })
        if (result?.createdJobs) {
          store.set({ selection: result.createdJobs, steps: NO_STEPS })
        }
        return true
      }
      if (kind === 'steps') {
        const hit = pointer && grid ? document.elementFromPoint(pointer.x, pointer.y) : null
        const at = pointer && grid ? stepDropAt(grid, pointer, hit, stepCount) : null
        const last = memo?.steps?.[memo.steps.length - 1]
        const target =
          at ??
          (last && last.index < stepCount(last.job)
            ? { job: last.job, index: last.index + 1 }
            : null)
        if (target) {
          const result = edit({
            type: 'pasteSteps',
            yaml: text,
            job: target.job,
            index: target.index,
          })
          if (result?.steps) {
            store.set({ steps: result.steps, selection: NO_SELECTION })
          }
        }
        return true
      }
      return false
    }

    const nudge = (direction: NudgeDirection): boolean => {
      const jobs = selected()
      if (jobs.length === 0) {
        return false
      }
      edit({ type: 'nudge', jobs, direction, layout: materialize() })
      return true
    }

    return {
      store,
      t,
      isMatrixJob: (job) => isMatrix(latest.current.source[job]),
      startDrag,
      openJobMenu,
      openStepMenu,
      openEdgeMenu,
      selectEdge,
      edgeInUse: (edge) => refsInUse(edgeRefs(edge)),
      startEdgeEnd,
      deleteSelection,
      editSelection,
      addJob: (matrix) => addJob({ type: 'addJob', ...(matrix ? { matrix: true } : {}) }),
      addStep,
      editJob,
      editStep,
      registerGrid: (grid) => {
        gridRef.current = grid
      },
      grid: () => gridRef.current,
      registerView: (view) => {
        viewRef.current = view
      },
      selected,
      toggleSelected: (job) => {
        const { selection, steps, edges } = store.get()
        if (steps.length > 0 || edges.length > 0) {
          store.set({ selection: [job], steps: NO_STEPS, edges: NO_EDGES })
          return
        }
        store.set({
          selection: selection.includes(job)
            ? selection.filter((other) => other !== job)
            : [...selection, job],
        })
      },
      selectedSteps,
      toggleStep: (step) => {
        const { selection, steps, edges } = store.get()
        if (selection.length > 0 || edges.length > 0) {
          store.set({ selection: NO_SELECTION, steps: [step], edges: NO_EDGES })
          return
        }
        store.set({
          steps: steps.some((ref) => sameStep(ref, step))
            ? steps.filter((ref) => !sameStep(ref, step))
            : [...steps, step],
        })
      },
      copySelection,
      paste,
      nudge,
      reveal: (target) => latest.current.editor?.onReveal?.(target),
      focus: ({ job, step }) =>
        store.set(
          step === undefined
            ? { selection: [job], steps: NO_STEPS, edges: NO_EDGES }
            : {
                selection: NO_SELECTION,
                steps: [{ job, index: step }],
                edges: NO_EDGES,
              },
        ),
    }
  }, [store, openMenu, t, editing])

  const problems = editor?.problems ?? NO_PROBLEMS
  useEffect(() => {
    store.set({ problems })
  }, [store, problems])

  // A press anywhere else on the page lets go of what's selected here.
  usePressOutside(
    () => latest.current.container,
    () => {
      const { selection, steps, edges } = store.get()
      if (selection.length > 0 || steps.length > 0 || edges.length > 0) {
        store.set({ selection: NO_SELECTION, steps: NO_STEPS, edges: NO_EDGES })
      }
    },
  )

  const active = editor !== undefined
  useEffect(() => {
    if (!container || !active) {
      return
    }
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || !(e.target instanceof Element) || e.target.closest(NOT_EMPTY)) {
        return
      }
      const start = { x: e.clientX, y: e.clientY }
      if (!e.shiftKey) {
        // A plain drag pans; a plain click that didn't pan clears the selection.
        trackDrag(start, {
          onEnd: (_, dragged) => {
            if (!dragged) {
              store.set({
                selection: NO_SELECTION,
                steps: NO_STEPS,
                edges: NO_EDGES,
              })
            }
          },
        })
        return
      }
      // Cancelling the pointerdown also cancels its mousedown, which is what starts a pan.
      e.preventDefault()
      const base = store.get()
      // Connectors hold still while the box is drawn, so their lines are measured once.
      let lines: ReturnType<typeof connectorLines> | null = null
      const move = (client: Point) => {
        const rect = {
          left: Math.min(start.x, client.x),
          right: Math.max(start.x, client.x),
          top: Math.min(start.y, client.y),
          bottom: Math.max(start.y, client.y),
        }
        const touched = (selector: string) =>
          [...container.querySelectorAll<HTMLElement>(selector)].filter((row) =>
            overlaps(row.getBoundingClientRect(), rect),
          )
        const wrapper = gridRef.current?.wrapper
        const from = wrapper && toContent(wrapper, { x: rect.left, y: rect.top })
        const to = wrapper && toContent(wrapper, { x: rect.right, y: rect.bottom })
        lines ??= connectorLines(container)
        store.set({
          ...boxSelection(base, {
            jobs: touched('[data-dag-job]').map((row) => row.dataset['dagJob'] ?? ''),
            steps: touched('[data-dag-step-job]').map((row) => ({
              job: row.dataset['dagStepJob'] ?? '',
              index: Number(row.dataset['dagStep']),
            })),
            edges: lines.filter(({ points }) => lineInBox(points, rect)).map(({ edge }) => edge),
          }),
          marquee: from && to ? { left: from.x, top: from.y, right: to.x, bottom: to.y } : null,
        })
      }
      const done = (dragged: boolean) => {
        if (dragged) {
          store.set({ marquee: null })
        }
      }
      trackDrag(start, {
        holdText: 'press',
        onMove: move,
        onEnd: (_, dragged) => done(dragged),
        onCancel: done,
      })
    }
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !store.get().drag && !typing(e.target)) {
        store.set({ selection: NO_SELECTION, steps: NO_STEPS, edges: NO_EDGES })
      }
    }
    container.addEventListener('pointerdown', onDown)
    container.addEventListener('keydown', onEscape)
    return () => {
      container.removeEventListener('pointerdown', onDown)
      container.removeEventListener('keydown', onEscape)
    }
  }, [container, active, store])

  const editable = editor !== undefined
  useEffect(() => {
    if (!container || !editable) {
      return
    }
    // Cmd on a Mac and Ctrl elsewhere make the browser copy and paste; the other one is handled here.
    const mac = /Mac|iPhone|iPad/.test(navigator.platform)
    let pointer: Point | null = null
    let pending: number | undefined
    const pasteCopied = () => {
      if (copied) {
        api.paste(copied.text, pointer)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      const busy =
        typing(e.target) ||
        (e.target instanceof Element && !!e.target.closest('[role="dialog"], [role="menu"]'))
      const direction = ARROWS[e.key]
      if (direction && !busy && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (api.nudge(direction)) {
          e.preventDefault()
        }
        return
      }
      if (
        e.key.toLowerCase() === 'e' &&
        !busy &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        api.editSelection()
      ) {
        e.preventDefault()
        return
      }
      if (
        (e.key === 'Delete' || e.key === 'Backspace') &&
        !busy &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey
      ) {
        if (api.deleteSelection()) {
          e.preventDefault()
          // A deleted job or connector takes focus with it; the graph keeps it so shortcuts still land here.
          requestAnimationFrame(() => {
            if (!container.contains(document.activeElement)) {
              container.focus({ preventScroll: true })
            }
          })
        }
        return
      }
      if (!(e.metaKey || e.ctrlKey)) {
        return
      }
      const key = e.key.toLowerCase()
      const native = mac ? e.metaKey : e.ctrlKey
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault()
        forgetSteps(api)
        latest.current.editor?.onUndo()
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault()
        forgetSteps(api)
        latest.current.editor?.onRedo()
      } else if (busy) {
        return
      } else if (key === 'c' && !native) {
        const text = api.copySelection()
        if (text) {
          e.preventDefault()
          navigator.clipboard?.writeText(text).catch(() => {})
        }
      } else if (key === 'v' && !native) {
        e.preventDefault()
        pasteCopied()
      } else if (key === 'v') {
        // Some browsers send no paste event to a graph that holds no text; paste what was copied here.
        window.clearTimeout(pending)
        pending = window.setTimeout(pasteCopied, 100)
      }
    }
    // On the document: a text selection elsewhere on the page would otherwise take a copy meant for the graph.
    const ours = (e: ClipboardEvent) =>
      container.contains(document.activeElement) &&
      !typing(e.target) &&
      !typing(document.activeElement)
    const onCopy = (e: ClipboardEvent) => {
      const text = ours(e) ? api.copySelection() : null
      if (text) {
        e.preventDefault()
        e.clipboardData?.setData('text/plain', text)
      }
    }
    const onPaste = (e: ClipboardEvent) => {
      window.clearTimeout(pending)
      if (!ours(e)) {
        return
      }
      const text = e.clipboardData ? e.clipboardData.getData('text/plain') : copied?.text
      if (text && api.paste(text, pointer)) {
        e.preventDefault()
      }
    }
    const onMove = (e: PointerEvent) => {
      pointer = { x: e.clientX, y: e.clientY }
    }
    const onLeave = () => {
      pointer = null
    }
    // Focus the graph so undo shortcuts reach it rather than the YAML editor.
    const onDown = (e: PointerEvent) => {
      if (!typing(e.target)) {
        container.focus({ preventScroll: true })
      }
    }
    container.addEventListener('keydown', onKey)
    document.addEventListener('copy', onCopy)
    document.addEventListener('paste', onPaste)
    container.addEventListener('pointermove', onMove)
    container.addEventListener('pointerleave', onLeave)
    container.addEventListener('pointerdown', onDown)
    return () => {
      window.clearTimeout(pending)
      container.removeEventListener('keydown', onKey)
      document.removeEventListener('copy', onCopy)
      document.removeEventListener('paste', onPaste)
      container.removeEventListener('pointermove', onMove)
      container.removeEventListener('pointerleave', onLeave)
      container.removeEventListener('pointerdown', onDown)
    }
  }, [container, editable, api])

  return {
    api,
    overlays: (
      <>
        <EditorToolbar api={api} editor={editor} layout={layout} />
        <DragOverlays api={api} container={container} trashRef={trashRef} />
        <EditorDialogs
          api={api}
          editor={editor}
          jobs={source}
          inputs={inputs}
          workflow={workflow}
        />
        {contextMenu}
      </>
    ),
  }
}

function graphShortcuts(t: GraphEditorStrings): ShortcutGroup[] {
  const key = t.shortcutKeys
  const does = t.shortcutDoes
  return [
    {
      title: t.shortcutGroups.select,
      shortcuts: [
        { combos: [[key.shift, key.click]], does: does.select },
        { combos: [[key.shift, key.drag]], does: does.box },
        { combos: [[key.click]], does: does.dependency },
        { combos: [['Tab']], does: does.focus },
        { combos: [[key.shift, key.enter]], does: does.pickJob },
        { combos: [[key.enter]], does: does.pickDependency },
        { combos: [['Esc']], does: does.escape },
      ],
    },
    {
      title: t.shortcutGroups.change,
      shortcuts: [
        { combos: [[key.dragJob]], does: does.move },
        { combos: [[key.dragCircle]], does: does.connect },
        { combos: [[key.dragButton]], does: does.addJob },
        { combos: [['E']], does: does.edit },
        { combos: [['←', '↑', '↓', '→']], does: does.nudge },
        { combos: [[key.delete]], does: does.remove },
        { combos: [[key.rightClick]], does: does.menu },
        {
          combos: [
            [MOD_KEY, 'C'],
            [MOD_KEY, 'V'],
          ],
          does: does.copy,
        },
        {
          combos: [
            [MOD_KEY, 'Z'],
            [key.shift, MOD_KEY, 'Z'],
          ],
          does: does.undo,
        },
      ],
    },
    {
      title: t.shortcutGroups.view,
      shortcuts: [
        { combos: [[key.dragSpace]], does: does.pan },
        { combos: [[key.scroll]], does: does.zoom },
      ],
    },
  ]
}

function EditorToolbar({
  api,
  editor,
  layout,
}: {
  api: GraphEditorApi
  editor: DependencyGraphEditor
  layout: GraphLayout | undefined
}) {
  const t = useGraphEditorStrings()
  const editing = useWorkflowEditing()
  const undoable: DependencyGraphEditor = {
    ...editor,
    onUndo: () => {
      forgetSteps(api)
      editor.onUndo()
    },
    onRedo: () => {
      forgetSteps(api)
      editor.onRedo()
    },
  }
  const chip = (matrix: boolean) => {
    const label = matrix ? t.addMatrixJob : t.addJob
    return (
      <AddChip
        icon={matrix ? <GridIcon className="h-3 w-3" /> : <AddIcon className="h-3 w-3" />}
        label={label}
        hint={matrix ? t.addMatrixJobHint : t.addJobHint}
        className={EDITOR_HANDLE_CLASS}
        onPointerDown={(e) => api.startDrag(e, { kind: 'new', matrix, label })}
        onClick={() => api.addJob(matrix)}
      />
    )
  }
  return (
    <EditorBar
      editor={undoable}
      groups={graphShortcuts(t)}
      className={cx(EDITOR_HANDLE_CLASS, 'absolute bottom-2 right-2 z-10 max-w-[calc(100%-1rem)]')}
    >
      {chip(false)}
      {chip(true)}
      <BarDivider />
      <IconButton
        icon={<RefreshIcon className="h-4 w-4" />}
        label={t.resetLayout}
        size="sm"
        variant="ghost"
        disabled={!editing.hasLayout(layout)}
        onClick={() => editor.onEdit({ type: 'resetLayout' })}
      />
    </EditorBar>
  )
}

function DragOverlays({
  api,
  container,
  trashRef,
}: {
  api: GraphEditorApi
  container: HTMLDivElement | null
  trashRef: RefObject<HTMLDivElement | null>
}) {
  const t = useGraphEditorStrings()
  const drag = useUi(api, (state) => state.drag, null)
  if (!drag || !container) {
    return null
  }
  const rect = container.getBoundingClientRect()
  const overTrash = drag.target?.kind === 'trash'
  const problem = drag.target?.kind === 'steps' ? drag.target.problem : undefined
  return (
    <>
      {drag.payload.kind === 'jobs' && (
        <div
          ref={trashRef}
          className={cx(
            'absolute bottom-2 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-lg border-2 border-dashed px-4 py-2 text-sm',
            overTrash
              ? 'border-(--theme-error) bg-(--theme-error-muted) text-(--theme-error)'
              : 'theme-border bg-(--theme-panel-bg) theme-muted-text',
          )}
        >
          <TrashIcon className="h-4 w-4" />
          {t.dropToDelete}
        </div>
      )}
      {drag.payload.kind !== 'connect' && (
        <DragLabel
          at={{ x: drag.client.x - rect.left, y: drag.client.y - rect.top }}
          text={problem ?? drag.payload.label}
          refused={problem !== undefined}
        />
      )}
    </>
  )
}

function EditorDialogs({
  api,
  editor,
  jobs,
  inputs,
  workflow,
}: {
  api: GraphEditorApi
  editor: DependencyGraphEditor
  jobs: Record<string, unknown>
  inputs: Record<string, unknown> | undefined
  workflow: Record<string, unknown> | undefined
}) {
  const editing = useWorkflowEditing()
  const dialog = useUi(api, (state) => state.dialog, null)
  const close = () => api.store.set({ dialog: null })
  const onEdit = (edit: GraphEdit) => {
    forgetSteps(api)
    editor.onEdit(edit)
  }
  const openOnAdd = openOnAddOf(editor)
  if (!dialog) {
    return null
  }
  // A job or step being added only exists in the dialog's copy of the workflow.
  const copy = dialog.addition ? asRecord(editing.loadYaml(dialog.addition.yml)) : null
  const here = copy ? asRecord(copy['jobs']) : jobs
  const source = dialog.addition?.yml ?? editor.readSource?.()
  if (dialog.kind === 'job') {
    return Object.hasOwn(here, dialog.job) ? (
      <JobDialog
        key={dialog.job}
        job={dialog.job}
        jobs={here}
        inputs={inputs}
        workflow={copy ?? workflow}
        source={source}
        addition={dialog.addition?.edit}
        view={editor.settingsView}
        onViewChange={editor.onSettingsViewChange}
        openOnAdd={openOnAdd}
        onEdit={onEdit}
        onClose={close}
      />
    ) : null
  }
  const steps = stepsOf(here[dialog.job])
  return dialog.index < steps.length ? (
    <StepDialog
      key={`${dialog.job}:${dialog.index}`}
      job={dialog.job}
      index={dialog.index}
      steps={steps}
      inputs={inputs}
      workflow={copy ?? workflow}
      source={source}
      addition={dialog.addition?.edit}
      view={editor.settingsView}
      onViewChange={editor.onSettingsViewChange}
      openOnAdd={openOnAdd}
      usesSuggestions={editor.usesSuggestions ?? []}
      onEdit={onEdit}
      onClose={close}
    />
  ) : null
}

/** The editor's state and overlays for a DependencyGraph, loaded only where a graph is edited. */
export default function GraphEditorOverlays({
  onApi,
  ...inputs
}: Parameters<typeof useGraphEditorState>[0] & {
  /** Hands the graph the editor's api once it's ready, and null when it goes. */
  onApi: (api: GraphEditorApi | null) => void
}) {
  const { api, overlays } = useGraphEditorState(inputs)
  useEffect(() => {
    onApi(api)
    return () => onApi(null)
  }, [api, onApi])
  return overlays
}

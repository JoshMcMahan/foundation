import type { GraphLayout, LaidOutColumn, WorkflowEditing } from '../editing'
import type { MatrixGroup, WorkflowEngine } from '../engine'
import { isJobRecord, type WorkflowJob } from './types'

// Every pass here stays near linear in jobs and needs, so a graph of thousands of jobs lays out in
// milliseconds: nothing compares every job with every other.

/** The jobs a level shows: those an `if` doesn't rule out, with each matrix collapsed into one job. */
export function displayJobsOf(
  engine: WorkflowEngine,
  jobs: Record<string, WorkflowJob>,
  matrixGroups: Record<string, MatrixGroup>,
): Record<string, WorkflowJob> {
  // Collapsing a matrix replaces entries and their `needs`, never what a job holds, so a copy of
  // each job is enough.
  const visibleJobs: Record<string, WorkflowJob> = {}
  for (const [name, job] of Object.entries(jobs)) {
    // An `if` an input decides is false here; one that reads job outputs never is, so it shows.
    if (job.if !== false) {
      visibleJobs[name] = { ...job }
    }
  }
  engine.collapseMatrixGroups(matrixGroups, visibleJobs)
  return visibleJobs
}

// A job's needs, each named once: `build` and `build:any` name one job, which draws one connector.
function namedNeeds(engine: WorkflowEngine, needs: WorkflowJob['needs']): string[] {
  return Array.isArray(needs)
    ? [
        ...new Set(
          needs.map((need) =>
            typeof need === 'string' && engine.editing ? engine.editing.needTarget(need) : need,
          ),
        ),
      ]
    : []
}

// Whether `from` needs `target`, or needs a job that does, on and on. A job that leads to `target`
// sits in a later column than it, so the walk leaves out every job no later than `target`.
function leadsTo(
  from: string,
  target: string,
  needs: Record<string, string[]>,
  column: Map<string, number>,
): boolean {
  const floor = column.get(target) ?? -1
  const seen = new Set([from])
  const stack = [from]
  for (let job = stack.pop(); job !== undefined; job = stack.pop()) {
    for (const need of needs[job] ?? []) {
      if (need === target) {
        return true
      }
      if (!seen.has(need) && (column.get(need) ?? -1) > floor) {
        seen.add(need)
        stack.push(need)
      }
    }
  }
  return false
}

// A job's needs less any another of them already implies, each drawing one connector. Only a need
// in a later column can imply another, so needs all in one column, as most are, cost no walk.
function directNeeds(
  named: string[],
  needs: Record<string, string[]>,
  column: Map<string, number>,
): string[] {
  if (named.length < 2) {
    return named
  }
  const at = (job: string) => column.get(job) ?? -1
  return named
    .filter(
      (dep) =>
        !named.some(
          (other) => other !== dep && at(other) > at(dep) && leadsTo(other, dep, needs, column),
        ),
    )
    .sort()
}

// Each job's column: one past its furthest need, a job without needs first. A need on a hidden job
// doesn't count. A job in a cycle, or after one, has none and isn't drawn. A need another implies
// never sets a column, as the one implying it is later still. Iterative, so a long chain can't
// overflow the stack.
function columnsOf(names: string[], deps: Record<string, string[]>): Map<string, number> {
  const visible = new Set(names)
  const column = new Map<string, number>()
  const seen = new Set<string>()
  for (const start of names) {
    if (seen.has(start)) {
      continue
    }
    seen.add(start)
    const stack: [string, number][] = [[start, 0]]
    while (stack.length > 0) {
      const top = stack[stack.length - 1] as [string, number]
      const [job, next] = top
      const needs = deps[job] ?? []
      const dep = needs[next]
      if (dep !== undefined) {
        top[1] += 1
        if (visible.has(dep) && !seen.has(dep)) {
          seen.add(dep)
          stack.push([dep, 0])
        }
        continue
      }
      stack.pop()
      let at = needs.length === 0 ? 0 : 1
      let placed = true
      for (const need of needs) {
        if (!visible.has(need)) {
          continue
        }
        const needAt = column.get(need)
        if (needAt === undefined) {
          placed = false
          break
        }
        at = Math.max(at, needAt + 1)
      }
      if (placed) {
        column.set(job, at)
      }
    }
  }
  return column
}

// Jobs sharing a slot form one node only when they need, and are needed by, the same jobs, as a
// layout drawn afresh would group them; the rest take the rows below, the largest group staying.
function unitsOnly(columns: LaidOutColumn[], unitOf: (job: string) => string): LaidOutColumn[] {
  return columns.map((col) => {
    const boxes: string[][] = []
    const rows: number[] = []
    let last = -1
    col.boxes.forEach((box, i) => {
      const groups = [...groupBy(box, unitOf).values()]
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

// Jobs by key, each group in the order its first job comes, its jobs in theirs.
function groupBy(jobs: string[], keyOf: (job: string) => string): Map<string, string[]> {
  const groups = new Map<string, string[]>()
  for (const job of jobs) {
    const key = keyOf(job)
    const group = groups.get(key)
    if (group) {
      group.push(job)
    } else {
      groups.set(key, [job])
    }
  }
  return groups
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

export interface ComputedGraphLayout {
  /** Columns of boxes, each box the jobs drawn as one node. */
  dependencyCols: string[][][]
  /** Each box's row; above a box, rows the layout leaves empty stay as space. */
  rowSlots: number[][]
  /** Each column's number; between two drawn columns, numbers skipped stay as space. */
  colSlots: number[]
  /** Each job's needs that draw a connector, sorted. */
  directDeps: Record<string, string[]>
  /** The jobs that need each job directly, sorted. */
  dependents: Record<string, string[]>
  displayJobs: Record<string, WorkflowJob>
}

/** Levels `jobs` into columns of boxes, by their needs or by a stored layout. */
export function computeGraphLayout(
  engine: WorkflowEngine,
  jobs: Record<string, WorkflowJob>,
  matrixGroups: Record<string, MatrixGroup>,
  layout?: GraphLayout,
): ComputedGraphLayout {
  const visibleJobs = displayJobsOf(engine, jobs, matrixGroups)
  const names = Object.keys(visibleJobs)

  const needs: Record<string, string[]> = {}
  for (const name of names) {
    needs[name] = namedNeeds(engine, visibleJobs[name]?.needs)
  }
  const column = columnsOf(names, needs)
  const directDeps: Record<string, string[]> = {}
  for (const name of names) {
    directDeps[name] = directNeeds(needs[name] ?? [], needs, column)
  }
  const dependents: Record<string, string[]> = {}
  for (const name of names) {
    for (const dep of directDeps[name] ?? []) {
      dependents[dep] ??= []
      dependents[dep].push(name)
    }
  }
  for (const list of Object.values(dependents)) {
    list.sort()
  }

  // Jobs share a box when they need, and are needed by, the same jobs: a key equal for exactly those.
  const units = new Map<string, string>()
  const unitOf = (job: string) => {
    let unit = units.get(job)
    if (unit === undefined) {
      unit = `${(directDeps[job] ?? []).join('\u0000')}\u0001${(dependents[job] ?? []).join('\u0000')}`
      units.set(job, unit)
    }
    return unit
  }
  // A matrix node is never grouped with another job.
  const alone = (job: string) => !!visibleJobs[job]?._matrixGroup

  // A stored layout groups jobs by the slot they were put in, and keeps each box's row.
  const editing = engine.editing
  const laidOut =
    layout && editing?.hasLayout(layout)
      ? unitsOnly(
          editing.boxesFromLayout(
            names,
            directDeps,
            withLoneMatrixSlots(editing, layout, visibleJobs, matrixGroups),
            { together: (a, b) => unitOf(a) === unitOf(b), alone },
          ),
          unitOf,
        )
      : null

  let dependencyCols: string[][][]
  if (laidOut) {
    dependencyCols = laidOut.map((col) => col.boxes)
  } else {
    const levels: string[][] = []
    for (const [job, at] of column) {
      levels[at] ??= []
      levels[at].push(job)
    }
    // Within a column, jobs keep the order they're listed in.
    const order = new Map(names.map((name, i) => [name, i]))
    const boxOf = (job: string) => (alone(job) ? `\u0002${job}` : unitOf(job))
    dependencyCols = levels.map((level) => [
      ...groupBy(
        level.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0)),
        boxOf,
      ).values(),
    ])
    // Every job may need another (its needs may name hidden jobs), leaving the first column empty.
    if (dependencyCols[0] === undefined) {
      dependencyCols.shift()
    }
  }

  return {
    dependencyCols,
    rowSlots: laidOut
      ? laidOut.map((col) => col.rows)
      : dependencyCols.map((col) => col.map((_, i) => i)),
    colSlots: laidOut ? laidOut.map((col) => col.column) : dependencyCols.map((_, i) => i),
    directDeps,
    dependents,
    displayJobs: visibleJobs,
  }
}

/** Hops from `job` to each job it leads to or follows from, by breadth-first walks both ways. */
export function hopDistances(
  job: string,
  directDeps: Record<string, string[]>,
  dependents: Record<string, string[]>,
): Map<string, number> {
  const dist = new Map<string, number>([[job, 0]])
  for (const edges of [directDeps, dependents]) {
    const queue = [job]
    for (let i = 0; i < queue.length; i++) {
      const at = queue[i] as string
      const d = (dist.get(at) ?? 0) + 1
      for (const next of edges[at] ?? []) {
        if (!dist.has(next)) {
          dist.set(next, d)
          queue.push(next)
        }
      }
    }
  }
  return dist
}

const isSlot = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0

/** Each job's place on the graph from its `position`; none when no job has one. */
export function positionsOf(jobs: Record<string, unknown>): GraphLayout | undefined {
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

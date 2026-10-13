import { describe, expect, it } from 'vitest'
import { testEngine } from '../test/engine'
import { computeGraphLayout, hopDistances, positionsOf } from './graphLayout'
import { chainJobs, layeredJobs } from './stories/generate'
import type { WorkflowJob } from './types'

const job = (needs?: string[], extra: Record<string, unknown> = {}): WorkflowJob =>
  ({ status: 'completed', steps: [], ...(needs ? { needs } : {}), ...extra }) as WorkflowJob

const layOut = (jobs: Record<string, WorkflowJob>) =>
  computeGraphLayout(testEngine, jobs, testEngine.matrixGroups(jobs))

const asJobs = (jobs: Record<string, unknown>) => jobs as Record<string, WorkflowJob>

// The leveling this module replaced: a pass per column over every job left, grouping a column's jobs
// by comparing each with every other. Slow on large graphs, and the reference for what they draw.
function referenceColumns(jobs: Record<string, WorkflowJob>): string[][][] {
  const names = Object.keys(jobs)
  const all: Record<string, Set<string>> = {}
  for (const name of names) {
    all[name] = testEngine.jobDependencies(name, jobs, all)
  }
  const deps: Record<string, string[]> = {}
  for (const name of names) {
    const own = [...new Set(jobs[name]?.needs ?? [])]
    deps[name] = own
      .filter((dep) => !own.some((other) => other !== dep && all[other]?.has(dep)))
      .sort()
  }
  const dependents: Record<string, string[]> = {}
  for (const name of names) {
    for (const dep of deps[name] ?? []) {
      dependents[dep] ??= []
      dependents[dep].push(name)
    }
  }
  for (const list of Object.values(dependents)) {
    list.sort()
  }
  const unfinished = new Set(names)
  const levels: string[][] = [names.filter((n) => deps[n]?.length === 0)]
  for (const n of levels[0] ?? []) {
    unfinished.delete(n)
  }
  let before: number
  do {
    const pending = new Set(unfinished)
    before = pending.size
    const level = [...pending].filter((n) => (deps[n] ?? []).every((d) => !pending.has(d)))
    for (const n of level) {
      unfinished.delete(n)
    }
    if (level.length > 0) {
      levels.push(level)
    }
  } while (before !== unfinished.size)
  const same = (a: string[] | undefined, b: string[] | undefined) =>
    (a ?? []).join('\0') === (b ?? []).join('\0')
  const cols = levels.map((level) => {
    const boxes: string[][] = []
    for (const n of level) {
      const box = boxes.find(
        ([head = '']) => same(deps[head], deps[n]) && same(dependents[head], dependents[n]),
      )
      if (box) {
        box.push(n)
      } else {
        boxes.push([n])
      }
    }
    return boxes
  })
  return cols[0]?.length === 0 ? cols.slice(1) : cols
}

describe('computeGraphLayout', () => {
  it('puts each job one column past its furthest need', () => {
    const { dependencyCols } = layOut({
      a: job(),
      b: job(['a']),
      c: job(['a', 'b']),
      d: job(['c']),
    })
    expect(dependencyCols).toEqual([[['a']], [['b']], [['c']], [['d']]])
  })

  it('draws no connector for a need another need already implies', () => {
    const { directDeps } = layOut({ a: job(), b: job(['a']), c: job(['a', 'b']) })
    expect(directDeps['c']).toEqual(['b'])
  })

  it('names a need with a condition once, by its job', () => {
    const { directDeps } = layOut({ a: job(), b: job(['a', 'a:any']) })
    expect(directDeps['b']).toEqual(['a'])
  })

  it('boxes the jobs of a column that need, and are needed by, the same jobs', () => {
    const { dependencyCols, dependents } = layOut({
      a: job(),
      x: job(['a']),
      y: job(['a']),
      z: job(['a']),
      w: job(['x']),
    })
    expect(dependencyCols[1]).toEqual([['x'], ['y', 'z']])
    expect(dependents['a']).toEqual(['x', 'y', 'z'])
  })

  it('never boxes a matrix with another job', () => {
    const jobs = asJobs({
      a: job(),
      run_0: job(['a'], { _matrix: { originaljob: 'run', index: 0, totalingroup: 2 } }),
      run_1: job(['a'], { _matrix: { originaljob: 'run', index: 1, totalingroup: 2 } }),
      other: job(['a']),
    })
    expect(layOut(jobs).dependencyCols[1]).toEqual([['run'], ['other']])
  })

  it('leaves out a job an `if` rules out, and starts a job whose needs are all hidden second', () => {
    const { dependencyCols } = layOut(
      asJobs({ gone: job(undefined, { if: false }), b: job(['gone']) }),
    )
    expect(dependencyCols).toEqual([[['b']]])
  })

  it('leaves out jobs in a cycle and those after it', () => {
    const { dependencyCols } = layOut({
      a: job(),
      b: job(['c']),
      c: job(['b']),
      d: job(['b']),
    })
    expect(dependencyCols).toEqual([[['a']]])
  })

  it('leaves out a job needing two jobs of a cycle, without walking it forever', () => {
    const { dependencyCols, directDeps } = layOut({
      a: job(),
      b: job(['c']),
      c: job(['b']),
      d: job(['b', 'c', 'a']),
    })
    expect(dependencyCols).toEqual([[['a']]])
    expect(directDeps['d']).toEqual(['a', 'b', 'c'])
  })

  it('draws no connector for a need implied through a long chain, or through a hidden job', () => {
    const chain = Object.fromEntries(
      Array.from({ length: 50 }, (_, i) => [`c${i}`, job(i ? [`c${i - 1}`] : undefined)]),
    )
    const { directDeps } = layOut({ ...chain, end: job(['c0', 'c49', 'c25']) })
    expect(directDeps['end']).toEqual(['c49'])
    const hidden = layOut(
      asJobs({ h: job(undefined, { if: false }), x: job(['h']), y: job(['h', 'x']) }),
    )
    expect(hidden.directDeps['y']).toEqual(['x'])
  })

  it('leaves the jobs it was given as they were', () => {
    const jobs = asJobs({
      run_0: job(undefined, { _matrix: { originaljob: 'run', index: 0, totalingroup: 2 } }),
      run_1: job(undefined, { _matrix: { originaljob: 'run', index: 1, totalingroup: 2 } }),
      merge: job(['run_0', 'run_1']),
    })
    layOut(jobs)
    expect(jobs['merge']?.needs).toEqual(['run_0', 'run_1'])
  })

  it('lays out as the leveling it replaced did, on graphs of every shape', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const jobs = asJobs(layeredJobs(20 + seed * 7, { columns: 2 + (seed % 9), seed }))
      expect(layOut(jobs).dependencyCols).toEqual(referenceColumns(jobs))
    }
  })

  it('lays out as it did with needs across columns, on hidden jobs, and listed out of order', () => {
    for (let seed = 1; seed <= 40; seed++) {
      let state = seed
      const random = () => {
        state = (state * 48271) % 2147483647
        return state / 2147483647
      }
      const count = 10 + seed * 3
      const names = Array.from({ length: count }, (_, i) => `j${i}`)
      const jobs: Record<string, WorkflowJob> = {}
      // Listed shuffled, each job needing up to four of those before it in name order.
      for (const i of [...names.keys()].sort(() => random() - 0.5)) {
        const needs = Array.from({ length: Math.floor(random() * 5) }, () =>
          i > 0 ? `j${Math.floor(random() * i)}` : '',
        ).filter(Boolean)
        jobs[`j${i}`] = job(needs, random() < 0.1 ? { if: false } : {})
      }
      const visible = Object.fromEntries(Object.entries(jobs).filter(([, j]) => j.if !== false))
      expect(layOut(jobs).dependencyCols).toEqual(referenceColumns(visible))
    }
  })

  it('lays out thousands of jobs, and a chain too long to recurse along', () => {
    const wide = layOut(asJobs(layeredJobs(5000, { columns: 40 })))
    expect(wide.dependencyCols).toHaveLength(40)
    const long = layOut(asJobs(chainJobs(20000)))
    expect(long.dependencyCols).toHaveLength(20000)
  })

  // Eight times the jobs take twelve to fourteen times as long (more than eight, as the larger graphs
  // outgrow the caches), and would take sixty-four if the work grew with their square; the bound sits
  // between. Measured in the CPU time this process spends, which other work on a busy machine doesn't
  // add to as it does to the time on the clock, and the fastest of a few runs leaves out a collection.
  it.each([
    ['a wide graph', (n: number) => layeredJobs(n, { columns: 40 })],
    ['a square graph', (n: number) => layeredJobs(n, { columns: Math.round(Math.sqrt(n)) })],
    ['a chain', (n: number) => chainJobs(n)],
  ])('takes time in step with the jobs it lays out: %s', (_, make) => {
    const small = asJobs(make(2000))
    const large = asJobs(make(16000))
    const time = (jobs: Record<string, WorkflowJob>) => {
      const start = process.cpuUsage()
      layOut(jobs)
      const { user, system } = process.cpuUsage(start)
      return user + system
    }
    time(small)
    time(large)
    let fastestSmall = Number.POSITIVE_INFINITY
    let fastestLarge = Number.POSITIVE_INFINITY
    for (let run = 0; run < 7; run++) {
      fastestSmall = Math.min(fastestSmall, time(small))
      fastestLarge = Math.min(fastestLarge, time(large))
    }
    expect(fastestLarge / fastestSmall).toBeLessThan(30)
  })
})

describe('hopDistances', () => {
  it('counts hops to every job before and after, and none to the rest', () => {
    const { directDeps, dependents } = layOut({
      a: job(),
      b: job(['a']),
      c: job(['b']),
      d: job(['c']),
      side: job(['a']),
    })
    expect(Object.fromEntries(hopDistances('b', directDeps, dependents))).toEqual({
      a: 1,
      b: 0,
      c: 1,
      d: 2,
    })
  })
})

describe('positionsOf', () => {
  it('reads each job’s position, a matrix run’s under its job', () => {
    expect(
      positionsOf({
        a: { position: { column: 1, row: 2 } },
        run_0: { _matrix: { originaljob: 'run' }, position: { column: 0, row: 0 } },
        bad: { position: { column: -1, row: 0 } },
      }),
    ).toEqual({ a: { column: 1, row: 2 }, run: { column: 0, row: 0 } })
    expect(positionsOf({ a: {} })).toBeUndefined()
  })
})

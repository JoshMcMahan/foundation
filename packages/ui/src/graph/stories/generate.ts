/** A job as a workflow's YAML holds it, for graphs built to size. */
export interface GeneratedJob {
  needs?: string[]
  steps: { name: string; run?: string; subworkflow?: { jobs: Record<string, GeneratedJob> } }[]
}

// The same numbers on every run, so a story or test of a generated graph draws it the same way.
function seeded(seed: number) {
  let state = seed
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff
    return state / 0x7fffffff
  }
}

/**
 * `count` jobs in `columns` columns, each job after the first column needing one to three jobs of the
 * column before it, as a large fan-out workflow does.
 */
export function layeredJobs(
  count: number,
  {
    columns = 30,
    seed = 7,
    prefix = 'job',
  }: { columns?: number; seed?: number; prefix?: string } = {},
): Record<string, GeneratedJob> {
  const random = seeded(seed)
  const width = Math.max(1, Math.ceil(count / columns))
  const jobs: Record<string, GeneratedJob> = {}
  for (let i = 0; i < count; i++) {
    const column = Math.floor(i / width)
    const needs =
      column === 0
        ? undefined
        : [
            ...new Set(
              Array.from(
                { length: 1 + Math.floor(random() * 3) },
                () => `${prefix}_${column - 1}_${Math.floor(random() * width)}`,
              ),
            ),
          ]
    jobs[`${prefix}_${column}_${i % width}`] = {
      ...(needs ? { needs } : {}),
      steps: [{ name: 'run', run: `./run.sh ${i}` }],
    }
  }
  return jobs
}

/** `count` jobs, each needing the one before it. */
export function chainJobs(count: number): Record<string, GeneratedJob> {
  const jobs: Record<string, GeneratedJob> = {}
  for (let i = 0; i < count; i++) {
    jobs[`step_${i}`] = {
      ...(i > 0 ? { needs: [`step_${i - 1}`] } : {}),
      steps: [{ name: 'run', run: `./run.sh ${i}` }],
    }
  }
  return jobs
}

/**
 * A layered graph of `perLevel` jobs whose every `every`-th job runs a subworkflow of the same
 * shape, `depth` levels down.
 */
export function nestedJobs(
  depth: number,
  perLevel: number,
  every = 5,
  prefix = 'job',
): Record<string, GeneratedJob> {
  const jobs = layeredJobs(perLevel, {
    columns: Math.max(2, Math.round(Math.sqrt(perLevel))),
    seed: depth + 1,
    prefix,
  })
  if (depth === 0) {
    return jobs
  }
  Object.values(jobs).forEach((job, i) => {
    if (i % every === 0) {
      job.steps.push({
        name: 'nested',
        subworkflow: { jobs: nestedJobs(depth - 1, perLevel, every, `${prefix}${i}`) },
      })
    }
  })
  return jobs
}

/** Every job of `jobs`, its subworkflows' with it. */
export function countJobs(jobs: Record<string, GeneratedJob>): number {
  return Object.values(jobs).reduce(
    (total, job) =>
      total +
      1 +
      job.steps.reduce(
        (sub, step) => sub + (step.subworkflow ? countJobs(step.subworkflow.jobs) : 0),
        0,
      ),
    0,
  )
}

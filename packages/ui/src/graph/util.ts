import type { WorkflowJob } from './types'

/** A job as people read it: `run_tests` is "Run tests", a matrix member "Build (2/4)". */
export function jobLabel(jobName: string, job?: WorkflowJob): string {
  const matrix = job?._matrix
  if (matrix?.originaljob) {
    return `${capitalize(matrix.originaljob)} (${(matrix.index ?? 0) + 1}/${matrix.totalingroup ?? '?'})`
  }
  return capitalize(jobName).replace(/_/g, ' ')
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** A copy of `set` with `key` added, or removed if it was there. */
export function toggled<T>(set: Set<T>, key: T): Set<T> {
  const next = new Set(set)
  if (!next.delete(key)) {
    next.add(key)
  }
  return next
}

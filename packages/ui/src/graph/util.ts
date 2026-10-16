import type { WorkflowJob } from './types'

/** How far below a node's top edge its connectors meet it, level with its first job. */
export const NODE_CONNECTOR_Y = 37

/** A job as people read it: `run_tests` is "Run tests", a matrix member "Build (2/4)". */
export function jobLabel(jobName: string, job?: Pick<WorkflowJob, '_matrix'>): string {
  const matrix = job?._matrix
  if (matrix?.originaljob && matrix.totalingroup !== 1) {
    return `${capitalize(matrix.originaljob)} (${(matrix.index ?? 0) + 1}/${matrix.totalingroup ?? '?'})`
  }
  // A matrix that made one job is named as that job.
  return capitalize(matrix?.originaljob ?? jobName).replace(/_/g, ' ')
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

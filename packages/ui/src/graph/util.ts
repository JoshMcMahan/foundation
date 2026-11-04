import { humanizeKey } from '../form/utils/humanizeKey'
import type { WorkflowJob } from './types'

/** How far below a node's top edge its connectors meet it, level with its first job. */
export const NODE_CONNECTOR_Y = 37

/** A job as people read it: `run_tests` is "Run tests", `buildImage` "Build image", a matrix
 *  member "Build (2/4)". A job's name is one name, so any dots in it stay part of the label. */
export function jobLabel(jobName: string, job?: Pick<WorkflowJob, '_matrix'>): string {
  const matrix = job?._matrix
  if (matrix?.originaljob && matrix.totalingroup !== 1) {
    return `${humanizeKey(matrix.originaljob, { path: false })} (${(matrix.index ?? 0) + 1}/${matrix.totalingroup ?? '?'})`
  }
  // A matrix that made one job is named as that job.
  return humanizeKey(matrix?.originaljob ?? jobName, { path: false })
}

/** A copy of `set` with `key` added, or removed if it was there. */
export function toggled<T>(set: Set<T>, key: T): Set<T> {
  const next = new Set(set)
  if (!next.delete(key)) {
    next.add(key)
  }
  return next
}

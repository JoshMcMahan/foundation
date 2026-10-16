import type { MatrixGroup, RunStatus } from '../engine'

export interface WorkflowSubworkflow {
  jobs?: Record<string, WorkflowJob>
  image?: string
  type?: string
  /** Browsable page for the referenced workflow, resolved server-side. */
  sourceUrl?: string
}

/** A run page link: something the workflow makes for itself, by endpoint name or by address. */
export interface RunLink {
  endpoint?: string | undefined
  url?: string | undefined
}

interface WorkflowAnnotation {
  type?: 'error' | 'warning' | 'notice'
  message?: string
  title?: string
  file?: string
  line?: number
  id?: string
}

export interface WorkflowStep {
  name?: string
  status: RunStatus
  run?: string
  uses?: string
  image?: string
  cleanup?: string
  linkedStep?: string
  startedAt?: string
  completedAt?: string
  annotations?: WorkflowAnnotation[]
  summary?: { bytes: number }
  subworkflow?: WorkflowSubworkflow | undefined
}

interface WorkflowMatrixMeta {
  originaljob: string
  index: number
  totalingroup: number
  groupjobs: string[]
  values: Record<string, unknown>
  failfast: boolean
  maxparallel: number
}

export interface WorkflowJob {
  status: RunStatus
  steps: WorkflowStep[]
  cleanup?: WorkflowStep[]
  needs?: string[]
  if?: boolean | string
  startedAt?: string
  completedAt?: string
  _matrix?: WorkflowMatrixMeta
  _matrixGroup?: MatrixGroup
}

export function isJobRecord(value: unknown): value is Record<string, WorkflowJob> {
  return typeof value === 'object' && value !== null
}

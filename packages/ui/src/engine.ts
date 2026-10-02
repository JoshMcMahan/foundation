export type RunStatus =
  | 'started'
  | 'running'
  | 'completed'
  | 'error'
  | 'failed'
  | 'canceled'
  | 'skipped'
  | 'faulted'
  | 'canceling'
  | 'skipped-failed'
  | ''
  | undefined

export interface MatrixGroup {
  originaljob: string
  members: string[]
}

export interface LogSegment {
  content: string
  className: string
  highlighted?: boolean
}

export interface LogCommand {
  type: 'error' | 'warning' | 'notice' | 'debug' | 'group' | 'endgroup'
  message: string
  params?: Record<string, string>
}

export interface ProcessedLogLine {
  index: number
  segments: LogSegment[]
  command?: LogCommand
  groupDepth: number
  groupId?: number
}

export interface WorkflowVariable {
  key?: string
  value?: string | null
  secret?: boolean
}

export type WorkflowVariables = Record<string, WorkflowVariable>

export interface EvaluateOptions<T> {
  inputs: unknown
  obj: T
  path?: string[]
  schema?: unknown
  orgVars?: WorkflowVariables | undefined
  userVars?: Record<string, string>
  remoteVars?: Record<string, string | undefined> | undefined
  secretKeys?: string[]
  appInfo?: Record<string, unknown>
  sessionInfo?: Record<string, string>
  index?: number | undefined
}

export interface ExpansionKeys {
  subworkflowKeys: string[]
  jobKeys: string[]
  matrixKeys: string[]
}

export interface EngineJob {
  status?: RunStatus
  needs?: string[]
  if?: boolean | string
  steps?: unknown[]
  _matrix?: { originaljob?: string; index?: number }
  _matrixGroup?: MatrixGroup
}

export interface EngineStep {
  name?: string | undefined
  run?: string
  uses?: string
  subworkflow?: unknown
}

/** The workflow semantics the form, graph, editor and log viewer defer to. */
export interface WorkflowEngine {
  /** Starts loading the expression runtime; safe to call repeatedly. */
  init(): void
  isReady(): boolean
  /** Calls back when readiness changes; returns an unsubscribe function. */
  onReady(listener: (ready: boolean) => void): () => void
  /** Resolves every `${{ }}` expression in `obj`. */
  evaluate<T>(options: EvaluateOptions<T>): T
  /** Turns a workflow's input definitions into the form's field tree. */
  convertInputs(inputs: Record<string, unknown>): Record<string, unknown>
  inputDependencies(obj: unknown): {
    inputDeps: Set<string>
    hasExpressions: boolean
  }
  jobDependencies(
    jobName: string,
    jobs: Record<string, { needs?: string[] }>,
    memo?: Record<string, Set<string>>,
  ): Set<string>
  matrixGroups(jobs: Record<string, EngineJob> | undefined): Record<string, MatrixGroup>
  /** Rewrites `visibleJobs` in place so each matrix group lays out as one node. */
  collapseMatrixGroups(
    groups: Record<string, MatrixGroup>,
    visibleJobs: Record<string, EngineJob>,
  ): void
  expansionKeys(jobs: Record<string, EngineJob> | undefined, pathPrefix?: string): ExpansionKeys
  matrixStatus(statuses: RunStatus[]): {
    aggStatus: RunStatus
    statusLabel: string
  }
  stepLabel(step: EngineStep, index?: number): string
  stepLogPath(subworkflowPrefix: string, jobName: string, stepIndex: number | string): string
  isRunActive(status: string | null | undefined): boolean
  processLogLines(
    lines: { index: number; segments: LogSegment[] }[],
    rawLines: string[],
  ): ProcessedLogLine[]
  toYaml(value: unknown): string
}

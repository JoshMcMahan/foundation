// The workflow model the visual editor edits, owned here so the package never imports the host's
// workflow implementation. The names match the functions a host passes as `WorkflowEngine['editing']`.

/** A job's slot on the dependency graph's column/row grid. */
export interface GraphPosition {
  column: number
  row: number
}

/** Job name to grid slot, as stored on a workflow. */
export type GraphLayout = Record<string, GraphPosition>

/** Where a dragged job lands; `insertColumn` opens a new column at `column`. */
export interface GraphSlot {
  column: number
  row: number
  insertColumn?: boolean
}

/** One entry of a job's `needs` list. */
export interface NeedRef {
  job: string
  need: string
}

export type NudgeDirection = 'up' | 'down' | 'left' | 'right'

/** One column's boxes, top to bottom, the row each box sits in, and the column's number. */
export interface LaidOutColumn {
  boxes: string[][]
  rows: number[]
  column: number
}

/** A step by its job and its index in that job's `steps`. */
export interface StepRef {
  job: string
  index: number
}

/** A matrix variable: a list of values, or a `${{ }}` expression string. */
export type MatrixVariable = [name: string, values: unknown[] | string]

/** Keys to write (a null value writes YAML null) and keys to remove. */
export interface FieldPatch {
  set?: Record<string, unknown>
  unset?: string[]
}

/** Keys from the workflow's inputs down to an input, through groups, lists and steps. */
export type InputPath = string[]

export type InputEdit =
  | {
      type: 'addInput'
      parent: InputPath
      /** Position among the container's inputs; appends when omitted. */
      index?: number
      /** Generated when omitted. */
      name?: string
      definition: Record<string, unknown>
    }
  | { type: 'deleteInput'; path: InputPath }
  /** Inputs, kept in form order, moved together to one place. */
  | { type: 'moveInputs'; paths: InputPath[]; parent: InputPath; index: number }
  | { type: 'duplicateInput'; path: InputPath }
  | ({ type: 'updateInput'; path: InputPath; name?: string } & FieldPatch)
  /** Replaces an input's settings with YAML text, as its YAML editor writes them. */
  | { type: 'setInputYaml'; path: InputPath; yaml: string }
  | ({
      type: 'updateWorkflow'
      /** Changes to the input form's `$meta`, in the same undo step. */
      inputsMeta?: FieldPatch
    } & FieldPatch)

export type GraphEdit =
  /** `anchor` lands in `to`; the other jobs keep their offsets from it. */
  | { type: 'move'; jobs: string[]; to: GraphSlot; layout: GraphLayout; anchor?: string }
  | { type: 'addJob'; matrix?: boolean; to?: GraphSlot; layout?: GraphLayout }
  | { type: 'deleteJob'; jobs: string[] }
  | { type: 'renameJob'; from: string; to: string }
  | { type: 'duplicateJob'; job: string; layout?: GraphLayout }
  | { type: 'connect'; from: string; to: string }
  /** `jobs` and what depends on them move right of their needs; `layout` is the grid as drawn. */
  | { type: 'placeAfterNeeds'; jobs: string[]; layout?: GraphLayout }
  /** Moves `jobs` left of what needs them; `dependents` gained a need and may leave their node. */
  | { type: 'placeBeforeDependents'; jobs: string[]; dependents: string[]; layout?: GraphLayout }
  /** Jobs join `into`'s node: they take its slot and a copy of its needs. */
  | { type: 'groupJobs'; jobs: string[]; into: string; layout: GraphLayout }
  | { type: 'disconnect'; needs: NeedRef[] }
  | { type: 'setNeedAny'; jobs: string[]; dep: string; any: boolean }
  | { type: 'setMatrix'; job: string; variables: MatrixVariable[] | null }
  | { type: 'addStep'; job: string }
  | { type: 'deleteStep'; job: string; index: number }
  | { type: 'renameStep'; job: string; index: number; name: string }
  | { type: 'moveStep'; job: string; from: number; to: number }
  /** Steps, in order, to insertion point `index` of `job` (an index into its steps before the move). */
  | { type: 'moveSteps'; steps: StepRef[]; job: string; index: number }
  /** The steps in `yaml`, a list as stepsYaml writes it, inserted at `index` of `job`. */
  | { type: 'pasteSteps'; yaml: string; job: string; index: number }
  /** The jobs in `yaml`, as jobsYaml writes it, added as new jobs; each lands at `to` plus its offset. */
  | {
      type: 'pasteJobs'
      yaml: string
      to?: GraphSlot
      offsets?: Record<string, GraphPosition>
      layout?: GraphLayout
    }
  /** Jobs one slot over, as the arrow keys move them. */
  | { type: 'nudge'; jobs: string[]; direction: NudgeDirection; layout: GraphLayout }
  | ({ type: 'updateJob'; job: string; name?: string } & FieldPatch)
  | ({ type: 'updateStep'; job: string; index: number } & FieldPatch)
  /** Replaces a job's or step's settings with YAML text, as its YAML editor writes them. */
  | { type: 'setJobYaml'; job: string; yaml: string }
  | { type: 'setStepYaml'; job: string; index: number; yaml: string }
  /** Replaces the workflow's own settings, everything but its jobs and trigger, with YAML text. */
  | { type: 'setSettingsYaml'; yaml: string }
  | { type: 'resetLayout' }
  | InputEdit
  /** Several edits as one undo step, such as a new input and the field that reads it. */
  | { type: 'batch'; edits: GraphEdit[] }

export interface GraphEditState {
  yml: string
  layout: GraphLayout | undefined
}

export interface GraphEditResult extends GraphEditState {
  /** Name of the job or input the edit created, if any. */
  created?: string
  /** The jobs a paste added, in order. */
  createdJobs?: string[]
  /** Where moved or pasted steps now sit. */
  steps?: StepRef[]
}

/** A step as a refusal names it: by its name, or by where it sits when it has none. */
export type RefusedStep = { name: string } | { job: string; index: number }

/** Why the workflow can't take an edit, by code, so the editor can say it in the reader's language. */
export type EditRefusalReason =
  | { code: 'cycle'; job: string; need: string }
  | { code: 'needRead'; job: string; need: string }
  | { code: 'columnRead'; job: string; need: string }
  | { code: 'stepReadsNeed'; step: RefusedStep; need: string; job: string }
  | { code: 'stepReadsStep'; step: RefusedStep; id: string; job: string }
  | { code: 'stepReadsMatrix'; step: RefusedStep; variable: string; job: string }
  | { code: 'stepLeftBehind'; job: string; id: string; target: string }
  | { code: 'jobNameInvalid' }
  | { code: 'jobNameTaken'; name: string }
  | { code: 'inputNameInvalid' }
  | { code: 'inputNameTaken'; name: string }
  | { code: 'inputIntoItself' }
  | { code: 'needsExpression' }
  | { code: 'matrixExpression' }
  | { code: 'inputsExpression'; name: string }
  | { code: 'notAGroup'; name: string }
  | { code: 'noStepsToPaste' }
  | { code: 'noJobsToPaste' }
  | { code: 'notASetting'; key: string }

/** A "did you mean": `replace` for each reference to `find` in the value, or, with `key`, the key's new name. */
export interface LintFix {
  find: string
  replace: string
  key: boolean
}

/** One problem a workflow's schema can't catch, such as a need read but never listed. */
export interface WorkflowLintProblem {
  path: string
  message: string
  line: number
  fix?: LintFix
}

/** What the checks can't work out from the document: `uses` targets' inputs, and secret variable names. */
export interface WorkflowLintContext {
  usesInputs?: Record<string, unknown>
  secretVars?: string[]
}

export type SettingsYamlProblem = { kind: 'syntax'; message: string } | { kind: 'notMap' }

/** A key or list index on the way down to a YAML node. */
export type YamlSegment = string | number

type UnknownRecord = Record<string, unknown>

/** One input a built-in action takes in its step's `with`, labelled in the reader's language. */
export interface WorkflowActionInput {
  key: string
  kind: 'text' | 'textarea' | 'number' | 'any' | 'list' | 'bool' | 'choice' | 'flags' | 'target'
  label: string
  description: string
  required?: boolean | undefined
  choices?: string[] | undefined
  /** A `${{ }}` expression also stands in for a choice. */
  expression?: boolean | undefined
  /** Inputs of these types, or their `suffix` property, can fill this one in. */
  refTypes?: string[] | undefined
  suffix?: string | undefined
  /** What a `bool` left unset means. */
  fallback?: boolean | undefined
  /** A `target` input's own keys. */
  fields?: { key: string; label: string; description: string }[] | undefined
}

/** A built-in action a step can use, keyed by its `uses` value in `UIData['workflowActions']`. */
export interface WorkflowAction {
  /** What it does, shown beside it where it's picked. */
  description: string
  inputs: WorkflowActionInput[]
}

/**
 * The workflow editing the visual editor defers to: reading and rewriting the workflow's YAML,
 * its graph layout and its checks. A host built on a workflow package can pass that package's
 * functions of the same names.
 */
export interface WorkflowEditing {
  loadYaml: (text: string) => unknown
  dumpYaml: (data: unknown) => string
  /** Applies one edit to the workflow's text and layout; throws `EditRefusal` when it can't. */
  applyGraphEdit: (state: GraphEditState, edit: GraphEdit) => GraphEditResult
  /** `edits` as one undo step: the edit itself when there is one, nothing when there are none. */
  batchOf: (edits: GraphEdit[]) => GraphEdit | null
  /** What an edit throws when the workflow can't take it, so the reason can be told. */
  EditRefusal: abstract new (
    reason: EditRefusalReason,
  ) => Error & { readonly reason: EditRefusalReason }
  /** The English wording of a refusal. */
  refusalMessage: (reason: EditRefusalReason) => string
  /** Each job's `needs` entries; expression-valued needs count as none. */
  jobNeeds: (jobs: unknown) => Record<string, string[]>
  /** Whether `from` already depends on `to`, directly or through other jobs. */
  dependsOn: (needs: Record<string, string[]>, from: string, to: string) => boolean
  /** The first of `refs` an expression in its job reads, so cutting it would break the read. */
  needInUse: (jobs: Record<string, unknown>, refs: NeedRef[]) => NeedRef | undefined
  /** The job a `needs` entry points at, without a matrix's wait-for-any suffix. */
  needTarget: (need: string) => string
  isValidJobName: (name: string) => boolean
  jobYaml: (text: string, job: string) => string
  jobsYaml: (text: string, jobs: string[]) => string
  stepYaml: (text: string, job: string, index: number) => string
  stepsYaml: (text: string, refs: StepRef[]) => string
  /** What a pasted snippet holds: jobs, steps, or neither. */
  snippetKind: (snippet: string) => 'jobs' | 'steps' | undefined
  /** Why moving `refs` into `job` would leave an expression reading something that isn't there. */
  stepMoveProblem: (text: string, refs: StepRef[], job: string) => EditRefusalReason | undefined
  /** A job's matrix variables; null when the matrix is an expression, which may hold any. */
  matrixNames: (job: unknown) => Set<string> | null
  /** Jobs whose matrix runs more than once as `<job>-<n>` members, the way a run lists them. */
  expandMatrixJobs: <T>(jobs: Record<string, T>) => Record<string, T>
  hasLayout: (layout: GraphLayout | undefined) => boolean
  layoutPosition: (layout: GraphLayout | undefined, job: string) => GraphPosition | undefined
  mapLayout: (
    layout: GraphLayout,
    fn: (position: GraphPosition, job: string) => GraphPosition | undefined,
  ) => GraphLayout
  /** Boxes and rows from a stored layout; jobs without a slot go below, grouped when `together` says. */
  boxesFromLayout: (
    jobNames: string[],
    deps: Record<string, string[]>,
    layout: GraphLayout,
    rules: { together: (a: string, b: string) => boolean; alone: (job: string) => boolean },
  ) => LaidOutColumn[]
  /** The grid as drawn, as a layout to store. */
  layoutFromCols: (
    dependencyCols: string[][][],
    previous?: GraphLayout,
    rows?: number[][],
    columns?: number[],
  ) => GraphLayout
  /** Where moved jobs land, and the needs the move would cut. */
  moveJobs: (
    layout: GraphLayout,
    needs: Record<string, string[]>,
    jobs: string[],
    slot: GraphSlot,
    anchor?: string | undefined,
  ) => { layout: GraphLayout; cuts: NeedRef[] }
  /** Where an input of this type keeps the inputs it holds, if it holds any. */
  inputChildrenKey: (type: unknown) => string | undefined
  isValidInputName: (name: string) => boolean
  newInputName: (existing: Iterable<string>) => string
  /** The name an `addJob` edit gives the job it adds. */
  newJobName: (existing: Iterable<string>) => string
  /** `base`, or `base_2`, `base_3`… when it's taken. */
  nextName: (taken: Iterable<string>, base: string) => string
  /** The first of `candidate(1)`, `candidate(2)`… that `taken` doesn't hold. */
  freeName: (taken: Iterable<string>, candidate: (n: number) => string) => string
  inputYaml: (text: string, path: InputPath) => string
  /** Whether a wizard's steps put their fields at the top level of the inputs. */
  wizardFlattens: (schema: UnknownRecord) => boolean
  /** The input definitions of a parsed workflow. */
  workflowInputsSchema: (workflow: UnknownRecord | undefined | null) => UnknownRecord | undefined
  /** The workflow's own settings as YAML: everything but its jobs and trigger. */
  settingsYaml: (text: string) => string
  /** What's wrong with YAML text written as a job's, step's or input's settings, if anything. */
  settingsYamlProblem: (snippet: string) => SettingsYamlProblem | undefined
  /** The first and last 1-based line of the node at `path`, its key included. */
  linesAt: (text: string, path: YamlSegment[]) => { start: number; end: number } | undefined
  /** `value` with each whole reference to `find` replaced by `replace`. */
  replaceReference: (value: string, find: string, replace: string) => string
  /** The workflow's problems its schema can't catch; none until the checks have loaded. */
  lintWorkflow: (yaml: string, context?: WorkflowLintContext) => WorkflowLintProblem[]
  /** Form definitions for picking a workflow file from a repository. */
  WORKFLOW_FORMS: { github: UnknownRecord }
}

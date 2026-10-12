import cx from 'classnames'
import { type ReactNode, useId, useMemo, useRef, useState } from 'react'
import { IconButton } from '../components/IconButton'
import { fieldBoxClasses, Input } from '../components/Input'
import { withPositionKeys } from '../components/keys'
import { useWorkflowActions, useWorkflowEditing } from '../components/Provider'
import type { GraphEdit, WorkflowEditing } from '../editing'
import { useLintContext, useLintEditing } from '../editor/lintContext'
import type { NestedWorkflowText } from '../editor/nestedText'
import { JOB_YAML_PATH, STEP_YAML_PATH } from '../editor/settingsYaml'
import { ArrowDownIcon, ArrowUpIcon, CloseIcon, TrashIcon } from '../icons'
import {
  AddRowButton,
  asRecord,
  ChoiceButtons,
  conditionText,
  countError,
  DialogShell,
  type DialogShellProps,
  diffPatch,
  durationError,
  ENV_KEY,
  EXPRESSION,
  ExpressionToggle,
  expressionError,
  FieldError,
  FieldLabel,
  type Flag,
  flagError,
  flagOf,
  isEmptyPatch,
  isScalar,
  type Json,
  KeyValueEditor,
  LabelledField,
  labelled,
  type OpenOnAdd,
  orUndefined,
  parseCondition,
  parseCount,
  parseJson,
  parseScalar,
  type Row,
  removeAt,
  rowsError,
  rowsFrom,
  rowsTo,
  Section,
  SectionMemory,
  type Strings,
  sameValue,
  ToggleField,
  text,
  unchangedValue,
  updateAt,
  useSectionMemory,
} from './editorFields'
import { useGraphEditorStrings } from './editorStrings'
import { expressionRefs } from './expressionRefs'
import {
  FieldProblems,
  LintScope,
  ProblemList,
  type ScopedProblem,
  useFieldProblems,
} from './fieldProblems'
import { useNewInputs } from './InputDialog'
import {
  ConditionField,
  FlagField,
  InputRefSelect,
  type InputSource,
  readRef,
  refExpression,
  refSuggestions,
  ScriptField,
  ValueOrInputField,
} from './inputRefs'
import { editErrorText } from './refusalText'
import {
  NO_SCOPED,
  type ScopedProblems,
  type SettingsView,
  ViewSwitch,
  YamlPane,
  yamlProblem,
} from './settingsViews'
import { UsesPicker, usesKind, WithEditor, withDraftFrom, withError, withValue } from './stepWith'

const SHELL = /^$|^(\/?([^/ ]+\/)*)?(bash|sh)( .*)?$/
const OUTPUT_KEY = /^[a-zA-Z0-9_-]+$/
const MATRIX_KEY = /^[a-zA-Z0-9_-]+$/
export const SSH_KEYS = [
  'remoteHost',
  'remoteUser',
  'jumpNodeHost',
  'jumpNodeUser',
  'disconnect-timeout',
] as const
/** What the job dialog writes; the schema coverage test holds these to the workflow schema. */
export const JOB_FIELDS = [
  'needs',
  'if',
  'ssh',
  'runs-on',
  'working-directory',
  'timeout',
  'env',
  'outputs',
  'strategy',
] as const
export const RUNS_ON_FIELDS = [
  'environment',
  'environment.cluster',
  'environment.name',
  'params',
  'mode',
  'targetId',
  'environmentId',
  'schedulingParams',
  'newWorker',
  'workerId',
] as const
export const STRATEGY_FIELDS = [
  'matrix',
  'matrix.include',
  'matrix.exclude',
  'fail-fast',
  'max-parallel',
] as const
/** What the step dialog writes. */
export const STEP_FIELDS = [
  'name',
  'run',
  'shell',
  'uses',
  'with',
  'if',
  'working-directory',
  'id',
  'timeout',
  'ignore-errors',
  'early-cancel',
  'cleanup',
  'retry',
  'env',
  'ssh',
] as const
export const RETRY_FIELDS = ['max-retries', 'interval', 'timeout', 'clean-on-retry'] as const

const CLUSTER_TYPES = ['compute-clusters', 'compute-resources']

type SshFields = Record<(typeof SSH_KEYS)[number], string>

function sshFrom(value: unknown): SshFields {
  const record = asRecord(value)
  return Object.fromEntries(SSH_KEYS.map((key) => [key, text(record[key])])) as SshFields
}

function sshTo(fields: SshFields, original: unknown): Json | undefined {
  const written = asRecord(original)
  const entries = SSH_KEYS.flatMap((key) => {
    const value = fields[key].trim()
    return value ? [[key, unchangedValue(value, written[key]) ? written[key] : value] as const] : []
  })
  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

function sshError(fields: SshFields, t: Strings): string | undefined {
  const used = SSH_KEYS.some((key) => fields[key].trim())
  // disconnect-timeout takes any string, as the schema does.
  return used && !fields.remoteHost.trim() ? t.remoteHostRequired : undefined
}

const TARGET_MODES = ['login', 'environment', 'worker'] as const
type TargetMode = (typeof TARGET_MODES)[number]
const TARGET_KEYS = [
  'mode',
  'targetId',
  'environmentId',
  'schedulingParams',
  'newWorker',
  'workerId',
]

/** Where a job runs: an environment named by cluster and name, or a compute target as its input writes it. */
interface RunsOnFields {
  kind: 'name' | 'target'
  cluster: string
  name: string
  params: Row[]
  mode: string
  targetId: string
  environmentId: string
  schedulingParams: Row[]
  newWorker: boolean | undefined
  workerId: string
}

function runsOnFrom(value: unknown): RunsOnFields {
  const record = asRecord(value)
  const environment = asRecord(record['environment'])
  const newWorker = record['newWorker']
  return {
    kind: TARGET_KEYS.some((key) => key in record) ? 'target' : 'name',
    cluster: text(environment['cluster']),
    name: text(environment['name']),
    params: rowsFrom(record['params'], false),
    mode: text(record['mode']),
    targetId: text(record['targetId']),
    environmentId: text(record['environmentId']),
    schedulingParams: rowsFrom(record['schedulingParams'], false),
    newWorker: typeof newWorker === 'boolean' ? newWorker : undefined,
    workerId: text(record['workerId']),
  }
}

function runsOnTo(fields: RunsOnFields): Json | undefined {
  if (fields.kind === 'target') {
    const mode = fields.mode.trim()
    const targetId = fields.targetId.trim()
    const environmentId = fields.environmentId.trim()
    const schedulingParams = rowsTo(fields.schedulingParams, parseScalar)
    const workerId = fields.workerId.trim()
    if (
      !mode &&
      !targetId &&
      !environmentId &&
      !schedulingParams &&
      fields.newWorker === undefined &&
      !workerId
    ) {
      return undefined
    }
    return {
      mode,
      ...(targetId ? { targetId } : {}),
      ...(environmentId ? { environmentId } : {}),
      ...(schedulingParams ? { schedulingParams } : {}),
      ...(fields.newWorker === undefined ? {} : { newWorker: fields.newWorker }),
      ...(workerId ? { workerId } : {}),
    }
  }
  const cluster = fields.cluster.trim()
  const name = fields.name.trim()
  const params = rowsTo(fields.params, parseScalar)
  if (!cluster && !name && !params) {
    return undefined
  }
  return { environment: { cluster, name }, ...(params ? { params } : {}) }
}

const PARAM_KEY = /^[A-Za-z0-9_-]+$/

// The engine refuses a job that sets both, a compute environment needs both of its names,
// and a compute target needs its mode.
function runsOnError(fields: RunsOnFields, sshUsed: boolean, t: Strings): string | undefined {
  if (!runsOnTo(fields)) {
    return undefined
  }
  if (sshUsed) {
    return t.runsOnWithSsh
  }
  if (fields.kind === 'target') {
    if (!TARGET_MODES.includes(fields.mode.trim() as TargetMode)) {
      return t.runsOnNeedsMode
    }
    return rowsError(fields.schedulingParams, PARAM_KEY, t.invalidKey, t)
  }
  if (!fields.cluster.trim() || !fields.name.trim()) {
    return t.runsOnNeedsEnvironment
  }
  return rowsError(fields.params, PARAM_KEY, t.invalidKey, t)
}

function sshHelp(key: (typeof SSH_KEYS)[number], t: Strings): string {
  return key === 'disconnect-timeout' ? t.help.disconnectTimeout : t.help[key]
}

function sshLabel(key: (typeof SSH_KEYS)[number], t: Strings): string {
  return key === 'disconnect-timeout' ? t.fields.disconnectTimeout : t.fields[key]
}

function SshEditor({
  fields,
  onChange,
  error,
  source,
}: {
  fields: SshFields
  onChange: (fields: SshFields) => void
  error: string | undefined
  source: InputSource
}) {
  const t = useGraphEditorStrings()
  const set = (key: (typeof SSH_KEYS)[number]) => (value: string) =>
    onChange({ ...fields, [key]: value })
  return (
    <LintScope at="ssh">
      <ValueOrInputField
        label={t.fields.remoteHost}
        yamlKey="remoteHost"
        description={t.help.remoteHost}
        value={fields.remoteHost}
        onChange={set('remoteHost')}
        source={source}
        types={CLUSTER_TYPES}
        suffix="ip"
      />
      <ValueOrInputField
        label={t.fields.remoteUser}
        yamlKey="remoteUser"
        description={t.help.remoteUser}
        value={fields.remoteUser}
        onChange={set('remoteUser')}
        source={source}
        types={CLUSTER_TYPES}
        suffix="user"
      />
      {(['jumpNodeHost', 'jumpNodeUser', 'disconnect-timeout'] as const).map((key) => (
        <Input
          key={key}
          mono
          {...labelled(sshLabel(key, t), key)}
          description={sshHelp(key, t)}
          value={fields[key]}
          onChange={(e) => set(key)(e.target.value)}
        />
      ))}
      <FieldError message={error} />
    </LintScope>
  )
}

/** A job's or step's env, each value checked against what it reads. */
function EnvSection({
  description,
  rows,
  onChange,
  error,
  source,
}: {
  description: string
  rows: Row[]
  onChange: (rows: Row[]) => void
  error: string | undefined
  source: InputSource
}) {
  const t = useGraphEditorStrings()
  return (
    <Section
      title={t.sectionEnvironment}
      description={description}
      open={rows.length > 0}
      alert={!!error}
    >
      <LintScope at="env">
        <KeyValueEditor
          lint
          rows={rows}
          onChange={onChange}
          error={error}
          valueSuggestions={refSuggestions(source)}
        />
      </LintScope>
    </Section>
  )
}

/** One published output: a step's output, or a value the YAML already has. */
interface OutputRow {
  name: string
  step: string
  output: string
  custom?: string
  /** The text it was read from, written back while it still names the same step output. */
  original?: string
}

const OUTPUT_REF =
  /^\$\{\{\s*needs\.([A-Za-z0-9_-]+)\.steps\.([A-Za-z0-9_-]+)\.outputs\.([A-Za-z0-9_-]+)\s*\}\}$/

function outputRowsFrom(value: unknown, job: string): OutputRow[] {
  return Object.entries(asRecord(value)).map(([name, raw]) => {
    const match = typeof raw === 'string' ? OUTPUT_REF.exec(raw.trim()) : null
    return match && match[1] === job
      ? { name, step: match[2] ?? '', output: match[3] ?? '', original: String(raw) }
      : { name, step: '', output: '', custom: text(raw) }
  })
}

function outputsTo(rows: OutputRow[], job: string): Json | undefined {
  if (rows.length === 0) {
    return undefined
  }
  return Object.fromEntries(
    rows.map((row) => {
      const written = `\${{ needs.${job}.steps.${row.step}.outputs.${row.output.trim()} }}`
      const same = row.original?.replace(/\s/g, '') === written.replace(/\s/g, '')
      return [row.name.trim(), row.custom ?? (same ? row.original : written)]
    }),
  )
}

function outputsError(rows: OutputRow[], t: Strings): string | undefined {
  const names = rows.map((row) => row.name.trim())
  for (const [i, row] of rows.entries()) {
    if (!OUTPUT_KEY.test(names[i] ?? '')) {
      return t.invalidKey
    }
    if (names.indexOf(names[i] ?? '') !== i) {
      return t.duplicateKey
    }
    if (row.custom !== undefined && !row.custom.trim()) {
      return t.required
    }
    if (row.custom === undefined && (!row.step || !OUTPUT_KEY.test(row.output.trim()))) {
      return t.outputNeedsStep
    }
  }
  return undefined
}

function OutputsEditor({
  rows,
  onChange,
  stepIds,
  error,
}: {
  rows: OutputRow[]
  onChange: (rows: OutputRow[]) => void
  stepIds: string[]
  error: string | undefined
}) {
  const t = useGraphEditorStrings()
  const update = (i: number, patch: Partial<OutputRow>) =>
    onChange(rows.map((row, j) => (i === j ? { ...row, ...patch } : row)))
  return (
    <div className="flex flex-col gap-2">
      {stepIds.length === 0 && <div className="text-xs theme-muted-text">{t.noStepIds}</div>}
      {withPositionKeys(rows).map(({ key, item: row }, i) => (
        <div key={key} className="flex items-center gap-2">
          <div className="w-1/3">
            <Input
              mono
              aria-label={t.outputName}
              placeholder={t.outputName}
              value={row.name}
              onChange={(e) => update(i, { name: e.target.value })}
            />
          </div>
          {row.custom !== undefined ? (
            <div className="flex-1">
              <Input
                mono
                aria-label={t.outputValue}
                value={row.custom}
                onChange={(e) => update(i, { custom: e.target.value })}
              />
            </div>
          ) : (
            <>
              <div className="w-1/3">
                <select
                  aria-label={t.outputStep}
                  value={row.step}
                  onChange={(e) => update(i, { step: e.target.value })}
                  className={fieldBoxClasses}
                >
                  <option value="" disabled>
                    {t.outputStep}
                  </option>
                  {stepIds.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <Input
                  mono
                  aria-label={t.outputKey}
                  placeholder={t.outputKey}
                  value={row.output}
                  onChange={(e) => update(i, { output: e.target.value })}
                />
              </div>
            </>
          )}
          <ExpressionToggle
            active={row.custom !== undefined}
            onChange={(on) =>
              onChange(
                rows.map((other, j) =>
                  j === i
                    ? on
                      ? { name: other.name, step: '', output: '', custom: '' }
                      : { name: other.name, step: stepIds[0] ?? '', output: '' }
                    : other,
                ),
              )
            }
          />
          <IconButton
            icon={<CloseIcon className="h-4 w-4" />}
            label={t.removeRow}
            variant="ghost"
            size="sm"
            onClick={() => onChange(removeAt(rows, i))}
          />
        </div>
      ))}
      <FieldError message={error} />
      <AddRowButton
        label={t.addRow}
        onClick={() => onChange([...rows, { name: '', step: stepIds[0] ?? '', output: '' }])}
      />
    </div>
  )
}

interface MatrixRow {
  /** Who the row is while rows above it come and go, since its field keeps state of its own. */
  key: number
  name: string
  values: string
  nested?: boolean
  /** The values the row was read from, written back as they were while its text is unchanged. */
  original?: unknown
  initial?: string
}

let matrixRowKeys = 0
const matrixRow = (row: Omit<MatrixRow, 'key'>): MatrixRow => ({ ...row, key: ++matrixRowKeys })

function matrixRowsFrom(matrix: unknown): MatrixRow[] {
  return Object.entries(asRecord(matrix))
    .filter(([name]) => name !== 'include' && name !== 'exclude')
    .map(([name, values]): MatrixRow => {
      if (typeof values === 'string') {
        return matrixRow({ name, values, original: values, initial: values })
      }
      if (
        Array.isArray(values) &&
        values.every(
          (value) => isScalar(value) && !(typeof value === 'string' && value.includes(',')),
        )
      ) {
        const joined = values.join(', ')
        return matrixRow({ name, values: joined, original: values, initial: joined })
      }
      const json = JSON.stringify(values)
      return matrixRow({
        name,
        values: json,
        nested: true,
        original: values,
        initial: json,
      })
    })
}

function matrixValues(row: MatrixRow): unknown {
  if (row.initial !== undefined && row.values === row.initial) {
    return row.original
  }
  const trimmed = row.values.trim()
  if (row.nested) {
    return parseJson(trimmed).value
  }
  if (EXPRESSION.test(trimmed)) {
    return trimmed
  }
  return trimmed
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map(parseScalar)
}

function matrixRowInvalid(row: MatrixRow, names: string[], i: number): boolean {
  const name = names[i] ?? ''
  const values = matrixValues(row)
  return (
    !MATRIX_KEY.test(name) ||
    name === 'include' ||
    name === 'exclude' ||
    names.indexOf(name) !== i ||
    !(typeof values === 'string' || Array.isArray(values)) ||
    (Array.isArray(values) && values.length === 0)
  )
}

function entriesFrom(value: unknown): Row[][] {
  return Array.isArray(value) ? value.map((entry) => rowsFrom(entry)) : []
}

function entriesTo(entries: Row[][]): Json[] | undefined {
  return entries.length > 0 ? entries.map((rows) => rowsTo(rows, parseScalar) ?? {}) : undefined
}

function entriesError(entries: Row[][], t: Strings): string | undefined {
  for (const rows of entries) {
    const error =
      rows.length === 0 ? t.invalidMatrixEntry : rowsError(rows, MATRIX_KEY, t.invalidKey, t)
    if (error) {
      return error
    }
  }
  return undefined
}

/** Combinations to add or skip, as entries of keys and values or as one expression. */
function MatrixEntries({
  label,
  yamlKey,
  description,
  entries,
  onChange,
  text,
  onText,
  error,
}: {
  label: string
  yamlKey: string
  description: string
  entries: Row[][]
  onChange: (entries: Row[][]) => void
  /** The expression, or undefined while the entries are edited. */
  text: string | undefined
  onText: (text: string | undefined) => void
  error: string | undefined
}) {
  const t = useGraphEditorStrings()
  return (
    <div className="flex flex-col gap-2">
      <FieldLabel
        label={label}
        yamlKey={yamlKey}
        description={description}
        actions={
          <ExpressionToggle
            active={text !== undefined}
            onChange={(on) => onText(on ? '' : undefined)}
          />
        }
      />
      {text !== undefined ? (
        <Input
          mono
          aria-label={label}
          value={text}
          error={error}
          onChange={(e) => onText(e.target.value)}
        />
      ) : (
        <>
          {withPositionKeys(entries).map(({ key, item: rows }, i) => (
            <div key={key} className="flex items-start gap-2">
              <div className="flex-1 rounded-md border theme-border p-2">
                <KeyValueEditor
                  rows={rows}
                  onChange={(next) => onChange(updateAt(entries, i, next))}
                  error={undefined}
                />
              </div>
              <IconButton
                icon={<CloseIcon className="h-4 w-4" />}
                label={t.removeEntry}
                variant="ghost"
                size="sm"
                onClick={() => onChange(removeAt(entries, i))}
              />
            </div>
          ))}
          <FieldError message={error} />
          <AddRowButton
            label={t.addEntry}
            onClick={() => onChange([...entries, [{ key: '', value: '' }]])}
          />
        </>
      )}
    </div>
  )
}

/** One matrix variable: values listed here, or the selections of a multi-select input. */
function MatrixVariable({
  row,
  source,
  onChange,
  onRemove,
}: {
  row: MatrixRow
  source: InputSource
  onChange: (row: MatrixRow) => void
  onRemove: () => void
}) {
  const t = useGraphEditorStrings()
  const ref = readRef(row.values.trim())
  const [fromInput, setFromInput] = useState(ref !== null)
  const { create } = source
  return (
    <div className="flex items-start gap-2">
      <div className="flex flex-1 flex-col gap-2 rounded-md border theme-border p-2">
        <div className="flex items-center gap-2">
          <div className="w-1/3">
            <Input
              mono
              aria-label={t.matrixVariable}
              placeholder={t.matrixVariable}
              value={row.name}
              onChange={(e) => onChange({ ...row, name: e.target.value })}
            />
          </div>
          <div className="flex-1">
            <ChoiceButtons
              options={[
                { value: 'values', label: t.matrixValuesListed },
                { value: 'input', label: t.modeFromInput },
              ]}
              value={fromInput ? 'input' : 'values'}
              onChange={(mode) => {
                setFromInput(mode === 'input')
                onChange({ ...row, values: '', nested: false })
              }}
            />
          </div>
        </div>
        {fromInput ? (
          <InputRefSelect
            refs={source.refs}
            types={['multi-dropdown', 'checkbox-group']}
            value={ref}
            label={t.matrixValues}
            onChange={(path) => onChange({ ...row, values: refExpression(path) })}
            {...(create
              ? {
                  onNew: () =>
                    create('multi-dropdown', (path) =>
                      onChange({ ...row, values: refExpression(path) }),
                    ),
                  newLabel: t.newInput,
                }
              : {})}
          />
        ) : (
          <Input
            mono
            aria-label={t.matrixValues}
            placeholder={t.matrixValues}
            value={row.values}
            title={row.nested ? t.jsonValue : undefined}
            onChange={(e) => onChange({ ...row, values: e.target.value })}
          />
        )}
      </div>
      <IconButton
        icon={<CloseIcon className="h-4 w-4" />}
        label={t.removeVariable}
        variant="ghost"
        size="sm"
        onClick={onRemove}
      />
    </div>
  )
}

/** Every field of a job, saved as one undoable edit. */
function JobForm({
  job,
  jobs,
  inputs,
  workflow,
  onEdit,
  onClose,
  renderShell,
  onDraft,
  pending = false,
}: JobDialogProps & SettingsFormHooks) {
  const t = useGraphEditorStrings()
  const editing = useWorkflowEditing()
  const { needTarget } = editing
  const newInputs = useNewInputs(inputs)
  const source = {
    ...newInputs.source,
    extras: expressionRefs(editing, workflow ?? { jobs }, job),
  }
  const [original] = useState(() => asRecord(jobs[job]))
  const rawNeeds = original['needs']
  const needsExpression = typeof rawNeeds === 'string' ? rawNeeds : undefined
  const strategy = asRecord(original['strategy'])
  const rawMatrix = strategy['matrix']
  const matrixRecord = asRecord(rawMatrix)

  const [name, setName] = useState(job)
  const [needs, setNeeds] = useState<string[]>(() =>
    Array.isArray(rawNeeds) ? rawNeeds.filter((n): n is string => typeof n === 'string') : [],
  )
  const [needsText, setNeedsText] = useState(needsExpression ?? '')
  const [needsTyped, setNeedsTyped] = useState(needsExpression !== undefined)
  const [condition, setCondition] = useState(conditionText(original['if']))
  const [ssh, setSsh] = useState(() => sshFrom(original['ssh']))
  const rawRunsOn = original['runs-on']
  const [runsOn, setRunsOn] = useState(() => runsOnFrom(rawRunsOn))
  const [runsOnTyped, setRunsOnTyped] = useState(typeof rawRunsOn === 'string')
  const [runsOnText, setRunsOnText] = useState(typeof rawRunsOn === 'string' ? rawRunsOn : '')
  const [workingDirectory, setWorkingDirectory] = useState(text(original['working-directory']))
  const [timeout, setTimeoutText] = useState(text(original['timeout']))
  const [env, setEnv] = useState(() => rowsFrom(original['env'], false))
  const [outputs, setOutputs] = useState(() => outputRowsFrom(original['outputs'], job))
  const stepIds = (Array.isArray(original['steps']) ? original['steps'] : []).flatMap((step) => {
    const id = asRecord(step)['id']
    return typeof id === 'string' && id ? [id] : []
  })
  const [matrixOn, setMatrixOn] = useState(rawMatrix !== undefined)
  const [matrixMode, setMatrixMode] = useState<'variables' | 'expression'>(
    typeof rawMatrix === 'string' ? 'expression' : 'variables',
  )
  const [matrixText, setMatrixText] = useState(typeof rawMatrix === 'string' ? rawMatrix : '')
  const [matrixRows, setMatrixRows] = useState(() => matrixRowsFrom(rawMatrix))
  const [include, setInclude] = useState(() => entriesFrom(matrixRecord['include']))
  const [exclude, setExclude] = useState(() => entriesFrom(matrixRecord['exclude']))
  // The schema also takes an expression for include or exclude, kept as written.
  const [includeText, setIncludeText] = useState(() =>
    typeof matrixRecord['include'] === 'string' ? matrixRecord['include'] : undefined,
  )
  const [excludeText, setExcludeText] = useState(() =>
    typeof matrixRecord['exclude'] === 'string' ? matrixRecord['exclude'] : undefined,
  )
  const [failFast, setFailFast] = useState<Flag>(() => flagOf(strategy['fail-fast']))
  const [maxParallel, setMaxParallel] = useState(text(strategy['max-parallel']))

  const needsId = useId()
  const needsLint = useFieldProblems('needs', needsId)
    .map((problem) => problem.message)
    .join(' ')
  const others = Object.keys(jobs).filter((other) => other !== job)
  const missing = needs.map(needTarget).filter((target) => !Object.hasOwn(jobs, target))
  const allNeeds = editing.jobNeeds(jobs)
  const isMatrixJob = (other: string) =>
    asRecord(asRecord(jobs[other])['strategy'])['matrix'] !== undefined

  const toggleNeed = (other: string, on: boolean) =>
    setNeeds((current) =>
      on ? [...current, other] : current.filter((need) => needTarget(need) !== other),
    )
  const toggleAny = (other: string, any: boolean) =>
    setNeeds((current) =>
      current.map((need) => (needTarget(need) === other ? (any ? `${other}:any` : other) : need)),
    )

  const trimmedName = name.trim()
  const matrixNames = matrixRows.map((row) => row.name.trim())
  const matrixError = (): string | undefined => {
    if (!matrixOn) {
      return undefined
    }
    if (matrixMode === 'expression') {
      return matrixText.trim() ? expressionError(matrixText, t) : t.invalidExpressionValue
    }
    if (matrixRows.length === 0 && include.length === 0 && includeText === undefined) {
      return t.matrixNeedsVariable
    }
    return matrixRows.some((row, i) => matrixRowInvalid(row, matrixNames, i))
      ? t.matrixInvalidVariable
      : undefined
  }
  const variablesMode = matrixOn && matrixMode === 'variables'
  const errors = {
    name: !editing.isValidJobName(trimmedName)
      ? t.invalidJobName
      : trimmedName !== job && Object.hasOwn(jobs, trimmedName)
        ? t.jobExists
        : undefined,
    needs: needsTyped ? expressionError(needsText, t) : undefined,
    ssh: sshError(ssh, t),
    runsOn: runsOnTyped
      ? !runsOnText.trim()
        ? undefined
        : sshTo(ssh, original['ssh'])
          ? t.runsOnWithSsh
          : expressionError(runsOnText, t)
      : runsOnError(runsOn, !!sshTo(ssh, original['ssh']), t),
    timeout: durationError(timeout, t),
    env: rowsError(env, ENV_KEY, t.invalidEnvKey, t),
    outputs: outputsError(outputs, t),
    matrix: matrixError(),
    include: !variablesMode
      ? undefined
      : includeText !== undefined
        ? expressionError(includeText, t)
        : entriesError(include, t),
    exclude: !variablesMode
      ? undefined
      : excludeText !== undefined
        ? expressionError(excludeText, t)
        : entriesError(exclude, t),
    failFast: matrixOn ? flagError(failFast, t) : undefined,
    maxParallel: matrixOn ? countError(maxParallel, 1, t.invalidMaxParallel) : undefined,
  }

  const nextStrategy = (): unknown => {
    if (!matrixOn) {
      return undefined
    }
    const includeList = includeText !== undefined ? orUndefined(includeText) : entriesTo(include)
    const excludeList = excludeText !== undefined ? orUndefined(excludeText) : entriesTo(exclude)
    const next: Json = {
      matrix:
        matrixMode === 'expression'
          ? matrixText.trim()
          : {
              ...Object.fromEntries(matrixRows.map((row) => [row.name.trim(), matrixValues(row)])),
              ...(includeList ? { include: includeList } : {}),
              ...(excludeList ? { exclude: excludeList } : {}),
            },
    }
    if (failFast !== undefined) {
      next['fail-fast'] = failFast
    }
    const parallel = parseCount(maxParallel)
    if (parallel !== undefined) {
      next['max-parallel'] = parallel
    }
    return next
  }

  const patch = diffPatch(original, {
    needs: needsTyped ? orUndefined(needsText) : needs.length > 0 ? needs : undefined,
    if: parseCondition(condition),
    ssh: sshTo(ssh, original['ssh']),
    'runs-on': runsOnTyped ? orUndefined(runsOnText) : runsOnTo(runsOn),
    'working-directory': orUndefined(workingDirectory),
    timeout: orUndefined(timeout),
    env: rowsTo(env, (value) => value),
    outputs: outputsTo(outputs, trimmedName),
    strategy: nextStrategy(),
  } satisfies Record<(typeof JOB_FIELDS)[number], unknown>)
  const renamed = trimmedName !== job
  const dirty = renamed || !isEmptyPatch(patch)
  const invalid = Object.values(errors).some(Boolean)
  const addVariableRow = () =>
    setMatrixRows((rows) =>
      rows.length === 0 ? [matrixRow({ name: 'value', values: '1, 2' })] : rows,
    )

  const saveEdit = newInputs.save(
    dirty
      ? {
          type: 'updateJob',
          job,
          ...(renamed ? { name: trimmedName } : {}),
          ...patch,
        }
      : null,
  )
  onDraft?.(saveEdit, invalid)
  const children = (
    <>
      {newInputs.dialog}
      <Input
        autoFocus
        mono
        label={t.jobName}
        description={t.help.jobName}
        value={name}
        error={errors.name}
        onChange={(e) => setName(e.target.value)}
      />
      <Section title={t.sectionDependencies} open>
        <FieldLabel
          label={t.fields.needs}
          yamlKey="needs"
          description={needsTyped ? t.help.needsExpression : t.help.needs}
          actions={<ExpressionToggle active={needsTyped} onChange={setNeedsTyped} />}
        />
        {needsTyped ? (
          <Input
            id={needsId}
            mono
            aria-label={t.fields.needs}
            value={needsText}
            error={errors.needs ?? (needsLint || undefined)}
            onChange={(e) => setNeedsText(e.target.value)}
          />
        ) : others.length === 0 ? (
          <div className="text-xs theme-muted-text">{t.noOtherJobs}</div>
        ) : (
          <div id={needsId} tabIndex={-1} className="flex flex-col gap-1.5">
            {[...others, ...missing].map((other) => {
              const entry = needs.find((need) => needTarget(need) === other)
              const cycle = !entry && editing.dependsOn(allNeeds, other, job)
              return (
                <div key={other} className="flex items-center gap-2 text-sm">
                  <label
                    className={cx(
                      'flex flex-1 items-center gap-2',
                      cycle ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
                    )}
                    title={cycle ? t.dependsOnThisJob : undefined}
                  >
                    <input
                      type="checkbox"
                      checked={!!entry}
                      disabled={cycle}
                      onChange={(e) => toggleNeed(other, e.target.checked)}
                    />
                    <span className="font-mono">{other}</span>
                    {!Object.hasOwn(jobs, other) && (
                      <span className="text-xs text-(--theme-error)">{t.missingJob}</span>
                    )}
                  </label>
                  {entry && isMatrixJob(other) && (
                    <label
                      className="flex cursor-pointer items-center gap-1.5 text-xs theme-muted-text"
                      title={t.help.waitForAny}
                    >
                      <input
                        type="checkbox"
                        checked={entry.endsWith(':any')}
                        onChange={(e) => toggleAny(other, e.target.checked)}
                      />
                      {t.waitForAny}
                    </label>
                  )}
                </div>
              )
            })}
            <FieldError message={needsLint || undefined} />
          </div>
        )}
        <ConditionField
          scope="job"
          label={t.fields.condition}
          yamlKey="if"
          description={t.help.jobIf}
          value={condition}
          onChange={setCondition}
          source={source}
        />
      </Section>
      <Section
        title={t.sectionRemoteHost}
        description={t.runsInWorkspace}
        open={!!sshTo(ssh, original['ssh'])}
        alert={!!errors.ssh}
      >
        <SshEditor fields={ssh} onChange={setSsh} error={errors.ssh} source={source} />
      </Section>
      <Section
        title={t.sectionComputeEnvironment}
        description={t.runsOnHint}
        open={runsOnTyped ? !!runsOnText.trim() : !!runsOnTo(runsOn)}
        alert={!!errors.runsOn}
      >
        <LintScope at="runs-on">
          <FieldLabel
            label={t.fields.runsOn}
            yamlKey="runs-on"
            description={t.help.runsOn}
            actions={<ExpressionToggle active={runsOnTyped} onChange={setRunsOnTyped} />}
          />
          {runsOnTyped ? (
            <Input
              mono
              aria-label={t.fields.runsOn}
              value={runsOnText}
              error={errors.runsOn}
              onChange={(e) => setRunsOnText(e.target.value)}
            />
          ) : (
            <>
              <ChoiceButtons
                options={[
                  { value: 'name' as const, label: t.runsOnByName },
                  { value: 'target' as const, label: t.runsOnByTarget },
                ]}
                value={runsOn.kind}
                onChange={(kind) => setRunsOn({ ...runsOn, kind })}
              />
              {runsOn.kind === 'name' ? (
                <>
                  <Input
                    mono
                    {...labelled(t.fields.environmentCluster, 'cluster')}
                    description={t.help.environmentCluster}
                    value={runsOn.cluster}
                    onChange={(e) => setRunsOn({ ...runsOn, cluster: e.target.value })}
                  />
                  <Input
                    mono
                    {...labelled(t.fields.environmentName, 'name')}
                    description={t.help.environmentName}
                    value={runsOn.name}
                    onChange={(e) => setRunsOn({ ...runsOn, name: e.target.value })}
                  />
                  <LabelledField
                    label={t.fields.schedulingParams}
                    yamlKey="params"
                    description={t.help.schedulingParams}
                  >
                    <KeyValueEditor
                      rows={runsOn.params}
                      onChange={(params) => setRunsOn({ ...runsOn, params })}
                      error={undefined}
                    />
                  </LabelledField>
                </>
              ) : (
                <>
                  <LabelledField
                    label={t.fields.targetMode}
                    yamlKey="mode"
                    description={t.help.targetMode}
                  >
                    <ChoiceButtons
                      options={TARGET_MODES.map((mode) => ({
                        value: mode,
                        label: t.targetModes[mode],
                      }))}
                      value={runsOn.mode as TargetMode}
                      onChange={(mode) => setRunsOn({ ...runsOn, mode })}
                    />
                  </LabelledField>
                  <Input
                    mono
                    {...labelled(t.fields.targetId, 'targetId')}
                    description={t.help.targetId}
                    value={runsOn.targetId}
                    onChange={(e) => setRunsOn({ ...runsOn, targetId: e.target.value })}
                  />
                  <Input
                    mono
                    {...labelled(t.fields.environmentId, 'environmentId')}
                    description={t.help.environmentId}
                    value={runsOn.environmentId}
                    onChange={(e) => setRunsOn({ ...runsOn, environmentId: e.target.value })}
                  />
                  <LabelledField
                    label={t.fields.schedulingParams}
                    yamlKey="schedulingParams"
                    description={t.help.schedulingParams}
                  >
                    <KeyValueEditor
                      rows={runsOn.schedulingParams}
                      onChange={(schedulingParams) => setRunsOn({ ...runsOn, schedulingParams })}
                      error={undefined}
                    />
                  </LabelledField>
                  <ToggleField
                    label={t.fields.newWorker}
                    yamlKey="newWorker"
                    description={t.help.newWorker}
                    checked={runsOn.newWorker === true}
                    onChange={(newWorker) => setRunsOn({ ...runsOn, newWorker })}
                  />
                  <Input
                    mono
                    {...labelled(t.fields.workerId, 'workerId')}
                    description={t.help.workerId}
                    value={runsOn.workerId}
                    onChange={(e) => setRunsOn({ ...runsOn, workerId: e.target.value })}
                  />
                </>
              )}
              <FieldError message={errors.runsOn} />
            </>
          )}
        </LintScope>
      </Section>
      <Section
        title={t.sectionMatrix}
        open={matrixOn}
        alert={
          !!(
            errors.matrix ||
            errors.include ||
            errors.exclude ||
            errors.failFast ||
            errors.maxParallel
          )
        }
      >
        <ToggleField
          label={t.fields.matrix}
          yamlKey="strategy.matrix"
          description={t.matrixOn}
          checked={matrixOn}
          onChange={(on) => {
            setMatrixOn(on)
            if (on && matrixMode === 'variables') {
              addVariableRow()
            }
          }}
        />
        {matrixOn && (
          <>
            {/* The schema takes only variables; an expression matrix can be turned into them. */}
            {typeof rawMatrix === 'string' && (
              <>
                <FieldLabel label={t.fields.matrixSource} description={t.help.matrixMode} />
                <ChoiceButtons
                  options={[
                    { value: 'variables', label: t.matrixFromVariables },
                    { value: 'expression', label: t.matrixFromExpression },
                  ]}
                  value={matrixMode}
                  onChange={(mode) => {
                    setMatrixMode(mode)
                    if (mode === 'variables') {
                      addVariableRow()
                    }
                  }}
                />
              </>
            )}
            {matrixMode === 'expression' ? (
              <Input
                mono
                {...labelled(t.fields.matrixExpression, 'strategy.matrix')}
                description={t.help.matrixExpression}
                value={matrixText}
                error={errors.matrix}
                onChange={(e) => setMatrixText(e.target.value)}
              />
            ) : (
              <>
                <div className="text-xs theme-muted-text">{t.help.matrixVariables}</div>
                {matrixRows.map((row, i) => (
                  <MatrixVariable
                    key={row.key}
                    row={row}
                    source={source}
                    onChange={(next) => setMatrixRows((rows) => updateAt(rows, i, next))}
                    onRemove={() => setMatrixRows((rows) => removeAt(rows, i))}
                  />
                ))}
                <FieldError message={errors.matrix} />
                <AddRowButton
                  label={t.addVariable}
                  onClick={() =>
                    setMatrixRows((rows) => [...rows, matrixRow({ name: '', values: '' })])
                  }
                />
                <MatrixEntries
                  label={t.fields.include}
                  yamlKey="include"
                  description={t.help.include}
                  entries={include}
                  onChange={setInclude}
                  text={includeText}
                  onText={setIncludeText}
                  error={errors.include}
                />
                <MatrixEntries
                  label={t.fields.exclude}
                  yamlKey="exclude"
                  description={t.help.exclude}
                  entries={exclude}
                  onChange={setExclude}
                  text={excludeText}
                  onText={setExcludeText}
                  error={errors.exclude}
                />
              </>
            )}
            <FlagField
              label={t.fields.failFast}
              yamlKey="fail-fast"
              description={t.help.failFast}
              value={failFast}
              original={strategy['fail-fast']}
              fallback={true}
              onChange={setFailFast}
              source={source}
            />
            <Input
              mono
              {...labelled(t.fields.maxParallel, 'max-parallel')}
              description={t.help.maxParallel}
              value={maxParallel}
              error={errors.maxParallel}
              onChange={(e) => setMaxParallel(e.target.value)}
            />
          </>
        )}
      </Section>
      <EnvSection
        description={t.help.jobEnv}
        rows={env}
        onChange={setEnv}
        error={errors.env}
        source={source}
      />
      <Section
        title={t.sectionOutputs}
        description={t.help.outputs}
        open={outputs.length > 0}
        alert={!!errors.outputs}
      >
        <OutputsEditor
          rows={outputs}
          onChange={setOutputs}
          stepIds={stepIds}
          error={errors.outputs}
        />
      </Section>
      <Section
        title={t.sectionAdvanced}
        open={!!workingDirectory || !!timeout}
        alert={!!errors.timeout}
      >
        <Input
          mono
          {...labelled(t.fields.workingDirectory, 'working-directory')}
          description={t.help.jobWorkingDirectory}
          value={workingDirectory}
          onChange={(e) => setWorkingDirectory(e.target.value)}
        />
        <Input
          mono
          {...labelled(t.fields.timeout, 'timeout')}
          description={t.help.jobTimeout}
          value={timeout}
          error={errors.timeout}
          onChange={(e) => setTimeoutText(e.target.value)}
        />
      </Section>
    </>
  )
  const shellProps: DialogShellProps = {
    title: rawMatrix !== undefined ? t.editMatrix : t.editJob,
    onClose,
    dirty: dirty || pending,
    saveDisabled: invalid,
    locked: newInputs.dialog !== null,
    onSubmit: () => {
      if (saveEdit) {
        onEdit(saveEdit)
      }
      onClose()
    },
    children,
  }
  return renderShell ? renderShell(shellProps) : <DialogShell {...shellProps} />
}

type SshMode = 'inherit' | 'custom' | 'none'

/** Every field of a step, saved as one undoable edit. */
function StepForm({
  job,
  index,
  steps,
  inputs,
  workflow,
  usesSuggestions,
  onEdit,
  onClose,
  renderShell,
  onDraft,
  pending = false,
  adding = false,
}: StepDialogProps & SettingsFormHooks) {
  const t = useGraphEditorStrings()
  const editing = useWorkflowEditing()
  const actions = useWorkflowActions()
  const newInputs = useNewInputs(inputs)
  const source = {
    ...newInputs.source,
    extras: expressionRefs(editing, workflow, job),
  }
  const [original] = useState(() => asRecord(steps[index]))
  const rawRetry = original['retry']
  const retry = asRecord(rawRetry)

  const [name, setName] = useState(text(original['name']))
  const [kind, setKind] = useState<'run' | 'uses'>(original['uses'] !== undefined ? 'uses' : 'run')
  const [run, setRun] = useState(text(original['run']))
  const [shell, setShell] = useState(text(original['shell']))
  const [uses, setUses] = useState(text(original['uses']))
  const [initialWith] = useState(() => withDraftFrom(original['with'], actions))
  const [withDraft, setWithDraft] = useState(initialWith)
  const [condition, setCondition] = useState(conditionText(original['if']))
  const [workingDirectory, setWorkingDirectory] = useState(text(original['working-directory']))
  const [id, setId] = useState(text(original['id']))
  const [timeout, setTimeoutText] = useState(text(original['timeout']))
  const [ignoreErrors, setIgnoreErrors] = useState<Flag>(() => flagOf(original['ignore-errors']))
  const [earlyCancel, setEarlyCancel] = useState(original['early-cancel'] === 'any-job-failed')
  const [cleanup, setCleanup] = useState(text(original['cleanup']))
  const [retryOn, setRetryOn] = useState(rawRetry !== undefined)
  const [maxRetries, setMaxRetries] = useState(text(retry['max-retries']))
  const [interval, setIntervalText] = useState(text(retry['interval']))
  const [retryTimeout, setRetryTimeout] = useState(text(retry['timeout']))
  const [cleanOnRetry, setCleanOnRetry] = useState<Flag>(() => flagOf(retry['clean-on-retry']))
  const [env, setEnv] = useState(() => rowsFrom(original['env'], false))
  const [sshMode, setSshMode] = useState<SshMode>(
    original['ssh'] === null ? 'none' : original['ssh'] !== undefined ? 'custom' : 'inherit',
  )
  const [ssh, setSsh] = useState(() => sshFrom(original['ssh']))

  const trimmedUses = uses.trim()
  const errors = {
    run: kind === 'run' && !run.trim() ? t.required : undefined,
    shell: kind === 'run' && !SHELL.test(shell.trim()) ? t.invalidShell : undefined,
    uses:
      kind !== 'uses'
        ? undefined
        : !trimmedUses
          ? t.required
          : usesKind(trimmedUses, actions) === 'other'
            ? t.invalidUses
            : undefined,
    with:
      kind === 'uses' ? withError(trimmedUses, actions, withDraft, original['with'], t) : undefined,
    id: id.trim() && !editing.isValidJobName(id.trim()) ? t.invalidJobName : undefined,
    timeout: durationError(timeout, t),
    ignoreErrors: flagError(ignoreErrors, t),
    maxRetries: retryOn ? countError(maxRetries, 0, t.invalidCount) : undefined,
    interval: retryOn ? durationError(interval, t) : undefined,
    retryTimeout: retryOn ? durationError(retryTimeout, t) : undefined,
    cleanOnRetry: retryOn ? flagError(cleanOnRetry, t) : undefined,
    env: rowsError(env, ENV_KEY, t.invalidEnvKey, t),
    ssh: sshMode === 'custom' ? sshError(ssh, t) : undefined,
  }

  const nextRetry = (): unknown => {
    if (!retryOn) {
      return undefined
    }
    const next: Partial<Record<(typeof RETRY_FIELDS)[number], unknown>> = {}
    const retries = parseCount(maxRetries)
    if (retries !== undefined) {
      next['max-retries'] = retries
    }
    if (interval.trim()) {
      next['interval'] = interval.trim()
    }
    if (retryTimeout.trim()) {
      next['timeout'] = retryTimeout.trim()
    }
    if (cleanOnRetry !== undefined) {
      next['clean-on-retry'] = cleanOnRetry
    }
    return next
  }

  const patch = diffPatch(original, {
    name: orUndefined(name),
    run: kind === 'run' ? run : undefined,
    shell: kind === 'run' ? orUndefined(shell) : undefined,
    uses: kind === 'uses' ? trimmedUses : undefined,
    with:
      kind === 'uses'
        ? withValue(
            trimmedUses,
            actions,
            withDraft,
            initialWith,
            text(original['uses']),
            original['with'],
          )
        : undefined,
    if: parseCondition(condition),
    'working-directory':
      original['working-directory'] === null && !workingDirectory.trim()
        ? null
        : orUndefined(workingDirectory),
    id: orUndefined(id),
    timeout: orUndefined(timeout),
    'ignore-errors': ignoreErrors,
    'early-cancel': earlyCancel ? 'any-job-failed' : undefined,
    cleanup: cleanup.trim() ? cleanup : undefined,
    retry: nextRetry(),
    env: rowsTo(env, (value) => value),
    ssh:
      sshMode === 'inherit' ? undefined : sshMode === 'none' ? null : sshTo(ssh, original['ssh']),
  } satisfies Record<(typeof STEP_FIELDS)[number], unknown>)
  const dirty = !isEmptyPatch(patch)
  const invalid = Object.values(errors).some(Boolean)
  const edit = (graphEdit: GraphEdit) => {
    onEdit(graphEdit)
    onClose()
  }

  const fromId = text(original['id']).trim()
  const references =
    fromId && id.trim() && id.trim() !== fromId
      ? stepIdEdits(workflow, steps, job, index, fromId, id.trim())
      : []
  const saveEdit = newInputs.save(
    dirty ? editing.batchOf([{ type: 'updateStep', job, index, ...patch }, ...references]) : null,
  )
  onDraft?.(saveEdit, invalid)
  const children = (
    <>
      {newInputs.dialog}
      <Input
        autoFocus
        {...labelled(t.stepName, 'name')}
        description={t.help.stepName}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <div className="text-xs theme-muted-text">{t.help.stepKind}</div>
      <ChoiceButtons
        options={[
          { value: 'run', label: t.stepRun },
          { value: 'uses', label: t.stepUses },
        ]}
        value={kind}
        onChange={setKind}
      />
      {kind === 'run' ? (
        <ScriptField
          label={t.fields.run}
          yamlKey="run"
          description={t.help.run}
          rows={8}
          value={run}
          error={errors.run}
          placeholder='echo "Hello World"'
          onChange={setRun}
          source={source}
        />
      ) : (
        <>
          <UsesPicker
            uses={trimmedUses}
            onUses={setUses}
            choices={usesSuggestions}
            draft={withDraft}
            onDraft={setWithDraft}
            error={errors.uses}
          />
          <WithEditor
            uses={trimmedUses}
            draft={withDraft}
            original={original['with']}
            onChange={setWithDraft}
            error={errors.with}
            source={source}
          />
        </>
      )}
      <Section title={t.sectionCleanup} open={!!cleanup.trim()}>
        <ScriptField
          label={t.fields.cleanup}
          yamlKey="cleanup"
          description={t.help.cleanup}
          value={cleanup}
          onChange={setCleanup}
          source={source}
        />
      </Section>
      <Section
        title={t.sectionBehavior}
        open={!!condition || !!timeout || ignoreErrors !== undefined || earlyCancel}
        alert={!!(errors.timeout || errors.ignoreErrors)}
      >
        <ConditionField
          scope="step"
          label={t.fields.condition}
          yamlKey="if"
          description={t.help.stepIf}
          value={condition}
          onChange={setCondition}
          source={source}
        />
        <Input
          mono
          {...labelled(t.fields.timeout, 'timeout')}
          description={t.help.stepTimeout}
          value={timeout}
          error={errors.timeout}
          onChange={(e) => setTimeoutText(e.target.value)}
        />
        <FlagField
          label={t.fields.ignoreErrors}
          yamlKey="ignore-errors"
          description={t.help.ignoreErrors}
          value={ignoreErrors}
          original={original['ignore-errors']}
          onChange={setIgnoreErrors}
          source={source}
        />
        <ToggleField
          label={t.fields.earlyCancel}
          yamlKey="early-cancel"
          description={t.help.earlyCancel}
          checked={earlyCancel}
          onChange={setEarlyCancel}
        />
      </Section>
      <Section
        title={t.sectionRetry}
        open={retryOn}
        alert={
          !!(errors.maxRetries || errors.interval || errors.retryTimeout || errors.cleanOnRetry)
        }
      >
        <ToggleField
          label={t.fields.retry}
          yamlKey="retry"
          description={t.help.retry}
          checked={retryOn}
          onChange={setRetryOn}
        />
        {retryOn && (
          <>
            <Input
              mono
              {...labelled(t.fields.maxRetries, 'max-retries')}
              description={t.help.maxRetries}
              value={maxRetries}
              error={errors.maxRetries}
              placeholder="10"
              onChange={(e) => setMaxRetries(e.target.value)}
            />
            <Input
              mono
              {...labelled(t.fields.retryInterval, 'interval')}
              description={t.help.retryInterval}
              value={interval}
              error={errors.interval}
              placeholder="5s"
              onChange={(e) => setIntervalText(e.target.value)}
            />
            <Input
              mono
              {...labelled(t.fields.retryTimeout, 'timeout')}
              description={t.help.retryTimeout}
              value={retryTimeout}
              error={errors.retryTimeout}
              placeholder="30s"
              onChange={(e) => setRetryTimeout(e.target.value)}
            />
            <FlagField
              label={t.fields.cleanOnRetry}
              yamlKey="clean-on-retry"
              description={t.help.cleanOnRetry}
              value={cleanOnRetry}
              original={retry['clean-on-retry']}
              fallback={true}
              onChange={setCleanOnRetry}
              source={source}
            />
          </>
        )}
      </Section>
      <Section
        title={t.sectionRemoteHost}
        description={t.help.stepSsh}
        open={sshMode !== 'inherit'}
        alert={!!errors.ssh}
      >
        <ChoiceButtons
          options={[
            { value: 'inherit', label: t.sshInherit },
            { value: 'custom', label: t.sshCustom },
            { value: 'none', label: t.sshNone },
          ]}
          value={sshMode}
          onChange={setSshMode}
        />
        {sshMode === 'custom' && (
          <SshEditor fields={ssh} onChange={setSsh} error={errors.ssh} source={source} />
        )}
      </Section>
      <EnvSection
        description={t.help.stepEnv}
        rows={env}
        onChange={setEnv}
        error={errors.env}
        source={source}
      />
      <Section
        title={t.sectionAdvanced}
        open={!!workingDirectory || !!id || !!shell}
        alert={!!(errors.id || errors.shell)}
      >
        <Input
          mono
          {...labelled(t.fields.workingDirectory, 'working-directory')}
          description={t.help.stepWorkingDirectory}
          value={workingDirectory}
          onChange={(e) => setWorkingDirectory(e.target.value)}
        />
        <Input
          mono
          {...labelled(t.fields.stepId, 'id')}
          description={t.help.stepId}
          value={id}
          error={errors.id}
          onChange={(e) => setId(e.target.value)}
        />
        {kind === 'run' && (
          <Input
            mono
            {...labelled(t.fields.shell, 'shell')}
            description={t.help.shell}
            value={shell}
            error={errors.shell}
            placeholder="bash -e {0}"
            onChange={(e) => setShell(e.target.value)}
          />
        )}
      </Section>
    </>
  )
  const shellProps: DialogShellProps = {
    title: t.editStep,
    onClose,
    dirty: dirty || pending,
    saveDisabled: invalid,
    locked: newInputs.dialog !== null,
    onSubmit: () => {
      if (saveEdit) {
        onEdit(saveEdit)
      }
      onClose()
    },
    footerStart: (
      <>
        <IconButton
          icon={<TrashIcon className="h-4 w-4" />}
          label={t.deleteStep}
          variant="ghost"
          size="sm"
          onClick={() => (adding ? onClose() : edit({ type: 'deleteStep', job, index }))}
        />
        <IconButton
          icon={<ArrowUpIcon className="h-4 w-4" />}
          label={t.moveUp}
          variant="ghost"
          size="sm"
          disabled={dirty || pending || index === 0}
          onClick={() => edit({ type: 'moveStep', job, from: index, to: index - 1 })}
        />
        <IconButton
          icon={<ArrowDownIcon className="h-4 w-4" />}
          label={t.moveDown}
          variant="ghost"
          size="sm"
          disabled={dirty || pending || index >= steps.length - 1}
          onClick={() => edit({ type: 'moveStep', job, from: index, to: index + 2 })}
        />
      </>
    ),
    children,
  }
  return renderShell ? renderShell(shellProps) : <DialogShell {...shellProps} />
}

interface ViewProps {
  source?: string | undefined
  /** Adds the job or step being edited; applied with the first save, so cancelling adds nothing. */
  addition?: GraphEdit | undefined
  /** The view to open in; YAML unless the host says form. */
  view?: SettingsView | undefined
  onViewChange?: ((view: SettingsView) => void) | undefined
  openOnAdd?: OpenOnAdd | undefined
}

// The YAML a dialog opens with, or null to open the form.
function openingYaml(
  view: SettingsView | undefined,
  source: string | undefined,
  read: (source: string) => string,
): string | null {
  if (view === 'form' || source === undefined) {
    return null
  }
  try {
    return read(source)
  } catch {
    return null
  }
}

interface JobDialogProps {
  job: string
  jobs: Json
  inputs: Json | undefined
  workflow?: Json | undefined
  onEdit: (edit: GraphEdit) => void
  onClose: () => void
}

interface StepDialogProps {
  job: string
  index: number
  steps: unknown[]
  inputs: Json | undefined
  workflow?: Json | undefined
  usesSuggestions: string[]
  onEdit: (edit: GraphEdit) => void
  onClose: () => void
}

/** What a job or step form hands the dialog around it, so the same settings can be edited as YAML. */
export interface SettingsFormHooks {
  renderShell?: ((props: DialogShellProps) => ReactNode) | undefined
  /** Called on each render with the edit Save would send, and whether a field is invalid. */
  onDraft?: ((edit: GraphEdit | null, invalid: boolean) => void) | undefined
  /** Edits made in the YAML view are waiting to be saved. */
  pending?: boolean
  /** The step exists only once saved, so deleting it just closes the dialog. */
  adding?: boolean
}

// A step's ID is read as `steps.<id>` within its job, and as `needs.<job>.steps.<id>` anywhere.
function stepIdEdits(
  workflow: Json | undefined,
  steps: unknown[],
  job: string,
  index: number,
  from: string,
  to: string,
): GraphEdit[] {
  const id = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const own = new RegExp(`(?<![A-Za-z0-9_.-])steps\\.${id}(?![A-Za-z0-9_-])`, 'g')
  const needed = new RegExp(
    `(?<![A-Za-z0-9_.-])needs\\.${job}\\.steps\\.${id}(?![A-Za-z0-9_-])`,
    'g',
  )
  const rewrite = (value: unknown, inJob: boolean): unknown => {
    if (typeof value === 'string') {
      return value.replace(/\$\{\{[\s\S]*?\}\}/g, (expression) => {
        const outside = expression.replace(needed, `needs.${job}.steps.${to}`)
        return inJob ? outside.replace(own, `steps.${to}`) : outside
      })
    }
    if (Array.isArray(value)) {
      return value.map((item) => rewrite(item, inJob))
    }
    return value && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rewrite(item, inJob)]))
      : value
  }
  const changed = (record: Json, inJob: boolean) => {
    const set: Json = {}
    for (const [key, value] of Object.entries(record)) {
      const next = rewrite(value, inJob)
      if (!sameValue(next, value)) {
        set[key] = next
      }
    }
    return set
  }
  const jobs = workflow ? asRecord(workflow['jobs']) : { [job]: { steps } }
  return Object.entries(jobs).flatMap(([name, value]): GraphEdit[] => {
    const { steps: own = [], ...fields } = asRecord(value)
    const inJob = name === job
    const jobSet = changed(fields, inJob)
    return [
      ...(Object.keys(jobSet).length > 0
        ? [{ type: 'updateJob' as const, job: name, set: jobSet }]
        : []),
      ...(Array.isArray(own) ? own : []).flatMap((step, i): GraphEdit[] => {
        const set = inJob && i === index ? {} : changed(asRecord(step), inJob)
        return Object.keys(set).length > 0 ? [{ type: 'updateStep', job: name, index: i, set }] : []
      }),
    ]
  })
}

function applyAll(editing: WorkflowEditing, text: string, edits: GraphEdit[]): string {
  return edits.reduce(
    (yml, edit) => editing.applyGraphEdit({ yml, layout: undefined }, edit).yml,
    text,
  )
}

function renamedJob(edit: GraphEdit | null): string | undefined {
  if (!edit) {
    return undefined
  }
  if (edit.type === 'batch') {
    return edit.edits.map(renamedJob).findLast(Boolean)
  }
  return edit.type === 'updateJob' ? edit.name : undefined
}

/**
 * The linter's problems inside one job or step of `whole`, the workflow as the dialog has it,
 * with lines in `fragment`, the YAML the dialog shows, when it shows YAML.
 */
function useScopedProblems(
  whole: string | undefined,
  prefix: string[],
  fragment: string | null,
  exclude: string[] = [],
): ScopedProblems {
  const ready = useLintEditing()
  const context = useLintContext(whole)
  const contextKey = JSON.stringify(context)
  const scope = prefix.join('.')
  // biome-ignore lint/correctness/useExhaustiveDependencies: context is compared by its content.
  return useMemo(() => {
    if (!ready || whole === undefined) {
      return NO_SCOPED
    }
    const problems = ready.lintWorkflow(whole, context).flatMap((problem): ScopedProblem[] => {
      const path = problem.path.split('.')
      if (
        !prefix.every((segment, i) => path[i] === segment) ||
        exclude.includes(path[prefix.length] ?? '')
      ) {
        return []
      }
      const at = path
        .slice(prefix.length)
        .map((segment) => (/^\d+$/.test(segment) ? Number(segment) : segment))
      return [{ at, message: problem.message, fix: problem.fix }]
    })
    return {
      problems,
      markers:
        fragment === null
          ? []
          : problems.map((problem) => ({
              message: problem.message,
              line:
                (problem.at.length > 0 ? ready.linesAt(fragment, problem.at)?.start : undefined) ??
                1,
            })),
    }
  }, [ready, whole, contextKey, scope, fragment, exclude.join()])
}

interface AddedGroup {
  name: string
  definition: Json
}

/**
 * The input groups a `with:` completion in the YAML view adds to the workflow, saved with the
 * dialog ahead of the text that reads them.
 */
function useAddedGroups(start: string | undefined, committed: GraphEdit[]) {
  const editing = useWorkflowEditing()
  const [added, setAdded] = useState<AddedGroup[]>([])
  const nested: NestedWorkflowText = {
    inputs: () => {
      const text = editedWorkflow(editing, start, committed).yml
      const on = asRecord(asRecord(text === undefined ? {} : editing.loadYaml(text))['on'])
      return {
        ...asRecord(asRecord(on['execute'])['inputs']),
        ...Object.fromEntries(added.map((group) => [group.name, group.definition])),
      }
    },
    addInputs: (name, definition) =>
      setAdded((current) => [
        ...current.filter((group) => group.name !== name),
        { name, definition },
      ]),
  }
  // Only while the YAML still reads a group, so a completion undone in the editor adds nothing.
  const edits = (text: string): GraphEdit[] =>
    added
      .filter(({ name }) => text.includes(`inputs.${name}.`))
      .map(({ name, definition }) => ({
        type: 'addInput',
        parent: [],
        index: 0,
        name,
        definition,
      }))
  return { nested, edits, clear: () => setAdded([]) }
}

// Applies the dialog's edits, or nothing when they no longer apply, such as to half-typed YAML.
function editedWorkflow(
  editing: WorkflowEditing,
  start: string | undefined,
  edits: GraphEdit[],
): { yml: string | undefined; error: unknown } {
  if (start === undefined) {
    return { yml: undefined, error: undefined }
  }
  try {
    return { yml: applyAll(editing, start, edits), error: undefined }
  } catch (error) {
    return { yml: undefined, error }
  }
}

interface SettingsViewsOptions extends ViewProps {
  onEdit: (edit: GraphEdit) => void
  onClose: () => void
  /** What the dialog edits, by the name the job dialog can change. */
  name: string
  read: (workflow: string, name: string) => string
  write: (name: string, yaml: string) => GraphEdit
  scope: (name: string) => string[]
  /** Keys right under the scope whose problems belong to other editors. */
  exclude?: string[]
  /** Whether empty text, meaning no settings at all, is fine. */
  optional?: boolean
  /** The YAML shows a job's settings, not its key, so its view renames through a field. */
  rename?: {
    label: string
    description: string
    error: (next: string, current: string) => string | undefined
    edit: (from: string, to: string) => GraphEdit
    /** The name a form draft gives the job. */
    from: (draft: GraphEdit | null) => string | undefined
  }
}

type FormHost = Required<Pick<SettingsFormHooks, 'renderShell' | 'onDraft' | 'pending'>>

/** A dialog's settings in a form or as YAML, with the edits carried across a switch. */
export function useSettingsViews(o: SettingsViewsOptions) {
  const t = useGraphEditorStrings()
  const editing = useWorkflowEditing()
  const sections = useSectionMemory()
  const [start] = useState(o.source)
  const [opening] = useState(() => openingYaml(o.view, o.source, (text) => o.read(text, o.name)))
  const [committed, setCommitted] = useState<GraphEdit[]>([])
  const [name, setName] = useState(o.name)
  const [yamlName, setYamlName] = useState(o.name)
  const [yaml, setYaml] = useState<string | null>(opening)
  const [yamlAtStart, setYamlAtStart] = useState(opening ?? '')
  const [problem, setProblem] = useState<string | undefined>()
  const [version, setVersion] = useState(0)
  const draft = useRef<GraphEdit | null>(null)
  // The draft leaves out what an invalid field can't write yet, so the YAML would lose it.
  const invalidDraft = useRef(false)
  const [, setDrafts] = useState(0)
  const lastDraft = useRef('')
  // The form reports its draft while it renders, so the problems follow it on a later turn,
  // and only when the draft changed.
  const trackDraft = (edit: GraphEdit | null, invalid: boolean) => {
    draft.current = edit
    invalidDraft.current = invalid
    const seen = JSON.stringify([edit, invalid])
    if (seen !== lastDraft.current) {
      lastDraft.current = seen
      window.setTimeout(() => {
        setDrafts((n) => n + 1)
        if (!invalid) {
          setProblem(undefined)
        }
      }, 0)
    }
  }
  const groups = useAddedGroups(start, committed)
  const drafted = () => (draft.current ? [...committed, draft.current] : committed)
  const withYaml = (text: string): GraphEdit[] =>
    text === yamlAtStart ? committed : [...committed, ...groups.edits(text), o.write(name, text)]
  const problemOf = (text: string) =>
    o.optional && !text.trim() ? undefined : yamlProblem(text, t, editing)
  const nextName = yamlName.trim()
  const nameError = o.rename?.error(nextName, name)
  const withRename = (edits: GraphEdit[]): GraphEdit[] =>
    o.rename && nextName !== name ? [...edits, o.rename.edit(name, nextName)] : edits
  const edits = yaml !== null ? withYaml(yaml) : drafted()
  const editsKey = JSON.stringify(edits)
  // biome-ignore lint/correctness/useExhaustiveDependencies: the edits are compared by their content.
  const applied = useMemo(() => editedWorkflow(editing, start, edits), [editing, start, editsKey])
  const whole = applied.yml
  // YAML the workflow would refuse, such as a job under the settings, can't be saved or carried to the form.
  const refused =
    yaml !== null && applied.error !== undefined
      ? editErrorText(t, editing, applied.error)
      : undefined
  const scopeName = yaml !== null ? name : (o.rename?.from(draft.current) ?? name)
  const scoped = useScopedProblems(whole, o.scope(scopeName), yaml, o.exclude)
  // The workflow with what a switch to the form committed, for the form to start from.
  const current = useMemo(
    () =>
      start !== undefined && committed.length > 0
        ? asRecord(editing.loadYaml(applyAll(editing, start, committed)))
        : null,
    [editing, start, committed],
  )
  const save = (edits: GraphEdit[]) => {
    const edit = editing.batchOf(o.addition ? [o.addition, ...edits] : edits)
    if (edit) {
      o.onEdit(edit)
    }
    o.onClose()
  }
  const toYaml = () => {
    if (start === undefined) {
      return
    }
    if (invalidDraft.current) {
      setProblem(t.fixFieldsFirst)
      return
    }
    const edits = drafted()
    const renamed = o.rename?.from(draft.current) ?? name
    try {
      const text = o.read(applyAll(editing, start, edits), renamed)
      setCommitted(edits)
      setName(renamed)
      setYamlName(renamed)
      setYaml(text)
      setYamlAtStart(text)
      setProblem(undefined)
      o.onViewChange?.('yaml')
    } catch (error) {
      setProblem(editErrorText(t, editing, error))
    }
  }
  const toForm = () => {
    if (yaml === null) {
      return
    }
    const issue = problemOf(yaml) ?? nameError ?? refused
    if (issue) {
      setProblem(issue)
      return
    }
    setCommitted(withRename(withYaml(yaml)))
    setName(nextName)
    groups.clear()
    setYaml(null)
    setVersion((current) => current + 1)
    o.onViewChange?.('form')
  }
  const switcher = <ViewSwitch yaml={yaml !== null} onForm={toForm} onYaml={toYaml} />
  const yamlDialog = (title: string, path: string, text: string) => (
    <DialogShell
      title={title}
      onClose={o.onClose}
      dirty={committed.length > 0 || text !== yamlAtStart || nextName !== name}
      saveDisabled={
        problemOf(text) !== undefined || nameError !== undefined || refused !== undefined
      }
      onSubmit={() => save(withRename(withYaml(text)))}
      headerEnd={switcher}
      openOnAdd={o.openOnAdd}
    >
      {o.rename && (
        <Input
          mono
          label={o.rename.label}
          description={o.rename.description}
          value={yamlName}
          error={nameError}
          onChange={(e) => setYamlName(e.target.value)}
        />
      )}
      <YamlPane
        path={path}
        nested={groups.nested}
        value={text}
        onChange={(next) => {
          setYaml(next)
          setProblem(undefined)
        }}
        problem={problem ?? problemOf(text) ?? refused}
        scoped={scoped}
      />
    </DialogShell>
  )
  const formDialog = (render: (host: FormHost) => ReactNode) => (
    <SectionMemory.Provider value={sections}>
      <FieldProblems problems={scoped.problems}>
        {render({
          pending: committed.length > 0 || o.addition !== undefined,
          onDraft: trackDraft,
          renderShell: (shellProps) => (
            <DialogShell
              {...shellProps}
              headerEnd={switcher}
              openOnAdd={o.openOnAdd}
              onSubmit={() => save(drafted())}
            >
              <FieldError message={problem} />
              <ProblemList problems={scoped.problems} />
              {shellProps.children}
            </DialogShell>
          ),
        })}
      </FieldProblems>
    </SectionMemory.Provider>
  )
  return { start, yaml, name, version, current, yamlDialog, formDialog }
}

/** A job's settings in a form, or as YAML; switching carries the edits across. */
export function JobDialog(props: JobDialogProps & ViewProps) {
  const t = useGraphEditorStrings()
  const editing = useWorkflowEditing()
  const views = useSettingsViews({
    ...props,
    name: props.job,
    read: editing.jobYaml,
    write: (job, yaml) => ({ type: 'setJobYaml', job, yaml }),
    scope: (job) => ['jobs', job],
    rename: {
      label: t.jobName,
      description: t.help.jobName,
      error: (next, current) =>
        !editing.isValidJobName(next)
          ? t.invalidJobName
          : next !== current && next !== props.job && Object.hasOwn(props.jobs, next)
            ? t.jobExists
            : undefined,
      edit: (job, name) => ({ type: 'updateJob', job, name }),
      from: renamedJob,
    },
  })
  if (views.start === undefined) {
    return <JobForm {...props} />
  }
  if (views.yaml !== null) {
    return views.yamlDialog(t.editJob, JOB_YAML_PATH, views.yaml)
  }
  const { current } = views
  return views.formDialog((host) => (
    <JobForm
      key={views.version}
      {...props}
      {...host}
      job={views.name}
      jobs={current ? asRecord(current['jobs']) : props.jobs}
      workflow={current ?? props.workflow}
    />
  ))
}

/** A step's settings in a form, or as YAML; switching carries the edits across. */
export function StepDialog(props: StepDialogProps & ViewProps) {
  const { job, index } = props
  const t = useGraphEditorStrings()
  const editing = useWorkflowEditing()
  const views = useSettingsViews({
    ...props,
    name: job,
    read: (text) => editing.stepYaml(text, job, index),
    write: (_, yaml) => ({ type: 'setStepYaml', job, index, yaml }),
    scope: () => ['jobs', job, 'steps', String(index)],
  })
  if (views.start === undefined) {
    return <StepForm {...props} />
  }
  if (views.yaml !== null) {
    return views.yamlDialog(t.editStep, STEP_YAML_PATH, views.yaml)
  }
  const steps = asRecord(asRecord(views.current?.['jobs'])[job])['steps']
  return views.formDialog((host) => (
    <StepForm
      key={views.version}
      {...props}
      {...host}
      adding={props.addition !== undefined}
      steps={Array.isArray(steps) ? steps : props.steps}
      workflow={views.current ?? props.workflow}
    />
  ))
}

import cx from 'classnames'
import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from 'react'
import Dropdown from '../components/Dropdown'
import { FilterPill } from '../components/FilterPill'
import { IconButton } from '../components/IconButton'
import { Input, Textarea } from '../components/Input'
import { withPositionKeys } from '../components/keys'
import { useWorkflowEditing, useWorkflowEngine } from '../components/Provider'
import type { FieldPatch, GraphEdit, InputPath, WorkflowEditing } from '../editing'
import { INPUT_YAML_PATH } from '../editor/settingsYaml'
import { DynamicForm } from '../form/Form'
import { formatDuration, parseDuration } from '../form/utils/duration'
import { ArrowDownIcon, ArrowUpIcon, CloseIcon, EditIcon, TrashIcon } from '../icons'
import {
  AddRowButton,
  asRecord,
  ChoiceButtons,
  DialogShell,
  diffPatch,
  EXPRESSION,
  ExpressionToggle,
  expressionError,
  FieldError,
  type Flag,
  flagError,
  GrowingTextarea,
  isEmptyPatch,
  isScalar,
  type Json,
  KeyHint,
  LabelledField,
  labelled,
  type OpenOnAdd,
  parseJson,
  parseScalar,
  Section,
  SectionMemory,
  StringListEditor,
  SuggestedInput,
  sameValue,
  ToggleField,
  text,
  unchangedValue,
  useSectionMemory,
  withoutUndefined,
} from './editorFields'
import {
  type GraphEditorStrings,
  type InputsEditorStrings,
  useGraphEditorStrings,
  useInputsEditorStrings,
} from './editorStrings'
import { withInputLayouts } from './inputLayout'
import { FlagField, type InputSource, inputRefs, ValueOrInputField } from './inputRefs'
import { FIELD_TEXT_BOX, SuggestionInput } from './SuggestionInput'
import type { SettingsView } from './settingsViews'
import { NO_SCOPED, ViewSwitch, YamlPane, yamlProblem } from './settingsViews'

type Help = keyof InputsEditorStrings['help']
type Kind =
  | 'text'
  | 'textarea'
  | 'number'
  | 'flag'
  | 'bool'
  | 'options'
  | 'json'
  | 'providers'
  | 'template'
  | 'language'
  | 'values'
  | 'rows'
  | 'duration'
  | 'ref'
  | 'implies'
  | 'choice'
  | 'perCopy'

interface Prop {
  key: string
  kind: Kind
  help: Help
  fallback?: boolean
  required?: boolean
  /** The schema also takes an object here, or with 'any' a list too. */
  nested?: 'object' | 'any'
  /** Inputs whose value this field can read. */
  refTypes?: string[]
  /** False when the field only reads another input. */
  literal?: boolean
  /** The values the schema takes when it isn't read from an input. */
  choices?: string[]
  /** The switch can follow another input's value. */
  conditional?: boolean
  /** A short text that starts one line tall and grows as it is written. */
  grow?: boolean
  /** Text people read, such as a label, set in the regular font instead of as code. */
  prose?: boolean
  /** The field's label where its key means something else on another type. */
  label?: keyof InputsEditorStrings['fields']
  /** A whole number of at least this, never an expression, as the schema takes for a length. */
  wholeFrom?: number
  /** A regular expression, which the run form compiles. */
  pattern?: boolean
}

/** Input types by menu group, in the order the add menu lists them. */
export const INPUT_TYPE_GROUPS: [keyof InputsEditorStrings['typeGroups'], string[]][] = [
  ['basic', ['string', 'number', 'duration', 'boolean', 'password', 'editor', 'color-picker']],
  ['choices', ['dropdown', 'multi-dropdown', 'radio', 'checkbox-group']],
  ['layout', ['group', 'list', 'header', 'step']],
  ['compute', ['compute-clusters', 'compute-resources', 'compute-target', 'bucket']],
  ['schedulers', ['slurm-accounts', 'slurm-partitions', 'slurm-qos', 'pbs-queues']],
  ['cloud', ['region', 'zone', 'instance-type']],
  [
    'kubernetes',
    [
      'kubernetes-clusters',
      'kubernetes-namespaces',
      'kubernetes-pods',
      'kubernetes-pvc',
      'kubernetes-secrets',
      'kubernetes-configmaps',
      'kubernetes-statefulsets',
      'kubernetes-deployments',
      'kubernetes-services',
      'kubernetes-workloads',
    ],
  ],
  ['platform', ['organization-groups', 'ai-model', 'allocations']],
]

const DEFAULT: Prop = { key: 'default', kind: 'text', help: 'default' }
const DEFAULT_OBJECT: Prop = { ...DEFAULT, nested: 'object' }
const DEFAULT_LIST: Prop = {
  key: 'default',
  kind: 'values',
  help: 'defaultList',
}
// A resource picker's default is one resource address, or a list of them with multi on.
const RESOURCE_DEFAULT: Prop = {
  ...DEFAULT,
  help: 'defaultResource',
  nested: 'any',
}
const RESOURCE_DEFAULTS: Prop = { ...DEFAULT_LIST, help: 'defaultResources' }
const AUTOSELECT: Prop = {
  key: 'autoselect',
  kind: 'flag',
  help: 'autoselect',
  nested: 'object',
  conditional: true,
}
const PLACEHOLDER: Prop = {
  key: 'placeholder',
  kind: 'text',
  help: 'placeholder',
  prose: true,
}
const CLUSTER: Prop = {
  key: 'clusterName',
  kind: 'ref',
  help: 'clusterName',
  required: true,
  refTypes: ['kubernetes-clusters'],
}
const NAMESPACE: Prop = {
  key: 'namespace',
  kind: 'ref',
  help: 'namespace',
  required: true,
  refTypes: ['kubernetes-namespaces'],
}
const CSPS = ['aws', 'azure', 'google', 'openstack']
const CSP: Prop = {
  key: 'csp',
  kind: 'ref',
  help: 'csp',
  refTypes: ['dropdown', 'radio'],
  choices: CSPS,
}
const CSP_REQUIRED: Prop = { ...CSP, required: true }
const REGION: Prop = {
  key: 'region',
  kind: 'ref',
  help: 'region',
  required: true,
  refTypes: ['region'],
}
const RESOURCE: Prop = {
  key: 'resource',
  kind: 'ref',
  help: 'resource',
  required: true,
  refTypes: ['compute-clusters', 'compute-resources'],
  literal: false,
}
const ACCOUNT: Prop = {
  key: 'account',
  kind: 'ref',
  help: 'account',
  refTypes: ['slurm-accounts'],
  literal: false,
}
const DEFAULT_FROM_INPUT: Prop = {
  key: 'default',
  kind: 'ref',
  help: 'defaultFromInput',
  refTypes: ['string', 'dropdown', 'radio'],
  literal: false,
}
const OPTIONS: Prop = {
  key: 'options',
  kind: 'options',
  help: 'options',
  required: true,
}
const MULTI: Prop = { key: 'multi', kind: 'bool', help: 'multi' }
const COMPUTE: Prop[] = [
  RESOURCE_DEFAULT,
  RESOURCE_DEFAULTS,
  AUTOSELECT,
  {
    key: 'include-workspace',
    kind: 'flag',
    help: 'includeWorkspace',
    conditional: true,
  },
  {
    key: 'include-unprovisioned',
    kind: 'flag',
    help: 'includeUnprovisioned',
    conditional: true,
  },
  CSP,
  { key: 'provider', kind: 'providers', help: 'provider' },
  MULTI,
]
const IN_NAMESPACE: Prop[] = [DEFAULT_OBJECT, CLUSTER, NAMESPACE, AUTOSELECT]
const SLIDER: Prop = { key: 'slider', kind: 'flag', help: 'slider' }
const FLATTEN: Prop = { key: 'flatten', kind: 'bool', help: 'flatten' }
const TEMPLATE: Prop = {
  key: 'template',
  kind: 'template',
  help: 'template',
  required: true,
}
const LIST_DEFAULT: Prop = { key: 'default', kind: 'rows', help: 'listDefault' }
const DURATION_DEFAULT: Prop = { key: 'default', kind: 'duration', help: 'durationDefault' }
const DISABLE_LABEL: Prop = {
  key: 'disableLabel',
  kind: 'text',
  help: 'disableLabel',
  prose: true,
}
const DISABLE_VALUE: Prop = {
  key: 'disableValue',
  kind: 'number',
  help: 'disableValue',
}
const OPTION_KEY: Prop = {
  key: 'option-key',
  kind: 'ref',
  help: 'optionKey',
  refTypes: ['dropdown', 'radio', 'string'],
  literal: false,
}

const TYPE_PROPS: Record<string, Prop[]> = {
  string: [
    DEFAULT,
    PLACEHOLDER,
    { key: 'textarea', kind: 'bool', help: 'textarea' },
    { key: 'prefillDefault', kind: 'flag', help: 'prefillDefault' },
    { key: 'minLength', kind: 'number', help: 'minLength', wholeFrom: 0 },
    { key: 'maxLength', kind: 'number', help: 'maxLength', wholeFrom: 1 },
    { key: 'lowercase', kind: 'bool', help: 'lowercase' },
    { key: 'sanitize', kind: 'text', help: 'sanitize', pattern: true },
  ],
  number: [
    { key: 'default', kind: 'number', help: 'default' },
    { key: 'min', kind: 'number', help: 'minNumber' },
    { key: 'max', kind: 'number', help: 'maxNumber' },
    { key: 'step', kind: 'number', help: 'step' },
    SLIDER,
  ],
  boolean: [{ key: 'default', kind: 'flag', help: 'default' }],
  password: [DEFAULT],
  editor: [
    { key: 'default', kind: 'textarea', help: 'default' },
    { key: 'language', kind: 'language', help: 'language' },
  ],
  'color-picker': [DEFAULT],
  dropdown: [OPTIONS, OPTION_KEY, DEFAULT_OBJECT, PLACEHOLDER, AUTOSELECT],
  'multi-dropdown': [OPTIONS, DEFAULT_LIST],
  radio: [
    OPTIONS,
    DEFAULT,
    {
      key: 'optionLabelPosition',
      kind: 'choice',
      help: 'optionLabelPosition',
      choices: ['left', 'top'],
    },
  ],
  'checkbox-group': [OPTIONS, DEFAULT_LIST, { key: 'implies', kind: 'implies', help: 'implies' }],
  duration: [
    DURATION_DEFAULT,
    PLACEHOLDER,
    { key: 'min', kind: 'duration', help: 'minDuration' },
    { key: 'max', kind: 'duration', help: 'maxDuration' },
    DISABLE_LABEL,
    DISABLE_VALUE,
  ],
  group: [{ key: 'collapsed', kind: 'flag', help: 'collapsed', conditional: true }, FLATTEN],
  list: [
    TEMPLATE,
    LIST_DEFAULT,
    { key: 'items-collapsible', kind: 'flag', help: 'itemsCollapsible' },
    { key: 'min', kind: 'number', help: 'minItems' },
    { key: 'max', kind: 'number', help: 'maxItems' },
  ],
  header: [
    {
      key: 'text',
      kind: 'textarea',
      help: 'text',
      required: true,
      grow: true,
      prose: true,
    },
    { key: 'size', kind: 'number', help: 'size' },
    { key: 'bold', kind: 'flag', help: 'bold', fallback: true },
  ],
  step: [
    { key: 'title', kind: 'perCopy', help: 'title', required: true, prose: true },
    { key: 'nextLabel', kind: 'text', help: 'nextLabel', prose: true },
    { key: 'prevLabel', kind: 'text', help: 'prevLabel', prose: true },
    { key: 'multi', kind: 'bool', help: 'multiStep', label: 'multiStep' },
    { key: 'min', kind: 'number', help: 'minCopies' },
    { key: 'max', kind: 'number', help: 'maxCopies' },
  ],
  'compute-clusters': COMPUTE,
  'compute-resources': COMPUTE,
  bucket: [
    RESOURCE_DEFAULT,
    RESOURCE_DEFAULTS,
    CSP,
    { key: 'generateCredentials', kind: 'flag', help: 'generateCredentials' },
    MULTI,
  ],
  region: [DEFAULT_OBJECT, CSP_REQUIRED, AUTOSELECT],
  zone: [DEFAULT_OBJECT, CSP_REQUIRED, REGION, AUTOSELECT],
  'instance-type': [DEFAULT_OBJECT, CSP_REQUIRED, REGION, AUTOSELECT],
  'slurm-accounts': [DEFAULT_FROM_INPUT, RESOURCE],
  'slurm-partitions': [DEFAULT_FROM_INPUT, RESOURCE, ACCOUNT],
  'slurm-qos': [
    DEFAULT_FROM_INPUT,
    RESOURCE,
    ACCOUNT,
    {
      key: 'partition',
      kind: 'ref',
      help: 'partition',
      refTypes: ['slurm-partitions'],
      literal: false,
    },
  ],
  'pbs-queues': [DEFAULT_FROM_INPUT, RESOURCE],
  'organization-groups': [DEFAULT_FROM_INPUT],
  'ai-model': [DEFAULT, PLACEHOLDER, AUTOSELECT],
  allocations: [
    DEFAULT,
    PLACEHOLDER,
    AUTOSELECT,
    { key: 'includeEmpty', kind: 'bool', help: 'includeEmpty', fallback: true },
  ],
  'kubernetes-clusters': [DEFAULT_OBJECT, AUTOSELECT],
  'kubernetes-namespaces': [DEFAULT_OBJECT, CLUSTER, AUTOSELECT],
  'kubernetes-pods': IN_NAMESPACE,
  'kubernetes-pvc': IN_NAMESPACE,
  'kubernetes-secrets': IN_NAMESPACE,
  'kubernetes-configmaps': IN_NAMESPACE,
  'kubernetes-statefulsets': IN_NAMESPACE,
  'kubernetes-deployments': IN_NAMESPACE,
  'kubernetes-services': IN_NAMESPACE,
  'kubernetes-workloads': IN_NAMESPACE,
}

const TEXT_FIELDS = ['label', 'description', 'tooltip'] as const
const FLAG_FIELDS = ['optional', 'hidden', 'disabled', 'ignore'] as const
type CommonKey = (typeof TEXT_FIELDS)[number] | (typeof FLAG_FIELDS)[number]

// Which shared keys each type takes, per the workflow schema.
const COMMON_KEYS: Record<string, CommonKey[]> = {
  group: ['label', 'description', 'tooltip', 'hidden', 'ignore'],
  header: ['label', 'description', 'tooltip', 'hidden'],
  step: ['description'],
}
const ALL_COMMON: CommonKey[] = [...TEXT_FIELDS, ...FLAG_FIELDS]

// Keys this dialog manages; anything else on an input is left untouched.
const KNOWN_KEYS = new Set<string>([
  'type',
  ...ALL_COMMON,
  ...Object.values(TYPE_PROPS).flatMap((props) => props.map((prop) => prop.key)),
  'items',
  'template',
  'options',
])

const LANGUAGES = ['bash', 'python', 'yaml', 'json', 'javascript', 'shell']

export function inputTypes(): string[] {
  return INPUT_TYPE_GROUPS.flatMap(([, types]) => types)
}

export function commonKeys(type: string): CommonKey[] {
  return COMMON_KEYS[type] ?? ALL_COMMON
}

/** Every key the dialog can write for an input of `type`. */
export function offeredInputKeys(editing: WorkflowEditing, type: string): string[] {
  const children = editing.inputChildrenKey(type)
  return [
    'type',
    ...commonKeys(type),
    ...(TYPE_PROPS[type] ?? []).map((prop) => prop.key),
    ...(children ? [children] : []),
  ]
}

/** The starting definition of a new input of `type`, with what the schema requires. */
export function newInputDefinition(type: string): Json {
  switch (type) {
    case 'dropdown':
    case 'multi-dropdown':
    case 'radio':
    case 'checkbox-group':
      return {
        type,
        options: [
          { value: 'one', label: 'One' },
          { value: 'two', label: 'Two' },
        ],
      }
    case 'group':
      return { type, items: {} }
    case 'list':
      return { type, template: { value: { type: 'string' } } }
    case 'header':
      return { type, text: '' }
    case 'step':
      return { type, title: '', options: {} }
    default:
      return { type }
  }
}

interface OptionRow {
  value: string
  label: string
  /** The value the row was read from, written back as it was while its text is unchanged. */
  original?: unknown
  /** Written as a bare value rather than a value/label pair. */
  bare?: boolean
  rest?: Json
}

interface OptionsDraft {
  /** byKey is the keyed dropdown the schema pairs with option-key; json is any other list. */
  mode: 'list' | 'expression' | 'byKey' | 'json'
  rows: OptionRow[]
  text: string
}

function optionsDraft(value: unknown): OptionsDraft {
  if (typeof value === 'string') {
    return { mode: 'expression', rows: [], text: value }
  }
  if (Array.isArray(value)) {
    const rows: OptionRow[] = []
    for (const item of value) {
      if (isScalar(item)) {
        rows.push({
          value: String(item),
          label: '',
          bare: true,
          original: item,
        })
      } else if (typeof item === 'object' && item !== null) {
        const { value: optionValue, label, ...rest } = item as Json
        if (!isScalar(optionValue) || (label !== undefined && !isScalar(label))) {
          return {
            mode: 'json',
            rows: [],
            text: JSON.stringify(value, null, 2),
          }
        }
        rows.push({
          value: String(optionValue),
          original: optionValue,
          label: text(label),
          ...(Object.keys(rest).length > 0 ? { rest } : {}),
        })
      }
    }
    return { mode: 'list', rows, text: '' }
  }
  if (value !== undefined && value !== null) {
    return { mode: 'byKey', rows: [], text: JSON.stringify(value, null, 2) }
  }
  return { mode: 'list', rows: [], text: '' }
}

function optionsValue(
  draft: OptionsDraft,
  { labelled = false, textValues = false }: ValueContext,
): unknown {
  if (draft.mode === 'expression') {
    return draft.text.trim() || undefined
  }
  if (draft.mode === 'byKey' || draft.mode === 'json') {
    return draft.text.trim() ? parseJson(draft.text).value : undefined
  }
  return draft.rows.map((row) => {
    const written = unchangedValue(row.value, row.original)
      ? row.original
      : parseScalar(row.value.trim())
    const value = textValues && isScalar(written) ? String(written) : written
    if (row.bare && !row.label.trim() && !row.rest && typeof value === 'string') {
      return value
    }
    // A multi-select shows only labels, so it needs one on every option, as does a value that isn't text.
    const label =
      row.label.trim() || (labelled || typeof value !== 'string' ? row.value.trim() : '')
    return {
      value,
      ...(label ? { label } : {}),
      ...row.rest,
    }
  })
}

function optionsError(
  draft: OptionsDraft,
  t: InputsEditorStrings,
  g: GraphEditorStrings,
): string | undefined {
  if (draft.mode === 'expression') {
    return draft.text.trim() ? expressionError(draft.text, g) : g.required
  }
  if (draft.mode === 'byKey' || draft.mode === 'json') {
    const parsed = parseJson(draft.text)
    if (!parsed.ok) {
      return g.invalidJson
    }
    if (draft.mode === 'json') {
      return Array.isArray(parsed.value) ? undefined : t.optionsJsonShape
    }
    const keyed = asRecord(parsed.value)
    return parsed.value === keyed &&
      Object.values(keyed).length > 0 &&
      Object.values(keyed).every(Array.isArray)
      ? undefined
      : t.optionsByKeyShape
  }
  return draft.rows.length === 0 || draft.rows.some((row) => !row.value.trim())
    ? t.needsOptions
    : undefined
}

function OptionsEditor({
  draft,
  onChange,
  error,
  keyed,
  described,
}: {
  draft: OptionsDraft
  onChange: (draft: OptionsDraft) => void
  error: string | undefined
  /** Offers options grouped by key, which only a dropdown takes. */
  keyed: boolean
  /** Each option also takes a description, as a checkbox shows one. */
  described: boolean
}) {
  const t = useInputsEditorStrings()
  const update = (i: number, patch: Partial<OptionRow>) =>
    onChange({
      ...draft,
      rows: draft.rows.map((row, j) => (j === i ? { ...row, ...patch } : row)),
    })
  // JSON is offered only for options the list can't show; an expression has its own switch.
  const modes = [
    { value: 'list' as const, label: t.optionsList },
    ...(keyed || draft.mode === 'byKey'
      ? [{ value: 'byKey' as const, label: t.optionsByKey }]
      : []),
    ...(draft.mode === 'json' ? [{ value: 'json' as const, label: t.optionsJson }] : []),
  ]
  return (
    <div className="flex flex-col gap-2">
      {draft.mode !== 'expression' && modes.length > 1 && (
        <ChoiceButtons
          options={modes}
          value={draft.mode}
          onChange={(mode) => onChange({ ...draft, mode })}
        />
      )}
      {draft.mode === 'list' ? (
        <>
          {draft.rows.length > 0 && (
            <div aria-hidden="true" className="flex items-center gap-2 text-xs theme-muted-text">
              <div className="w-2/5">{t.optionValue}</div>
              <div className="flex-1">{t.optionLabel}</div>
              {described && <div className="flex-1">{t.optionDescription}</div>}
              <div className="w-7 shrink-0" />
            </div>
          )}
          {withPositionKeys(draft.rows).map(({ key, item: row }, i) => (
            <div key={key} className="flex items-center gap-2">
              <div className="w-2/5">
                <Input
                  mono
                  aria-label={t.optionValue}
                  placeholder={t.optionValue}
                  value={row.value}
                  onChange={(e) => update(i, { value: e.target.value })}
                />
              </div>
              <div className="flex-1">
                <Input
                  aria-label={t.optionLabel}
                  placeholder={t.optionLabel}
                  value={row.label}
                  onChange={(e) => update(i, { label: e.target.value })}
                />
              </div>
              {described && (
                <div className="flex-1">
                  <Input
                    aria-label={t.optionDescription}
                    placeholder={t.optionDescription}
                    value={text(row.rest?.['description'])}
                    onChange={(e) => {
                      const { description: _old, ...rest } = row.rest ?? {}
                      update(i, {
                        rest: e.target.value ? { ...rest, description: e.target.value } : rest,
                      })
                    }}
                  />
                </div>
              )}
              <IconButton
                icon={<CloseIcon className="h-4 w-4" />}
                label={t.removeOption}
                variant="ghost"
                size="sm"
                onClick={() =>
                  onChange({
                    ...draft,
                    rows: draft.rows.filter((_, j) => j !== i),
                  })
                }
              />
            </div>
          ))}
          <AddRowButton
            label={t.addOption}
            onClick={() =>
              onChange({
                ...draft,
                rows: [...draft.rows, { value: '', label: '' }],
              })
            }
          />
        </>
      ) : draft.mode === 'expression' ? (
        <Input
          mono
          aria-label={t.fields.options}
          value={draft.text}
          onChange={(e) => onChange({ ...draft, text: e.target.value })}
        />
      ) : (
        <>
          <div className="text-xs theme-muted-text">
            {draft.mode === 'byKey' ? t.optionsByKeyHelp : t.optionsJsonHelp}
          </div>
          <Textarea
            mono
            aria-label={t.fields.options}
            rows={6}
            value={draft.text}
            placeholder={
              draft.mode === 'byKey'
                ? '{\n  "aws": ["us-east-1", "us-west-2"],\n  "google": ["us-central1"]\n}'
                : undefined
            }
            onChange={(e) => onChange({ ...draft, text: e.target.value })}
          />
        </>
      )}
      <FieldError message={error} />
    </div>
  )
}

/** For each option, the options ticking it also ticks. */
type ImpliesDraft = Record<string, string[]>

function impliesDraft(value: unknown): ImpliesDraft {
  return Object.fromEntries(
    Object.entries(asRecord(value)).map(([key, list]) => [
      key,
      Array.isArray(list) ? list.map((item) => String(item)) : [],
    ]),
  )
}

/** Each option with the others as switches: ticking that option in the form ticks these too. */
function ImpliesEditor({
  draft,
  options,
  onChange,
}: {
  draft: ImpliesDraft
  options: OptionRow[]
  onChange: (draft: ImpliesDraft) => void
}) {
  const t = useInputsEditorStrings()
  const listed = options.filter((option) => option.value.trim())
  if (listed.length < 2) {
    return <div className="text-xs theme-muted-text">{t.impliesNeedsOptions}</div>
  }
  const nameOf = (value: string) =>
    listed.find((option) => option.value === value)?.label.trim() || value
  const toggle = (from: string, to: string) => {
    const current = draft[from] ?? []
    onChange({
      ...draft,
      [from]: current.includes(to) ? current.filter((value) => value !== to) : [...current, to],
    })
  }
  return (
    <div className="flex flex-col gap-2">
      {listed.map((option) => (
        <div key={option.value} className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-sm font-medium">{t.impliesWhen(nameOf(option.value))}</span>
          {listed
            .filter((other) => other.value !== option.value)
            .map((other) => {
              return (
                <FilterPill
                  key={other.value}
                  active={(draft[option.value] ?? []).includes(other.value)}
                  onClick={() => toggle(option.value, other.value)}
                >
                  {nameOf(other.value)}
                </FilterPill>
              )
            })}
        </div>
      ))}
    </div>
  )
}

/** A duration's checkbox that sends a set value in place of a time, such as -1 for none. */
function OptOutCheckbox({
  label,
  value,
  onLabel,
  onValue,
  errors,
}: {
  label: string
  value: string
  onLabel: (label: string) => void
  onValue: (value: string) => void
  errors: { label: string | undefined; value: string | undefined }
}) {
  const t = useInputsEditorStrings()
  const [on, setOn] = useState(label.trim() !== '' || value.trim() !== '')
  return (
    <div className="flex flex-col gap-3">
      <ToggleField
        label={t.fields.optOut}
        description={t.help.optOut}
        checked={on}
        onChange={(next) => {
          setOn(next)
          if (!next) {
            onLabel('')
            onValue('')
          }
        }}
      />
      {on && (
        <div className="flex flex-col gap-3 border-l theme-border pl-4">
          <Input
            {...labelled(t.fields.disableLabel, 'disableLabel')}
            description={t.help.disableLabel}
            value={label}
            error={errors.label}
            placeholder={t.optOutPlaceholder}
            onChange={(e) => onLabel(e.target.value)}
          />
          <Input
            mono
            {...labelled(t.fields.disableValue, 'disableValue')}
            description={t.help.disableValue}
            value={value}
            error={errors.value}
            placeholder="-1"
            onChange={(e) => onValue(e.target.value)}
          />
        </div>
      )}
    </div>
  )
}

function TypeSelect({
  value,
  onChange,
  allowStep,
  disabled,
}: {
  value: string
  onChange: (type: string) => void
  allowStep: boolean
  disabled: boolean
}) {
  const t = useInputsEditorStrings()
  const id = useId()
  const types = t.types as Record<string, string>
  const help = t.typeHelp as Record<string, string>
  const known = inputTypes().includes(value)
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-baseline gap-x-1.5">
        <label htmlFor={id} className="text-[0.8125rem] font-medium text-(--theme-app)">
          {t.inputType}
        </label>
        <KeyHint label={t.inputType} yamlKey="type" />
      </div>
      <Dropdown
        id={id}
        value={value}
        disabled={disabled}
        textBoxClassName={FIELD_TEXT_BOX}
        options={[
          ...(known ? [] : [{ label: value, value }]),
          ...INPUT_TYPE_GROUPS.map(([group, list]) => ({
            category: t.typeGroups[group],
            options: list
              .filter((type) => allowStep || type !== 'step' || value === 'step')
              .map((type) => ({ label: types[type] ?? type, value: type })),
          })),
        ]}
        onChange={(next) => {
          if (typeof next === 'string' && next) {
            onChange(next)
          }
        }}
      />
      <span className="text-xs text-(--theme-muted-text-color)">{help[value] ?? t.help.type}</span>
    </div>
  )
}

type Drafts = Record<string, unknown>

// Kinds that write one value, which a list or object kept from another type can't be.
const SCALAR_KINDS = new Set<Kind>([
  'text',
  'textarea',
  'number',
  'flag',
  'bool',
  'language',
  'duration',
  'ref',
  'choice',
])

function effectiveKind(prop: Prop, original: unknown): Kind {
  if (original === null || typeof original !== 'object') {
    return prop.kind
  }
  // Only a shape the schema takes there is edited as JSON; a list where one value goes isn't one.
  const takes = Array.isArray(original) ? prop.nested === 'any' : prop.nested !== undefined
  return takes && prop.kind !== 'options' && prop.kind !== 'template' && prop.kind !== 'providers'
    ? 'json'
    : prop.kind
}

interface ValuesDraft {
  /** A default the YAML sets by expression, kept as written. */
  expression: string | undefined
  values: string[]
}

interface RowsDraft {
  expression: string | undefined
  rows: Json[]
}

/** A repeated page's title or description: one text, or one per copy. */
interface PerCopyDraft {
  list: boolean
  text: string
  values: string[]
}

function listItemText(item: unknown): string {
  if (isScalar(item)) {
    return String(item)
  }
  const value = asRecord(item)['value']
  return isScalar(value) ? String(value) : JSON.stringify(item)
}

function draftOf(kind: Kind, value: unknown): unknown {
  switch (kind) {
    case 'flag':
      return typeof value === 'boolean' || typeof value === 'string' ? value : undefined
    case 'bool':
      return typeof value === 'boolean' ? value : undefined
    case 'json':
      return value === undefined ? '' : JSON.stringify(value, null, 2)
    case 'options':
      return optionsDraft(value)
    case 'providers':
      return Array.isArray(value) ? value.join(', ') : text(value)
    case 'template':
      return typeof value === 'string' ? value : asRecord(value)
    case 'implies':
      return impliesDraft(value)
    case 'rows':
      return typeof value === 'string'
        ? { expression: value, rows: [] }
        : {
            expression: undefined,
            rows: Array.isArray(value) ? value.map(asRecord) : [],
          }
    case 'duration':
      // A negative number is an opt-out value, such as -1, and shows as written.
      return typeof value === 'number' && value >= 0 ? formatDuration(value) : text(value)
    case 'number':
      // A number written as text shows quoted, so typing the number is an edit that replaces it.
      return typeof value === 'string' &&
        value.trim() !== '' &&
        !EXPRESSION.test(value.trim()) &&
        Number.isFinite(Number(value))
        ? JSON.stringify(value)
        : text(value)
    case 'perCopy':
      return Array.isArray(value)
        ? { list: true, text: '', values: value.map(listItemText) }
        : { list: false, text: text(value), values: [] }
    case 'values':
      return typeof value === 'string' && EXPRESSION.test(value.trim())
        ? { expression: value, values: [] }
        : {
            expression: undefined,
            values: (Array.isArray(value) ? value : value === undefined ? [] : [value]).map(
              listItemText,
            ),
          }
    default:
      // Only a wrong-shaped value lands here; it shows as JSON text rather than [object Object].
      if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
        return value.join('\n')
      }
      return value !== null && typeof value === 'object' ? JSON.stringify(value) : text(value)
  }
}

interface ValueContext {
  /** Options need labels, as a multi-select's do. */
  labelled?: boolean
  /** Option values, and the defaults picking them, are text, as a radio's and a checkbox group's are. */
  textValues?: boolean
}

// The keys an option of these types takes besides its value and label, all text; other types' options take any.
const OPTION_KEYS: Record<string, string[]> = { radio: [], 'checkbox-group': ['description'] }

function textOption(option: unknown, keys: string[]): unknown {
  if (isScalar(option)) {
    return String(option)
  }
  const record = asRecord(option)
  if (option !== record) {
    return option
  }
  return Object.fromEntries(
    Object.entries(record)
      .filter(([key]) => key === 'value' || key === 'label' || keys.includes(key))
      .map(([key, value]) => [key, isScalar(value) ? String(value) : value]),
  )
}

function fitsTextOption(option: unknown, keys: string[]): boolean {
  if (typeof option === 'string') {
    return true
  }
  const record = asRecord(option)
  return (
    option === record &&
    typeof record['value'] === 'string' &&
    Object.entries(record).every(
      ([key, value]) =>
        (key === 'value' || key === 'label' || keys.includes(key)) && typeof value === 'string',
    )
  )
}

function writtenValue(kind: Kind, draft: unknown, context: ValueContext = {}): unknown {
  switch (kind) {
    case 'flag':
    case 'bool':
      return draft
    case 'json': {
      const raw = String(draft ?? '').trim()
      return raw ? parseJson(raw).value : undefined
    }
    case 'options':
      return optionsValue(draft as OptionsDraft, context)
    case 'perCopy': {
      const perCopy = draft as PerCopyDraft
      const values = perCopy.values.map((value) => value.trim()).filter(Boolean)
      return perCopy.list
        ? values.length > 0
          ? values
          : undefined
        : perCopy.text.trim() || undefined
    }
    case 'values': {
      const list = draft as ValuesDraft
      if (list.expression !== undefined) {
        return list.expression.trim() || undefined
      }
      const values = list.values.map((value) => value.trim()).filter(Boolean)
      if (values.length === 0) {
        return undefined
      }
      return context.textValues ? values : values.map(parseScalar)
    }
    case 'rows': {
      const list = draft as RowsDraft
      if (list.expression !== undefined) {
        return list.expression.trim() || undefined
      }
      // A field left empty in a default row is unset, not an empty string.
      const rows = list.rows.map((row) =>
        Object.fromEntries(
          Object.entries(row).filter(
            ([, value]) => value !== '' && value !== undefined && value !== null,
          ),
        ),
      )
      return rows.length > 0 ? rows : undefined
    }
    case 'duration': {
      const raw = String(draft ?? '').trim()
      if (!raw) {
        return undefined
      }
      if (EXPRESSION.test(raw)) {
        return raw
      }
      return parseDuration(raw) ?? (/^-\d+$/.test(raw) ? Number(raw) : raw)
    }
    case 'ref':
    case 'choice':
      return String(draft ?? '').trim() || undefined
    case 'number': {
      const raw = String(draft ?? '').trim()
      if (!raw) {
        return undefined
      }
      return EXPRESSION.test(raw) ? raw : Number(raw)
    }
    case 'implies': {
      const entries = Object.entries(draft as ImpliesDraft).filter(
        ([, values]) => values.length > 0,
      )
      return entries.length > 0 ? Object.fromEntries(entries) : undefined
    }
    case 'providers': {
      const raw = String(draft ?? '').trim()
      if (!raw) {
        return undefined
      }
      return EXPRESSION.test(raw)
        ? raw
        : raw
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean)
    }
    case 'template':
      return typeof draft === 'string' ? draft.trim() || undefined : draft
    case 'textarea':
      return String(draft ?? '') === '' ? undefined : String(draft)
    default: {
      const raw = String(draft ?? '').trim()
      return raw ? raw : undefined
    }
  }
}

function valueError(
  prop: Prop,
  kind: Kind,
  draft: unknown,
  t: InputsEditorStrings,
  g: GraphEditorStrings,
): string | undefined {
  const value = writtenValue(kind, draft)
  if (prop.required && (value === undefined || value === '')) {
    return g.required
  }
  switch (kind) {
    case 'json': {
      const raw = String(draft ?? '').trim()
      const parsed = parseJson(raw)
      if (!raw) {
        return undefined
      }
      if (!parsed.ok) {
        return g.invalidJson
      }
      const list = Array.isArray(parsed.value)
      const object = !list && parsed.value === asRecord(parsed.value)
      return object || (list && prop.nested === 'any')
        ? undefined
        : prop.nested === 'any'
          ? t.jsonObjectOrList
          : t.jsonObject
    }
    case 'values': {
      const list = draft as ValuesDraft
      return list.expression !== undefined ? expressionError(list.expression, g) : undefined
    }
    case 'rows': {
      const list = draft as RowsDraft
      return list.expression !== undefined ? expressionError(list.expression, g) : undefined
    }
    case 'duration': {
      const raw = String(draft ?? '').trim()
      return raw && !EXPRESSION.test(raw) && parseDuration(raw) === null
        ? t.invalidDurationText
        : undefined
    }
    case 'number': {
      const raw = String(draft ?? '').trim()
      if (raw && prop.wholeFrom !== undefined) {
        return /^\d+$/.test(raw) && Number(raw) >= prop.wholeFrom
          ? undefined
          : t.wholeNumberFrom(prop.wholeFrom)
      }
      return raw && !EXPRESSION.test(raw) && !Number.isFinite(Number(raw))
        ? t.invalidNumber
        : undefined
    }
    case 'flag':
      return flagError(draft as Flag, g)
    case 'options':
      return optionsError(draft as OptionsDraft, t, g)
    case 'ref': {
      const raw = String(draft ?? '').trim()
      if (!raw || EXPRESSION.test(raw)) {
        return undefined
      }
      // Some settings take only an expression, such as one reading a cluster input.
      if (prop.literal === false) {
        return g.invalidExpressionValue
      }
      return prop.choices && !prop.choices.includes(raw) ? g.invalidChoice(prop.key) : undefined
    }
    case 'choice': {
      const raw = String(draft ?? '').trim()
      return raw && prop.choices && !prop.choices.includes(raw)
        ? g.invalidChoice(prop.key)
        : undefined
    }
    case 'template':
      if (typeof draft === 'string') {
        return draft.trim() ? expressionError(draft, g) : g.required
      }
      return Object.keys(asRecord(draft)).length === 0 ? t.needsFields : undefined
    default:
      if (prop.pattern && typeof value === 'string' && !EXPRESSION.test(value)) {
        try {
          new RegExp(value, 'g')
        } catch {
          return t.invalidPattern
        }
      }
      return prop.choices && typeof value === 'string' && !prop.choices.includes(value)
        ? g.invalidChoice(prop.key)
        : undefined
  }
}

/** A list's template fields, edited here since the form repeats them per row. */
function TemplateFields({
  fields,
  onChange,
  error,
  inputs,
  adopt,
  home,
  onDialog,
  onFieldKey,
}: {
  fields: Json
  onChange: (fields: Json) => void
  error: string | undefined
  inputs: Json
  adopt: (inputs: PendingInput[]) => void
  home: InputHome
  /** Told when a field's dialog opens or closes, so the dialog holding the list stays put meanwhile. */
  onDialog: (open: boolean) => void
  /** Told when a field is renamed, or removed (`to` undefined), so the list's default rows follow. */
  onFieldKey: (from: string, to: string | undefined) => void
}) {
  const t = useInputsEditorStrings()
  const workflowEditing = useWorkflowEditing()
  const { freeName } = workflowEditing
  const [editing, setEditing] = useState<{ name: string } | { create: true } | null>(null)
  const open = editing !== null
  useEffect(() => {
    onDialog(open)
  }, [onDialog, open])
  const names = Object.keys(fields).filter((name) => name !== '$meta')
  const types = t.types as Record<string, string>
  const update = (edit: GraphEdit) => {
    const next = workflowEditing.applyGraphEdit(
      { yml: workflowEditing.dumpYaml({ on: { execute: { inputs: fields } } }), layout: undefined },
      withInputLayouts(workflowEditing, fields, edit),
    )
    onChange(
      asRecord(workflowEditing.workflowInputsSchema(asRecord(workflowEditing.loadYaml(next.yml)))),
    )
  }
  const move = (from: number, to: number) => {
    const name = names[from]
    if (name)
      update({ type: 'moveInputs', paths: [[name]], parent: [], index: to > from ? to + 1 : to })
  }
  return (
    <div className="flex flex-col gap-1.5">
      {names.length === 0 && <div className="text-xs theme-muted-text">{t.noFields}</div>}
      {names.map((name, i) => {
        const type = text(asRecord(fields[name])['type'])
        return (
          <div
            key={name}
            className="flex items-center gap-2 rounded-md border theme-border px-2 py-1 text-sm"
          >
            <span className="font-mono">{name}</span>
            <span className="rounded border theme-border px-1 text-xs theme-muted-text">
              {types[type] ?? type}
            </span>
            <div className="flex-1" />
            <IconButton
              icon={<EditIcon className="h-3.5 w-3.5" />}
              label={t.editInput}
              variant="ghost"
              size="sm"
              onClick={() => setEditing({ name })}
            />
            <IconButton
              icon={<ArrowUpIcon className="h-3.5 w-3.5" />}
              label={t.moveUp}
              variant="ghost"
              size="sm"
              disabled={i === 0}
              onClick={() => move(i, i - 1)}
            />
            <IconButton
              icon={<ArrowDownIcon className="h-3.5 w-3.5" />}
              label={t.moveDown}
              variant="ghost"
              size="sm"
              disabled={i === names.length - 1}
              onClick={() => move(i, i + 1)}
            />
            <IconButton
              icon={<TrashIcon className="h-3.5 w-3.5" />}
              label={t.deleteInput}
              variant="ghost"
              size="sm"
              onClick={() => {
                update({ type: 'deleteInput', path: [name] })
                onFieldKey(name, undefined)
              }}
            />
          </div>
        )
      })}
      <FieldError message={error} />
      <AddRowButton label={t.addField} onClick={() => setEditing({ create: true })} />
      {editing && (
        <InputDialog
          name={'name' in editing ? editing.name : nextFieldName(freeName, names)}
          definition={
            'name' in editing ? asRecord(fields[editing.name]) : newInputDefinition('string')
          }
          isNew={!('name' in editing)}
          siblings={names.filter((name) => !('name' in editing) || name !== editing.name)}
          allowStep={false}
          inputs={inputs}
          home={home}
          onClose={() => setEditing(null)}
          onSave={(name, definition, patch, extra) => {
            adopt(extra)
            if ('name' in editing) {
              update({ type: 'updateInput', path: [editing.name], name, ...patch })
              if (name !== editing.name) onFieldKey(editing.name, name)
            } else {
              update({ type: 'addInput', parent: [], name, definition })
            }
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}

function nextFieldName(freeName: WorkflowEditing['freeName'], names: string[]): string {
  return freeName(names, (n) => `field_${n}`)
}

function ValuesField({
  label,
  draft,
  suggestions,
  onChange,
  error,
}: {
  label: string
  draft: ValuesDraft
  suggestions: string[]
  onChange: (draft: ValuesDraft) => void
  error: string | undefined
}) {
  const t = useInputsEditorStrings()
  if (draft.expression === undefined) {
    return (
      <StringListEditor
        label={label}
        values={draft.values}
        onChange={(values) => onChange({ ...draft, values })}
        addLabel={t.addValue}
        suggestions={suggestions}
        error={error}
      />
    )
  }
  return (
    <Input
      mono
      aria-label={label}
      value={draft.expression}
      error={error}
      onChange={(e) => onChange({ ...draft, expression: e.target.value })}
    />
  )
}

/** A list's default rows, entered through the same form a run shows. */
function RowsField({
  draft,
  template,
  label,
  onChange,
  error,
}: {
  draft: RowsDraft
  template: Json
  label: string
  onChange: (draft: RowsDraft) => void
  error: string | undefined
}) {
  const { convertInputs } = useWorkflowEngine()
  const formJSONs = useMemo(
    () => convertInputs({ rows: { type: 'list', label, template } }),
    [convertInputs, label, template],
  )
  // The list fills in row fields as it mounts; only what the user does counts as an edit.
  const touched = useRef(false)
  const touch = () => {
    touched.current = true
  }
  if (draft.expression !== undefined) {
    return (
      <Input
        mono
        aria-label={label}
        value={draft.expression}
        error={error}
        onChange={(e) => onChange({ ...draft, expression: e.target.value })}
      />
    )
  }
  return (
    <div
      className="flex flex-col gap-2 rounded-md border theme-border p-2"
      onClickCapture={touch}
      onInputCapture={touch}
      onKeyDownCapture={touch}
    >
      <DynamicForm
        key={JSON.stringify(template)}
        formJSONs={formJSONs}
        initialValues={{ rows: draft.rows }}
        labelPosition="top"
        workflowForm
        setValues={(values) => {
          if (touched.current) {
            const rows = values['rows']
            onChange({
              expression: undefined,
              rows: Array.isArray(rows) ? rows.map(asRecord) : [],
            })
          }
        }}
      />
      <FieldError message={error} />
    </div>
  )
}

function PropField({
  prop,
  kind,
  draft,
  original,
  error,
  onChange,
  suggestions,
  inputType,
  optionRows,
  source,
  adopt,
  allInputs,
  home,
  template,
  inputLabel,
  onDialog,
  onFieldKey,
}: {
  prop: Prop
  kind: Kind
  draft: unknown
  original: unknown
  error: string | undefined
  onChange: (draft: unknown) => void
  suggestions: string[]
  inputType: string
  optionRows: OptionRow[]
  source: InputSource
  adopt: (inputs: PendingInput[]) => void
  allInputs: Json
  home: InputHome
  /** The list's template as edited so far, for its default rows. */
  template: Json
  inputLabel: string
  onDialog: (open: boolean) => void
  onFieldKey: (from: string, to: string | undefined) => void
}) {
  const t = useInputsEditorStrings()
  const description = t.help[prop.help]
  const name = (t.fields as Record<string, string | undefined>)[prop.label ?? prop.key] ?? prop.key
  const field = { label: name, yamlKey: prop.key, description }
  switch (kind) {
    case 'flag':
      return (
        <FlagField
          {...field}
          value={draft as Flag}
          original={original}
          fallback={prop.fallback ?? false}
          onChange={onChange}
          source={prop.conditional ? source : undefined}
        />
      )
    case 'ref':
      return (
        <ValueOrInputField
          {...field}
          value={String(draft ?? '')}
          onChange={onChange}
          source={source}
          types={prop.refTypes ?? []}
          literal={prop.literal ?? true}
          required={prop.required ?? false}
          error={error}
          suggestions={prop.choices ?? []}
        />
      )
    case 'bool': {
      const fallback = prop.fallback ?? false
      return (
        <div className="flex flex-col gap-1.5">
          <ToggleField
            {...field}
            checked={typeof draft === 'boolean' ? draft : fallback}
            onChange={(on) => onChange(on !== fallback ? on : original === on ? on : undefined)}
          />
          <FieldError message={error} />
        </div>
      )
    }
    case 'options': {
      const options = draft as OptionsDraft
      return (
        <LabelledField
          {...field}
          actions={
            <ExpressionToggle
              active={options.mode === 'expression'}
              onChange={(on) =>
                onChange({
                  ...options,
                  mode: on ? 'expression' : 'list',
                  text: '',
                })
              }
            />
          }
        >
          <OptionsEditor
            draft={draft as OptionsDraft}
            onChange={onChange}
            error={error}
            keyed={inputType === 'dropdown'}
            described={inputType === 'checkbox-group'}
          />
        </LabelledField>
      )
    }
    case 'perCopy': {
      const perCopy = draft as PerCopyDraft
      return (
        <LabelledField
          {...field}
          actions={
            <label className="flex cursor-pointer items-center gap-1.5 text-xs theme-muted-text">
              <input
                type="checkbox"
                checked={perCopy.list}
                onChange={(e) =>
                  onChange({
                    ...perCopy,
                    list: e.target.checked,
                    values:
                      e.target.checked && perCopy.values.length === 0 && perCopy.text.trim()
                        ? [perCopy.text]
                        : perCopy.values,
                  })
                }
              />
              {t.onePerCopy}
            </label>
          }
        >
          {perCopy.list ? (
            <ValuesField
              label={name}
              draft={{ expression: undefined, values: perCopy.values }}
              suggestions={[]}
              onChange={(next) => onChange({ ...perCopy, values: next.values })}
              error={error}
            />
          ) : (
            <>
              <SuggestionInput
                aria-label={name}
                value={perCopy.text}
                suggestions={[]}
                onChange={(next) => onChange({ ...perCopy, text: next })}
              />
              <FieldError message={error} />
            </>
          )}
        </LabelledField>
      )
    }
    case 'values':
      return (
        <LabelledField
          {...field}
          actions={
            <ExpressionToggle
              active={(draft as ValuesDraft).expression !== undefined}
              onChange={(on) => onChange({ expression: on ? '' : undefined, values: [] })}
            />
          }
        >
          <ValuesField
            label={name}
            draft={draft as ValuesDraft}
            suggestions={
              inputType === 'multi-dropdown' || inputType === 'checkbox-group'
                ? optionRows.map((row) => row.value.trim()).filter(Boolean)
                : []
            }
            onChange={onChange}
            error={error}
          />
        </LabelledField>
      )
    case 'rows':
      return (
        <LabelledField
          {...field}
          actions={
            <ExpressionToggle
              active={(draft as RowsDraft).expression !== undefined}
              onChange={(on) => onChange({ expression: on ? '' : undefined, rows: [] })}
            />
          }
        >
          <RowsField
            draft={draft as RowsDraft}
            template={template}
            label={inputLabel}
            onChange={onChange}
            error={error}
          />
        </LabelledField>
      )
    case 'duration':
      return (
        <Input
          mono
          {...labelled(name, prop.key)}
          description={description}
          value={String(draft ?? '')}
          placeholder="HH:MM:SS"
          error={error}
          onChange={(e) => onChange(e.target.value)}
        />
      )
    case 'template':
      return (
        <LabelledField
          {...field}
          actions={
            <ExpressionToggle
              active={typeof draft === 'string'}
              onChange={(on) => onChange(on ? '' : {})}
            />
          }
        >
          {typeof draft === 'string' ? (
            <Input
              mono
              aria-label={name}
              value={draft}
              error={error}
              onChange={(e) => onChange(e.target.value)}
            />
          ) : (
            <TemplateFields
              fields={asRecord(draft)}
              onChange={onChange}
              error={error}
              inputs={allInputs}
              adopt={adopt}
              home={home}
              onDialog={onDialog}
              onFieldKey={onFieldKey}
            />
          )}
        </LabelledField>
      )
    case 'implies':
      return (
        <LabelledField {...field}>
          <ImpliesEditor draft={draft as ImpliesDraft} options={optionRows} onChange={onChange} />
        </LabelledField>
      )
    case 'choice': {
      const choiceLabels = (t.choices as Record<string, Record<string, string> | undefined>)[
        prop.key
      ]
      return (
        <LabelledField {...field}>
          <ChoiceButtons
            options={(prop.choices ?? []).map((choice) => ({
              value: choice,
              label: choiceLabels?.[choice] ?? choice,
            }))}
            value={String(draft ?? '') || (prop.choices?.[0] ?? '')}
            onChange={onChange}
          />
          <FieldError message={error} />
        </LabelledField>
      )
    }
    case 'json':
    case 'textarea':
      return prop.grow ? (
        <GrowingTextarea
          mono={!prop.prose}
          {...labelled(name, prop.key)}
          description={description}
          value={String(draft ?? '')}
          {...(error ? { error } : {})}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <Textarea
          mono={!prop.prose}
          {...labelled(name, prop.key)}
          description={description}
          rows={kind === 'json' ? 4 : 6}
          value={String(draft ?? '')}
          {...(error ? { error } : {})}
          onChange={(e) => onChange(e.target.value)}
        />
      )
    default:
      return (
        <SuggestedInput
          {...field}
          value={String(draft ?? '')}
          onChange={onChange}
          suggestions={prop.choices ?? (kind === 'language' ? LANGUAGES : suggestions)}
          error={error}
        />
      )
  }
}

function commonProp(key: CommonKey): Prop {
  const flag = (FLAG_FIELDS as readonly string[]).includes(key)
  return {
    key,
    kind: flag ? 'flag' : key === 'label' ? 'text' : 'textarea',
    help: key,
    ...(flag ? { conditional: true } : { prose: true }),
    ...(key === 'description' || key === 'tooltip' ? { grow: true } : {}),
  }
}

const COMMON_PROPS = ALL_COMMON.map(commonProp)
// A page's description, like its title, can be one per copy when the page repeats.
const STEP_DESCRIPTION: Prop = { ...commonProp('description'), kind: 'perCopy' }

function commonPropsOf(type: string): Prop[] {
  return commonKeys(type).map((key) =>
    type === 'step' && key === 'description' ? STEP_DESCRIPTION : commonProp(key),
  )
}

/** Every field a type has, as the type an input had before a type change read its settings. */
function propsOf(type: string): Prop[] {
  return [...commonPropsOf(type), ...(TYPE_PROPS[type] ?? [])]
}

function isCommon(prop: Prop): boolean {
  return COMMON_PROPS.some((common) => draftKey(common) === draftKey(prop))
}

// Types may read the same key differently, such as a number or a text default.
function draftKey(prop: Prop): string {
  return `${prop.kind}:${prop.key}`
}

const ALL_PROPS: Prop[] = [
  ...new Map(
    [...COMMON_PROPS, STEP_DESCRIPTION, ...Object.values(TYPE_PROPS).flat()].map((prop) => [
      draftKey(prop),
      prop,
    ]),
  ).values(),
]

/** An input a dialog creates when it saves, for a field that reads it. */
export interface PendingInput {
  name: string
  definition: Json
}

const SUGGESTED_NAMES: Record<string, string> = {
  'compute-clusters': 'cluster',
  'compute-resources': 'cluster',
  'slurm-accounts': 'account',
  'slurm-partitions': 'partition',
  'kubernetes-clusters': 'kubernetes_cluster',
  'kubernetes-namespaces': 'namespace',
  region: 'region',
  boolean: 'enabled',
  dropdown: 'choice',
  'multi-dropdown': 'choices',
  string: 'text',
}

export function allNames(editing: WorkflowEditing, map: Json, out: Set<string>): Set<string> {
  for (const [name, value] of Object.entries(map)) {
    out.add(name)
    const definition = asRecord(value)
    const childKey = editing.inputChildrenKey(definition['type'])
    if (childKey) {
      allNames(editing, asRecord(definition[childKey]), out)
    }
  }
  return out
}

function suggestedName(editing: WorkflowEditing, type: string, inputs: Json): string {
  const taken = allNames(editing, inputs, new Set())
  const base = SUGGESTED_NAMES[type]
  return base ? editing.nextName(taken, base) : editing.newInputName(taken)
}

/** Where a dialog puts the inputs it creates: the top level, or one wizard step. */
export interface InputHome {
  parent: string[]
  index?: number
}

// A wizard form draws only its steps, so new inputs join the last one.
function defaultHome(inputs: Json): InputHome {
  const wizard = asRecord(asRecord(inputs['$meta'])['wizard'])
  const steps = Object.entries(inputs).filter(
    ([name, value]) => name !== '$meta' && asRecord(value)['type'] === 'step',
  )
  const last = steps.at(-1)?.[0]
  return wizard['mode'] === 'wizard' && last ? { parent: [last] } : { parent: [] }
}

function homeContainer(editing: WorkflowEditing, inputs: Json, home: InputHome): Json {
  const [step] = home.parent
  if (!step) {
    return inputs
  }
  const key = editing.inputChildrenKey(text(asRecord(inputs[step])['type']))
  return key ? asRecord(asRecord(inputs[step])[key]) : {}
}

function withPending(
  editing: WorkflowEditing,
  inputs: Json,
  home: InputHome,
  pending: PendingInput[],
): Json {
  const added = Object.fromEntries(pending.map((input) => [input.name, input.definition]))
  const [step] = home.parent
  if (!step) {
    return { ...inputs, ...added }
  }
  const definition = asRecord(inputs[step])
  const key = editing.inputChildrenKey(text(definition['type'])) ?? 'options'
  return {
    ...inputs,
    [step]: {
      ...definition,
      [key]: { ...homeContainer(editing, inputs, home), ...added },
    },
  }
}

/** `edit` after the edits that add `created` at `home`, as one undo step. */
export function withCreatedInputs(
  editing: WorkflowEditing,
  created: PendingInput[],
  home: InputHome,
  edit: GraphEdit | null,
): GraphEdit | null {
  return editing.batchOf([
    ...created.map(
      (input, i): GraphEdit => ({
        type: 'addInput',
        parent: home.parent,
        ...(home.index !== undefined ? { index: home.index + i } : {}),
        name: input.name,
        definition: input.definition,
      }),
    ),
    ...(edit ? [edit] : []),
  ])
}

export interface NewInputs {
  source: InputSource
  all: Json
  home: InputHome
  pending: PendingInput[]
  adopt: (created: PendingInput[]) => void
  dialog: ReactNode
  /** The form's edit with the inputs it made, or null when there's nothing to save. */
  save: (edit: GraphEdit | null) => GraphEdit | null
}

/** Inputs a dialog's fields can read, plus the ones it creates on save. */
export function useNewInputs(inputs: Json | undefined, home?: InputHome): NewInputs {
  const editing = useWorkflowEditing()
  const root = asRecord(inputs)
  const place = home ?? defaultHome(root)
  const [pending, setPending] = useState<PendingInput[]>([])
  const [creating, setCreating] = useState<{
    type: string
    onCreated: (path: string[]) => void
  } | null>(null)
  const all = withPending(editing, root, place, pending)
  const source: InputSource = {
    refs: inputRefs(editing, all),
    create: (type, onCreated) => setCreating({ type, onCreated }),
  }
  const adopt = (created: PendingInput[]) => setPending((current) => [...current, ...created])
  const pathOf = (name: string) =>
    place.parent.length > 0 && !editing.wizardFlattens(root) ? [...place.parent, name] : [name]
  const dialog = creating ? (
    <InputDialog
      name={suggestedName(editing, creating.type, all)}
      definition={newInputDefinition(creating.type)}
      isNew
      lockedType
      siblings={[...allNames(editing, all, new Set())]}
      allowStep={false}
      inputs={all}
      home={place}
      onClose={() => setCreating(null)}
      onSave={(name, definition, _patch, extra) => {
        adopt([...extra, { name, definition }])
        creating.onCreated(pathOf(name))
      }}
    />
  ) : null
  return {
    source,
    all,
    home: place,
    pending,
    adopt,
    dialog,
    save: (edit) => withCreatedInputs(editing, pending, place, edit),
  }
}

/** Every setting of one input; `onSave` gets the whole definition and the change to it. */
interface InputDialogProps {
  name: string
  definition: Json
  isNew: boolean
  /** Names already taken in the same container. */
  siblings: string[]
  allowStep: boolean
  /** The workflow's inputs, for settings that read another input. */
  inputs?: Json | undefined
  /** Where inputs made for this dialog's settings will go. */
  home?: InputHome | undefined
  /** A new input made for one field keeps the type that field needs. */
  lockedType?: boolean
  /** `created` are inputs this dialog made for its own settings. */
  onSave: (
    name: string,
    definition: Json,
    patch: Required<FieldPatch>,
    created: PendingInput[],
  ) => void
  onDelete?: () => void
  onClose: () => void
  openOnAdd?: OpenOnAdd | undefined
}

/** Saving an input as YAML text; `path` and `source` give an existing input's text with its comments. */
export interface InputYaml {
  source?: string | undefined
  path?: InputPath | undefined
  /** `created` are the inputs the form made for its settings before switching to the YAML. */
  onSave: (name: string, yaml: string, created: PendingInput[]) => void
}

/** An input's settings in a form, or as YAML when `yaml` says how to save it; switching carries the edits across. */
export function InputDialog({
  yaml,
  view,
  onViewChange,
  ...props
}: InputDialogProps & {
  yaml?: InputYaml | undefined
  view?: SettingsView | undefined
  onViewChange?: ((view: SettingsView) => void) | undefined
}) {
  return yaml ? (
    <InputViews {...props} textual={yaml} view={view} onViewChange={onViewChange} />
  ) : (
    // Opened from another dialog, it keeps no memory of that one's sections.
    <SectionMemory.Provider value={null}>
      <InputForm {...props} />
    </SectionMemory.Provider>
  )
}

function startingYaml(editing: WorkflowEditing, textual: InputYaml, definition: Json): string {
  if (textual.source !== undefined && textual.path) {
    try {
      return editing.inputYaml(textual.source, textual.path)
    } catch {
      // A definition the text can't be found for is shown as it's read.
    }
  }
  return editing.dumpYaml(definition)
}

function InputViews({
  textual,
  view,
  onViewChange,
  ...props
}: InputDialogProps & {
  textual: InputYaml
  view?: SettingsView | undefined
  onViewChange?: ((view: SettingsView) => void) | undefined
}) {
  const t = useInputsEditorStrings()
  const g = useGraphEditorStrings()
  const editing = useWorkflowEditing()
  const sections = useSectionMemory()
  // Kept here, as the form is drawn anew on each switch: the inputs it made for its settings.
  const newInputs = useNewInputs(props.inputs, props.home)
  const [original] = useState(() => (props.isNew ? {} : props.definition))
  const [opening] = useState(() => startingYaml(editing, textual, props.definition))
  // The YAML as last shown, and the settings the form starts from.
  const [shown, setShown] = useState(opening)
  const [base, setBase] = useState<Json>(props.definition)
  const [yaml, setYaml] = useState<string | null>(view === 'form' ? null : opening)
  const [name, setName] = useState(props.name)
  const [version, setVersion] = useState(0)
  const [problem, setProblem] = useState<string | undefined>()
  const draft = useRef<{ name: string; next: Json } | null>(null)
  const toYaml = () => {
    const current = draft.current
    if (current) {
      setName(current.name)
    }
    // The form's settings are written out again only when it changed them, so the text keeps its comments.
    const text =
      !current || isEmptyPatch(diffPatch(base, current.next))
        ? shown
        : editing.dumpYaml(withoutUndefined(current.next))
    setShown(text)
    setYaml(text)
    setProblem(undefined)
    onViewChange?.('yaml')
  }
  const toForm = () => {
    if (yaml === null) {
      return
    }
    const issue = yamlProblem(yaml, g, editing)
    if (issue) {
      setProblem(issue)
      return
    }
    setShown(yaml)
    setBase(asRecord(editing.loadYaml(yaml)))
    setYaml(null)
    setVersion((current) => current + 1)
    onViewChange?.('form')
  }
  const switcher = <ViewSwitch yaml={yaml !== null} onForm={toForm} onYaml={toYaml} />
  if (yaml === null) {
    return (
      <SectionMemory.Provider value={sections}>
        <InputForm
          key={version}
          {...props}
          name={name}
          originalName={props.name}
          definition={base}
          original={original}
          newInputs={newInputs}
          headerEnd={switcher}
          onDraft={(next, settings) => {
            draft.current = { name: next, next: settings }
          }}
        />
      </SectionMemory.Provider>
    )
  }
  const nextName = name.trim()
  const nameError = !editing.isValidInputName(nextName)
    ? t.invalidInputName
    : (nextName !== props.name && props.siblings.includes(nextName)) ||
        newInputs.pending.some((input) => input.name === nextName)
      ? t.inputExists
      : undefined
  const dirty =
    props.isNew || nextName !== props.name || yaml !== opening || newInputs.pending.length > 0
  return (
    <DialogShell
      title={t.editInput}
      onClose={props.onClose}
      dirty={dirty}
      saveDisabled={yamlProblem(yaml, g, editing) !== undefined || nameError !== undefined}
      onSubmit={() => {
        if (dirty) {
          textual.onSave(nextName, yaml, newInputs.pending)
        }
        props.onClose()
      }}
      headerEnd={switcher}
      openOnAdd={props.openOnAdd}
      {...(props.onDelete ? { footerStart: deleteButton(t, props) } : {})}
    >
      {/* The YAML holds the input's settings, not its key, so it's renamed here. */}
      <Input
        mono
        label={t.inputName}
        description={t.help.name}
        value={name}
        error={nameError}
        onChange={(e) => setName(e.target.value)}
      />
      <YamlPane
        path={INPUT_YAML_PATH}
        value={yaml}
        onChange={(text) => {
          setYaml(text)
          setProblem(undefined)
        }}
        problem={problem ?? yamlProblem(yaml, g, editing)}
        scoped={NO_SCOPED}
      />
    </DialogShell>
  )
}

function deleteButton(
  t: InputsEditorStrings,
  { onDelete, onClose }: Pick<InputDialogProps, 'onDelete' | 'onClose'>,
): ReactNode {
  return (
    <IconButton
      icon={<TrashIcon className="h-4 w-4" />}
      label={t.deleteInput}
      variant="ghost"
      size="sm"
      onClick={() => {
        onDelete?.()
        onClose()
      }}
    />
  )
}

function InputForm({
  name,
  definition,
  isNew,
  siblings,
  allowStep,
  inputs,
  home,
  lockedType = false,
  onSave,
  onDelete,
  onClose,
  openOnAdd,
  original: startOriginal,
  originalName = name,
  newInputs: shared,
  headerEnd,
  onDraft,
}: InputDialogProps & {
  /** What Save diffs against, when the form starts from settings edited as YAML. */
  original?: Json | undefined
  /** The input's name when the dialog opened, which a rename is measured from. */
  originalName?: string | undefined
  /** The inputs made for its settings, when a parent keeps them across views. */
  newInputs?: NewInputs | undefined
  headerEnd?: ReactNode
  /** Called on each render with the name and settings Save would write; an unset key is undefined. */
  onDraft?: ((name: string, next: Json) => void) | undefined
}) {
  const t = useInputsEditorStrings()
  const g = useGraphEditorStrings()
  const editing = useWorkflowEditing()
  const own = useNewInputs(inputs, home)
  const newInputs = shared ?? own
  const [original] = useState(() => startOriginal ?? (isNew ? {} : definition))
  // The type the input had when the dialog opened; the YAML just shown may have changed it already.
  const originalType = text(original['type'])
  // A container's fields sit under its type's key, or still under the old type's when the YAML changed only the type.
  const childrenOf = (settings: Json, withTemplate = true) => {
    for (const from of [text(settings['type']), originalType]) {
      const key = editing.inputChildrenKey(from)
      if (key && (withTemplate || key !== 'template') && settings[key] !== undefined) {
        return settings[key]
      }
    }
    return undefined
  }
  const [draftName, setDraftName] = useState(name)
  const [type, setType] = useState(() => text(definition['type']) || 'string')
  const [initial] = useState(() => {
    const out: Drafts = {}
    for (const prop of ALL_PROPS) {
      out[draftKey(prop)] = draftOf(effectiveKind(prop, definition[prop.key]), definition[prop.key])
    }
    return out
  })
  // A list the YAML made of a group or step starts with its fields as the template, as the type menu does.
  const [drafts, setDrafts] = useState<Drafts>(() => {
    const fields =
      text(definition['type']) === 'list' && definition['template'] === undefined
        ? childrenOf(definition, false)
        : undefined
    return fields === undefined
      ? initial
      : { ...initial, [draftKey(TEMPLATE)]: draftOf('template', fields) }
  })
  const [nested, setNested] = useState(false)
  const rowsKey = draftKey(LIST_DEFAULT)
  const onFieldKey = (from: string, to: string | undefined) =>
    setDrafts((current) => {
      const rows = current[rowsKey] as RowsDraft | undefined
      if (!rows || rows.expression !== undefined) {
        return current
      }
      const moved = rows.rows.map((row) => {
        if (!Object.hasOwn(row, from)) {
          return row
        }
        const { [from]: value, ...rest } = row
        return to === undefined ? rest : { ...rest, [to]: value }
      })
      return { ...current, [rowsKey]: { ...rows, rows: moved } }
    })
  const optionsDraftNow = drafts[draftKey(OPTIONS)] as OptionsDraft | undefined
  const optionRows = optionsDraftNow?.mode === 'list' ? optionsDraftNow.rows : []
  // The schema has two dropdowns: a list with placeholder and autoselect, or options keyed by option-key.
  const keyedDropdown =
    type === 'dropdown' &&
    (optionsDraftNow?.mode === 'byKey' ||
      (optionsDraftNow?.mode === 'expression' &&
        String(drafts[draftKey(OPTION_KEY)] ?? '').trim() !== ''))
  // With multi on, a resource picker's default is a list, the way the form keeps its picks.
  const multi = drafts[draftKey(MULTI)] === true
  const shown = (prop: Prop) =>
    prop === RESOURCE_DEFAULTS
      ? multi
      : prop === RESOURCE_DEFAULT
        ? !multi
        : type !== 'dropdown'
          ? true
          : keyedDropdown
            ? prop.key !== 'placeholder' && prop.key !== 'autoselect'
            : prop.key !== 'option-key' || optionsDraftNow?.mode === 'expression'
  const settingProps = (TYPE_PROPS[type] ?? []).filter(shown)
  const props = [...commonPropsOf(type), ...settingProps]
  const kindOf = (prop: Prop) => effectiveKind(prop, definition[prop.key])
  const optionKeys = OPTION_KEYS[type]
  const context: ValueContext = { labelled: type === 'multi-dropdown', textValues: !!optionKeys }
  // A value kept from before a type change may not suit the new type, so every setting is checked then.
  const typeChanged = !isNew && type !== originalType
  // An untouched field keeps its YAML value exactly, so `5` isn't rewritten as '5', unless the type it changed
  // to reads the key differently, as a number default becoming text: then it's written as the new type reads it.
  const valueFor = (prop: Prop) => {
    const key = draftKey(prop)
    const kept = definition[prop.key]
    const becameList =
      kindOf(prop) === 'values' &&
      isScalar(kept) &&
      !(typeof kept === 'string' && EXPRESSION.test(kept.trim()))
    const readsAlike =
      !typeChanged || propsOf(originalType).some((before) => draftKey(before) === key)
    return sameValue(drafts[key], initial[key]) && !becameList && readsAlike
      ? kept
      : writtenValue(kindOf(prop), drafts[key], context)
  }
  const edited = (key: string) =>
    props.some(
      (prop) => prop.key === key && !sameValue(drafts[draftKey(prop)], initial[draftKey(prop)]),
    )
  const optionValues =
    type === 'dropdown' || type === 'radio' ? optionRows.map((row) => row.value) : []
  const slider = type === 'number' && valueFor(SLIDER) === true

  const trimmedName = draftName.trim()
  const errors: Record<string, string | undefined> = {
    name: !editing.isValidInputName(trimmedName)
      ? t.invalidInputName
      : siblings.includes(trimmedName) ||
          newInputs.pending.some((input) => input.name === trimmedName)
        ? t.inputExists
        : undefined,
  }
  for (const prop of props) {
    const key = draftKey(prop)
    const required =
      prop.required ||
      (keyedDropdown && optionsDraftNow?.mode === 'byKey' && prop === OPTION_KEY) ||
      (slider && ['min', 'max', 'step'].includes(prop.key))
    const untouched = sameValue(drafts[key], initial[key])
    const kept = definition[prop.key]
    // A list or object kept where the new type takes one value is written as it is, so it has to change.
    errors[key] =
      typeChanged &&
      untouched &&
      kept !== null &&
      typeof kept === 'object' &&
      SCALAR_KINDS.has(kindOf(prop))
        ? t.keptValueDoesNotFit
        : untouched && !required && !typeChanged
          ? undefined
          : valueError({ ...prop, required }, kindOf(prop), drafts[key], t, g)
  }
  if (type !== 'dropdown' && optionsDraftNow?.mode === 'byKey' && props.includes(OPTIONS)) {
    errors[draftKey(OPTIONS)] = t.optionsByKeyDropdownOnly
  }
  // A flattened group's fields sit beside it, so they can't share a name with its neighbours.
  const clash =
    type === 'group' && drafts[draftKey(FLATTEN)] === true
      ? Object.keys(asRecord(definition['items'])).find((child) => siblings.includes(child))
      : undefined
  if (clash) {
    errors[draftKey(FLATTEN)] = t.flattenClash(clash)
  }
  if (type === 'duration') {
    const hasLabel = valueFor(DISABLE_LABEL) !== undefined
    const optOut = valueFor(DISABLE_VALUE)
    if (hasLabel !== (optOut !== undefined)) {
      errors[draftKey(hasLabel ? DISABLE_VALUE : DISABLE_LABEL)] = t.disableNeedsBoth
    }
    // The opt-out value is sent as it is, so it can't be an expression.
    if (typeof optOut === 'string') {
      errors[draftKey(DISABLE_VALUE)] = t.invalidNumber
    }
    // A default of the opt-out value starts the form with its box ticked.
    const defaultKey = draftKey(DURATION_DEFAULT)
    if (optOut !== undefined && valueFor(DURATION_DEFAULT) === optOut) {
      errors[defaultKey] = undefined
    }
  }

  const nextDefinition = (): Json => {
    // Settings this dialog doesn't show are kept as they are; ones the YAML took out stay out.
    const next: Json = { ...definition, type }
    for (const key of Object.keys(original)) {
      if (!Object.hasOwn(next, key)) {
        next[key] = undefined
      }
    }
    for (const prop of props) {
      next[prop.key] = valueFor(prop)
    }
    // A container's fields carry over from wherever the settings kept them.
    const childKey = editing.inputChildrenKey(type)
    if (childKey && childKey !== 'template') {
      next[childKey] = childrenOf(definition) ?? {}
    }
    // The schema takes one dropdown variant, so the other one's settings go.
    for (const prop of TYPE_PROPS[type] ?? []) {
      if (!settingProps.some((other) => other.key === prop.key)) {
        next[prop.key] = undefined
      }
    }
    const options = next['options']
    // Only a list's values are known here; options by expression or by key leave the rules below alone.
    const listed = Array.isArray(options)
      ? options.map((option) => (isScalar(option) ? option : asRecord(option)['value']))
      : []
    const known = Array.isArray(options) && listed.every(isScalar)
    // Links between options name options there are, so a renamed or removed one leaves none behind.
    if (
      type === 'checkbox-group' &&
      next['implies'] !== undefined &&
      known &&
      (edited('options') || edited('implies'))
    ) {
      const values = new Set(listed.map(String))
      const links = Object.entries(asRecord(next['implies']))
        .filter(([from]) => values.has(from))
        .map(([from, to]) => [
          from,
          (Array.isArray(to) ? to : []).filter((value) => values.has(String(value))),
        ])
        .filter(([, to]) => (to as unknown[]).length > 0)
      next['implies'] = links.length > 0 ? Object.fromEntries(links) : undefined
    }
    // A dropdown's default picks one of its options by value, so it takes the value as written: 4, not '4'.
    // A radio matches its options as text and keeps a text default.
    if (
      type === 'dropdown' &&
      typeof next['default'] === 'string' &&
      known &&
      (typeChanged || edited('options') || edited('default'))
    ) {
      const picked = listed.find(
        (value) => typeof value !== 'string' && String(value) === next['default'],
      )
      if (picked !== undefined) {
        next['default'] = picked
      }
    }
    // After a type change, the settings the new type doesn't take go too.
    if (type !== originalType) {
      const takes = new Set(offeredInputKeys(editing, type))
      for (const key of Object.keys(next)) {
        if (KNOWN_KEYS.has(key) && !takes.has(key)) {
          next[key] = undefined
        }
      }
    }
    // A radio's and a checkbox group's options, and the defaults picking them, are text, however they were written.
    if (optionKeys && Array.isArray(next['options']) && (typeChanged || edited('options'))) {
      next['options'] = next['options'].map((option) => textOption(option, optionKeys))
    }
    if (optionKeys && typeChanged) {
      const picked = next['default']
      next['default'] = Array.isArray(picked)
        ? picked.map((value) => (isScalar(value) ? String(value) : value))
        : isScalar(picked)
          ? String(picked)
          : picked
    }
    return next
  }

  const next = nextDefinition()
  // Options written as JSON can still hold what these types' options can't, such as an object as a value.
  const shaped = next['options']
  if (
    optionKeys &&
    (typeChanged || edited('options')) &&
    Array.isArray(shaped) &&
    !shaped.every((option) => fitsTextOption(option, optionKeys)) &&
    !errors[draftKey(OPTIONS)]
  ) {
    errors[draftKey(OPTIONS)] = type === 'radio' ? t.radioOptionShape : t.checkboxOptionShape
  }
  const patch = diffPatch(original, next)
  const renamed = trimmedName !== originalName
  const dirty = isNew || renamed || !isEmptyPatch(patch)
  const invalid = Object.values(errors).some(Boolean)
  const setDraft = (key: string, value: unknown) =>
    setDrafts((current) => ({ ...current, [key]: value }))
  const changeType = (next: string) => {
    setType(next)
    // A group's or step's fields carry over as a list's template, as they do between those two.
    const fields = childrenOf(definition, false)
    const templateKey = draftKey(TEMPLATE)
    if (next === 'list' && fields && sameValue(drafts[templateKey], initial[templateKey])) {
      setDraft(templateKey, draftOf('template', fields))
    }
    if (!isNew) {
      return
    }
    // A new input starts from what the schema requires of its type.
    const seeded = newInputDefinition(next)
    for (const prop of TYPE_PROPS[next] ?? []) {
      const key = draftKey(prop)
      if (seeded[prop.key] !== undefined && sameValue(drafts[key], initial[key])) {
        setDraft(key, draftOf(prop.kind, seeded[prop.key]))
      }
    }
  }
  const renderProp = (prop: Prop) => (
    <PropField
      key={draftKey(prop)}
      prop={prop}
      kind={kindOf(prop)}
      draft={drafts[draftKey(prop)]}
      original={definition[prop.key]}
      error={errors[draftKey(prop)]}
      onChange={(value) => setDraft(draftKey(prop), value)}
      suggestions={prop.key === 'default' ? optionValues : []}
      inputType={type}
      optionRows={optionRows}
      source={newInputs.source}
      adopt={newInputs.adopt}
      allInputs={newInputs.all}
      home={newInputs.home}
      template={asRecord(drafts[draftKey(TEMPLATE)])}
      inputLabel={String(drafts[draftKey(commonProp('label'))] ?? '').trim() || trimmedName}
      onDialog={setNested}
      onFieldKey={onFieldKey}
    />
  )
  const textProps = props.filter(
    (prop) =>
      (TEXT_FIELDS as readonly string[]).includes(prop.key) &&
      (isCommon(prop) || prop === STEP_DESCRIPTION),
  )
  const behaviorProps = props.filter(
    (prop) => (FLAG_FIELDS as readonly string[]).includes(prop.key) && isCommon(prop),
  )
  // As in the job and step dialogs, a section starts open only when it holds something.
  const holds = (prop: Prop) => original[prop.key] !== undefined
  const erred = (prop: Prop) => errors[draftKey(prop)] !== undefined
  const fieldOpen = isNew || textProps.some(holds)
  const settingsOpen = settingProps.some((prop) => prop.required || holds(prop))

  const written = withoutUndefined(next)
  onDraft?.(trimmedName, next)

  return (
    <DialogShell
      title={t.editInput}
      onClose={onClose}
      dirty={dirty}
      locked={newInputs.dialog !== null || nested}
      saveDisabled={invalid}
      onSubmit={() => {
        if (dirty) {
          onSave(trimmedName, written, patch, newInputs.pending)
        }
        onClose()
      }}
      headerEnd={headerEnd}
      openOnAdd={openOnAdd}
      {...(onDelete ? { footerStart: deleteButton(t, { onDelete, onClose }) } : {})}
    >
      <Input
        autoFocus
        mono
        label={t.inputName}
        description={t.help.name}
        value={draftName}
        error={errors['name']}
        onChange={(e) => setDraftName(e.target.value)}
      />
      <TypeSelect value={type} onChange={changeType} allowStep={allowStep} disabled={lockedType} />
      {!isNew && originalType && type !== originalType && (
        <div className="text-xs theme-muted-text">{t.typeChangeNote}</div>
      )}
      {textProps.length > 0 && (
        <Section title={t.sectionField} open={fieldOpen} alert={textProps.some(erred)}>
          {textProps.map(renderProp)}
        </Section>
      )}
      {settingProps.length > 0 && (
        <Section title={t.sectionSettings} open={settingsOpen} alert={settingProps.some(erred)}>
          {settingProps.map((prop) =>
            prop === DISABLE_VALUE ? null : prop === DISABLE_LABEL ? (
              <OptOutCheckbox
                key="opt-out"
                label={String(drafts[draftKey(DISABLE_LABEL)] ?? '')}
                value={String(drafts[draftKey(DISABLE_VALUE)] ?? '')}
                onLabel={(next) => setDraft(draftKey(DISABLE_LABEL), next)}
                onValue={(next) => setDraft(draftKey(DISABLE_VALUE), next)}
                errors={{
                  label: errors[draftKey(DISABLE_LABEL)],
                  value: errors[draftKey(DISABLE_VALUE)],
                }}
              />
            ) : (
              renderProp(prop)
            ),
          )}
        </Section>
      )}
      {behaviorProps.length > 0 && (
        <Section
          title={t.sectionBehavior}
          open={behaviorProps.some(holds)}
          alert={behaviorProps.some(erred)}
        >
          {behaviorProps.map(renderProp)}
        </Section>
      )}
      {newInputs.dialog}
    </DialogShell>
  )
}

/** A compact type chip for rows that list inputs. */
export function TypeBadge({ type }: { type: string }) {
  const t = useInputsEditorStrings()
  const types = t.types as Record<string, string>
  return (
    <span className={cx('rounded border theme-border px-1 text-[11px] leading-4 theme-muted-text')}>
      {types[type] ?? (type || '?')}
    </span>
  )
}

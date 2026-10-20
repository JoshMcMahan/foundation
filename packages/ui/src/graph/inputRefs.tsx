import { useId, useRef, useState } from 'react'
import { ActionMenu } from '../components/ActionMenu'
import { IconButton } from '../components/IconButton'
import { Textarea } from '../components/Input'
import type { MenuEntry } from '../components/MenuEntries'
import { useStrings } from '../components/Provider'
import { Select } from '../components/Select'
import { Switch } from '../components/Switch'
import type { WorkflowEditing } from '../editing'
import { AddIcon } from '../icons'
import {
  asRecord,
  ExpressionToggle,
  type Flag,
  flagError,
  flagValue,
  GROWING_AREA,
  type Json,
  text,
  useGrowingArea,
  YamlField,
} from './editorFields'
import {
  type GraphEditorStrings,
  useGraphEditorStrings,
  useInputsEditorStrings,
} from './editorStrings'
import type { ExpressionRef, RefGroup } from './expressionRefs'
import { useFieldLint } from './fieldProblems'
import { type Suggestion, SuggestionInput } from './SuggestionInput'

/** An input a workflow expression can read, by its path under `inputs`. */
export interface InputRef {
  path: string[]
  type: string
  label: string
  definition: Json
}

/** Every input with a value, where a run reads it: groups nest unless flattened, lists hide their rows. */
export function inputRefs(editing: WorkflowEditing, inputs: Json | undefined): InputRef[] {
  const root = asRecord(inputs)
  const flatSteps = editing.wizardFlattens(root)
  const out: InputRef[] = []
  const walk = (map: Json, prefix: string[]) => {
    for (const [name, raw] of Object.entries(map)) {
      if (name === '$meta') {
        continue
      }
      const definition = asRecord(raw)
      const type = text(definition['type'])
      const childKey = editing.inputChildrenKey(type)
      if (type === 'group' || type === 'step') {
        const flat = type === 'step' ? flatSteps : definition['flatten'] === true
        walk(
          asRecord(childKey ? definition[childKey] : undefined),
          flat ? prefix : [...prefix, name],
        )
        continue
      }
      if (type === 'header') {
        continue
      }
      out.push({
        path: [...prefix, name],
        type,
        label: text(definition['label']) || name,
        definition,
      })
    }
  }
  walk(root, [])
  return out
}

const REF = /^\$\{\{\s*(!?)\s*inputs\.([A-Za-z0-9_.-]+?)\s*\}\}$/

export function refExpression(path: string[], suffix?: string): string {
  return `\${{ inputs.${[...path, ...(suffix ? [suffix] : [])].join('.')} }}`
}

/** The input `value` reads when it is exactly `${{ inputs.PATH[.suffix] }}`. */
export function readRef(value: unknown, suffix?: string): string[] | null {
  const match = typeof value === 'string' ? REF.exec(value.trim()) : null
  if (!match || match[1]) {
    return null
  }
  const parts = (match[2] ?? '').split('.')
  if (suffix) {
    return parts.at(-1) === suffix ? parts.slice(0, -1) : null
  }
  return parts
}

export function flagExpression(path: string[], negated: boolean): string {
  return `\${{ ${negated ? '!' : ''}inputs.${path.join('.')} }}`
}

// A quote inside an expression's string is written twice.
export function equalsExpression(path: string[], value: string, negated = false): string {
  const operator = negated ? '!=' : '=='
  return `\${{ inputs.${path.join('.')} ${operator} '${value.replace(/'/g, "''")}' }}`
}

const pathKey = (path: string[]) => path.join('.')

/** The option values a dropdown input offers, for conditions on it. */
function optionValues(definition: Json): string[] {
  const options = definition['options']
  return Array.isArray(options)
    ? options.map((option) =>
        typeof option === 'object' && option !== null
          ? text((option as Json)['value'])
          : text(option),
      )
    : []
}

/** Picks an existing input of the given types, or asks for a new one. */
export function InputRefSelect({
  refs,
  types,
  value,
  onChange,
  onNew,
  newLabel,
  label,
}: {
  refs: InputRef[]
  types: string[]
  value: string[] | null
  onChange: (path: string[]) => void
  onNew?: (() => void) | undefined
  newLabel?: string
  label: string
}) {
  const t = useGraphEditorStrings()
  const matching = refs.filter((ref) => types.includes(ref.type))
  const current = value ? pathKey(value) : ''
  const known = matching.some((ref) => pathKey(ref.path) === current)
  // An input the field names that isn't offered still shows, marked so choosing it does nothing.
  const items = [
    ...(!known && current ? [{ value: `?${current}`, label: `inputs.${current}` }] : []),
    ...matching.map((ref) => ({
      value: pathKey(ref.path),
      label:
        ref.label === ref.path.at(-1)
          ? `inputs.${pathKey(ref.path)}`
          : `${ref.label} (inputs.${pathKey(ref.path)})`,
    })),
    ...(onNew ? [{ value: '+', label: newLabel ?? t.newInput }] : []),
  ]
  return (
    <Select<string>
      aria-label={label}
      width="fill"
      placeholder={matching.length > 0 ? t.chooseInput : t.noMatchingInputs}
      items={items}
      value={known || !current ? current || null : `?${current}`}
      onValueChange={(next) => {
        if (next === '+') {
          onNew?.()
        } else if (next && !next.startsWith('?')) {
          onChange(next.split('.'))
        }
      }}
    />
  )
}

/** Where fields find inputs to read, and how they ask for a new one. */
export interface InputSource {
  refs: InputRef[]
  /** Outputs, matrix values, variables, sessions and env an expression here can read. */
  extras?: ExpressionRef[] | undefined
  /** Opens a dialog for a new input of `type`, then reports where it lives. */
  create?: ((type: string, onCreated: (path: string[]) => void) => void) | undefined
}

/** Makes a new input of `type` for the field, when the host can; `onCreated` gets where it went. */
function NewInputButton({
  type,
  source,
  onCreated,
}: {
  type: string
  source: InputSource | undefined
  onCreated: (path: string[]) => void
}) {
  const t = useGraphEditorStrings()
  const inputsEditor = useInputsEditorStrings()
  const create = source?.create
  if (!create) {
    return null
  }
  const types = inputsEditor.types as Record<string, string>
  return (
    <IconButton
      icon={<AddIcon />}
      label={t.newInputOf(types[type] ?? type)}
      size="sm"
      variant="ghost"
      onClick={() => create(type, onCreated)}
    />
  )
}

// Puts `reference` at the cursor in `element`, or at the end when there is no element.
function insertAt(
  element: HTMLInputElement | HTMLTextAreaElement | null,
  value: string,
  reference: string,
): string {
  const start = element?.selectionStart ?? value.length
  const end = element?.selectionEnd ?? value.length
  return value.slice(0, start) + reference + value.slice(end)
}

// Inputs whose value is one of their options, so a condition compares it to one.
const ONE_OF = ['dropdown', 'radio']

/** Conditions on the form's switches and choices, for fields that run on one. */
function conditionSuggestions(
  source: InputSource | undefined,
  t: GraphEditorStrings,
): Suggestion[] {
  return (source?.refs ?? []).flatMap((ref): Suggestion[] => {
    if (ref.type === 'boolean') {
      return [
        { value: flagExpression(ref.path, false), label: t.whenOn(ref.label) },
        { value: flagExpression(ref.path, true), label: t.whenOff(ref.label) },
      ]
    }
    return ONE_OF.includes(ref.type)
      ? optionValues(ref.definition).map((option) => ({
          value: equalsExpression(ref.path, option),
          label: t.whenIs(ref.label, option),
        }))
      : []
  })
}

/** A switch, or an expression typed in its place, such as one that follows another input. */
export function FlagField({
  label,
  yamlKey,
  description,
  value,
  original,
  fallback = false,
  onChange,
  source,
}: {
  label: string
  yamlKey?: string
  description: string
  value: Flag
  original: unknown
  fallback?: boolean
  onChange: (value: Flag) => void
  source?: InputSource | undefined
}) {
  const t = useGraphEditorStrings()
  const id = useId()
  const [typed, setTyped] = useState(typeof value === 'string')
  const checked = typeof value === 'boolean' ? value : fallback
  const setTypedValue = (next: string) => onChange(next.trim() ? next : undefined)
  const lint = useFieldLint(yamlKey, id, typeof value === 'string' ? value : '', setTypedValue)
  return (
    <YamlField
      label={label}
      yamlKey={yamlKey}
      description={description}
      error={typed ? (flagError(value, t) ?? lint.message) : undefined}
      id={id}
      actions={
        <ExpressionToggle
          active={typed}
          onChange={(on) => {
            setTyped(on)
            onChange(undefined)
          }}
        />
      }
    >
      {(control) =>
        typed ? (
          <>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <SuggestionInput
                  {...control}
                  value={typeof value === 'string' ? value : ''}
                  suggestions={conditionSuggestions(source, t)}
                  onValueChange={setTypedValue}
                />
              </div>
              <NewInputButton
                type="boolean"
                source={source}
                onCreated={(path) => onChange(flagExpression(path, false))}
              />
            </div>
            {lint.fixes}
          </>
        ) : (
          <Switch
            {...control}
            nativeButton
            render={<button type="button" />}
            checked={checked}
            onCheckedChange={(on) => onChange(flagValue(on, fallback, original))}
          />
        )
      }
    </YamlField>
  )
}

// The executor's one if keyword, and its status checks.
const CONDITIONS = [
  ['always', 'always'],
  ['failure()', 'failure'],
  ['canceled()', 'canceled'],
  ['success()', 'success'],
] as const

/** When a job or step runs: any condition, typed, with the executor's status checks and the form's switches offered. */
export function ConditionField({
  label,
  yamlKey,
  description,
  value,
  onChange,
  source,
  scope,
}: {
  label: string
  yamlKey?: string
  description: string
  value: string
  onChange: (value: string) => void
  source: InputSource
  /** A job's status checks read the jobs it needs; a step's, the steps before it. */
  scope: 'job' | 'step'
}) {
  const t = useGraphEditorStrings()
  const id = useId()
  const texts = scope === 'job' ? t.jobConditions : t.stepConditions
  const lint = useFieldLint(yamlKey, id, value, onChange)
  const insert = (reference: string) => {
    const element = document.getElementById(id)
    // A picked condition shows its name rather than its text, so only typed text has a cursor in it.
    const typed = element instanceof HTMLInputElement && element.value === value ? element : null
    onChange(insertAt(typed, value, reference))
  }
  return (
    <YamlField
      label={label}
      yamlKey={yamlKey}
      description={description}
      error={lint.message}
      id={id}
      actions={
        <>
          {allRefs(source).length > 0 && (
            <InsertRefSelect source={source} label={t.insertValue} onInsert={insert} />
          )}
          <NewInputButton
            type="boolean"
            source={source}
            onCreated={(path) => onChange(flagExpression(path, false))}
          />
        </>
      }
    >
      {(control) => (
        <>
          <SuggestionInput
            {...control}
            value={value}
            placeholder={texts.default}
            suggestions={[
              ...CONDITIONS.map(([condition, key]) => ({
                value: condition,
                label: texts[key],
              })),
              { value: 'false', label: t.conditionNever },
              ...conditionSuggestions(source, t),
            ]}
            onValueChange={onChange}
          />
          {lint.fixes}
        </>
      )}
    </YamlField>
  )
}

/** A value typed in, with the form's inputs of the given types offered, or a new one made for it. */
export function ValueOrInputField({
  label,
  yamlKey,
  description,
  value,
  onChange,
  source,
  types,
  suffix,
  literal = true,
  required = false,
  error,
  suggestions = [],
  placeholder,
}: {
  label: string
  yamlKey?: string
  description: string
  value: string
  onChange: (value: string) => void
  source: InputSource
  types: string[]
  /** A property of the input's value to read, such as a cluster's ip. */
  suffix?: string
  /** False when the schema takes only an expression here. */
  literal?: boolean
  required?: boolean
  error?: string | undefined
  suggestions?: string[]
  placeholder?: string
}) {
  const t = useGraphEditorStrings()
  const id = useId()
  const lint = useFieldLint(yamlKey, id, value, onChange)
  const firstType = types[0] ?? 'string'
  const offered: Suggestion[] = [
    ...source.refs
      .filter((ref) => types.includes(ref.type))
      .map((ref) => ({
        value: refExpression(ref.path, suffix),
        label: ref.label,
      })),
    ...(literal ? suggestions.map((suggestion) => ({ value: suggestion })) : []),
  ]
  return (
    <YamlField
      label={label}
      yamlKey={yamlKey}
      description={description}
      required={required}
      error={error ?? lint.message}
      id={id}
    >
      {(control) => (
        <>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <SuggestionInput
                {...control}
                value={value}
                placeholder={placeholder ?? (literal ? undefined : t.chooseInput)}
                suggestions={offered}
                onValueChange={onChange}
              />
            </div>
            <NewInputButton
              type={firstType}
              source={source}
              onCreated={(path) => onChange(refExpression(path, suffix))}
            />
          </div>
          {lint.fixes}
        </>
      )}
    </YamlField>
  )
}

/** A script field with a menu that drops an input's reference at the cursor. */
export function ScriptField({
  label,
  yamlKey,
  description,
  value,
  onChange,
  source,
  rows,
  error,
  placeholder,
}: {
  label: string
  yamlKey?: string
  description: string
  value: string
  onChange: (value: string) => void
  source: InputSource
  /** Lines to show; without it the field starts one line tall and grows. */
  rows?: number
  error?: string | undefined
  placeholder?: string
}) {
  const t = useGraphEditorStrings()
  const id = useId()
  const growing = useGrowingArea(value)
  const area = rows === undefined ? growing : null
  const fixed = useRef<HTMLTextAreaElement>(null)
  const lint = useFieldLint(yamlKey, id, value, onChange)
  const shownError = error ?? lint.message
  const insert = (reference: string) =>
    onChange(insertAt((area ?? fixed).current, value, reference))
  return (
    <YamlField
      label={label}
      yamlKey={yamlKey}
      description={description}
      error={shownError}
      id={id}
      actions={
        allRefs(source).length > 0 && (
          <InsertRefSelect source={source} label={t.insertValue} onInsert={insert} />
        )
      }
    >
      {(control) => (
        <>
          <Textarea
            {...control}
            ref={area ?? fixed}
            mono
            rows={rows ?? 1}
            value={value}
            className={rows === undefined ? GROWING_AREA : ''}
            {...(placeholder ? { placeholder } : {})}
            onChange={(e) => onChange(e.target.value)}
          />
          {lint.fixes}
        </>
      )}
    </YamlField>
  )
}

const GROUP_ORDER: RefGroup[] = ['inputs', 'outputs', 'matrix', 'variables', 'sessions', 'env']

function InsertRefSelect({
  source,
  label,
  onInsert,
}: {
  source: InputSource
  label: string
  onInsert: (reference: string) => void
}) {
  const t = useGraphEditorStrings()
  const strings = useStrings()
  const all = allRefs(source)
  const groups = GROUP_ORDER.map((group) => ({
    group,
    items: all
      .filter((item) => item.group === group)
      .map((item) => ({ label: item.label, onClick: () => onInsert(item.expression) })),
  })).filter((group) => group.items.length > 0)
  // One kind of reference lists them all; several make a submenu each.
  const entries: MenuEntry[] =
    groups.length === 1
      ? (groups[0]?.items ?? [])
      : groups.map(({ group, items }) => ({ label: t.refGroups[group], items }))
  return (
    <ActionMenu
      label={label}
      items={entries}
      search={{ placeholder: strings.common.search, empty: strings.dropdown.noOptionsFound }}
      triggerClassName="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-(--theme-border) bg-(--theme-panel-bg) px-2 py-1 text-xs text-(--theme-app) hover:bg-(--theme-muted-panel-bg)"
    >
      <AddIcon aria-hidden="true" className="size-3 theme-muted-text" />
      {label}
    </ActionMenu>
  )
}

function allRefs(source: InputSource): ExpressionRef[] {
  return [
    ...source.refs.map((input) => ({
      group: 'inputs' as const,
      label: `inputs.${pathKey(input.path)}`,
      expression: refExpression(input.path),
    })),
    ...(source.extras ?? []).filter((extra) => extra.group !== 'inputs'),
  ]
}

/** References offered as suggestions on free-text values. */
export function refSuggestions(source: InputSource): string[] {
  return allRefs(source).map((item) => item.expression)
}

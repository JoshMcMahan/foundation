import { useId, useRef, useState } from 'react'
import { IconButton } from '../components/IconButton'
import { fieldBoxClasses, Textarea } from '../components/Input'
import { Toggle } from '../components/Toggle'
import type { WorkflowEditing } from '../editing'
import { AddIcon } from '../icons'
import {
  asRecord,
  ExpressionToggle,
  FieldError,
  FieldLabel,
  type Flag,
  flagError,
  flagValue,
  GROWING_AREA,
  type Json,
  LabelledField,
  text,
  useGrowingArea,
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
  const id = useId()
  const matching = refs.filter((ref) => types.includes(ref.type))
  const current = value ? pathKey(value) : ''
  const known = matching.some((ref) => pathKey(ref.path) === current)
  return (
    <select
      id={id}
      aria-label={label}
      value={known || !current ? current : `?${current}`}
      onChange={(e) => {
        const next = e.target.value
        if (next === '+') {
          onNew?.()
        } else if (next && !next.startsWith('?')) {
          onChange(next.split('.'))
        }
      }}
      className={fieldBoxClasses}
    >
      <option value="" disabled>
        {matching.length > 0 ? t.chooseInput : t.noMatchingInputs}
      </option>
      {!known && current && <option value={`?${current}`}>inputs.{current}</option>}
      {matching.map((ref) => (
        <option key={pathKey(ref.path)} value={pathKey(ref.path)}>
          {ref.label === ref.path.at(-1)
            ? `inputs.${pathKey(ref.path)}`
            : `${ref.label} (inputs.${pathKey(ref.path)})`}
        </option>
      ))}
      {onNew && <option value="+">{newLabel ?? t.newInput}</option>}
    </select>
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
      icon={<AddIcon className="h-4 w-4" />}
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

/** A text field that takes any value, expressions included, with suggestions to pick from. */
export function ExpressionInput({
  id,
  label,
  value,
  onChange,
  suggestions = [],
  placeholder,
  error,
  describedBy,
  required,
}: {
  id?: string
  label: string
  value: string
  onChange: (value: string) => void
  suggestions?: Suggestion[]
  placeholder?: string | undefined
  error?: string | undefined
  describedBy?: string
  required?: boolean
}) {
  return (
    <>
      <SuggestionInput
        id={id}
        ariaLabel={label}
        aria-describedby={describedBy}
        required={required}
        value={value}
        placeholder={placeholder}
        suggestions={suggestions}
        onChange={onChange}
      />
      <FieldError message={error} />
    </>
  )
}

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
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <FieldLabel label={label} yamlKey={yamlKey} description={description} />
        <div className="flex shrink-0 items-center gap-1">
          {!typed && (
            <Toggle
              checked={checked}
              onChange={(on) => onChange(flagValue(on, fallback, original))}
              label={label}
            />
          )}
          <ExpressionToggle
            active={typed}
            onChange={(on) => {
              setTyped(on)
              onChange(undefined)
            }}
          />
        </div>
      </div>
      {typed && (
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <ExpressionInput
              id={id}
              label={label}
              value={typeof value === 'string' ? value : ''}
              suggestions={conditionSuggestions(source, t)}
              error={flagError(value, t) ?? lint.message}
              onChange={setTypedValue}
            />
          </div>
          <NewInputButton
            type="boolean"
            source={source}
            onCreated={(path) => onChange(flagExpression(path, false))}
          />
        </div>
      )}
      {typed && lint.fixes}
    </div>
  )
}

// The executor's one if keyword, and its status checks.
const CONDITIONS = [
  ['always', 'always'],
  ['failure()', 'failure'],
  ['cancelled()', 'cancelled'],
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
    <LabelledField
      label={label}
      yamlKey={yamlKey}
      description={description}
      htmlFor={id}
      descriptionId={`${id}-help`}
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
      <ExpressionInput
        id={id}
        label={label}
        describedBy={`${id}-help`}
        value={value}
        error={lint.message}
        placeholder={texts.default}
        suggestions={[
          ...CONDITIONS.map(([condition, key]) => ({
            value: condition,
            label: texts[key],
          })),
          { value: 'false', label: t.conditionNever },
          ...conditionSuggestions(source, t),
        ]}
        onChange={onChange}
      />
      {lint.fixes}
    </LabelledField>
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
    <LabelledField
      label={required ? `${label} *` : label}
      yamlKey={yamlKey}
      description={description}
      descriptionId={`${id}-help`}
    >
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <ExpressionInput
            id={id}
            label={label}
            describedBy={`${id}-help`}
            required={required}
            value={value}
            placeholder={placeholder ?? (literal ? undefined : t.chooseInput)}
            suggestions={offered}
            onChange={onChange}
          />
        </div>
        <NewInputButton
          type={firstType}
          source={source}
          onCreated={(path) => onChange(refExpression(path, suffix))}
        />
      </div>
      <FieldError message={error ?? lint.message} />
      {lint.fixes}
    </LabelledField>
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
    <LabelledField
      label={label}
      yamlKey={yamlKey}
      description={description}
      htmlFor={id}
      descriptionId={`${id}-help`}
      actions={
        allRefs(source).length > 0 && (
          <InsertRefSelect source={source} label={t.insertValue} onInsert={insert} />
        )
      }
    >
      <Textarea
        ref={area ?? fixed}
        id={id}
        mono
        aria-describedby={`${id}-help`}
        rows={rows ?? 1}
        value={value}
        className={rows === undefined ? GROWING_AREA : ''}
        {...(shownError ? { error: shownError } : {})}
        {...(placeholder ? { placeholder } : {})}
        onChange={(e) => onChange(e.target.value)}
      />
      {lint.fixes}
    </LabelledField>
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
  const all = allRefs(source)
  // A select dressed as a button: the grouped list and keyboard handling come with it.
  return (
    <span className="relative inline-flex shrink-0 items-center">
      <AddIcon
        aria-hidden="true"
        className="pointer-events-none absolute left-2 h-3 w-3 theme-muted-text"
      />
      <select
        aria-label={label}
        value=""
        onChange={(e) => {
          if (e.target.value) {
            onInsert(e.target.value)
          }
        }}
        className="cursor-pointer appearance-none rounded-md border border-(--theme-border) bg-(--theme-panel-bg) py-1 pr-2 pl-6 text-xs text-(--theme-app) hover:bg-(--theme-muted-panel-bg)"
      >
        <option value="">{label}</option>
        {GROUP_ORDER.map((group) => {
          const refs = all.filter((item) => item.group === group)
          return refs.length > 0 ? (
            <optgroup key={group} label={t.refGroups[group]}>
              {refs.map((item) => (
                <option key={item.label} value={item.expression}>
                  {item.label}
                </option>
              ))}
            </optgroup>
          ) : null
        })}
      </select>
    </span>
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

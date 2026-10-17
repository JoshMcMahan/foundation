import { dequal as deepEqual } from 'dequal'
import {
  type CSSProperties,
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  type FieldError,
  FormProvider,
  get,
  type UseFormReturn,
  useForm,
  useFormContext,
  useFormState,
  useWatch,
} from 'react-hook-form'
import { Button } from '../components/Button'
import { FieldRowContext } from '../components/Field'
import { Loader } from '../components/Loader'
import { useStrings, useWorkflowEngine } from '../components/Provider'
import { Section, type SectionSpacing } from '../components/Section'
import { cx } from '../cx'
import type { WorkflowVariables } from '../engine'
import { FormLayout, LayoutCSSContext } from './FormLayout'
import { type FieldComponent, FieldRegistryContext, Registry } from './fieldRegistry'
import { EditingScope, useFormEditing } from './formEditing'
import { resolveFormLayout } from './layout'
import { inputWidth, resolvedFlag } from './lib'
import { useParsedOpts } from './useParsedOpts'
import { atIndex, fieldPath, rowIndexOf } from './utils/fieldPath'
import { getParentValue } from './utils/getParentValue'
import { getValueUsingPath } from './utils/getValueUsingPath'
import { shareEqual } from './utils/shareEqual'
import {
  type FormChecks,
  FormChecksContext,
  RequiredFieldContext,
  type ServerError,
} from './validation'
import { parseWizardConfig } from './Wizard/utils'
import { WizardContainer } from './Wizard/WizardContainer'

interface FormMeta {
  labelPosition?: 'left' | 'top' | undefined
  spaceCompact?: boolean | undefined
}

/** Loose shape of one node of the user-authored form schema. */
interface SchemaField {
  type?: string | Record<string, string> | undefined
  label?: string
  name?: string
  default?: unknown
  hidden?: boolean | string
  ignore?: boolean | string
  optional?: boolean | string
  disabled?: boolean | string
  collapsed?: boolean
  noCollapse?: boolean
  computeOn?: boolean
  tooltip?: string | string[]
  width?: number | string
  'anchor-below'?: boolean
  template?: Record<string, unknown>
  items?: Record<string, unknown>
  options?: Record<string, unknown>
  show_if?: unknown
  show_if_not?: unknown
  depends_on?: string
  enable_if?: string | boolean
  resetOnChange?: string
  secondaryField?: string | string[]
  one_must_be_true?: boolean
  min?: number | Record<string, number> | undefined
  max?: number | Record<string, number> | undefined
}

function asSchemaField(value: unknown): SchemaField | null {
  return value && typeof value === 'object' ? (value as SchemaField) : null
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function flagValue(value: unknown, fallback: string | boolean): string | boolean {
  return value && (typeof value === 'string' || typeof value === 'boolean') ? value : fallback
}

/** The `$meta.labelPosition` a workflow set, which nested lists inherit; undefined when none did. */
const ChosenLabelPosition = createContext<'left' | 'top' | undefined>(undefined)

function useChosenLabelPosition(options: Record<string, unknown>): 'left' | 'top' | undefined {
  const inherited = useContext(ChosenLabelPosition)
  const position = asRecord(options['$meta'])['labelPosition']
  return position === 'left' || position === 'top' ? position : inherited
}

/** Applies `$meta` overrides for `labelPosition` / `spaceCompact`. */
export function resolveMetaOverrides(
  options: { $meta?: FormMeta } | Record<string, unknown> | undefined,
  labelPosition: 'left' | 'top' | undefined,
  spaceCompact: boolean,
) {
  const meta = options?.['$meta'] as FormMeta | undefined
  return {
    labelPosition: meta?.labelPosition ?? labelPosition,
    spaceCompact: meta?.spaceCompact ?? spaceCompact,
  }
}

/** Cheap signature of every list's length; gates the expensive collect walk. */
export function listLengthsSignature(
  options: Record<string, unknown>,
  values: Record<string, unknown> = {},
  prefix = '',
): string {
  if (!options || typeof options !== 'object') {
    return ''
  }
  const parts: string[] = []
  for (const [fieldName, rawField] of Object.entries(options)) {
    const field = asSchemaField(rawField)
    if (fieldName === '$meta' || !field) {
      continue
    }
    const fullName = prefix ? `${prefix}${fieldName}` : fieldName
    if (field.type === 'list' || repeatsPage(field)) {
      const items = values?.[fieldName]
      const len = Array.isArray(items) ? items.length : 0
      parts.push(`${fullName}:${len}`)
      const template = field.template || field.options
      if (template && Array.isArray(items)) {
        for (let i = 0; i < items.length; i++) {
          parts.push(listLengthsSignature(template, asRecord(items[i]), `${fullName}.${i}.`))
        }
      }
    } else if (field.type === 'group') {
      // Same split as collectFieldsWithDefaults, and it has to match: this signature is what gates that
      // walk and keys its row-shrink pruning. Prefixing a flatten group here emitted `controller.disks:0`
      // forever, so a row add or remove in that list was invisible to the memo and the pruning keys never
      // matched the tracked names.
      const groupItems = field.items || field.options
      if (groupItems) {
        parts.push(listLengthsSignature(groupItems, values, prefix))
      }
    } else if (field.type === 'object') {
      const groupItems = field.items || field.options
      if (groupItems) {
        const nestedValues = asRecord(values?.[fieldName])
        parts.push(listLengthsSignature(groupItems, nestedValues, `${fullName}.`))
      }
    }
  }
  return parts.join('|')
}

/** Collects every field with a `default` for the form-level sync to track, named as the form store
 * names it: a row's fields by `list.0.field`. */
export function collectFieldsWithDefaults(
  options: Record<string, unknown>,
  values: Record<string, unknown> = {},
  prefix = '',
): Array<{ name: string; defaultValue: unknown; hasSecondary?: boolean }> {
  const result: Array<{
    name: string
    defaultValue: unknown
    hasSecondary?: boolean
  }> = []

  if (!options || typeof options !== 'object') {
    return result
  }

  for (const [fieldName, rawField] of Object.entries(options)) {
    const field = asSchemaField(rawField)
    if (fieldName === '$meta' || !field) {
      continue
    }

    const fullName = prefix ? `${prefix}${fieldName}` : fieldName

    // convertToDynamicForm keeps a flatten group as `group` and turns every other one into `object`,
    // so a surviving `group` is always flattened. Its children live at the ROOT of values, not under
    // its own key -- initializeValues and the renderers both hoist them -- so prefixing here would
    // produce paths that do not exist and the sync would never fire.
    if (field.type === 'group') {
      const groupItems = field.items || field.options
      if (groupItems) {
        result.push(...collectFieldsWithDefaults(groupItems, values, prefix))
      }
      continue
    }

    if (field.type === 'object') {
      const groupItems = field.items || field.options
      if (groupItems) {
        const nestedValues = asRecord(values?.[fieldName])
        result.push(...collectFieldsWithDefaults(groupItems, nestedValues, `${fullName}.`))
      }
      continue
    }

    if (field.type === 'list' || repeatsPage(field)) {
      const listTemplate = field.template || field.options
      const listValues = values?.[fieldName]
      if (listTemplate && Array.isArray(listValues)) {
        for (let i = 0; i < listValues.length; i++) {
          const itemValues = asRecord(listValues[i])
          result.push(...collectFieldsWithDefaults(listTemplate, itemValues, `${fullName}.${i}.`))
        }
      }
      continue
    }

    // A hidden field marked `ignore` is stripped before save, so materializing its default is
    // churn at best. The wizard only strips on render, and a collapsed section never renders, so
    // the write would survive into the saved config.
    // `ignore` is usually the self-reference `${{ .hidden }}`, which never resolves to a boolean
    // here, so presence (not truth) is what marks the field strippable.
    if (
      resolvedFlag(field.hidden) === true &&
      field.ignore !== undefined &&
      resolvedFlag(field.ignore) !== false
    ) {
      continue
    }

    if (field.default !== undefined) {
      result.push({
        name: fullName,
        defaultValue: field.default,
        ...(field.secondaryField ? { hasSecondary: true } : {}),
      })
    }
  }

  return result
}

// The lookahead stops `inputs.region` from matching `inputs.region_name` or `inputs.region.zone`.
export function defaultReferencesField(defaultValue: unknown, fieldPath: string): boolean {
  if (typeof defaultValue !== 'string' || !defaultValue.includes('${{')) {
    return false
  }
  const escaped = fieldPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`\\binputs\\.${escaped}(?![\\w.[-])`).test(defaultValue)
}

export function findSelfReferencingFieldNames(
  schema: Record<string, unknown>,
  values: Record<string, unknown> = {},
): string[] {
  return collectFieldsWithDefaults(schema, values)
    .filter(({ name, defaultValue }) => defaultReferencesField(defaultValue, name))
    .map(({ name }) => name)
}

/** Resolves schema defaults into form values as dependencies change. Store-agnostic so the form and
 * hosts with their own store share one implementation. */
export function useDynamicDefaultsSync({
  options,
  values,
  setValue,
  isTouched,
}: {
  options: Record<string, unknown>
  values: Record<string, unknown>
  setValue: (name: string, value: unknown) => void
  isTouched: (name: string) => boolean
}) {
  const engine = useWorkflowEngine()
  // Gate `collectFieldsWithDefaults` on list-lengths only — a scalar
  // keystroke changes `values` but not the signature, so we skip the walk.
  const listSig = useMemo(() => listLengthsSignature(options, values), [options, values])
  // biome-ignore lint/correctness/useExhaustiveDependencies: listSig captures the only value-derived input we care about here.
  const fieldsWithDefaults = useMemo(
    () =>
      // The options tree is parsed without a row context, so a list default's `[index]` is still a
      // raw template here; resolve it per row or the sync compares against, and writes, the template.
      collectFieldsWithDefaults(options, values).map((f) => {
        if (typeof f.defaultValue !== 'string' || !f.defaultValue.includes('${{')) {
          return f
        }
        const index = rowIndexOf(f.name) ?? -1
        // The parser is object-in/object-out, so wrap the bare string and unwrap the result.
        const parsed = engine.evaluate({
          inputs: values,
          obj: { v: f.defaultValue },
          orgVars: {},
          index,
        })
        const resolved =
          parsed && typeof parsed === 'object' && 'v' in parsed
            ? (parsed as { v: unknown }).v
            : f.defaultValue
        return { ...f, defaultValue: resolved }
      }),
    [options, listSig],
  )

  // Writes wait for the commit: a store that tells other components of a change can't be written
  // while this one renders.
  const pendingRef = useRef<Array<[string, unknown]>>([])
  useEffect(() => {
    const pending = pendingRef.current.splice(0)
    for (const [name, value] of pending) {
      setValue(name, value)
    }
  })
  const prevDefaultsRef = useRef<Map<string, string>>(new Map())
  const synthTouchedRef = useRef<Set<string>>(new Set())
  const prevListLensRef = useRef<Map<string, number>>(new Map())

  // Ref starts null so the initial iteration runs once on mount.
  const fieldsWithDefaultsRef = useRef<typeof fieldsWithDefaults | null>(null)
  if (!deepEqual(fieldsWithDefaultsRef.current, fieldsWithDefaults)) {
    fieldsWithDefaultsRef.current = fieldsWithDefaults
    // Drop refs for removed list-item paths so a re-added item at the same
    // index starts fresh instead of inheriting the previous occupant's state.
    const currentNames = new Set(fieldsWithDefaults.map((f) => f.name))
    for (const name of prevDefaultsRef.current.keys()) {
      if (!currentNames.has(name)) {
        prevDefaultsRef.current.delete(name)
        synthTouchedRef.current.delete(name)
      }
    }
    // Removing a row shifts the survivors' indexes, transplanting the deleted occupant's tracked
    // state onto them. Forget the whole list on any shrink so survivors are first-seen again.
    const listLens = new Map<string, number>()
    for (const part of listSig.split('|')) {
      const sep = part.lastIndexOf(':')
      if (sep > 0) {
        listLens.set(part.slice(0, sep), Number(part.slice(sep + 1)))
      }
    }
    for (const [list, prevLen] of prevListLensRef.current) {
      const nowLen = listLens.get(list)
      if (nowLen !== undefined && nowLen < prevLen) {
        for (const name of [...prevDefaultsRef.current.keys()]) {
          if (name.startsWith(`${list}.`)) {
            prevDefaultsRef.current.delete(name)
          }
        }
        for (const name of [...synthTouchedRef.current]) {
          if (name.startsWith(`${list}.`)) {
            synthTouchedRef.current.delete(name)
          }
        }
      }
    }
    prevListLensRef.current = listLens
    for (const { name, defaultValue, hasSecondary } of fieldsWithDefaults) {
      // A bare write cannot maintain a secondaryField pair the way the field's own component does.
      if (hasSecondary) {
        continue
      }
      if (synthTouchedRef.current.has(name)) {
        continue
      }
      if (isTouched(name)) {
        continue
      }
      // Still unresolved: skip without locking, so a later resolvable pass can still act.
      if (typeof defaultValue === 'string' && defaultValue.includes('${{')) {
        continue
      }

      // Map.has (not just != null) so a null-then-real expression doesn't
      // get treated as first-seen on the second pass.
      const wasSeen = prevDefaultsRef.current.has(name)
      // `?? null` so prev-default and currVal use the same JSON encoding
      // (both `"null"` when null/undefined; without it they'd compare unequal).
      const serializedDefault = JSON.stringify(defaultValue ?? null)
      const prevDefault = prevDefaultsRef.current.get(name)
      prevDefaultsRef.current.set(name, serializedDefault)

      if (!wasSeen) {
        const rawValue = getValueUsingPath(values, name)
        const currVal = JSON.stringify(rawValue)
        // A value that is still a raw template is the artefact this sync exists to replace, not a
        // choice the user made — locking it would pin the template forever.
        //
        // Whole-string, not `includes`: a saved value may legitimately EMBED an expression the user
        // typed, e.g. `https://${{ var.PAT }}@github.com/acme/private.git`, and substring matching read
        // that as an artefact and overwrote it with the schema default. initializeValues copies a
        // template default verbatim, so the artefact is always the entire value.
        const trimmedValue = typeof rawValue === 'string' ? rawValue.trim() : ''
        const unresolvedValue = trimmedValue.startsWith('${{') && trimmedValue.endsWith('}}')
        // Saved value diverges from the default → user curated it; lock so
        // future default changes don't overwrite. Skip when there's no saved
        // value (currVal === undefined) — let the next default flow through.
        if (!unresolvedValue && currVal !== undefined && currVal !== serializedDefault) {
          synthTouchedRef.current.add(name)
          continue
        }
        if (!unresolvedValue) {
          continue
        }
        // Fall through so the resolved default is written over the template on this same pass.
      }

      if (prevDefault === serializedDefault) {
        continue
      }
      if (defaultValue === null || defaultValue === undefined) {
        continue
      }
      const currVal = JSON.stringify(getValueUsingPath(values, name))
      if (currVal !== serializedDefault) {
        pendingRef.current.push([name, defaultValue])
      }
    }
  }
}

export function DynamicDefaultsSync({ options }: { options: Record<string, unknown> }) {
  const { control, setValue, getFieldState } = useFormContext<FormValues>()
  const values = useWatch({ control })
  useDynamicDefaultsSync({
    options,
    values,
    setValue: (name, value) => setValue(name, value, { shouldDirty: true }),
    isTouched: (name) => getFieldState(name).isTouched,
  })
  return null
}

export type FormValues = Record<string, unknown>

/** What holds for every field of a form, so no field passes it down. */
interface FormOptions {
  /** Keeps a hidden field's value: a workflow form filters hidden inputs out when it submits. */
  workflowForm: boolean
}

const FormOptionsContext = createContext<FormOptions>({ workflowForm: false })

/** Called by a field marked `one_must_be_true` in a list's row, so the list can keep one row on. */
type RowFlagChange = (
  fieldName: string,
  index: number,
  changeOtherValuesTo?: string | boolean,
  keepOneValueOf?: string | boolean,
  currentValue?: string | boolean,
) => void

/** Where fields that are part of another field, as an object's or a list row's, keep their values. */
export interface ParentInfo {
  computeOn?: boolean | undefined
  fieldNamePrefix: string
  arrayIndex?: number | undefined
  onChange?: RowFlagChange | undefined
}

interface ParseFieldCache {
  optionsField: unknown
  converted: Record<string, unknown>
  inputDeps: string[]
  hasExpressions: boolean
  /** The inputs the last parse read, as text: the store changes values in place. */
  key: string | null
  result: unknown
}

/** Parses a field's schema against the form's values, again only when an input it reads changes.
 * Without expressions the schema is its own parse; with only org-var or path expressions it parses once. */
function useFieldParse(
  optionsField: unknown,
  arrayIndex: number | undefined,
): (values: FormValues) => unknown {
  const engine = useWorkflowEngine()
  const cache = useRef<ParseFieldCache | null>(null)
  let c = cache.current
  if (c === null || c.optionsField !== optionsField) {
    const converted = engine.convertInputs(asRecord(optionsField))
    const { inputDeps, hasExpressions } = engine.inputDependencies(converted)
    c = {
      optionsField,
      converted,
      inputDeps: [...inputDeps],
      hasExpressions,
      key: null,
      result: null,
    }
    cache.current = c
  }
  const parse = c
  return (values) => {
    if (!parse.hasExpressions) {
      return optionsField
    }
    const key = JSON.stringify([arrayIndex, ...parse.inputDeps.map((dep) => values[dep])])
    if (key !== parse.key) {
      parse.key = key
      parse.result = shareEqual(
        parse.result,
        engine.evaluate({ inputs: values, obj: parse.converted, orgVars: {}, index: arrayIndex }),
      )
    }
    return parse.result
  }
}

/** Whether a field's `show_if` and `show_if_not` let it show. */
function shows(field: SchemaField, values: FormValues, index: number | undefined): boolean {
  if (field.show_if !== undefined && !getParentValue(index, field.show_if, values, field)) {
    return false
  }
  return field.show_if_not === undefined || !getParentValue(index, field.show_if_not, values, field)
}

/** What a field reads from the form's values, beyond what its schema's expressions read. */
interface FieldReads {
  hidden: boolean
  /** Whether the field, hidden, takes its value out of the form. */
  clears: boolean
  /** Its `enable_if` input is off. */
  disabledByInput: boolean
  /** The value of the input its `depends_on` names, read when it picks the field's type or range. */
  parentValue: unknown
  /** The value of the input whose change resets the field. */
  resetBy: string | undefined
}

function readField(
  field: SchemaField | null,
  values: FormValues,
  index: number | undefined,
  workflowForm: boolean,
): FieldReads {
  if (field === null) {
    return {
      hidden: true,
      clears: false,
      disabledByInput: false,
      parentValue: undefined,
      resetBy: undefined,
    }
  }
  const markedHidden = field.hidden === true || !field.type
  const hidden = markedHidden || !shows(field, values, index)
  // A workflow form filters hidden inputs out at submit, so it keeps their values across hiding and
  // showing; any other form drops a hidden field's value unless it's only marked hidden without `ignore`.
  const clears = hidden && !workflowForm && (!markedHidden || Boolean(resolvedFlag(field.ignore)))
  const enableIf =
    typeof field.enable_if === 'string' && field.disabled === false
      ? getValueUsingPath(values, atIndex(field.enable_if, index))
      : undefined
  const typedByParent =
    field.depends_on !== undefined && (typeof field.type === 'object' || field.type === 'range')
  return {
    hidden,
    clears,
    disabledByInput: enableIf === false,
    parentValue: typedByParent
      ? getValueUsingPath(values, atIndex(field.depends_on ?? '', index))
      : undefined,
    resetBy: field.resetOnChange
      ? JSON.stringify(getValueUsingPath(values, field.resetOnChange))
      : undefined,
  }
}

interface FormFieldProps {
  fieldName: string
  optionsField: unknown
  /** Set for a field that is part of another, whose schema is parsed per row. */
  nested: boolean
  fieldNamePrefix: string
  arrayIndex: number | undefined
  computeOn: boolean | undefined
  onRowChange: RowFlagChange | undefined
  labelPosition: 'left' | 'top'
  spaceCompact: boolean
}

/**
 * One field of the schema. It renders again only when what it reads changes: an input its expressions
 * or conditions read, or the error the form shows under it. Its own value is its input's business.
 */
const FormField = memo(function FormField({
  fieldName,
  optionsField,
  nested,
  fieldNamePrefix,
  arrayIndex,
  computeOn,
  onRowChange,
  labelPosition,
  spaceCompact,
}: FormFieldProps) {
  const { control, getValues, setValue, unregister } = useFormContext<FormValues>()
  const { workflowForm } = useContext(FormOptionsContext)
  const { form: strings } = useStrings()
  const inRow = useContext(FieldRowContext)
  const editing = useFormEditing()
  const parse = useFieldParse(optionsField, nested ? arrayIndex : undefined)
  // The row a field's `[index]` paths read: its own list's, or the nearest list's around it.
  const index = nested ? (arrayIndex ?? rowIndexOf(fieldNamePrefix)) : undefined
  // The name editing tells copies apart by keeps the list's own spelling; the store's uses dots.
  const instance = fieldNamePrefix + fieldName
  const name = fieldPath(instance)
  const schemaOf = (values: FormValues) => asSchemaField(nested ? parse(values) : optionsField)

  useWatch({
    control,
    compute: (values: FormValues) => {
      const field = schemaOf(values)
      const reads = readField(field, values, index, workflowForm)
      return [
        field,
        JSON.stringify(reads),
        reads.clears && getValueUsingPath(values, name) !== undefined,
      ]
    },
  })
  const { errors } = useFormState({ control, name, exact: true })

  const values = getValues()
  const field = schemaOf(values)
  const reads = readField(field, values, index, workflowForm)
  const holdsValue = reads.clears && getValueUsingPath(values, name) !== undefined
  useEffect(() => {
    if (holdsValue) {
      unregister(name)
    }
  }, [holdsValue, name, unregister])
  // The field's value goes when the input it resets on changes, not when that input is first set.
  const resetFrom = useRef(reads.resetBy)
  useEffect(() => {
    if (resetFrom.current !== undefined && resetFrom.current !== reads.resetBy) {
      setValue(name, undefined)
    }
    resetFrom.current = reads.resetBy
  }, [reads.resetBy, name, setValue])

  const tooltip = field?.tooltip
  const help =
    (typeof tooltip === 'string'
      ? tooltip.replace(/\r/g, '')
      : // An entry may be an expression that resolves to '' when it does not apply.
        tooltip?.filter(Boolean).join('\n')) || undefined

  const path = editing ? [...editing.parent, fieldName] : null
  if (field === null || fieldName === 'v3') {
    return null
  }
  if (reads.hidden) {
    return editing && path && fieldName !== '$meta' ? (
      <editing.Row path={path} instance={instance} hidden />
    ) : null
  }
  const parentInfo: ParentInfo | undefined = nested
    ? { fieldNamePrefix, arrayIndex, computeOn, onChange: onRowChange }
    : undefined
  if (field.type === 'group') {
    const meta = resolveMetaOverrides(field.options, labelPosition, spaceCompact)
    const group = (
      <Section
        title={field.label}
        collapsible={!field.noCollapse}
        defaultOpen={!field.collapsed}
        spacing={sectionSpacing(meta.labelPosition)}
        className={sectionAbove}
      >
        <EditingScope editing={editing} path={path}>
          {/* A group's fields flow on their own, outside the row the group sits in. */}
          <FieldRowContext value={false}>
            <FieldsFromOptions
              options={field.options ?? {}}
              parentInfo={parentInfo}
              labelPosition={meta.labelPosition}
              spaceCompact={meta.spaceCompact}
            />
          </FieldRowContext>
        </EditingScope>
      </Section>
    )
    return editing && path ? (
      <editing.Row path={path} instance={instance}>
        {group}
      </editing.Row>
    ) : (
      group
    )
  }

  const fieldObj: SchemaField = {
    ...field,
    label: field.label || fieldName.charAt(0).toUpperCase() + fieldName.slice(1),
    name,
    // explicit field.optional first, implicit field.default second
    optional: resolvedFlag(field.optional) ?? field.default !== undefined,
  }
  if (field.depends_on) {
    fieldObj.depends_on = fieldPath(atIndex(field.depends_on, index))
  }
  if (reads.disabledByInput) {
    fieldObj.disabled = true
  }
  if (typeof field.type === 'object' && field.depends_on) {
    const resolvedType = field.type[String(reads.parentValue)]
    if (!resolvedType) {
      return null
    }
    fieldObj.type = resolvedType
  }
  if (field.type === 'range' && field.depends_on) {
    const { min, max } = field
    if (typeof min === 'object' && typeof max === 'object') {
      fieldObj.min = min[String(reads.parentValue)]
      fieldObj.max = max[String(reads.parentValue)]
    }
  }
  if (field.secondaryField) {
    fieldObj.secondaryField = Array.isArray(field.secondaryField)
      ? field.secondaryField.map((secondary) => fieldPath(fieldNamePrefix + secondary))
      : fieldPath(fieldNamePrefix + field.secondaryField)
  }
  let onChange: ((val: unknown) => void) | undefined
  if (field.one_must_be_true && onRowChange) {
    // only used in pool partition_config at the moment
    const fieldOptions = fieldObj.options
    onChange = (val) =>
      onRowChange(
        fieldName,
        arrayIndex ?? 0,
        flagValue(fieldOptions?.['offOption'], false),
        flagValue(fieldOptions?.['onOption'], true),
        val as string | boolean,
      )
  }

  // A field needs a value unless it is optional or has a default. A boolean always holds one, and a
  // field the person can't change, or one still being built, holds nothing back.
  const required =
    !fieldObj.optional && !fieldObj.disabled && fieldObj.type !== 'boolean' && !editing
  const input = (
    <div
      className={
        inRow
          ? // Passes the row's label and control tracks to the field; a field that doesn't take
            // them, such as a group or one with its label beside it, spans both.
            'grid grid-rows-subgrid [&>:not([data-field-row])]:row-span-2'
          : cx(
              'flex w-full',
              labelPosition === 'left' ? 'mb-[15px]' : 'mb-[5px]',
              fieldObj.type === 'object' && sectionAbove,
            )
      }
    >
      <RequiredFieldContext value={required ? { name, message: strings.required } : null}>
        <Registry
          field={fieldObj}
          label={fieldObj.label ?? ''}
          labelPosition={labelPosition}
          error={errorMessage(get(errors, name), strings)}
          onChange={onChange}
          disabled={Boolean(fieldObj.disabled)}
          computeOn={computeOn || fieldObj.computeOn}
          spaceCompact={spaceCompact}
          help={help}
        />
      </RequiredFieldContext>
    </div>
  )
  if (!editing || !path) {
    return input
  }
  // An object's fields are editable in place, and a list's template through any of its rows.
  const holds = fieldObj.type === 'object' || fieldObj.type === 'list'
  return (
    <editing.Row path={path} instance={instance}>
      <EditingScope editing={editing} path={holds ? path : null}>
        {input}
      </EditingScope>
    </editing.Row>
  )
})

// A section's heading starts what follows it, so it sits further from the rows above than its
// rule does from its own first row; the form's row gap alone left it closer to the rows above,
// as if it closed them. Not at the top of a list, where nothing sits above it. Padding rather than
// a margin, which would collapse into the margin under the row above.
const sectionAbove = 'not-first:pt-3'

/** A section's rule sits as far over its first row as the form's rows sit apart: tight with the
 *  labels over the fields, and the regular gap, close to the 15px between side-labeled rows. */
export function sectionSpacing(labelPosition: 'left' | 'top' | undefined): SectionSpacing {
  return labelPosition === 'top' ? 'tight' : 'regular'
}

/** The message under a field for its error, if it has one of its own rather than errors in fields
 *  inside it. */
function errorMessage(
  error: FieldError | undefined,
  strings: { required: string; checkValue: string },
): string | undefined {
  if (typeof error?.type !== 'string') {
    return undefined
  }
  if (typeof error.message === 'string' && error.message !== '') {
    return error.message
  }
  return error.type === 'server' ? strings.checkValue : strings.required
}

/** Renders a schema's fields. Inside another field, `parentInfo` says where their values sit. */
export function FieldsFromOptions({
  options = {},
  parentInfo,
  labelPosition = 'left',
  spaceCompact = false,
}: {
  options: Record<string, unknown>
  parentInfo?: ParentInfo | undefined
  labelPosition?: 'left' | 'top' | undefined
  spaceCompact?: boolean
}) {
  const editing = useFormEditing()
  const chosen = useChosenLabelPosition(options)
  // A group's fields can be a wizard of their own, paged inside the form around it.
  const wizard = parseWizardConfig(options)
  if (wizard) {
    return (
      <ChosenLabelPosition.Provider value={chosen}>
        <WizardContainer
          wizardConfig={wizard}
          className="w-full"
          labelPosition={labelPosition}
          spaceCompact={spaceCompact}
          nested
          fieldNamePrefix={parentInfo?.fieldNamePrefix}
        />
      </ChosenLabelPosition.Provider>
    )
  }
  const names = Object.keys(options)
  // Without a width or an `anchor-below` in the list, the fields stack exactly as they always have.
  const flows = names.some((name) => {
    const field = asRecord(options[name])
    return inputWidth(field['width']) !== undefined || field['anchor-below'] === true
  })
  const columns = flows ? columnsOf(options, names) : []
  const fieldOf = (fieldName: string, compactLabels = false) => (
    <FormField
      key={fieldName}
      optionsField={options[fieldName]}
      fieldName={fieldName}
      nested={parentInfo !== undefined}
      fieldNamePrefix={parentInfo?.fieldNamePrefix ?? ''}
      arrayIndex={parentInfo?.arrayIndex}
      computeOn={parentInfo?.computeOn}
      onRowChange={parentInfo?.onChange}
      // A side label would squeeze a field that shares its row, unless the workflow chose one.
      labelPosition={compactLabels ? (chosen ?? 'top') : labelPosition}
      spaceCompact={spaceCompact}
    />
  )
  const add = editing ? <editing.Add parent={editing.parent} /> : null
  const layout = resolveFormLayout(
    asRecord(options['$meta'])['layout'],
    names.filter((name) => !name.startsWith('$') && asSchemaField(options[name])),
  )
  if (layout.layout) {
    return (
      <ChosenLabelPosition.Provider value={chosen}>
        <div className="flex min-w-0 flex-col gap-4">
          <FormLayout layout={layout.layout} renderField={(name) => fieldOf(name, true)} />
          {layout.remaining.map((name) => fieldOf(name, true))}
          {add}
        </div>
      </ChosenLabelPosition.Provider>
    )
  }

  return (
    <ChosenLabelPosition.Provider value={chosen}>
      {flows ? (
        // Below 24rem the list is too narrow for rows: shares of it go full width, pixels stay.
        <div className="@container/inputs -mx-2 flex flex-wrap items-start">
          {columns.map((column) => {
            const width = inputWidth(asRecord(options[column.head])['width'])
            return (
              // The editor lists a column of hidden inputs after the shown ones, so it never splits a row.
              <div
                key={column.head}
                data-input-cell
                className="flex w-(--input-narrow) max-w-full flex-col px-2 empty:hidden @min-[24rem]/inputs:w-(--input-width) [&:not(:has(>:not([data-input-hidden])))]:order-1 [&:not(:has(>:not([data-input-hidden])))]:w-full"
                style={widthVars(width, width)}
              >
                {column.names.map((name) => {
                  const own =
                    name === column.head ? undefined : inputWidth(asRecord(options[name])['width'])
                  return own === undefined ? (
                    fieldOf(name, width !== undefined && width !== '100%')
                  ) : (
                    // A share of the list, less the gutter a column of that share keeps.
                    <div
                      key={name}
                      data-input-member
                      className="w-(--input-narrow) max-w-full @min-[24rem]/inputs:w-(--input-width)"
                      style={widthVars(
                        own,
                        own.endsWith('%') ? `calc(${parseFloat(own)}cqw - 1rem)` : own,
                      )}
                    >
                      {fieldOf(name, width !== undefined && width !== '100%')}
                    </div>
                  )
                })}
              </div>
            )
          })}
          {add && <div className="order-2 w-full px-2">{add}</div>}
        </div>
      ) : (
        <>
          {names.map((name) => fieldOf(name, undefined))}
          {add}
        </>
      )}
    </ChosenLabelPosition.Provider>
  )
}

// A wizard page the form repeats keeps its values as a list, one row per copy, like a list input.
function repeatsPage(field: { type?: unknown; multi?: unknown }): boolean {
  return field.type === 'step' && field.multi === true
}

interface Column {
  head: string
  names: string[]
}

// A field marked `anchor-below` goes under the shown field before it, in that one's column; any other
// field heads a column of its own, and columns follow the list's order.
function columnsOf(options: Record<string, unknown>, names: string[]): Column[] {
  const columns: Column[] = []
  let shown: Column | undefined
  for (const name of names) {
    const field = asRecord(options[name])
    const hidden = name.startsWith('$') || field['hidden'] === true
    if (shown && !hidden && field['anchor-below'] === true) {
      shown.names.push(name)
      continue
    }
    const column = { head: name, names: [name] }
    columns.push(column)
    if (!hidden) {
      shown = column
    }
  }
  return columns
}

// A width as written applies once the list has room for rows; before that only pixels hold.
function widthVars(width: string | undefined, wide: string | undefined): CSSProperties {
  return {
    '--input-width': wide ?? '100%',
    '--input-narrow': width?.endsWith('px') ? width : '100%',
  } as CSSProperties
}

/** The form's schema parsed against its values. The form renders again only when an input the schema
 * reads changes, and a field the change leaves alone keeps its identity, so it doesn't render. */
function useSchema(
  options: Record<string, unknown>,
  organizationVariables: WorkflowVariables | undefined,
  remoteVars: Record<string, string | undefined> | undefined,
): Record<string, unknown> {
  const engine = useWorkflowEngine()
  const { control, getValues } = useFormContext<FormValues>()
  const reads = useMemo(
    () => [...engine.inputDependencies(engine.convertInputs(options)).inputDeps],
    [engine, options],
  )
  useWatch({
    control,
    compute: (values: FormValues) => JSON.stringify(reads.map((key) => values[key])),
  })
  return useParsedOpts(
    options,
    getValues(),
    organizationVariables,
    undefined,
    undefined,
    remoteVars,
  )
}

interface DynamicFormContentProps {
  options: Record<string, unknown>
  labelPosition: 'left' | 'top'
  spaceCompact: boolean
  organizationVariables?: WorkflowVariables | undefined
  remoteVars?: Record<string, string | undefined> | undefined
  onSubmit?: ((values: FormValues) => void) | undefined
  submitLabel: string
  contextKey?: string | undefined
}

function DynamicFormContent({
  options,
  labelPosition,
  spaceCompact,
  organizationVariables,
  remoteVars,
  onSubmit,
  submitLabel,
  contextKey,
}: DynamicFormContentProps) {
  const { workflowForm } = useContext(FormOptionsContext)
  const opts = useSchema(options, organizationVariables, remoteVars)
  const wizardConfig = parseWizardConfig(opts)
  const meta = resolveMetaOverrides(options, labelPosition, spaceCompact)
  // A wizard's steps hold their own fields, so they learn the form's choice from here.
  const chosen = useChosenLabelPosition(options)

  return (
    <ChosenLabelPosition.Provider value={chosen}>
      <DynamicDefaultsSync key={contextKey ?? ''} options={opts} />
      {wizardConfig ? (
        <WizardContainer
          wizardConfig={wizardConfig}
          onSubmit={onSubmit}
          className="w-full"
          {...meta}
        />
      ) : (
        <>
          <FieldsFromOptions {...meta} options={opts} />
          {onSubmit !== undefined && !workflowForm && (
            <div className="mt-4">
              <Button type="submit" variant="primary">
                {submitLabel}
              </Button>
            </div>
          )}
        </>
      )}
    </ChosenLabelPosition.Provider>
  )
}

export interface DynamicFormProps {
  /**
   * The form to render into, from the host's own `useForm()`, which then reads and drives it:
   * `formState.isDirty`, `getValues`, `reset`, `trigger`. Without one, the form keeps its own.
   */
  form?: UseFormReturn<FormValues>
  /** Enables validated layout-only CSS declarations on authored layout nodes. */
  allowLayoutCSS?: boolean
  formJSONs: Record<string, unknown>
  /** Loads `initialValues` again whenever they change, as Formik's `enableReinitialize` did. */
  reinitialize?: boolean
  initialValues: object
  /** Every change to the form's values, as it happens. */
  onValuesChange?: (values: FormValues) => void
  labelPosition?: 'left' | 'top'
  /**
   * Fields the server rejected, each shown under its field until the person changes it. They never
   * hold back Next or a submit, since the server checks again, and a wizard turns to the first page
   * holding one. `useFieldMessages` from the problem package gives them from a problem response.
   */
  serverErrors?: readonly ServerError[] | undefined
  spaceCompact?: boolean
  organizationVariables?: WorkflowVariables | undefined
  /** A remote workflow's repo/branch/yaml, so `${{ remote.* }}` resolves the same here as it does on the run. */
  remoteVars?: Record<string, string | undefined> | undefined
  needsOrganizationVariables?: boolean
  onSubmit?: ((values: FormValues) => void) | undefined
  submitLabel?: string
  className?: string
  /** Prevents deletion of hidden+ignored field values (workflow forms filter at submit time). */
  workflowForm?: boolean
  /** Identifier for the load context (e.g. rerun slug, configuration name). When this
   *  changes, DynamicDefaultsSync remounts so it re-evaluates its prev-default tracking
   *  and saved-vs-default first-seen synthesis against the new context. */
  contextKey?: string
  /** Skip expression parsing on initial values (for edit forms where saved values may contain user-typed expressions like ${{ var.X }} that should stay literal). Schema-level expressions still resolve. */
  skipValueParse?: boolean
  /** Host-supplied field components, merged over the core registry by type. */
  fields?: Record<string, FieldComponent>
}

const NO_FIELDS: Record<string, FieldComponent> = {}
const NO_SERVER_ERRORS: readonly ServerError[] = []

/** A form drawn from a workflow's schema. */
export function DynamicForm({ form, ...props }: DynamicFormProps) {
  return form ? <DynamicFormBody {...props} form={form} /> : <OwnForm {...props} />
}

function OwnForm(props: Omit<DynamicFormProps, 'form'>) {
  const form = useForm<FormValues>()
  return <DynamicFormBody {...props} form={form} />
}

function DynamicFormBody({
  form,
  formJSONs: options = {},
  reinitialize = false,
  initialValues,
  onValuesChange,
  labelPosition = 'left',
  serverErrors = NO_SERVER_ERRORS,
  spaceCompact = false,
  organizationVariables,
  remoteVars,
  needsOrganizationVariables = false,
  onSubmit,
  submitLabel,
  className = 'w-full',
  workflowForm = false,
  contextKey,
  skipValueParse = false,
  fields = NO_FIELDS,
  allowLayoutCSS = false,
}: DynamicFormProps & { form: UseFormReturn<FormValues> }) {
  const { common } = useStrings()
  const engine = useWorkflowEngine()
  const [parseReady, setParseReady] = useState(() => engine.isReady())
  useEffect(() => {
    engine.init()
    return engine.onReady(setParseReady)
  }, [engine])

  const ready = parseReady && (!needsOrganizationVariables || organizationVariables !== undefined)
  const parsed = useMemo(
    () =>
      !ready || !initialValues
        ? undefined
        : skipValueParse
          ? (initialValues as FormValues)
          : (engine.evaluate({
              inputs: initialValues,
              obj: initialValues as FormValues,
              orgVars: organizationVariables,
              remoteVars,
            }) as FormValues),
    [ready, initialValues, skipValueParse, engine, organizationVariables, remoteVars],
  )
  // The values load once, or again whenever they change when the form reinitializes. Fields draw only
  // once they have loaded, so none reads the form before it holds its values.
  const load = parsed === undefined ? undefined : reinitialize ? JSON.stringify(parsed) : ''
  const [loaded, setLoaded] = useState<string>()
  useLayoutEffect(() => {
    if (load !== undefined && load !== loaded) {
      form.reset(parsed)
      setLoaded(load)
    }
  }, [form, load, loaded, parsed])

  const report = useEffectEvent((values: FormValues) => {
    onValuesChange?.(values)
  })
  useEffect(
    () => form.subscribe({ formState: { values: true }, callback: ({ values }) => report(values) }),
    [form],
  )

  // Every field reads these, so they keep their identity while they hold.
  const formOptions = useMemo(() => ({ workflowForm }), [workflowForm])

  const checks = useServerErrors(form, serverErrors, loaded !== undefined)

  return (
    <FieldRegistryContext.Provider value={fields}>
      <LayoutCSSContext.Provider value={allowLayoutCSS}>
        <FormOptionsContext.Provider value={formOptions}>
          <div className={className}>
            {!parseReady ? (
              <Loader />
            ) : (
              loaded !== undefined && (
                <FormProvider {...form}>
                  <form
                    className="w-full text-[13px]"
                    onSubmit={(event) =>
                      checks.check(() => form.handleSubmit((values) => onSubmit?.(values))(event))
                    }
                  >
                    <FormChecksContext value={checks}>
                      <DynamicFormContent
                        options={options}
                        labelPosition={labelPosition}
                        spaceCompact={spaceCompact}
                        organizationVariables={organizationVariables}
                        remoteVars={remoteVars}
                        onSubmit={onSubmit}
                        submitLabel={submitLabel ?? common.submit}
                        contextKey={contextKey}
                      />
                    </FormChecksContext>
                  </form>
                </FormProvider>
              )
            )}
          </div>
        </FormOptionsContext.Provider>
      </LayoutCSSContext.Provider>
    </FieldRegistryContext.Provider>
  )
}

/**
 * The server's errors on the form: each is set on its field until the person changes the field's
 * value, and set again whenever the host reports a new set. A check of the form sets them aside while
 * it runs, so they never hold the person back.
 */
function useServerErrors(
  form: UseFormReturn<FormValues>,
  serverErrors: readonly ServerError[],
  loaded: boolean,
): FormChecks {
  const key = JSON.stringify(
    serverErrors
      .map((error) => [fieldPath(error.path), error.message ?? ''])
      .filter(([path]) => path !== ''),
  )
  const [given, setGiven] = useState({ key, open: openErrors(key) })
  let open = given.open
  if (given.key !== key) {
    open = openErrors(key)
    setGiven({ key, open })
  }
  const latest = useRef(open)
  useEffect(() => {
    latest.current = open
    if (!loaded || open.size === 0) {
      return
    }
    const paths = [...open.keys()]
    const read = (values: FormValues, path: string) =>
      JSON.stringify(getValueUsingPath(values, path))
    const before = new Map(paths.map((path) => [path, read(form.getValues(), path)]))
    for (const [path, message] of open) {
      setServerError(form, path, message)
    }
    const unsubscribe = form.subscribe({
      formState: { values: true },
      callback: ({ values }) => {
        const changed = paths.filter((path) => read(values, path) !== before.get(path))
        if (changed.length > 0) {
          setGiven((current) => ({
            key: current.key,
            open: new Map([...current.open].filter(([path]) => !changed.includes(path))),
          }))
        }
      },
    })
    return () => {
      unsubscribe()
      clearServerErrors(form, paths)
    }
  }, [form, open, loaded])

  const check = useCallback(
    async <T,>(run: () => Promise<T>): Promise<T> => {
      const kept = latest.current
      clearServerErrors(form, kept.keys())
      try {
        return await run()
      } finally {
        for (const [path, message] of kept) {
          if (!form.getFieldState(path).error) {
            setServerError(form, path, message)
          }
        }
      }
    },
    [form],
  )
  return useMemo(
    () => ({ serverErrors: new Set(open.keys()), serverErrorsKey: key, check }),
    [open, key, check],
  )
}

/** The server's errors in a set, by store path, to the message each gives, if any. */
function openErrors(key: string): ReadonlyMap<string, string> {
  return new Map(JSON.parse(key) as [string, string][])
}

function setServerError(form: UseFormReturn<FormValues>, path: string, message: string) {
  form.setError(path, message ? { type: 'server', message } : { type: 'server' })
}

/** Clears the server's errors at these paths, leaving any error the form's own check set there. */
function clearServerErrors(form: UseFormReturn<FormValues>, paths: Iterable<string>) {
  for (const path of paths) {
    if (form.getFieldState(path).error?.type === 'server') {
      form.clearErrors(path)
    }
  }
}

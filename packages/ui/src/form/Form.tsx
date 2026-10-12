import cx from 'classnames'
import deepEqual from 'fast-deep-equal'
import {
  Form,
  Formik,
  type FormikProps,
  type FormikValues,
  useField,
  useFormikContext,
} from 'formik'
import React, {
  type CSSProperties,
  createContext,
  type SetStateAction,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { UncontrolledCollapsiblePanel } from '../components/CollapsiblePanel'
import CustomListbox from '../components/Listbox'
import Loader from '../components/Loader'
import { useStrings, useWorkflowEngine } from '../components/Provider'
import SectionHeader from '../components/SectionHeader'
import { Table } from '../components/Table'
import { TooltipInfo } from '../components/Tooltip'
import type { WorkflowVariables } from '../engine'
import { AngleRightIcon, TrashIcon } from '../icons'
import { FormLayout, LayoutCSSContext } from './FormLayout'
import { useFieldControlProps, useFieldRequired } from './fieldContext'
import { type FieldComponent, FieldRegistryContext, Registry } from './fieldRegistry'
import { EditingScope, useFormEditing } from './formEditing'
import { resolveFormLayout } from './layout'
import { inputWidth, resolvedFlag } from './lib'
import { useParsedOpts } from './useParsedOpts'
import { usePrevious } from './usePrevious'
import { getParentValue } from './utils/getParentValue'
import { getValueUsingPath } from './utils/getValueUsingPath'
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
  prevParentValue?: unknown
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
          parts.push(listLengthsSignature(template, asRecord(items[i]), `${fullName}[${i}].`))
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

/** Collects every field with a `default` for the form-level sync to track. */
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
          result.push(...collectFieldsWithDefaults(listTemplate, itemValues, `${fullName}[${i}].`))
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

/** Resolves schema defaults into form values as dependencies change. Store-agnostic so the Formik
 * form and hosts with their own store share one implementation. */
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
        const rowIndexes = [...f.name.matchAll(/\[(\d+)\]/g)]
        const lastRowIndex = rowIndexes.at(-1)?.[1]
        const index = lastRowIndex === undefined ? -1 : Number(lastRowIndex)
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
          if (name.startsWith(`${list}[`)) {
            prevDefaultsRef.current.delete(name)
          }
        }
        for (const name of [...synthTouchedRef.current]) {
          if (name.startsWith(`${list}[`)) {
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
        setValue(name, defaultValue)
      }
    }
  }
}

export function DynamicDefaultsSync({ options }: { options: Record<string, unknown> }) {
  const { setFieldValue, getFieldMeta, values } = useFormikContext<Record<string, unknown>>()
  useDynamicDefaultsSync({
    options,
    values,
    setValue: setFieldValue,
    isTouched: (name) => getFieldMeta(name).touched,
  })
  return null
}

export function GroupHeader({
  children,
  open,
  setOpen,
  title,
}: {
  children?: React.ReactNode
  open: boolean
  setOpen: React.Dispatch<SetStateAction<boolean>>
  title: React.ReactNode
}) {
  return (
    <SectionHeader className="flex items-center justify-between pb-1 mb-2 border-b">
      <button
        type="button"
        aria-expanded={open}
        data-field-label
        className="w-full flex items-center text-left transform ease-in transition cursor-pointer"
        onClick={() => setOpen((open) => !open)}
      >
        <AngleRightIcon
          className={cx(open && 'transform rotate-90 ', 'px-1 text-[1.25rem]  transition ease-in ')}
        />
        <span>{title}</span>
      </button>
      {children}
    </SectionHeader>
  )
}

export type TSetFormDirty = (dirty: boolean) => void

function deleteFieldByPath(obj: Record<string, unknown>, path: string): void {
  if (!path) {
    return
  }
  const parts = path.replaceAll('[', '.').replaceAll(']', '').split('.')

  const fieldToRemove = parts.pop() // Get the last part as the field to remove

  if (!fieldToRemove) {
    console.error('Invalid path')
    return
  }

  // Navigate to the second-to-last part of the path
  const parent = parts.reduce<unknown>((acc, curr) => {
    if (acc && typeof acc === 'object') {
      return (acc as Record<string, unknown>)[curr]
    }
    return {} // In case of an invalid path, return an empty object to avoid runtime errors
  }, obj)

  if (parent && typeof parent === 'object' && Object.hasOwn(parent, fieldToRemove)) {
    delete (parent as Record<string, unknown>)[fieldToRemove] // Delete the field
  }
}

function getClosestParentIndex(parentPath: string) {
  for (let i = parentPath.length - 1; i >= 0; i--) {
    if (parentPath[i] === ']') {
      let j = i - 1
      while (j >= 0 && parentPath[j] !== '[') {
        j--
      }
      return parseInt(parentPath.slice(j + 1, i), 10)
    }
  }
  return undefined
}

interface MultiSelectOption {
  label: string
  secondaryLabel?: string
  value: string | boolean | number
  selected?: boolean
}

export function MultiSelectionDropdown({
  name,
  label = '',
  invalid = false,
  options: initialOptions = [],
  setFormDirty,
  onChange,
  parentValue,
}: {
  name: string
  label: string
  invalid?: boolean
  // A bare string is an option whose label is its value.
  options?: (string | MultiSelectOption)[]
  setFormDirty: TSetFormDirty
  onChange?: ((val: unknown) => void) | undefined
  parentValue?: unknown
}) {
  const [field] = useField<unknown[]>(name)
  const required = useFieldRequired()
  const controlProps = useFieldControlProps()
  const { setFieldValue } = useFormikContext<string[]>()

  const options = useMemo(
    () =>
      initialOptions.map((option) => {
        const op = typeof option === 'string' ? { label: option, value: option } : option
        return { ...op, selected: !!field.value?.includes(op.value) || !!op.selected }
      }),
    [initialOptions, field.value],
  )

  const handleOptionSelected = (selectedValue: unknown) => {
    setFieldValue(name, [...(field.value ?? []), selectedValue])
    onChange?.(options)
    setFormDirty(true)
  }

  const t = useStrings().common

  const handleRemoveOption = (key: unknown) => {
    setFieldValue(
      name,
      field.value.filter((item) => item !== key),
    )
    onChange?.(options)
    setFormDirty(true)
  }

  const prevParent = usePrevious(parentValue)
  useEffect(() => {
    if (prevParent && parentValue && prevParent !== parentValue) {
      setFieldValue(name, [])
    }
  }, [parentValue, prevParent, name, setFieldValue])
  return (
    <>
      <CustomListbox
        {...controlProps}
        options={options}
        required={required}
        type={label.toLowerCase()}
        handleOptionSelected={handleOptionSelected}
        className="mb-3"
        invalid={invalid}
        closeOnSelect={false}
      />
      <Table>
        {field.value && field.value.length > 0 ? (
          options
            .filter((option) => option.selected)
            .map((option) => {
              return (
                <tr key={String(option.value)}>
                  <Table.Item className="w-full">{option.label}</Table.Item>
                  <Table.Item>
                    <button
                      type="button"
                      aria-label={t.remove}
                      className="inline-flex bg-transparent p-0 cursor-pointer"
                      onClick={() => handleRemoveOption(option.value)}
                    >
                      <TrashIcon className="link mr-4" />
                    </button>
                  </Table.Item>
                </tr>
              )
            })
        ) : (
          <tr>
            <Table.Item>No {label !== '' ? label.toLowerCase() : 'options'} selected</Table.Item>
          </tr>
        )}
      </Table>
    </>
  )
}

const InputField = React.memo(
  function InputField({
    label,
    field,
    setFormDirty,
    onChange,
    disabled = false,
    labelPosition = 'left',
    missingFields = [],
    computeOn,
    spaceCompact = false,
    workflowForm = false,
    setFieldValue,
    setFieldTouched,
    values,
    currentValue,
  }: {
    label: string
    field: SchemaField
    setFormDirty: TSetFormDirty
    onChange?: ((val: unknown) => void) | undefined
    disabled: boolean
    labelPosition?: 'left' | 'top'
    missingFields: string[]
    computeOn?: boolean | undefined
    spaceCompact?: boolean
    workflowForm?: boolean
    setFieldValue: (field: string, value: unknown, shouldValidate?: boolean) => void
    setFieldTouched: (field: string, touched?: boolean, shouldValidate?: boolean) => void
    values: Record<string, unknown>
    currentValue: unknown
  }) {
    // A deep-equal field keeps its first identity, so the field components below can memoize on it.
    const prevField = useRef(field)
    const fieldObj = useMemo(() => {
      if (!deepEqual(prevField.current, field)) {
        prevField.current = field
      }
      return prevField.current
    }, [field])

    const tooltipComponent = useMemo(() => {
      if (!fieldObj.tooltip) {
        return null
      }
      return (
        <TooltipInfo
          className="pr-2"
          place="top"
          text={
            typeof fieldObj.tooltip === 'string'
              ? fieldObj.tooltip.replace(/\r/g, '')
              : // An entry may be an expression that resolves to '' when it does not apply.
                fieldObj.tooltip.filter(Boolean).join('\n')
          }
        />
      )
    }, [fieldObj.tooltip])

    const missing = missingFields.includes(fieldObj.name ?? '')

    // No Formik hooks here — all values come as props to avoid
    // subscribing to the entire Formik context (which re-renders on every change)
    return (
      <Registry
        field={fieldObj}
        label={label}
        labelPosition={labelPosition}
        missing={missing}
        missingFields={missingFields}
        values={values}
        setFormDirty={setFormDirty}
        onChange={onChange}
        disabled={disabled}
        computeOn={computeOn}
        spaceCompact={spaceCompact}
        tooltipComponent={tooltipComponent}
        workflowForm={workflowForm}
        setFieldTouched={setFieldTouched}
        setFieldValue={setFieldValue}
        currentValue={currentValue}
      />
    )
  },
  (prev, next) => {
    // Skip re-render if field definition and values-relevant props haven't changed
    if (!deepEqual(prev.field, next.field)) {
      return false
    }
    // values ref change alone shouldn't trigger — InputField is purely prop-driven
    // Only re-render if other props changed
    for (const key of Object.keys(prev) as (keyof typeof prev)[]) {
      if (key === 'field' || key === 'values') {
        continue
      }
      if (prev[key] !== next[key]) {
        return false
      }
    }
    return true
  },
)

function FormikStateBridge({ onChange }: { onChange: (state: Record<string, unknown>) => void }) {
  const { values } = useFormikContext<Record<string, unknown>>()
  const prevEmitted = useRef<Record<string, unknown> | null>(null)

  useEffect(() => {
    const { editorKeyPostfix: _, ...next } = values
    if (prevEmitted.current !== null && deepEqual(prevEmitted.current, next)) {
      return
    }
    prevEmitted.current = next
    onChange(next)
  }, [values, onChange])

  return null
}

function DirtyStateBridge({ setFormDirty }: { setFormDirty: TSetFormDirty }) {
  const { dirty } = useFormikContext()

  useEffect(() => {
    setFormDirty(dirty)
  }, [dirty, setFormDirty])

  return null
}

interface ParseFieldCache {
  lastOptField: unknown
  convertedField: unknown
  inputDeps: Set<string>
  hasExpressions: boolean
  lastRelevant: Record<string, unknown>
  lastIndex: number | undefined
  result: unknown
}

/** Three-tier cache: no expressions → raw pass-through; input-dep expressions → re-parse on dep change; org-var/path expressions → parse once. */
function useFieldParse(
  optionsField: unknown,
  values: Record<string, unknown>,
  arrayIndex: number | undefined,
): unknown {
  const engine = useWorkflowEngine()
  const cache = useRef<ParseFieldCache>({
    lastOptField: null,
    convertedField: null,
    inputDeps: new Set(),
    hasExpressions: false,
    lastRelevant: {},
    lastIndex: undefined,
    result: null,
  })
  const c = cache.current

  if (optionsField !== c.lastOptField) {
    c.lastOptField = optionsField
    c.convertedField = engine.convertInputs(asRecord(optionsField))
    const { inputDeps, hasExpressions } = engine.inputDependencies(c.convertedField)
    c.inputDeps = inputDeps
    c.hasExpressions = hasExpressions
    c.result = null
  }

  // No expressions at all — skip parsing entirely
  if (!c.hasExpressions) {
    return optionsField
  }

  if (c.result !== null) {
    // Expressions with no input deps (org vars, relative paths) parse once.
    const unchanged =
      c.inputDeps.size === 0 ||
      (arrayIndex === c.lastIndex &&
        [...c.inputDeps].every((key) => deepEqual(values[key], c.lastRelevant[key])))
    if (unchanged) {
      return c.result
    }
  }

  c.result = engine.evaluate({
    inputs: values,
    obj: c.convertedField,
    orgVars: {},
    index: arrayIndex,
  })
  c.lastIndex = arrayIndex
  c.lastRelevant = {}
  for (const key of c.inputDeps) {
    c.lastRelevant[key] = values[key]
  }
  return c.result
}

const FormField = React.memo(
  function FormField({
    optionsField,
    fieldName,
    values,
    setFormDirty,
    setFieldValue,
    setFieldTouched,
    parentInfo,
    labelPosition = 'left',
    missingFields = [],
    spaceCompact = false,
    workflowForm = false,
  }: {
    fieldName: string
    optionsField: unknown
    values: Record<string, unknown>
    setFormDirty: TSetFormDirty
    setFieldValue: (field: string, value: unknown, shouldValidate?: boolean) => void
    setFieldTouched: (field: string, touched?: boolean, shouldValidate?: boolean) => void
    /** If fields are part of other field, this is the info needed*/
    parentInfo?:
      | {
          computeOn?: boolean | undefined
          parentName: string
          fieldNamePrefix: string
          arrayIndex?: number | undefined
          onChange?: (
            fieldName: string,
            index: number,
            changeOtherValuesTo?: string | boolean,
            keepOneValueOf?: string | boolean,
            currentValue?: string | boolean,
          ) => void
        }
      | undefined
    labelPosition?: 'left' | 'top'
    missingFields?: string[]
    spaceCompact?: boolean
    /** Prevents deletion of hidden+ignored field values (workflow forms filter at submit time) */
    workflowForm?: boolean
  }) {
    const parsedField = useFieldParse(optionsField, values, parentInfo?.arrayIndex)
    const editing = useFormEditing()
    const path = editing ? [...editing.parent, fieldName] : null
    const field = asSchemaField(parentInfo ? parsedField : optionsField)
    if (field === null) {
      return null
    }
    const fieldNamePrefix = parentInfo?.fieldNamePrefix || ''
    const fieldObj = {
      ...field,
      label: field.label || fieldName.charAt(0).toUpperCase() + fieldName.slice(1),
      name: fieldNamePrefix + fieldName,
      // explicit field.optional first, implicit field.default second
      optional: resolvedFlag(field.optional) ?? field.default !== undefined,
    }

    if (!fieldObj.name || fieldName === 'v3') {
      return null
    }

    if (field.hidden === true || !field.type) {
      // If the field is hidden, and field is set to be ignored, remove it from values.
      // Only delete if NOT a workflow form (workflow forms filter at submit time)
      if (resolvedFlag(field.ignore) && !workflowForm) {
        deleteFieldByPath(values, fieldObj.name)
      }
      // If it is not set, default to no show only without deleting field from values
      return editing && path && fieldName !== '$meta' ? (
        <editing.Row path={path} instance={fieldObj.name} hidden />
      ) : null
    }
    let onChange: ((val: unknown) => void) | undefined
    if (field.one_must_be_true && parentInfo?.onChange) {
      // only used in pool partition_config at the moment
      const parentOnChange = parentInfo.onChange
      const parentArrayIndex = parentInfo.arrayIndex ?? 0
      const fieldOptions = fieldObj.options
      onChange = (val) =>
        parentOnChange(
          fieldName,
          parentArrayIndex,
          flagValue(fieldOptions?.['offOption'], false),
          flagValue(fieldOptions?.['onOption'], true),
          val as string | boolean,
        )
    }
    //handles both show_if and show_if_not
    if (field.show_if !== undefined || field.show_if_not !== undefined) {
      const index = parentInfo
        ? parentInfo.arrayIndex || getClosestParentIndex(parentInfo.fieldNamePrefix)
        : undefined
      let shouldShowField = true
      if (field.show_if !== undefined) {
        const parentValue = getParentValue(index, field.show_if, values, field)
        shouldShowField = !!parentValue
      }
      if (shouldShowField && field.show_if_not !== undefined) {
        const parentValue = getParentValue(index, field.show_if_not, values, field)
        shouldShowField = !parentValue
      }
      if (!shouldShowField) {
        // Workflow forms filter at submit time; don't destroy state across hide/unhide
        // cycles or drop config-loaded values whose field is currently hidden.
        if (!workflowForm) {
          deleteFieldByPath(values, fieldObj.name)
        }
        return editing && path ? <editing.Row path={path} instance={fieldObj.name} hidden /> : null
      }
    }
    if (field.depends_on && parentInfo?.arrayIndex !== undefined) {
      fieldObj.depends_on = field.depends_on.replace('[index]', `[${parentInfo.arrayIndex}]`)
    }
    //enable_if should work when its not disabled
    if (field.enable_if && field.disabled === false) {
      //if disabled is a string, find its value parents like show_if
      if (typeof field.enable_if === 'string') {
        let path = field.enable_if
        if (parentInfo?.arrayIndex !== undefined) {
          path = field.enable_if.replace('[index]', `[${parentInfo.arrayIndex}]`)
        }
        const parentValue = getValueUsingPath(values, path)
        //if value is false, means we are going to disabled the field, otherwise disabled will be decided by its original factor
        if (parentValue === false) {
          //set the value to false
          fieldObj.disabled = true
        }
      }
    }
    if (field.type === 'group') {
      const hideHeader = field.noCollapse
      const HeaderElement = hideHeader ? React.Fragment : UncontrolledCollapsiblePanel
      const meta = resolveMetaOverrides(field.options, labelPosition, spaceCompact)

      const group = (
        <div className="flex flex-col w-full">
          <HeaderElement
            {...(!hideHeader && {
              title: (open, setOpen) => (
                <GroupHeader open={open} setOpen={setOpen} title={field.label} />
              ),
              initialState: field.collapsed !== undefined ? !field.collapsed : true,
            })}
          >
            <div className="w-full">
              <EditingScope editing={editing} path={path}>
                <FieldsFromOptions
                  options={field.options ?? {}}
                  setFormDirty={setFormDirty}
                  setFieldValue={setFieldValue}
                  setFieldTouched={setFieldTouched}
                  values={values}
                  parentInfo={parentInfo}
                  workflowForm={workflowForm}
                  labelPosition={meta.labelPosition}
                  spaceCompact={meta.spaceCompact}
                  missingFields={missingFields}
                />
              </EditingScope>
            </div>
          </HeaderElement>
        </div>
      )
      return editing && path ? (
        <editing.Row path={path} instance={fieldObj.name}>
          {group}
        </editing.Row>
      ) : (
        group
      )
    }
    if (typeof field.type === 'object' && field.depends_on) {
      const parentValue = getValueUsingPath(values, field.depends_on)
      const resolvedType = field.type[String(parentValue)]
      if (!resolvedType) {
        return null
      }
      fieldObj.type = resolvedType
    }
    if (field.type === 'range' && field.depends_on) {
      const parentValue = getValueUsingPath(values, field.depends_on)
      const { min, max } = field
      if (typeof min === 'object' && typeof max === 'object') {
        fieldObj.min = min[String(parentValue)]
        fieldObj.max = max[String(parentValue)]
      }
    }
    if (field.resetOnChange) {
      const parentValue = getValueUsingPath(values, field.resetOnChange)
      const prevParentValue = field.prevParentValue
      if (prevParentValue !== undefined && prevParentValue !== parentValue) {
        deleteFieldByPath(values, fieldObj.name)
      }
      field.prevParentValue = parentValue
    }
    if (field.secondaryField) {
      if (Array.isArray(field.secondaryField)) {
        fieldObj.secondaryField = field.secondaryField.map(
          (secondaryField: string) => fieldNamePrefix + secondaryField,
        )
      } else {
        fieldObj.secondaryField = fieldNamePrefix + field.secondaryField
      }
    }

    const input = (
      <div className={cx('flex w-full', labelPosition === 'left' ? 'mb-[15px]' : 'mb-[5px]')}>
        <InputField
          field={fieldObj}
          label={fieldObj.label}
          setFormDirty={setFormDirty}
          setFieldValue={setFieldValue}
          setFieldTouched={setFieldTouched}
          values={values}
          currentValue={getValueUsingPath(values, fieldObj.name)}
          onChange={onChange}
          disabled={Boolean(fieldObj.disabled)}
          computeOn={parentInfo?.computeOn || fieldObj.computeOn}
          labelPosition={labelPosition}
          missingFields={missingFields}
          spaceCompact={spaceCompact}
          workflowForm={workflowForm}
        />
      </div>
    )
    if (!editing || !path) {
      return input
    }
    // An object's fields are editable in place, and a list's template through any of its rows.
    const holds = fieldObj.type === 'object' || fieldObj.type === 'list'
    return (
      <editing.Row path={path} instance={fieldObj.name}>
        <EditingScope editing={editing} path={holds ? path : null}>
          {input}
        </EditingScope>
      </editing.Row>
    )
  },
  (prev, next) => {
    if (!deepEqual(prev.optionsField, next.optionsField)) {
      return false
    }
    if (prev.values !== next.values) {
      return false
    }
    if (!deepEqual(prev.parentInfo, next.parentInfo)) {
      return false
    }
    if (!deepEqual(prev.missingFields, next.missingFields)) {
      return false
    }
    if (prev.labelPosition !== next.labelPosition) {
      return false
    }
    if (prev.spaceCompact !== next.spaceCompact) {
      return false
    }
    if (prev.workflowForm !== next.workflowForm) {
      return false
    }
    return true
  },
)

export function FieldsFromOptions({
  options = {},
  values,
  setFormDirty,
  setFieldValue,
  setFieldTouched,
  parentInfo,
  labelPosition = 'left',
  missingFields = [],
  spaceCompact = false,
  workflowForm = false,
}: {
  options: Record<string, unknown>
  values: Record<string, unknown>
  setFormDirty: TSetFormDirty
  setFieldValue: (field: string, value: unknown, shouldValidate?: boolean) => void
  setFieldTouched: (field: string, touched?: boolean, shouldValidate?: boolean) => void
  /** If fields are part of other field, this is the info needed*/
  parentInfo?:
    | {
        computeOn?: boolean | undefined
        parentName: string
        fieldNamePrefix: string
        arrayIndex?: number | undefined
        onChange?: (
          fieldName: string,
          index: number,
          changeOtherValuesTo?: string | boolean,
          keepOneValueOf?: string | boolean,
          currentValue?: string | boolean,
        ) => void
      }
    | undefined
  labelPosition?: 'left' | 'top' | undefined
  missingFields?: string[]
  spaceCompact?: boolean
  /** Prevents deletion of hidden+ignored field values (workflow forms filter at submit time) */
  workflowForm?: boolean | undefined
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
          values={values}
          className="w-full"
          labelPosition={labelPosition}
          missingFields={missingFields}
          spaceCompact={spaceCompact}
          workflowForm={workflowForm}
          nested
          fieldNamePrefix={parentInfo?.fieldNamePrefix}
          setFieldValue={setFieldValue}
          setFieldTouched={setFieldTouched}
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
      values={values}
      setFormDirty={setFormDirty}
      setFieldValue={setFieldValue}
      setFieldTouched={setFieldTouched}
      parentInfo={parentInfo}
      // A side label would squeeze a field that shares its row, unless the workflow chose one.
      labelPosition={compactLabels ? (chosen ?? 'top') : labelPosition}
      missingFields={missingFields}
      spaceCompact={spaceCompact}
      workflowForm={workflowForm}
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

const noop = () => {}

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

interface DynamicFormContentProps {
  options: Record<string, unknown>
  setValues?: ((values: Record<string, unknown>) => void) | undefined
  setFormDirty: (dirty: boolean) => void
  labelPosition: 'left' | 'top'
  missingFields: string[]
  spaceCompact: boolean
  organizationVariables?: WorkflowVariables | undefined
  remoteVars?: Record<string, string | undefined> | undefined
  workflowForm: boolean
  onSubmit?: ((values: Record<string, unknown>) => void) | undefined
  submitLabel: string
  values: Record<string, unknown>
  /** Pass-through identifier for the load context (e.g. `${runParam}-${configurationName}`).
   *  Changing this remounts DynamicDefaultsSync so its prev-default tracking and the
   *  saved-vs-default first-seen synthesis re-evaluate against the new context. */
  contextKey?: string | undefined
}

function DynamicFormContent({
  options,
  setValues,
  setFormDirty,
  labelPosition,
  missingFields,
  spaceCompact,
  organizationVariables,
  remoteVars,
  workflowForm,
  onSubmit,
  submitLabel,
  values,
  contextKey,
}: DynamicFormContentProps) {
  // Extract Formik helpers once here — child components should NOT use useFormikContext
  const { setFieldValue, setFieldTouched } = useFormikContext()

  const opts = useParsedOpts(
    options,
    values,
    organizationVariables,
    undefined,
    undefined,
    remoteVars,
  )

  const handleChange = useCallback(
    (state: Record<string, unknown>) => setValues?.(state),
    [setValues],
  )

  const wizardConfig = parseWizardConfig(opts)
  const meta = resolveMetaOverrides(options, labelPosition, spaceCompact)
  // A wizard's steps hold their own fields, so they learn the form's choice from here.
  const chosen = useChosenLabelPosition(options)

  return (
    <ChosenLabelPosition.Provider value={chosen}>
      <DirtyStateBridge setFormDirty={setFormDirty} />
      <FormikStateBridge onChange={handleChange} />
      <DynamicDefaultsSync key={contextKey ?? ''} options={opts} />
      {wizardConfig ? (
        <WizardContainer
          wizardConfig={wizardConfig}
          values={values}
          onChange={handleChange}
          onSubmit={onSubmit}
          className="w-full"
          {...meta}
          missingFields={missingFields}
          workflowForm={workflowForm}
          setFieldValue={setFieldValue}
          setFieldTouched={setFieldTouched}
        />
      ) : (
        <>
          <FieldsFromOptions
            {...meta}
            options={opts}
            values={values}
            setFormDirty={setFormDirty}
            setFieldValue={setFieldValue}
            setFieldTouched={setFieldTouched}
            missingFields={missingFields}
            workflowForm={workflowForm}
          />
          {onSubmit !== undefined && !workflowForm && (
            <div className="mt-4">
              <input type="submit" className="btn btn-info" value={submitLabel} />
            </div>
          )}
        </>
      )}
    </ChosenLabelPosition.Provider>
  )
}

export interface DynamicFormProps {
  /** Enables validated layout-only CSS declarations on authored layout nodes. */
  allowLayoutCSS?: boolean
  formJSONs: Record<string, unknown>
  reinitialize?: boolean
  setFormDirty?: (dirty: boolean) => void
  initialValues: object
  setValues?: (values: Record<string, unknown>) => void
  formikRef?: React.RefObject<FormikProps<FormikValues> | null>
  labelPosition?: 'left' | 'top'
  missingFields?: string[] | undefined
  spaceCompact?: boolean
  organizationVariables?: WorkflowVariables | undefined
  /** A remote workflow's repo/branch/yaml, so `${{ remote.* }}` resolves the same here as it does on the run. */
  remoteVars?: Record<string, string | undefined> | undefined
  needsOrganizationVariables?: boolean
  onSubmit?: ((values: Record<string, unknown>) => void) | undefined
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

export function DynamicForm({
  formJSONs: options = {},
  reinitialize = false,
  initialValues,
  setValues,
  setFormDirty = noop,
  formikRef,
  labelPosition = 'left',
  missingFields = [],
  spaceCompact = false,
  organizationVariables,
  remoteVars,
  needsOrganizationVariables = false,
  onSubmit,
  submitLabel = 'Submit',
  className = 'w-full',
  workflowForm = false,
  contextKey,
  skipValueParse = false,
  fields = NO_FIELDS,
  allowLayoutCSS = false,
}: DynamicFormProps) {
  const engine = useWorkflowEngine()
  const [parseReady, setParseReady] = useState(() => engine.isReady())
  useEffect(() => {
    engine.init()
    return engine.onReady(setParseReady)
  }, [engine])
  if (!parseReady) {
    return <Loader />
  }
  const parsedInitVals: Record<string, unknown> = skipValueParse
    ? (initialValues as Record<string, unknown>)
    : initialValues &&
      engine.evaluate({
        inputs: initialValues,
        obj: initialValues as Record<string, unknown>,
        orgVars: organizationVariables,
        remoteVars,
      })
  return (
    <FieldRegistryContext.Provider value={fields}>
      <LayoutCSSContext.Provider value={allowLayoutCSS}>
        <div className={className}>
          {(!needsOrganizationVariables || organizationVariables) && initialValues && (
            <Formik
              enableReinitialize={reinitialize}
              initialValues={parsedInitVals}
              onSubmit={onSubmit ?? (() => {})}
              onReset={() => {
                setFormDirty(false)
              }}
              {...(formikRef ? { innerRef: formikRef } : {})}
            >
              {({ values }) => (
                <Form className="w-full text-[13px]">
                  <DynamicFormContent
                    values={values}
                    options={options}
                    setValues={setValues}
                    setFormDirty={setFormDirty}
                    labelPosition={labelPosition}
                    missingFields={missingFields}
                    spaceCompact={spaceCompact}
                    organizationVariables={organizationVariables}
                    remoteVars={remoteVars}
                    workflowForm={workflowForm}
                    onSubmit={onSubmit}
                    submitLabel={submitLabel}
                    contextKey={contextKey}
                  />
                </Form>
              )}
            </Formik>
          )}
        </div>
      </LayoutCSSContext.Provider>
    </FieldRegistryContext.Provider>
  )
}

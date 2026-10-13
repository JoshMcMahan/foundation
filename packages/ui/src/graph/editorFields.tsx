import {
  type ComponentProps,
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { Button } from '../components/Button'
import { Checkbox } from '../components/Checkbox'
import { ErrorText, Field, type FieldProps } from '../components/Field'
import { IconButton } from '../components/IconButton'
import { Input, Textarea } from '../components/Input'
import { withPositionKeys } from '../components/keys'
import { Modal, ModalTitle } from '../components/Modal'
import { Section } from '../components/Section'
import { SegmentedControl } from '../components/SegmentedControl'
import { Switch } from '../components/Switch'
import { Tooltip } from '../components/Tooltip'
import type { FieldPatch } from '../editing'
import { AddIcon, CloseIcon, ExpressionIcon } from '../icons'
import { type GraphEditorStrings, useGraphEditorStrings } from './editorStrings'
import { useFieldLint } from './fieldProblems'
import { asRecord, type Json } from './records'
import { SuggestionInput } from './SuggestionInput'

export { asRecord, type Json } from './records'
export type Strings = GraphEditorStrings

export const EXPRESSION = /^\$\{\{.*\}\}$/
export const ENV_KEY = /^[a-zA-Z0-9_]+$/
const EMPTY_EXPRESSION = /^\$\{\{\s*\}\}$/
export const DURATION = /^(\d+)(d|h|m|s)?$/

export function withoutUndefined(value: Json): Json {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined))
}

export function text(value: unknown): string {
  return value === undefined || value === null ? '' : String(value)
}

export function isScalar(value: unknown): boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

// A number only when it writes back as the same text: `4` is a number, `3.10` and `01` keep their digits.
export function parseScalar(value: string): unknown {
  if (/^-?\d+(\.\d+)?$/.test(value) && String(Number(value)) === value) {
    return Number(value)
  }
  if (value === 'true' || value === 'false') {
    return value === 'true'
  }
  return value
}

export function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((item, i) => sameValue(item, b[i]))
    )
  }
  if (typeof a === 'object' && typeof b === 'object' && a !== null && b !== null) {
    const ak = Object.keys(a)
    const bk = Object.keys(b)
    return ak.length === bk.length && ak.every((k) => sameValue((a as Json)[k], (b as Json)[k]))
  }
  return a === b
}

/** Keys whose value changed: undefined removes a key, anything else writes it. */
export function diffPatch(original: Json, next: Json): Required<FieldPatch> {
  const set: Json = {}
  const unset: string[] = []
  for (const [key, value] of Object.entries(next)) {
    if (value === undefined) {
      if (Object.hasOwn(original, key)) {
        unset.push(key)
      }
    } else if (!sameValue(original[key], value)) {
      set[key] = value
    }
  }
  return { set, unset }
}

export function isEmptyPatch(patch: Required<FieldPatch>): boolean {
  return Object.keys(patch.set).length === 0 && patch.unset.length === 0
}

export function conditionText(value: unknown): string {
  return typeof value === 'boolean' ? String(value) : text(value)
}

export function parseCondition(value: string): unknown {
  const trimmed = value.trim()
  if (!trimmed) {
    return undefined
  }
  if (trimmed === 'true' || trimmed === 'false') {
    return trimmed === 'true'
  }
  return trimmed
}

export function durationError(
  value: string,
  t: Strings,
  pattern: RegExp = DURATION,
): string | undefined {
  const trimmed = value.trim()
  return !trimmed || pattern.test(trimmed) || EXPRESSION.test(trimmed)
    ? undefined
    : t.invalidDuration
}

export function expressionError(value: string, t: Strings): string | undefined {
  const trimmed = value.trim()
  return !trimmed || (EXPRESSION.test(trimmed) && !EMPTY_EXPRESSION.test(trimmed))
    ? undefined
    : t.invalidExpressionValue
}

export function orUndefined(value: string): string | undefined {
  return value.trim() ? value.trim() : undefined
}

export function countError(value: string, min: number, message: string): string | undefined {
  const trimmed = value.trim()
  if (!trimmed || EXPRESSION.test(trimmed)) {
    return undefined
  }
  return /^\d+$/.test(trimmed) && Number(trimmed) >= min ? undefined : message
}

export function parseCount(value: string): unknown {
  const trimmed = value.trim()
  if (!trimmed) {
    return undefined
  }
  return /^\d+$/.test(trimmed) ? Number(trimmed) : trimmed
}

export function parseJson(value: string): { ok: boolean; value?: unknown } {
  try {
    return { ok: true, value: JSON.parse(value) }
  } catch {
    return { ok: false }
  }
}

/** A key/value row; nested values are edited as JSON. */
export interface Row {
  key: string
  value: string
  nested?: boolean
  /** What the row was read from; while its text is unchanged a save writes this back as it was. */
  original?: unknown
}

// The text a row showed for `original`; unchanged text means the value is unchanged.
export function unchangedValue(text: string, original: unknown, nested = false): boolean {
  return original !== undefined && text === (nested ? JSON.stringify(original) : String(original))
}

/** Rows for a map; with `nested` false a non-scalar is shown as its JSON text and saved as a string. */
export function rowsFrom(value: unknown, nested = true): Row[] {
  return Object.entries(asRecord(value)).map(([key, item]) =>
    isScalar(item)
      ? { key, value: String(item), original: item }
      : nested
        ? { key, value: JSON.stringify(item), nested: true, original: item }
        : { key, value: JSON.stringify(item) ?? '' },
  )
}

export function rowsTo(rows: Row[], parse: (value: string) => unknown): Json | undefined {
  if (rows.length === 0) {
    return undefined
  }
  return Object.fromEntries(
    rows.map((row) => [
      row.key.trim(),
      unchangedValue(row.value, row.original, row.nested)
        ? row.original
        : row.nested
          ? parseJson(row.value).value
          : parse(row.value),
    ]),
  )
}

export function rowsError(
  rows: Row[],
  keyPattern: RegExp,
  keyMessage: string,
  t: Strings,
  valueError?: (value: string) => string | undefined,
): string | undefined {
  const keys = rows.map((row) => row.key.trim())
  for (const [i, row] of rows.entries()) {
    const key = keys[i] ?? ''
    if (!keyPattern.test(key)) {
      return keyMessage
    }
    if (keys.indexOf(key) !== i) {
      return t.duplicateKey
    }
    const error = row.nested
      ? parseJson(row.value).ok
        ? undefined
        : t.invalidJson
      : valueError?.(row.value)
    if (error) {
      return error
    }
  }
  return undefined
}

/** A switch that may instead hold a `${{ }}` expression. */
export type Flag = boolean | string | undefined

export function flagOf(value: unknown): Flag {
  return typeof value === 'boolean' || typeof value === 'string' ? value : undefined
}

export function flagError(value: Flag, t: Strings): string | undefined {
  return typeof value === 'string' ? expressionError(value, t) : undefined
}

// Writes nothing when the switch matches the default, unless the YAML spelled it out.
export function flagValue(checked: boolean, fallback: boolean, original: unknown): Flag {
  if (checked !== fallback) {
    return checked
  }
  return original === checked ? checked : undefined
}

/** Whether each section of a dialog is open, kept while the dialog is up so switching views keeps it. */
export const SectionMemory = createContext<Map<string, boolean> | null>(null)

export function useSectionMemory(): Map<string, boolean> {
  return useState(() => new Map<string, boolean>())[0]
}

/** A titled part of an editor dialog. It opens as it was last left in this
 *  dialog, and opens itself when a problem inside would otherwise be hidden. */
export function DialogSection({
  title,
  description,
  open = false,
  alert = false,
  children,
}: {
  title: string
  description?: string
  /** Whether it starts open; read once, when its dialog first shows it. */
  open?: boolean
  /** A problem inside, which opens it so a folded section can't hide why Save is off. */
  alert?: boolean
  children: ReactNode
}) {
  const memory = useContext(SectionMemory)
  const [isOpen, setOpen] = useState(() => memory?.get(title) ?? open)
  useEffect(() => {
    memory?.set(title, isOpen)
  }, [memory, title, isOpen])
  useEffect(() => {
    if (alert) {
      setOpen(true)
    }
  }, [alert])
  return (
    <Section title={title} open={isOpen} onOpenChange={setOpen} headingLevel={4}>
      <div className="flex flex-col gap-3 pb-4">
        {description && <div className="text-xs theme-muted-text">{description}</div>}
        {children}
      </div>
    </Section>
  )
}

/** The YAML key a field sets, beside its name; left out where the name already says it. */
export function KeyHint({ label, yamlKey }: { label: string; yamlKey: string }) {
  return label.trim().toLowerCase() === yamlKey.toLowerCase() ? null : (
    <code aria-hidden="true" className="font-mono text-xs font-normal theme-muted-text">
      {yamlKey}
    </code>
  )
}

/** Label props for an Input or Textarea that sets `yamlKey`. */
export function labelled(label: string, yamlKey: string) {
  return { label, hint: <KeyHint label={label} yamlKey={yamlKey} /> }
}

/** A Field for a setting the YAML holds, with the key it sets beside its name. With `id`
 *  its label names the one control that takes that id; without, it names its controls as a
 *  group, as a list of rows or a set of choices wants. */
export function YamlField({
  label,
  yamlKey,
  description,
  actions,
  error,
  required,
  id,
  children,
}: {
  label: string
  yamlKey?: string | undefined
  description?: ReactNode
  actions?: ReactNode
  error?: ReactNode
  required?: boolean | undefined
  id?: string | undefined
  children: FieldProps['children']
}) {
  return (
    <Field
      label={label}
      hint={yamlKey && <KeyHint label={label} yamlKey={yamlKey} />}
      description={description || undefined}
      actions={actions}
      error={error || undefined}
      required={required}
      id={id}
      group={id === undefined}
    >
      {children}
    </Field>
  )
}

/**
 * Switches a field between its own control and a typed expression, where the schema takes one. Its
 * name says what pressing it does, so it isn't also announced as pressed.
 */
export function ExpressionToggle({
  active,
  onChange,
}: {
  active: boolean
  onChange: (active: boolean) => void
}) {
  const t = useGraphEditorStrings()
  return (
    <IconButton
      icon={<ExpressionIcon />}
      label={active ? t.stopExpression : t.useExpression}
      size="sm"
      variant="ghost"
      data-selected={active || undefined}
      onClick={() => onChange(!active)}
    />
  )
}

export function ToggleField({
  label,
  yamlKey,
  description,
  checked,
  onChange,
  disabled,
  error,
}: {
  label: string
  yamlKey?: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  error?: string | undefined
}) {
  const id = useId()
  return (
    <YamlField label={label} yamlKey={yamlKey} description={description} error={error} id={id}>
      {(control) => (
        <Switch
          {...control}
          nativeButton
          render={<button type="button" />}
          checked={checked}
          onCheckedChange={onChange}
          {...(disabled ? { disabled } : {})}
        />
      )}
    </YamlField>
  )
}

/** One of a few choices. A YamlField around it names it; standing alone, `label` does. */
export function ChoiceButtons<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label?: string | undefined
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
}) {
  return <SegmentedControl label={label} options={options} value={value} onValueChange={onChange} />
}

export function AddRowButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <div>
      <Button variant="ghost" size="sm" icon={<AddIcon />} onClick={onClick}>
        {label}
      </Button>
    </div>
  )
}

export function KeyValueEditor({
  rows,
  onChange,
  error,
  valuePlaceholder,
  keyPlaceholder,
  addLabel,
  valueSuggestions = [],
  lint = false,
}: {
  rows: Row[]
  onChange: (rows: Row[]) => void
  error: string | undefined
  valuePlaceholder?: string
  keyPlaceholder?: string
  addLabel?: string
  /** Offered on each value, such as references to the workflow's inputs. */
  valueSuggestions?: string[]
  /** Whether each row shows the problems at its key, inside the caller's LintScope. */
  lint?: boolean
}) {
  const t = useGraphEditorStrings()
  return (
    <div className="flex flex-col gap-2">
      {withPositionKeys(rows).map(({ key, item: row }, i) => (
        <KeyValueRow
          key={key}
          row={row}
          onChange={(next) => onChange(updateAt(rows, i, next))}
          onRemove={() => onChange(removeAt(rows, i))}
          keyPlaceholder={keyPlaceholder ?? t.key}
          valuePlaceholder={valuePlaceholder ?? t.value}
          valueSuggestions={valueSuggestions}
          lint={lint}
        />
      ))}
      <ErrorText>{error}</ErrorText>
      <AddRowButton
        label={addLabel ?? t.common.add}
        onClick={() => onChange([...rows, { key: '', value: '' }])}
      />
    </div>
  )
}

function KeyValueRow({
  row,
  onChange,
  onRemove,
  keyPlaceholder,
  valuePlaceholder,
  valueSuggestions,
  lint: linted,
}: {
  row: Row
  onChange: (row: Row) => void
  onRemove: () => void
  keyPlaceholder: string
  valuePlaceholder: string
  valueSuggestions: string[]
  lint: boolean
}) {
  const t = useGraphEditorStrings()
  const id = useId()
  const lint = useFieldLint(
    linted ? row.key.trim() || undefined : undefined,
    id,
    row.value,
    (value) => onChange({ ...row, value }),
  )
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <div className="w-2/5">
          <Input
            mono
            aria-label={t.key}
            placeholder={keyPlaceholder}
            value={row.key}
            onChange={(e) => onChange({ ...row, key: e.target.value })}
          />
        </div>
        <div className="flex-1" title={row.nested ? t.jsonValue : undefined}>
          <SuggestionInput
            id={id}
            aria-label={t.value}
            placeholder={valuePlaceholder}
            value={row.value}
            suggestions={valueSuggestions.map((value) => ({ value }))}
            onValueChange={(value) => onChange({ ...row, value })}
          />
        </div>
        <IconButton
          icon={<CloseIcon />}
          label={t.common.remove}
          variant="ghost"
          size="sm"
          onClick={onRemove}
        />
      </div>
      <ErrorText>{lint.message}</ErrorText>
      {lint.fixes}
    </div>
  )
}

export function updateAt<T>(items: T[], index: number, item: T): T[] {
  return items.map((current, i) => (i === index ? item : current))
}

export function removeAt<T>(items: T[], index: number): T[] {
  return items.filter((_, i) => i !== index)
}

/** A list of single values, such as permissions or variable names. */
export function StringListEditor({
  label,
  values,
  onChange,
  addLabel,
  placeholder,
  error,
  suggestions = [],
}: {
  /** The list's name, which names each of its rows. */
  label: string
  values: string[]
  onChange: (values: string[]) => void
  addLabel: string
  placeholder?: string
  error?: string | undefined
  /** Offered on each row; any other value can still be typed. */
  suggestions?: string[]
}) {
  const t = useGraphEditorStrings()
  return (
    <div className="flex flex-col gap-2">
      {withPositionKeys(values).map(({ key, item: value }, i) => (
        <div key={key} className="flex items-center gap-2">
          <div className="flex-1">
            <SuggestionInput
              aria-label={t.listItem(label, i + 1)}
              value={value}
              placeholder={placeholder}
              suggestions={suggestions.map((option) => ({ value: option }))}
              onValueChange={(next) => onChange(updateAt(values, i, next))}
            />
          </div>
          <IconButton
            icon={<CloseIcon />}
            label={t.common.remove}
            variant="ghost"
            size="sm"
            onClick={() => onChange(removeAt(values, i))}
          />
        </div>
      ))}
      <ErrorText>{error}</ErrorText>
      <AddRowButton label={addLabel} onClick={() => onChange([...values, ''])} />
    </div>
  )
}

export function SuggestedInput({
  label,
  yamlKey,
  description,
  value,
  onChange,
  suggestions,
  error,
  placeholder,
}: {
  label: string
  yamlKey?: string
  description?: string
  value: string
  onChange: (value: string) => void
  suggestions: string[]
  error?: string | undefined
  placeholder?: string
}) {
  const id = useId()
  const lint = useFieldLint(yamlKey, id, value, onChange)
  return (
    <YamlField
      label={label}
      yamlKey={yamlKey}
      description={description}
      error={error ?? lint.message}
      id={id}
    >
      {(control) => (
        <>
          <SuggestionInput
            {...control}
            value={value}
            placeholder={placeholder}
            suggestions={suggestions.map((option) => ({ value: option }))}
            onValueChange={onChange}
          />
          {lint.fixes}
        </>
      )}
    </YamlField>
  )
}

/** A text area that starts one line tall and grows with its text. */
export function useGrowingArea(value: string) {
  const ref = useRef<HTMLTextAreaElement>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: each new value is measured again.
  useLayoutEffect(() => {
    const area = ref.current
    if (area) {
      area.style.height = 'auto'
      area.style.height = `${area.scrollHeight + area.offsetHeight - area.clientHeight}px`
    }
  }, [value])
  return ref
}

// Important: the text area's own min-height and resize handle come later in the stylesheet.
export const GROWING_AREA = '!min-h-0 !resize-none overflow-hidden'

export function GrowingTextarea(
  props: Omit<ComponentProps<typeof Textarea>, 'rows'> & { value: string },
) {
  const ref = useGrowingArea(props.value)
  return <Textarea {...props} ref={ref} rows={1} className={GROWING_AREA} />
}

/** Whether adding a job, step or input opens its dialog first; any of those dialogs sets it. */
export interface OpenOnAdd {
  open: boolean
  onChange: (open: boolean) => void
}

/** The dialogs' "open when adding" switch, when the host keeps the setting. */
export function openOnAddOf(
  editor: { openOnAdd?: boolean; onOpenOnAddChange?: (open: boolean) => void } | undefined,
): OpenOnAdd | undefined {
  return editor?.onOpenOnAddChange
    ? { open: editor.openOnAdd !== false, onChange: editor.onOpenOnAddChange }
    : undefined
}

export interface DialogShellProps {
  title: string
  onClose: () => void
  onSubmit: () => void
  saveDisabled: boolean
  dirty: boolean
  /** A dialog opened on top of this one owns Escape and outside clicks. */
  locked?: boolean
  footerStart?: ReactNode
  /** Controls beside the title, such as a switch between views. */
  headerEnd?: ReactNode
  openOnAdd?: OpenOnAdd | undefined
  children: ReactNode
}

function OpenOnAddSwitch({ open, onChange }: OpenOnAdd) {
  const t = useGraphEditorStrings()
  return (
    <Tooltip content={t.openOnAddHelp}>
      <label className="flex cursor-pointer items-center gap-2 text-xs theme-muted-text">
        <Checkbox checked={open} onCheckedChange={(next) => onChange(next)} />
        {t.openOnAdd}
      </label>
    </Tooltip>
  )
}

export function DialogShell({
  title,
  onClose,
  onSubmit,
  saveDisabled,
  dirty,
  locked = false,
  footerStart,
  headerEnd,
  openOnAdd,
  children,
}: DialogShellProps) {
  const t = useGraphEditorStrings()
  const submit = () => {
    if (!saveDisabled) {
      onSubmit()
    }
  }
  // Not a <form>: the dialogs host input forms of their own, and forms can't nest.
  return (
    <Modal
      open
      onClose={onClose}
      align="center"
      dismissible={!dirty && !locked}
      className="flex max-h-[85vh] w-full max-w-2xl flex-col"
    >
      <div className="flex min-h-0 flex-col">
        <div className="flex items-center gap-3 border-b theme-border px-5 py-4">
          <ModalTitle className="flex-1 text-[1rem] font-semibold">{title}</ModalTitle>
          {headerEnd}
        </div>
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto px-5 py-4">{children}</div>
        <div className="flex items-center gap-2 border-t theme-border px-5 py-3">
          {footerStart}
          {openOnAdd && <OpenOnAddSwitch {...openOnAdd} />}
          <div className="flex-1" />
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button variant="primary" size="sm" disabled={saveDisabled} onClick={submit}>
            {t.common.save}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

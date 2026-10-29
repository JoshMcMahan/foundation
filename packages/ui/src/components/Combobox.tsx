import { Autocomplete as BaseAutocomplete } from '@base-ui/react/autocomplete'
import { Combobox as BaseCombobox } from '@base-ui/react/combobox'
import { useVirtualizer, type Virtualizer } from '@tanstack/react-virtual'
import { dequal } from 'dequal'
import {
  type ClipboardEvent,
  type CSSProperties,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
  type RefObject,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import { cx } from '../cx'
import { AddIcon, CheckIcon, ChevronDownIcon, RemoveIcon } from '../icons'
import {
  type ComboboxItem,
  type ComboboxItems,
  type ComboboxLeaf,
  isComboboxGroup as isGroup,
  optionNaming,
  pickerEndClassName,
  pickerHintClassName,
  pickerItemClassName,
} from './comboboxItems'
import { useFieldControlId, useFieldRequired } from './Field'
import { type FieldBoxSize, fieldBox } from './fieldBox'
import { panelClassName, positionerClassName } from './floating'
import { Loader } from './Loader'
import { OptionDescription } from './OptionDescription'
import { useLocale, useStrings } from './Provider'
import { usePopupContainer } from './popupContainer'
import { useQueryMatch } from './search'
import { tagClasses } from './Tag'
import { Tooltip } from './Tooltip'

export type {
  ComboboxGroup,
  ComboboxItem,
  ComboboxItems,
  ComboboxLeaf,
} from './comboboxItems'

interface FieldProps {
  id?: string | undefined
  placeholder?: string | undefined
  disabled?: boolean | undefined
  required?: boolean | undefined
  'aria-label'?: string | undefined
  'aria-labelledby'?: string | undefined
  'aria-describedby'?: string | undefined
  'aria-invalid'?: boolean | undefined
  'aria-required'?: boolean | undefined
  /** `sm` for dense places such as toolbars and table cells, `lg` for a form that stands alone,
   *  such as sign-in. */
  size?: FieldBoxSize | undefined
  /** Classes for the field box: border, background, width. */
  className?: string | undefined
}

type SelectionProps<Value> =
  | {
      multiple?: false | undefined
      value?: Value | null | undefined
      defaultValue?: Value | null | undefined
      onValueChange?: ((value: NoInfer<Value> | null) => void) | undefined
    }
  | {
      multiple: true
      value?: readonly Value[] | undefined
      defaultValue?: readonly Value[] | undefined
      onValueChange?: ((value: NoInfer<Value>[]) => void) | undefined
      /** Typed text the list doesn't have can be added as a value of its own, as tags are. The
       *  values are then strings. For one free-text value, use Autocomplete. */
      creatable?: (Value extends string ? boolean : never) | undefined
      /** The most values the field takes; past it, only removing one lets another in. */
      maxItems?: number | undefined
      /** The longest text that can be typed, such as for a created value. */
      maxLength?: number | undefined
      /** With `creatable`: turns typed text into the value it adds, such as trimmed and
       *  lowercased; undefined refuses it. */
      createValue?: ((typed: string) => string | undefined) | undefined
      /** With `creatable`: keys that add what is typed, beside Enter, such as `','`. Pasted
       *  text splits on them too, adding each part. */
      separators?: readonly string[] | undefined
      /** With `creatable`: leaving the field adds what is typed, so a value half entered isn't
       *  lost. */
      addOnBlur?: boolean | undefined
      /** With `creatable`: values offered as chips under the field, each added with a press.
       *  Chosen ones leave the row. */
      suggested?: readonly string[] | undefined
    }

export type ComboboxProps<Value = string> = FieldProps &
  SelectionProps<Value> & {
    items: ComboboxItems<Value>
    /** Matches a value to its item. Defaults to deep equality, so object values can be recreated. */
    isItemEqualToValue?: ((itemValue: Value, value: Value) => boolean) | undefined
    /** Labels a selected value that no item has, such as a saved choice the list no longer offers. */
    itemToStringLabel?: ((value: Value) => string) | undefined
    /** Renders the field as this button, with the search input inside the popup, for compact
     *  pickers such as a toolbar pill. The button shows the selection itself. */
    trigger?: ReactElement | undefined
    /** A hint on the trigger button. */
    triggerTooltip?: ReactNode
    /** A pane beside the list about the highlighted item, such as who is in a group; it gets
     *  undefined while nothing is highlighted. It follows the highlight from the keyboard and
     *  the pointer alike, and is hidden from assistive technology, so each item's
     *  `accessibleDescription` must say what matters in it. Where the list is narrower than
     *  30rem the pane has no room, and `detailsSummary` shows under the highlighted item. */
    details?: ((value: Value | undefined) => ReactNode) | undefined
    /** Called as the highlight moves, from the keyboard or the pointer, such as to load what
     *  `details` shows; undefined once nothing is highlighted. */
    onItemHighlighted?: ((value: Value | undefined) => void) | undefined
    /** A line about the highlighted item, under it, where the list has no room for `details`. */
    detailsSummary?: ((value: Value) => ReactNode) | undefined
    /** Called as the typed text changes. With it, the host does the filtering: the list shows
     *  `items` as given, such as the results of a search on the server. */
    onQueryChange?: ((query: string) => void) | undefined
    /** The host's search is under way. */
    loading?: boolean | undefined
    /** The area the open list stays inside, such as a drawer's body above its footer; by
     *  default, the viewport. With `details`, the list grows to fill it. */
    collisionBoundary?: Element | null | undefined
    /** Whether the list is open, for a host that opens it itself, such as from a shortcut or
     *  to keep one picker open at a time. */
    open?: boolean | undefined
    defaultOpen?: boolean | undefined
    onOpenChange?: ((open: boolean) => void) | undefined
    /** The edge of the field or trigger the open list lines up with. */
    align?: 'start' | 'end' | undefined
    /** Offers a row that creates the typed text, such as a label that doesn't exist yet, while
     *  no item has that text. Choosing it calls this with the text and picks nothing itself:
     *  the host creates the thing and picks it, if it should. */
    onCreate?: ((text: string) => void) | undefined
  }

export interface AutocompleteProps extends FieldProps {
  /** Suggestions; any typed text is also a valid value. */
  items: ComboboxItems<string>
  value?: string | undefined
  defaultValue?: string | undefined
  onValueChange?: ((value: string) => void) | undefined
}

interface Entry<Value> extends ComboboxItem<Value> {
  /** The heading the item sits under, which a query also matches. */
  group?: string | undefined
  /** The row that adds the typed text, which every query keeps. */
  created?: boolean | undefined
  /** The row that hands the typed text to `onCreate`, adding no value itself. */
  action?: boolean | undefined
}

interface EntryGroup<Value> {
  label: string
  icon?: ReactNode
  description?: string | undefined
  items: Entry<Value>[]
  /** The group's place in the items, kept through Base UI's filtering. */
  order: number
  /** Items that sat between groups, listed without a heading. */
  headless?: boolean
}

function toEntry<Value>(
  item: ComboboxItem<Value> | (Value & string),
  group?: string,
): Entry<Value> {
  const entry = typeof item === 'string' ? { value: item, label: item } : item
  return group === undefined ? entry : { ...entry, group }
}

/** Base UI takes either flat items or groups, and filters and navigates by the leaf items, so
 *  items listed between groups gather into headless groups where they sit. */
function useEntries<Value>(items: ComboboxItems<Value>) {
  return useMemo(() => {
    if (!items.some(isGroup)) {
      const flat = (items as readonly ComboboxLeaf<Value>[]).map((item) => toEntry(item))
      return { items: flat, flat, statusGroups: [] as EntryGroup<Value>[] }
    }
    const groups: EntryGroup<Value>[] = []
    for (const item of items) {
      if (isGroup(item)) {
        groups.push({
          label: item.label,
          icon: item.icon,
          description: item.description,
          items: item.items.map((leaf) => toEntry(leaf, item.label)),
          order: groups.length,
        })
        continue
      }
      const last = groups.at(-1)
      if (last?.headless) {
        last.items.push(toEntry(item))
      } else {
        groups.push({ label: '', items: [toEntry(item)], order: groups.length, headless: true })
      }
    }
    return {
      items: groups,
      flat: groups.flatMap((g) => g.items),
      statusGroups: groups.filter((g) => g.items.length === 0),
    }
  }, [items])
}

// Matches the label, a string value (what free-text fields store) and the group heading, so
// generic labels like "Login node" are found by the name of the group they sit under.
function useEntryFilter() {
  const match = useQueryMatch()
  return useCallback(
    <Value,>(entry: Entry<Value>, query: string) =>
      entry.created === true ||
      match(
        query,
        entry.label,
        typeof entry.value === 'string' ? entry.value : undefined,
        entry.group,
      ),
    [match],
  )
}

const entryLabel = <Value,>(entry: Entry<Value> | null) => entry?.label ?? ''

const fieldClassName = (size: FieldBoxSize) =>
  cx(
    fieldBox({ size, within: true, multiline: true, padded: false }),
    'relative flex items-center gap-1',
  )
// Stretched to the box rather than padded to it, so the text centers as a Select's does; among
// chips the row pads itself, so the box keeps its height until the chips wrap.
const inputClassName = (size: FieldBoxSize) =>
  cx(
    'min-w-12 flex-1 self-stretch border-0 bg-transparent p-0 text-inherit outline-none placeholder:text-(--theme-placeholder) disabled:cursor-not-allowed',
    size === 'sm' ? 'pl-2' : 'pl-3',
  )
const triggerClassName =
  'flex shrink-0 items-center self-stretch px-2 text-(--theme-muted-text-color) disabled:cursor-not-allowed'
const popupInputClassName = fieldBox({ size: 'sm' })

/** A pick-from-the-list field: one value, or several with `multiple`. Typing filters the list. */
export function Combobox<Value = string>(props: ComboboxProps<Value>) {
  const {
    items,
    isItemEqualToValue = dequal,
    itemToStringLabel = String,
    className,
    placeholder,
    disabled,
    required,
    id: ownId,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledBy,
    'aria-describedby': ariaDescribedBy,
    'aria-invalid': ariaInvalid,
    'aria-required': ariaRequired,
    trigger,
    triggerTooltip,
    size = 'md',
    details,
    detailsSummary,
    onItemHighlighted,
    onQueryChange,
    loading = false,
    collisionBoundary,
    open,
    defaultOpen,
    onOpenChange,
    align = 'start',
    onCreate,
  } = props
  const id = useFieldControlId(ownId)
  const fieldRequired = useFieldRequired()
  const entries = useEntries(items)
  const filter = useEntryFilter()
  const t = useStrings().dropdown
  const locale = useLocale()
  const list = useRef<VirtualListHandle>(null)
  const uid = useId()
  const [inputValue, setInputValue] = useState<string | null>(null)
  /** Empties the search, and tells a host that mirrors it. */
  const clearQuery = (to: '' | null = '') => {
    if (inputValue) {
      onQueryChange?.('')
    }
    setInputValue(to)
  }
  const [highlighted, setHighlighted] = useState<Entry<Value> | undefined>(undefined)
  // Open from the start, the list opens a moment after its rows mount, as any other opening
  // does, so it lands on the chosen row; Base UI's own first-render open would land on the first.
  const [startsOpen] = useState(open === undefined && defaultOpen === true)
  const [ownOpen, setOwnOpen] = useState(false)
  useEffect(() => {
    if (startsOpen) {
      setOwnOpen(true)
    }
  }, [startsOpen])

  // Values the list doesn't have still show, under itemToStringLabel.
  const entryOf = (value: Value): Entry<Value> =>
    entries.flat.find((entry) => isItemEqualToValue(entry.value, value)) ?? {
      value,
      label: itemToStringLabel(value),
    }
  const toEntries = (values: readonly Value[] | undefined) => values?.map(entryOf)
  const toSingle = (value: Value | null | undefined) =>
    value === undefined ? undefined : value === null ? null : entryOf(value)

  const selected = props.multiple ? undefined : toSingle(props.value)

  // Multiple values, held here while uncontrolled so typed and pasted ones can join them;
  // whether the field is full; and the row that adds the typed text when nothing listed or
  // chosen already has it.
  const [ownValues, setOwnValues] = useState<readonly Value[]>(
    props.multiple ? (props.defaultValue ?? []) : [],
  )
  const chosen: readonly Value[] | null = props.multiple ? (props.value ?? ownValues) : null
  const full =
    props.multiple && props.maxItems !== undefined && (chosen?.length ?? 0) >= props.maxItems
  const isChosen = (entry: Entry<Value>) =>
    chosen?.some((value) => isItemEqualToValue(entry.value, value)) ?? false
  const setValues = (next: Value[]) => {
    if (props.multiple) {
      setOwnValues(next)
      props.onValueChange?.(next)
    }
  }
  const creatable = props.multiple && props.creatable
  const typed = inputValue?.trim() ?? ''
  // A value already listed or chosen under the same text isn't made again, in any case.
  const sameText = (text: string) => (value: unknown, label?: string) => {
    const lowered = text.toLocaleLowerCase()
    return (
      label?.toLocaleLowerCase() === lowered ||
      (typeof value === 'string' && value.toLocaleLowerCase() === lowered)
    )
  }
  const isNew = (text: string, among: readonly Value[] | null = chosen) =>
    !entries.flat.some((entry) => sameText(text)(entry.value, entry.label)) &&
    !among?.some((value) => sameText(text)(value))
  /** The value typed text adds, or undefined when it adds none. */
  const toCreated = (text: string, among?: readonly Value[] | null) => {
    if (!props.multiple || !props.creatable) {
      return undefined
    }
    const value = props.createValue ? props.createValue(text) : text.trim()
    return value && isNew(value, among) && isNew(text.trim(), among) ? value : undefined
  }
  const createdValue = creatable && !full && typed !== '' ? toCreated(typed) : undefined
  const created: Entry<Value> | undefined = onCreate
    ? typed !== '' && !full && isNew(typed)
      ? {
          value: typed as Value,
          label: t.create(typed),
          icon: <AddIcon />,
          created: true,
          action: true,
        }
      : undefined
    : createdValue !== undefined
      ? {
          value: createdValue as Value,
          label: t.add(createdValue),
          icon: <AddIcon />,
          created: true,
        }
      : undefined
  /** Adds what is typed, or each part of pasted text, as values; true when any was added. */
  const addTyped = (parts: readonly string[]) => {
    if (!chosen || !props.multiple) {
      return false
    }
    const { maxItems } = props
    const next = [...chosen]
    for (const part of parts) {
      if (maxItems !== undefined && next.length >= maxItems) {
        break
      }
      const value = part.trim() === '' ? undefined : toCreated(part, next)
      if (value !== undefined) {
        next.push(value as Value)
      }
    }
    if (next.length === chosen.length) {
      return false
    }
    setValues(next)
    clearQuery()
    return true
  }
  const separators = props.multiple && props.creatable ? (props.separators ?? []) : []
  const splitOnSeparators = (text: string) =>
    separators.reduce<string[]>(
      (parts, separator) => parts.flatMap((p) => p.split(separator)),
      [text],
    )
  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (separators.includes(event.key) && !event.nativeEvent.isComposing) {
      event.preventDefault()
      addTyped([typed])
    }
  }
  const onInputPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData('text')
    const parts = splitOnSeparators(text)
    if (parts.length > 1) {
      event.preventDefault()
      addTyped(parts)
    }
  }
  // Free entry with nothing to pick from: no button to open a list, and no empty one.
  const freeEntry = creatable && entries.flat.length === 0
  const [first] = entries.items
  // A typed value to add leads, so Enter adds what was typed. A row that hands the text to
  // `onCreate` follows the matches instead: Enter picks "performance" for "per", and creates
  // only once nothing else is listed.
  const createLast = created?.action === true
  const listItems = !created
    ? entries.items
    : first !== undefined && 'items' in first
      ? createLast
        ? [
            ...(entries.items as EntryGroup<Value>[]),
            { label: '', items: [created], order: entries.items.length },
          ]
        : [{ label: '', items: [created], order: -1 }, ...(entries.items as EntryGroup<Value>[])]
      : createLast
        ? [...(entries.items as Entry<Value>[]), created]
        : [created, ...(entries.items as Entry<Value>[])]
  // The selection's icon sits in the field until the text no longer names it.
  const selectedIcon =
    selected?.icon && (inputValue === null || inputValue === selected.label) ? selected.icon : null

  const input = (
    <BaseCombobox.Input
      id={trigger ? undefined : id}
      placeholder={
        full && props.maxItems !== undefined ? t.limitReached(props.maxItems) : placeholder
      }
      maxLength={props.multiple ? props.maxLength : undefined}
      onKeyDown={separators.length > 0 ? onInputKeyDown : undefined}
      onPaste={separators.length > 0 ? onInputPaste : undefined}
      onBlur={
        props.multiple && props.creatable && props.addOnBlur ? () => addTyped([typed]) : undefined
      }
      aria-label={ariaLabel || undefined}
      aria-labelledby={ariaLabelledBy}
      aria-describedby={ariaDescribedBy}
      aria-invalid={ariaInvalid || undefined}
      aria-required={ariaRequired || required || fieldRequired}
      autoComplete="off"
      data-1p-ignore
      className={trigger ? popupInputClassName : inputClassName(size)}
    />
  )

  const isHighlighted = (entry: Entry<Value>) =>
    highlighted !== undefined &&
    !entry.created &&
    !highlighted.created &&
    isItemEqualToValue(entry.value, highlighted.value)
  const itemRow = (entry: Entry<Value>, rowProps: RowProps) => (
    <BaseCombobox.Item
      key={rowProps.key}
      value={entry}
      disabled={entry.disabled || (full && !isChosen(entry))}
      {...rowProps.props}
      {...optionNaming(`${uid}${rowProps.props.index}`, entry)}
      className={pickerItemClassName}
    >
      <ItemContent entry={entry} id={`${uid}${rowProps.props.index}`}>
        {detailsSummary && isHighlighted(entry) && (
          // The pane's stand-in where it has no room; seen only, as the pane is.
          <span
            aria-hidden="true"
            className="mt-0.5 text-xs leading-snug text-(--theme-muted-text-color) @min-[30rem]/picker:hidden"
          >
            {detailsSummary(entry.value)}
          </span>
        )}
      </ItemContent>
      <span className={pickerEndClassName}>
        {entry.hint && (
          <span id={`${uid}${rowProps.props.index}hint`} className={pickerHintClassName}>
            {entry.hint}
          </span>
        )}
        {/* Beside a hint, the check keeps its place while unchosen, so hints line up. */}
        <span className={cx('flex items-center', entry.hint && 'w-3.5')}>
          <BaseCombobox.ItemIndicator className="flex items-center">
            <CheckIcon aria-hidden="true" className="size-3.5" />
          </BaseCombobox.ItemIndicator>
        </span>
      </span>
    </BaseCombobox.Item>
  )

  // A trigger named only by its label would hide what it holds, which its own text shows: it
  // is named by the label and then the value, both from text kept out of sight.
  const labelId = `${uid}-label`
  const valueId = `${uid}-value`
  const named = Boolean(ariaLabel || ariaLabelledBy)
  const parts = trigger ? (
    <>
      {named && (
        <>
          {ariaLabel && !ariaLabelledBy && (
            <span id={labelId} hidden>
              {ariaLabel}
            </span>
          )}
          <span id={valueId} hidden>
            <BaseCombobox.Value>
              {(value: Entry<Value> | Entry<Value>[] | null) =>
                Array.isArray(value) ? value.map(entryLabel).join(', ') : entryLabel(value)
              }
            </BaseCombobox.Value>
          </span>
        </>
      )}
      <Tooltip content={triggerTooltip}>
        <BaseCombobox.Trigger
          id={id}
          aria-labelledby={named ? `${ariaLabelledBy || labelId} ${valueId}` : undefined}
          aria-describedby={ariaDescribedBy}
          aria-invalid={ariaInvalid || undefined}
          aria-required={ariaRequired || required || fieldRequired}
          render={trigger}
        />
      </Tooltip>
      <ListPopup<Value>
        listRef={list}
        empty={t.noOptionsFound}
        statusGroups={entries.statusGroups}
        query={inputValue ?? ''}
        header={<div className="border-b border-(--theme-border) p-1.5">{input}</div>}
        // As wide as its longest rows, from a floor that gives a small chip a list to read up
        // to a cap that keeps it a list.
        className={
          details
            ? 'w-[min(36rem,var(--available-width))]'
            : 'w-max min-w-[min(max(14rem,var(--anchor-width)),var(--available-width))] max-w-[min(28rem,var(--available-width))]'
        }
        sizer={details ? undefined : <ListSizer entries={entries.flat} />}
        align={align}
        loading={loading ? t.searching : undefined}
        details={details?.(highlighted?.created ? undefined : highlighted?.value)}
        collisionBoundary={collisionBoundary}
        renderItem={itemRow}
      />
    </>
  ) : (
    <>
      <BaseCombobox.InputGroup
        data-testid="combobox"
        className={cx(fieldClassName(size), freeEntry && 'pr-2', className)}
      >
        {props.multiple ? (
          <BaseCombobox.Chips
            className={cx(
              'flex min-w-0 flex-1 flex-wrap items-center gap-1 pl-1',
              size === 'sm' ? 'py-0.5' : 'py-1',
            )}
          >
            <BaseCombobox.Value>
              {(values: Entry<Value>[]) =>
                values.map((entry, index) => (
                  <BaseCombobox.Chip
                    // Two values may share a label, such as a created tag and a listed one.
                    // biome-ignore lint/suspicious/noArrayIndexKey: a value has no key of its own; the label alone may repeat
                    key={`${index}:${entry.label}`}
                    aria-label={entry.label}
                    // The library's one tag look, so a chosen value reads as the tag it becomes.
                    className={cx(
                      tagClasses(),
                      'pr-0.5 outline-none data-highlighted:bg-(--theme-hover)',
                    )}
                  >
                    {entry.label}
                    <BaseCombobox.ChipRemove
                      aria-label={t.removeValue(entry.label)}
                      className="flex size-4 cursor-pointer items-center justify-center rounded-full text-(--theme-muted-text-color) hover:bg-(--theme-hover) hover:text-(--theme-app)"
                    >
                      <RemoveIcon aria-hidden="true" className="size-2.5" />
                    </BaseCombobox.ChipRemove>
                  </BaseCombobox.Chip>
                ))
              }
            </BaseCombobox.Value>
            {input}
          </BaseCombobox.Chips>
        ) : (
          <>
            {selectedIcon && (
              <span className={cx('flex shrink-0 items-center', size === 'sm' ? 'pl-2' : 'pl-3')}>
                {selectedIcon}
              </span>
            )}
            {input}
          </>
        )}
        {!freeEntry && (
          <BaseCombobox.Trigger
            aria-label={t.showOptions}
            data-testid="combobox-button"
            className={triggerClassName}
          >
            <ChevronDownIcon aria-hidden="true" className="size-3" />
          </BaseCombobox.Trigger>
        )}
      </BaseCombobox.InputGroup>
      {props.multiple && props.creatable && props.suggested && (
        <Suggestions
          suggested={props.suggested.filter((s) => toCreated(s) !== undefined)}
          disabled={disabled || full}
          onAdd={(s) => addTyped([s])}
        />
      )}
      <ListPopup<Value>
        listRef={list}
        empty={freeEntry ? undefined : t.noOptionsFound}
        align={align}
        statusGroups={entries.statusGroups}
        query={inputValue ?? ''}
        loading={loading ? t.searching : undefined}
        details={details?.(highlighted?.created ? undefined : highlighted?.value)}
        collisionBoundary={collisionBoundary}
        renderItem={itemRow}
      />
    </>
  )
  const root = {
    items: listItems,
    // The create row is itself alone: its text may match a value the host holds.
    isItemEqualToValue: (a: Entry<Value>, b: Entry<Value>) =>
      a.action || b.action ? a === b : isItemEqualToValue(a.value, b.value),
    itemToStringLabel: entryLabel,
    // A host that searches for itself gets the items as it gave them.
    filter: onQueryChange ? null : filter,
    onInputValueChange: (next: string) => {
      setInputValue(next)
      onQueryChange?.(next)
    },
    onItemHighlighted: (
      entry: Entry<Value> | undefined,
      { index, reason }: { index: number; reason: string },
    ) => {
      if (details || detailsSummary) {
        setHighlighted(entry)
      }
      onItemHighlighted?.(entry && !entry.created ? entry.value : undefined)
      list.current?.reveal(index, reason)
    },
    disabled,
    required,
    locale,
    virtualized: true,
    // Enter takes the leading row: what was typed, or the item that has that text already. A
    // button's picker is opened to choose, so it opens on a row and Enter takes it at once.
    // Base UI types `'always'` on its Autocomplete alone, though its Combobox takes it too.
    autoHighlight: (trigger ? 'always' : Boolean(creatable || onCreate)) as boolean,
    ...(open !== undefined ? { open } : startsOpen ? { open: ownOpen } : {}),
    onOpenChange: (next: boolean) => {
      setOwnOpen(next)
      // A picker opens to a fresh search; a field of chips keeps what is half typed.
      if (!next && (trigger || !props.multiple)) {
        clearQuery(null)
      }
      onOpenChange?.(next)
    },
    children: parts,
  }
  return props.multiple ? (
    <BaseCombobox.Root<Entry<Value>, true>
      {...root}
      multiple
      value={toEntries(chosen ?? [])}
      inputValue={inputValue ?? ''}
      onValueChange={(next, details) => {
        // Escape on a closed list would drop every chip at once, with no way back; it's left
        // to whatever holds the field instead, such as a form that steps back or a dialog.
        if (details.reason === 'escape-key') {
          details.cancel()
          details.allowPropagation()
          return
        }
        const action = next.find((entry) => entry.action)
        if (action) {
          details.cancel()
          clearQuery()
          onCreate?.(String(action.value))
          return
        }
        setValues(next.map((entry) => entry.value))
      }}
    />
  ) : (
    <BaseCombobox.Root<Entry<Value>>
      {...root}
      value={selected}
      defaultValue={toSingle(props.defaultValue)}
      onValueChange={(next, details) => {
        if (next?.action) {
          details.cancel()
          onCreate?.(String(next.value))
          return
        }
        props.onValueChange?.(next?.value ?? null)
      }}
    />
  )
}

/** A free-text field that suggests values as you type. */
export function Autocomplete({
  items,
  value,
  defaultValue,
  onValueChange,
  className,
  placeholder,
  disabled,
  required,
  id: ownId,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-required': ariaRequired,
  size = 'md',
}: AutocompleteProps) {
  const id = useFieldControlId(ownId)
  const fieldRequired = useFieldRequired()
  const entries = useEntries(items)
  const filter = useEntryFilter()
  const t = useStrings().dropdown
  const list = useRef<VirtualListHandle>(null)
  const uid = useId()

  return (
    <BaseAutocomplete.Root
      // Base UI types flat and grouped items as separate overloads of one runtime path.
      items={entries.items as readonly Entry<string>[]}
      filter={filter}
      itemToStringValue={(entry: Entry<string>) => entry.value}
      value={value}
      defaultValue={defaultValue}
      onValueChange={(next) => onValueChange?.(next)}
      onItemHighlighted={(_, { index, reason }) => list.current?.reveal(index, reason)}
      disabled={disabled}
      required={required}
      virtualized
    >
      <BaseAutocomplete.InputGroup
        data-testid="combobox"
        className={cx(fieldClassName(size), className)}
      >
        <BaseAutocomplete.Input
          id={id}
          placeholder={placeholder}
          aria-label={ariaLabel || undefined}
          aria-labelledby={ariaLabelledBy}
          aria-describedby={ariaDescribedBy}
          aria-invalid={ariaInvalid || undefined}
          aria-required={ariaRequired || required || fieldRequired}
          autoComplete="off"
          className={inputClassName(size)}
        />
        {entries.flat.length > 0 && (
          <BaseAutocomplete.Trigger
            aria-label={t.showOptions}
            data-testid="combobox-button"
            className={triggerClassName}
          >
            <ChevronDownIcon aria-hidden="true" className="size-3" />
          </BaseAutocomplete.Trigger>
        )}
      </BaseAutocomplete.InputGroup>
      <ListPopup<string>
        listRef={list}
        renderItem={(entry, rowProps) => (
          <BaseAutocomplete.Item
            key={rowProps.key}
            value={entry}
            disabled={entry.disabled}
            {...rowProps.props}
            {...optionNaming(`${uid}${rowProps.props.index}`, entry)}
            className={pickerItemClassName}
          >
            <ItemContent entry={entry} id={`${uid}${rowProps.props.index}`} />
          </BaseAutocomplete.Item>
        )}
      />
    </BaseAutocomplete.Root>
  )
}

function ItemContent<Value>({
  entry,
  id,
  children,
}: {
  entry: Entry<Value>
  id: string
  /** Under the description. */
  children?: ReactNode
}) {
  return (
    <>
      {entry.icon && <span className="flex shrink-0 items-center">{entry.icon}</span>}
      <span className="flex min-w-0 flex-col">
        <span className="flex min-w-0 items-center gap-2">
          <Tooltip content={entry.label} overflowOnly>
            <span id={`${id}label`} className="truncate">
              {entry.label}
            </span>
          </Tooltip>
          {entry.badge}
        </span>
        <OptionDescription id={`${id}description`} item={entry} />
        {children}
      </span>
    </>
  )
}

// Rows by their text's length, the longest few of which stand in for all, unseen.
const SIZER_ROWS = 3

/** Unseen copies of the longest rows, which set the width of a popup whose own rows are
 *  positioned out of its flow by the virtual list. */
function ListSizer<Value>({ entries }: { entries: readonly Entry<Value>[] }) {
  const longest = useMemo(
    () =>
      [...entries]
        .sort(
          (a, b) =>
            b.label.length + (b.hint?.length ?? 0) - (a.label.length + (a.hint?.length ?? 0)),
        )
        .slice(0, SIZER_ROWS),
    [entries],
  )
  return (
    <div aria-hidden="true" className="invisible h-0 overflow-hidden px-1">
      {longest.map((entry, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: unseen copies, in a fixed order
        <div key={index} className={cx(pickerItemClassName, 'w-max')}>
          {entry.icon && <span className="flex shrink-0 items-center">{entry.icon}</span>}
          <span className="flex items-center gap-2 whitespace-nowrap">
            {entry.label}
            {entry.badge}
          </span>
          <span className={pickerEndClassName}>
            {entry.hint && <span className={pickerHintClassName}>{entry.hint}</span>}
            <span className="size-3.5" />
          </span>
        </div>
      ))}
    </div>
  )
}

/** Values offered under a tag field, each added with a press. */
function Suggestions({
  suggested,
  disabled,
  onAdd,
}: {
  suggested: readonly string[]
  disabled: boolean | undefined
  onAdd: (value: string) => void
}) {
  const t = useStrings().dropdown
  const id = useId()
  if (suggested.length === 0) {
    return null
  }
  return (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset is for form controls; this groups buttons
    <div role="group" aria-labelledby={id} className="mt-1.5 flex flex-wrap items-center gap-1">
      <span id={id} className="mr-0.5 text-xs text-(--theme-muted-text-color)">
        {t.suggested}
      </span>
      {suggested.map((value) => (
        <button
          key={value}
          type="button"
          disabled={disabled}
          aria-label={t.add(value)}
          onClick={() => onAdd(value)}
          // The tag pill, dashed and muted until pressed: a value not yet added.
          className={cx(
            tagClasses(),
            'cursor-pointer gap-0.5 border-dashed border-(--theme-border-strong) pr-2 pl-1.5 text-(--theme-muted-text-color) transition-colors hover:border-solid hover:bg-(--theme-hover) hover:text-(--theme-app) focus-visible:outline-2 focus-visible:outline-(--theme-focus) disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-dashed disabled:hover:bg-transparent',
          )}
        >
          <AddIcon aria-hidden="true" className="size-2.5" />
          {value}
        </button>
      ))}
    </div>
  )
}

function GroupHeading<Value>({ group }: { group: EntryGroup<Value> }) {
  return (
    <>
      {group.icon && <span className="flex shrink-0 items-center">{group.icon}</span>}
      <span className="shrink-0 font-semibold">{group.label}</span>
      {group.description && (
        <Tooltip content={group.description} overflowOnly>
          <span className="min-w-0 truncate">· {group.description}</span>
        </Tooltip>
      )}
    </>
  )
}

interface RowProps {
  key: string | number | bigint
  props: {
    index: number
    ref: (element: Element | null) => void
    'data-index': number
    'aria-setsize': number
    'aria-posinset': number
    style: CSSProperties
  }
}

interface VirtualListHandle {
  reveal: (index: number | undefined, reason: string) => void
}

/** Portal, positioner and popup shared by Combobox and Autocomplete; both use the same parts. */
function ListPopup<Value>({
  listRef,
  empty,
  statusGroups = [],
  query = '',
  header,
  className = 'w-(--anchor-width) max-w-(--available-width)',
  loading,
  details,
  collisionBoundary,
  renderItem,
  sizer,
  align = 'start',
}: {
  listRef: RefObject<VirtualListHandle | null>
  empty?: string | undefined
  /** Itemless groups, which Base UI's filtering drops, shown in their place while they match. */
  statusGroups?: readonly EntryGroup<Value>[]
  query?: string
  /** Above the list, such as the search input of a button-triggered picker. */
  header?: ReactNode
  /** Sizes the popup; by default it matches the field. */
  className?: string | undefined
  /** Says a search is under way. */
  loading?: string | undefined
  /** The pane beside the list, for the highlighted item. */
  details?: ReactNode
  collisionBoundary?: Element | null | undefined
  renderItem: (entry: Entry<Value>, row: RowProps) => ReactElement
  /** Gives a content-wide popup its width, which the list's positioned rows don't. */
  sizer?: ReactNode
  align?: 'start' | 'end' | undefined
}) {
  const portal = usePopupContainer()
  const withDetails = details !== undefined
  const list = (
    <>
      {loading && (
        <div
          role="status"
          className="flex items-center gap-2 px-3 py-2 text-(--theme-muted-text-color)"
        >
          <Loader inline decorative size="1em" />
          {loading}
        </div>
      )}
      {/* Status headings say why nothing can be picked, so the empty message would repeat them. */}
      {empty && !loading && statusGroups.length === 0 && (
        <BaseCombobox.Empty className="px-3 py-2 text-(--theme-muted-text-color) empty:hidden">
          {empty}
        </BaseCombobox.Empty>
      )}
      <BaseCombobox.List className={cx(withDetails && 'min-h-0 flex-1')}>
        <VirtualList<Value>
          ref={listRef}
          statusGroups={statusGroups}
          query={query}
          tall={withDetails}
          renderItem={renderItem}
        />
      </BaseCombobox.List>
    </>
  )
  return (
    <BaseCombobox.Portal {...portal}>
      <BaseCombobox.Positioner
        align={align}
        sideOffset={4}
        className={positionerClassName}
        {...(collisionBoundary && { collisionBoundary })}
      >
        <BaseCombobox.Popup
          className={cx(
            'overflow-hidden',
            // The popup is the container its narrow layout answers to, wherever the field sits.
            // With a pane beside the list it takes the room there is, so the pane rarely
            // scrolls and many rows show, but not past a height that would be all list.
            withDetails && '@container/picker flex h-[min(40rem,var(--available-height))] flex-col',
            className,
            panelClassName,
            // Base UI leaves a popup with nothing to show open, as an empty panel, for its host to hide.
            !empty && !loading && statusGroups.length === 0 && !header && 'data-empty:hidden',
          )}
        >
          {header}
          {withDetails ? (
            <div className="flex min-h-0 flex-1">
              <div className="flex min-w-0 flex-1 flex-col">{list}</div>
              <div
                aria-hidden="true"
                data-testid="combobox-details"
                className="hidden w-1/2 shrink-0 overflow-y-auto overscroll-contain border-l border-(--theme-border) bg-(--theme-panel-bg) @min-[30rem]/picker:block"
              >
                {details}
                {/* Fades what runs on below the edge, so a cut line reads as more to scroll to;
                    the padding above it lets the last line clear it at the end. */}
                <div className="pointer-events-none sticky bottom-0 -mt-6 h-6 bg-linear-to-t from-(--theme-panel-bg) to-transparent" />
              </div>
            </div>
          ) : (
            list
          )}
          {sizer}
        </BaseCombobox.Popup>
      </BaseCombobox.Positioner>
    </BaseCombobox.Portal>
  )
}

type Row<Value> =
  | { kind: 'group'; group: EntryGroup<Value> }
  | { kind: 'item'; entry: Entry<Value>; index: number }

// Base UI navigates by leaf item, so group headings are rows of their own that items count past.
function toRows<Value>(
  filtered: readonly (Entry<Value> | EntryGroup<Value>)[],
  statusGroups: readonly EntryGroup<Value>[],
) {
  const nodes = statusGroups.length
    ? [...filtered, ...statusGroups].sort(
        (a, b) => ('order' in a ? a.order : 0) - ('order' in b ? b.order : 0),
      )
    : filtered
  const rows: Row<Value>[] = []
  const rowOfItem: number[] = []
  for (const node of nodes) {
    const leaves = 'items' in node ? node.items : [node]
    if ('items' in node && !node.headless) {
      rows.push({ kind: 'group', group: node })
    }
    for (const entry of leaves) {
      rowOfItem.push(rows.length)
      rows.push({ kind: 'item', entry, index: rowOfItem.length - 1 })
    }
  }
  return { rows, rowOfItem }
}

function VirtualList<Value>({
  ref,
  statusGroups,
  query,
  tall,
  renderItem,
}: {
  ref: Ref<VirtualListHandle>
  statusGroups: readonly EntryGroup<Value>[]
  query: string
  /** Room for more rows, beside a details pane as tall. */
  tall: boolean
  renderItem: (entry: Entry<Value>, row: RowProps) => ReactElement
}) {
  const filtered = BaseCombobox.useFilteredItems<Entry<Value> | EntryGroup<Value>>()
  const match = useQueryMatch()
  const { rows, rowOfItem } = useMemo(() => {
    const q = query.trim()
    const shown = q ? statusGroups.filter((g) => match(q, g.label, g.description)) : statusGroups
    return toRows(filtered, shown)
  }, [filtered, statusGroups, query, match])
  const scroller = useRef<HTMLDivElement | null>(null)
  // Once the person scrolls the list themselves, only the keyboard moves it until they type
  // again: autoHighlight re-highlights the first row whenever the highlighted one scrolls out
  // of the rendered window, and following that would throw the list back to the top.
  const scrolledByHand = useRef(false)
  // biome-ignore lint/correctness/useExhaustiveDependencies: typing starts the list over
  useEffect(() => {
    scrolledByHand.current = false
  }, [query])
  const virtualizer: Virtualizer<HTMLDivElement, Element> = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroller.current,
    // A row is panelItemClassName's py-1.5 around a text-sm line: 32px. An estimate off by even
    // a few pixels moves the list under the pointer as each row is measured on the way past.
    estimateSize: (i) => (rows[i]?.kind === 'group' ? 28 : 32),
    overscan: 10,
    paddingStart: 4,
    paddingEnd: 4,
    scrollPaddingStart: 4,
    scrollPaddingEnd: 4,
  })

  // Keyboard moves past the rendered window, so the highlighted item is scrolled to explicitly.
  useImperativeHandle(
    ref,
    () => ({
      reveal(index, reason) {
        const row = index === undefined ? undefined : rowOfItem[index]
        if (row === undefined || reason === 'pointer') {
          return
        }
        if (reason !== 'keyboard' && scrolledByHand.current) {
          return
        }
        queueMicrotask(() => virtualizer.scrollToIndex(row, { align: 'auto' }))
      },
    }),
    [rowOfItem, virtualizer],
  )

  const scrollerRef = useCallback(
    (element: HTMLDivElement | null) => {
      scroller.current = element
      if (element) {
        virtualizer.measure()
      }
    },
    [virtualizer],
  )

  if (rows.length === 0) {
    return null
  }
  const total = virtualizer.getTotalSize()
  return (
    <div
      role="presentation"
      ref={scrollerRef}
      onWheel={() => {
        scrolledByHand.current = true
      }}
      onTouchMove={() => {
        scrolledByHand.current = true
      }}
      onPointerDown={(e) => {
        // The scrollbar: a press on the list itself rather than on one of its rows.
        if (e.target === e.currentTarget) scrolledByHand.current = true
      }}
      className={cx(
        // The panel's gutter: the virtualizer pads the ends, so the list takes only the sides.
        'overflow-auto overscroll-contain px-1',
        tall ? 'max-h-full' : 'max-h-[min(15rem,var(--available-height))]',
      )}
      style={{ height: total }}
    >
      <div role="presentation" className="relative w-full" style={{ height: total }}>
        {virtualizer.getVirtualItems().map((virtual) => {
          const row = rows[virtual.index]
          const style: CSSProperties = {
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            transform: `translateY(${virtual.start}px)`,
          }
          if (!row) {
            return null
          }
          if (row.kind === 'group') {
            return (
              <div
                key={virtual.key}
                role="presentation"
                data-index={virtual.index}
                ref={virtualizer.measureElement}
                style={style}
                className="flex items-center gap-1.5 px-2 pt-2 pb-1 text-xs text-(--theme-muted-text-color)"
              >
                <GroupHeading group={row.group} />
              </div>
            )
          }
          return renderItem(row.entry, {
            key: virtual.key,
            props: {
              index: row.index,
              ref: virtualizer.measureElement,
              'data-index': virtual.index,
              'aria-setsize': rowOfItem.length,
              'aria-posinset': row.index + 1,
              style,
            },
          })
        })}
      </div>
    </div>
  )
}

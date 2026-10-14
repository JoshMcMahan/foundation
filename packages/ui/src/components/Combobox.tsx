import { Autocomplete as BaseAutocomplete } from '@base-ui/react/autocomplete'
import { Combobox as BaseCombobox } from '@base-ui/react/combobox'
import { useVirtualizer, type Virtualizer } from '@tanstack/react-virtual'
import { dequal } from 'dequal'
import {
  type CSSProperties,
  type ReactElement,
  type ReactNode,
  type Ref,
  type RefObject,
  useCallback,
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
} from './comboboxItems'
import { type FieldBoxSize, fieldBox } from './fieldBox'
import { panelClassName, panelItemClassName, positionerClassName } from './floating'
import { useStrings } from './Provider'
import { useQueryMatch } from './search'
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
  /** `sm` for dense places such as toolbars and table cells. */
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
    id,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledBy,
    'aria-describedby': ariaDescribedBy,
    'aria-invalid': ariaInvalid,
    'aria-required': ariaRequired,
    trigger,
    triggerTooltip,
    size = 'md',
  } = props
  const entries = useEntries(items)
  const filter = useEntryFilter()
  const strings = useStrings()
  const t = strings.dropdown
  const list = useRef<VirtualListHandle>(null)
  const [inputValue, setInputValue] = useState<string | null>(null)

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

  // Multiple values: how many there are (counted here while uncontrolled), whether the field is
  // full, and the row that adds the typed text when nothing listed or chosen already has it.
  const [uncontrolledCount, setUncontrolledCount] = useState(
    props.multiple ? (props.defaultValue?.length ?? 0) : 0,
  )
  const chosen = props.multiple ? (props.value ?? null) : null
  const full =
    props.multiple &&
    props.maxItems !== undefined &&
    (chosen?.length ?? uncontrolledCount) >= props.maxItems
  const isChosen = (entry: Entry<Value>) =>
    chosen?.some((value) => isItemEqualToValue(entry.value, value)) ?? false
  const typed = inputValue?.trim() ?? ''
  const lowered = typed.toLocaleLowerCase()
  const sameText = (value: unknown, label?: string) =>
    label?.toLocaleLowerCase() === lowered ||
    (typeof value === 'string' && value.toLocaleLowerCase() === lowered)
  const created: Entry<Value> | undefined =
    props.multiple &&
    props.creatable &&
    typed !== '' &&
    !full &&
    !entries.flat.some((entry) => sameText(entry.value, entry.label)) &&
    !chosen?.some((value) => sameText(value))
      ? { value: typed as Value, label: t.add(typed), icon: <AddIcon />, created: true }
      : undefined
  const [first] = entries.items
  const listItems = !created
    ? entries.items
    : first !== undefined && 'items' in first
      ? [{ label: '', items: [created], order: -1 }, ...(entries.items as EntryGroup<Value>[])]
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
      aria-label={ariaLabel || undefined}
      aria-labelledby={ariaLabelledBy}
      aria-describedby={ariaDescribedBy}
      aria-invalid={ariaInvalid || undefined}
      aria-required={ariaRequired || required || undefined}
      autoComplete="off"
      className={trigger ? popupInputClassName : inputClassName(size)}
    />
  )

  const itemRow = (entry: Entry<Value>, rowProps: RowProps) => (
    <BaseCombobox.Item
      key={rowProps.key}
      value={entry}
      disabled={entry.disabled || (full && !isChosen(entry))}
      {...rowProps.props}
      className={itemClassName}
    >
      <ItemContent entry={entry} />
      <BaseCombobox.ItemIndicator className="ml-auto flex shrink-0 items-center">
        <CheckIcon className="size-3.5" />
      </BaseCombobox.ItemIndicator>
    </BaseCombobox.Item>
  )

  const parts = trigger ? (
    <>
      <Tooltip content={triggerTooltip}>
        <BaseCombobox.Trigger
          id={id}
          aria-label={ariaLabel || undefined}
          aria-labelledby={ariaLabelledBy}
          aria-describedby={ariaDescribedBy}
          aria-invalid={ariaInvalid || undefined}
          aria-required={ariaRequired || required || undefined}
          render={trigger}
        />
      </Tooltip>
      <ListPopup<Value>
        listRef={list}
        empty={t.noOptionsFound}
        statusGroups={entries.statusGroups}
        query={inputValue ?? ''}
        header={<div className="border-b border-(--theme-border) p-1.5">{input}</div>}
        className="w-max min-w-(--anchor-width) max-w-[min(28rem,var(--available-width))]"
        renderItem={itemRow}
      />
    </>
  ) : (
    <>
      <BaseCombobox.InputGroup
        data-testid="combobox"
        className={cx(fieldClassName(size), className)}
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
                values.map((entry) => (
                  <BaseCombobox.Chip
                    key={entry.label}
                    aria-label={entry.label}
                    className="flex items-center gap-1 rounded bg-(--theme-muted-panel-bg) py-0.5 pr-0.5 pl-1.5 text-xs outline-none data-highlighted:bg-(--theme-hover)"
                  >
                    {entry.label}
                    <BaseCombobox.ChipRemove
                      aria-label={`${strings.common.remove} ${entry.label}`}
                      className="flex size-4 items-center justify-center rounded hover:bg-(--theme-hover)"
                    >
                      <RemoveIcon className="size-3" />
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
        <BaseCombobox.Trigger
          aria-label={t.showOptions}
          data-testid="combobox-button"
          className={triggerClassName}
        >
          <ChevronDownIcon className="size-3" />
        </BaseCombobox.Trigger>
      </BaseCombobox.InputGroup>
      <ListPopup<Value>
        listRef={list}
        empty={t.noOptionsFound}
        statusGroups={entries.statusGroups}
        query={inputValue ?? ''}
        renderItem={itemRow}
      />
    </>
  )
  const root = {
    items: listItems,
    filter,
    isItemEqualToValue: (a: Entry<Value>, b: Entry<Value>) => isItemEqualToValue(a.value, b.value),
    itemToStringLabel: entryLabel,
    onInputValueChange: setInputValue,
    onItemHighlighted: (_: unknown, { index, reason }: { index: number; reason: string }) =>
      list.current?.reveal(index, reason),
    disabled,
    required,
    virtualized: true,
    // Enter takes the leading row: what was typed, or the item that has that text already.
    autoHighlight: Boolean(props.multiple && props.creatable),
    children: parts,
  }
  return props.multiple ? (
    <BaseCombobox.Root<Entry<Value>, true>
      {...root}
      multiple
      value={toEntries(props.value)}
      defaultValue={toEntries(props.defaultValue)}
      onValueChange={(next) => {
        setUncontrolledCount(next.length)
        props.onValueChange?.(next.map((entry) => entry.value))
      }}
    />
  ) : (
    <BaseCombobox.Root<Entry<Value>>
      {...root}
      value={selected}
      defaultValue={toSingle(props.defaultValue)}
      onValueChange={(next) => props.onValueChange?.(next?.value ?? null)}
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
  id,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-required': ariaRequired,
  size = 'md',
}: AutocompleteProps) {
  const entries = useEntries(items)
  const filter = useEntryFilter()
  const t = useStrings().dropdown
  const list = useRef<VirtualListHandle>(null)

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
          aria-required={ariaRequired || required || undefined}
          autoComplete="off"
          className={inputClassName(size)}
        />
        {entries.flat.length > 0 && (
          <BaseAutocomplete.Trigger
            aria-label={t.showOptions}
            data-testid="combobox-button"
            className={triggerClassName}
          >
            <ChevronDownIcon className="size-3" />
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
            className={itemClassName}
          >
            <ItemContent entry={entry} />
          </BaseAutocomplete.Item>
        )}
      />
    </BaseAutocomplete.Root>
  )
}

const itemClassName = cx(panelItemClassName, 'data-selected:font-medium')

function ItemContent<Value>({ entry }: { entry: Entry<Value> }) {
  return (
    <>
      {entry.icon && <span className="flex shrink-0 items-center">{entry.icon}</span>}
      <span className="flex min-w-0 flex-col">
        <Tooltip content={entry.label} overflowOnly>
          <span className="truncate">{entry.label}</span>
        </Tooltip>
        {entry.description && (
          <span className="text-xs leading-snug text-(--theme-muted-text-color)">
            {entry.description}
          </span>
        )}
      </span>
    </>
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
  renderItem,
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
  renderItem: (entry: Entry<Value>, row: RowProps) => ReactElement
}) {
  return (
    <BaseCombobox.Portal>
      <BaseCombobox.Positioner align="start" sideOffset={4} className={positionerClassName}>
        <BaseCombobox.Popup className={cx('overflow-hidden', className, panelClassName)}>
          {header}
          {/* Status headings say why nothing can be picked, so the empty message would repeat them. */}
          {empty && statusGroups.length === 0 && (
            <BaseCombobox.Empty className="px-3 py-2 text-(--theme-muted-text-color) empty:hidden">
              {empty}
            </BaseCombobox.Empty>
          )}
          <BaseCombobox.List>
            <VirtualList<Value>
              ref={listRef}
              statusGroups={statusGroups}
              query={query}
              renderItem={renderItem}
            />
          </BaseCombobox.List>
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
  renderItem,
}: {
  ref: Ref<VirtualListHandle>
  statusGroups: readonly EntryGroup<Value>[]
  query: string
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
  const virtualizer: Virtualizer<HTMLDivElement, Element> = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroller.current,
    estimateSize: (i) => (rows[i]?.kind === 'group' ? 28 : 36),
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
      className="max-h-[min(15rem,var(--available-height))] overflow-auto overscroll-contain"
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
                className="flex items-center gap-1.5 px-3 pt-2 pb-1 text-xs text-(--theme-muted-text-color)"
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

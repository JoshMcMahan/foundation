import { Menu } from '@base-ui/react/menu'
import {
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { buttonClasses } from '../components/buttonClasses'
import { Combobox, type ComboboxGroup, type ComboboxItem } from '../components/Combobox'
import { Calendar } from '../components/DatePicker'
import { Drawer } from '../components/Drawer'
import { Input } from '../components/Input'
import {
  MenuCheckboxItem,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuRadioItem,
  MenuSeparator,
} from '../components/Menu'
import { Popover } from '../components/Popover'
import { useLocale, useStrings } from '../components/Provider'
import { useQueryMatch } from '../components/search'
import { cx } from '../cx'
import { AddIcon, CheckIcon, CloseIcon } from '../icons'
import {
  type ActiveFilter,
  DATE_PRESETS,
  type FilterField,
  type FilterOperator,
  type FilterOption,
  fieldOperators,
  isDatePreset,
  isMultiple,
  parseDay,
  toDay,
} from './filterModel'
import type { ListFilters } from './useListFilters'

// biome-ignore lint/suspicious/noExplicitAny: the chip row only reads the fields' shape
type Field = FilterField<any>

/** Below this width the row stops at two lines and the rest open in a sheet. */
const NARROW_PX = 640

// --- Chip ------------------------------------------------------------------

// Each part is its own button. The pill is 28px; a part reaches 32px for a finger.
const partClassName =
  "relative flex min-w-0 shrink-0 cursor-pointer items-center gap-1.5 px-2 outline-none transition-colors before:absolute before:inset-x-0 before:-inset-y-0.5 before:content-[''] hover:bg-(--theme-hover) focus-visible:z-[1] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--theme-focus) data-popup-open:bg-(--theme-hover)"

function Divider() {
  return <span aria-hidden="true" className="w-px shrink-0 self-stretch bg-(--theme-border)" />
}

type Strings = ReturnType<typeof useStrings>['filters']

/** The labels a filter's values show, and their icons. */
function valueParts(
  field: Field,
  filter: ActiveFilter,
  t: Strings,
  labels: Map<string, FilterOption>,
  locale: string | undefined,
) {
  const labelOf = (v: string) =>
    labels.get(v)?.label ??
    field.options?.find((o) => o.value === v)?.label ??
    field.valueLabel?.(v) ??
    v
  const iconOf = (v: string) =>
    labels.get(v)?.icon ?? field.options?.find((o) => o.value === v)?.icon
  const dayText = (v: string | undefined) => {
    if (!v) {
      return ''
    }
    if (isDatePreset(v)) {
      return t.datePreset(v)
    }
    const day = parseDay(v)
    return day ? t.formatDate(day, locale) : v
  }
  switch (field.kind) {
    case 'date':
      return {
        all: [
          filter.op === 'between'
            ? t.between(dayText(filter.values[0]), dayText(filter.values[1]))
            : dayText(filter.values[0]),
        ],
        icons: [],
      }
    case 'boolean':
      return { all: [filter.values[0] === 'false' ? t.no : t.yes], icons: [] }
    case 'text':
      return { all: [filter.values[0] ?? ''], icons: [] }
    default:
      return {
        all: filter.values.map(labelOf),
        icons: filter.values
          .slice(0, field.kind === 'people' ? 3 : 1)
          .map(iconOf)
          .filter(Boolean),
      }
  }
}

interface ChipProps {
  filters: ListFilters
  filter: ActiveFilter
  field: Field
  /** Full width, as the phone sheet stacks them. */
  stretch?: boolean
  /** Whether this chip answers requests to open its pickers. */
  answers: boolean
  /** Called after Backspace or Delete removed it, to move focus on. */
  onRemoved?: () => void
}

/** One filter as a sentence: its field, its condition and its values, each opening its own
 *  picker, and a button that removes it. */
export function FilterChip({
  filters,
  filter,
  field,
  stretch = false,
  answers,
  onRemoved,
}: ChipProps) {
  const strings = useStrings()
  const t = strings.filters
  // Labels of options loaded from the server, so a chosen one keeps its name.
  const [seen] = useState(() => new Map<string, FilterOption>())
  const [open, setOpen] = useState<'field' | 'operator' | 'value' | null>(null)
  // Opened by a request rather than its own button: focus comes back to the chip on close,
  // not to wherever the request came from.
  const requested = useRef(false)
  const valueButton = useRef<HTMLButtonElement>(null)
  const request =
    answers && filters.editRequest?.field === filter.field ? filters.editRequest : null
  const { clearEditRequest } = filters
  useEffect(() => {
    if (!request) {
      return
    }
    // A frame later, so a menu that asked for it has handed focus back first.
    const frame = requestAnimationFrame(() => {
      requested.current = true
      setOpen(request.part)
      clearEditRequest(request.id)
    })
    return () => cancelAnimationFrame(frame)
  }, [request, clearEditRequest])

  const unset = filter.values.length === 0 && filter.op !== 'isSet' && filter.op !== 'isNotSet'
  const fixed = Boolean(field.required || field.pinned)
  const showsAny = unset && fixed
  const isDraft = filters.draft === filter.field
  const removable = !field.required && !(field.pinned && unset)
  const operators = fieldOperators(field)
  const locale = useLocale()
  const { all, icons } = valueParts(field, filter, t, seen, locale)
  const shown = all.slice(0, 2)
  const hidden = all.length - shown.length
  const valueText = unset ? (showsAny ? t.any : t.pending) : t.list(shown)
  const operatorText = t.operator(filter.op, filter.values.length)
  const noValuePart =
    filter.op === 'isSet' ||
    filter.op === 'isNotSet' ||
    (field.kind === 'boolean' && filter.values[0] !== 'false')
  const noOperatorPart = showsAny || (field.kind === 'boolean' && filter.values[0] !== 'false')
  const readAll = unset ? valueText : t.list(all)

  const remove = () => {
    if (field.pinned && !field.required) {
      filters.update(filter.field, { values: [] })
    } else {
      filters.remove(filter.field)
    }
  }
  const onKeyDown = (e: KeyboardEvent) => {
    if ((e.key === 'Backspace' || e.key === 'Delete') && removable && open === null) {
      e.preventDefault()
      remove()
      onRemoved?.()
    }
  }
  const setPart = (part: 'field' | 'operator' | 'value') => (next: boolean) =>
    setOpen((current) => (next ? part : current === part ? null : current))
  const onValueClose = () => {
    const wasRequested = requested.current
    requested.current = false
    // A chip just added that never got a value goes away again.
    if (isDraft && filter.values.length === 0) {
      filters.discardDraft()
      return
    }
    if (wasRequested) {
      setTimeout(() => valueButton.current?.focus(), 0)
    }
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset is for form controls; this groups buttons
    <div
      role="group"
      aria-label={t.chip(
        field.label,
        noOperatorPart ? '' : operatorText,
        noValuePart ? '' : readAll,
      )}
      data-filter-chip={filter.field}
      onKeyDown={onKeyDown}
      className={cx(
        'flex h-7 max-w-full items-stretch overflow-hidden rounded-md border border-(--theme-border) bg-(--theme-panel-bg) text-[12px] text-(--theme-app)',
        stretch ? 'w-full' : 'w-fit',
      )}
    >
      <FieldMenu
        filters={filters}
        field={field}
        open={open === 'field'}
        onOpenChange={setPart('field')}
      />
      {!noOperatorPart && (
        <>
          <Divider />
          {operators.length > 1 ? (
            <OperatorMenu
              filters={filters}
              filter={filter}
              operators={operators}
              open={open === 'operator'}
              onOpenChange={setPart('operator')}
            />
          ) : (
            <span className="flex shrink-0 items-center px-2 text-(--theme-muted-text-color)">
              {operatorText}
            </span>
          )}
        </>
      )}
      {!noValuePart && (
        <>
          <Divider />
          <ValuePicker
            filters={filters}
            filter={filter}
            field={field}
            seen={seen}
            open={open === 'value'}
            onOpenChange={(next) => {
              setPart('value')(next)
              if (!next) {
                onValueClose()
              }
            }}
            trigger={
              <button
                type="button"
                ref={valueButton}
                aria-label={t.changeValue(readAll || field.label)}
                // The part that gives way on a narrow row, so the × stays in reach.
                className={cx(partClassName, 'shrink', stretch && 'flex-1')}
              >
                {icons.length > 0 && (
                  <span className="flex shrink-0 items-center -space-x-1 [&_svg]:size-3">
                    {icons.map((icon, i) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: icons keep their values' order
                      <span key={i} className="flex">
                        {icon}
                      </span>
                    ))}
                  </span>
                )}
                <span
                  className={cx(
                    'min-w-0 truncate',
                    !stretch && 'max-w-40',
                    unset && 'text-(--theme-muted-text-color)',
                  )}
                >
                  {valueText}
                </span>
                {hidden > 0 && (
                  <span className="shrink-0 text-(--theme-muted-text-color)">{t.more(hidden)}</span>
                )}
              </button>
            }
          />
        </>
      )}
      {removable && (
        <>
          <Divider />
          <button
            type="button"
            aria-label={t.remove(field.label)}
            onClick={remove}
            className={cx(
              partClassName,
              'px-1.5 text-(--theme-muted-text-color) hover:text-(--theme-app)',
              stretch && 'ml-auto',
            )}
          >
            <CloseIcon aria-hidden="true" className="size-3" />
          </button>
        </>
      )}
    </div>
  )
}

function FieldMenu({
  filters,
  field,
  open,
  onOpenChange,
}: {
  filters: ListFilters
  field: Field
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useStrings().filters
  // Another field takes this chip's place; one already in a chip isn't offered twice.
  const used = new Set(filters.chips.map((f) => f.field))
  const others = filters.fields.filter(
    (f) => f.key === field.key || (!used.has(f.key) && !f.required && !f.pinned),
  )
  const fixed = field.required || field.pinned
  const label = (
    <>
      {field.icon && (
        <span className="flex shrink-0 text-(--theme-muted-text-color) [&_svg]:size-3.5">
          {field.icon}
        </span>
      )}
      <span className="whitespace-nowrap">{field.label}</span>
    </>
  )
  if (fixed || others.length < 2) {
    return <span className="flex shrink-0 items-center gap-1.5 px-2">{label}</span>
  }
  return (
    <Menu.Root open={open} onOpenChange={onOpenChange}>
      <Menu.Trigger
        render={
          <button type="button" aria-label={t.changeField(field.label)} className={partClassName} />
        }
      >
        {label}
      </Menu.Trigger>
      <MenuPopup className="max-w-[min(20rem,var(--available-width))]">
        <Menu.RadioGroup
          value={field.key}
          onValueChange={(next: string) => filters.replaceField(field.key, next)}
        >
          {others.map((f) => (
            <MenuRadioItem key={f.key} value={f.key}>
              {f.icon && <span className="flex [&_svg]:size-3.5">{f.icon}</span>}
              {f.label}
            </MenuRadioItem>
          ))}
        </Menu.RadioGroup>
      </MenuPopup>
    </Menu.Root>
  )
}

function OperatorMenu({
  filters,
  filter,
  operators,
  open,
  onOpenChange,
}: {
  filters: ListFilters
  filter: ActiveFilter
  operators: readonly FilterOperator[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useStrings().filters
  const count = filter.values.length
  const text = t.operator(filter.op, count)
  return (
    <Menu.Root open={open} onOpenChange={onOpenChange}>
      <Menu.Trigger
        render={
          <button
            type="button"
            aria-label={t.changeOperator(text)}
            className={cx(partClassName, 'text-(--theme-muted-text-color)')}
          />
        }
      >
        <span className="whitespace-nowrap">{text}</span>
      </Menu.Trigger>
      <MenuPopup>
        <Menu.RadioGroup
          value={filter.op}
          onValueChange={(op: FilterOperator) => {
            // A range keeps its first day as either end; a single day becomes the range's start.
            const values =
              op === 'between' || filter.op === 'between' || op === 'isSet' || op === 'isNotSet'
                ? op === 'isSet' || op === 'isNotSet'
                  ? []
                  : filter.values.filter((v) => !isDatePreset(v)).slice(0, op === 'between' ? 2 : 1)
                : filter.op === 'is' && (op === 'after' || op === 'before')
                  ? filter.values.filter((v) => !isDatePreset(v))
                  : filter.values
            filters.update(filter.field, { op, values })
          }}
        >
          {operators.map((op) => (
            <MenuRadioItem key={op} value={op}>
              {t.operator(op, Math.max(count, 1))}
            </MenuRadioItem>
          ))}
        </Menu.RadioGroup>
      </MenuPopup>
    </Menu.Root>
  )
}

// --- Value pickers ---------------------------------------------------------

interface PickerProps {
  filters: ListFilters
  filter: ActiveFilter
  field: Field
  seen: Map<string, FilterOption>
  open: boolean
  onOpenChange: (open: boolean) => void
  trigger: ReactElement
}

function ValuePicker(props: PickerProps) {
  switch (props.field.kind) {
    case 'date':
      return <DateValuePicker {...props} />
    case 'text':
      return <TextValuePicker {...props} />
    case 'boolean':
      return <BooleanValuePicker {...props} />
    default:
      return <OptionValuePicker {...props} />
  }
}

/** Options from the server for what is typed, while the picker is open. */
function useLoadedOptions(field: Field, query: string, open: boolean) {
  const [state, setState] = useState<{ options: readonly FilterOption[]; loading: boolean }>({
    options: field.options ?? [],
    loading: false,
  })
  const { loadOptions } = field
  useEffect(() => {
    if (!loadOptions || !open) {
      return
    }
    const controller = new AbortController()
    setState((s) => ({ ...s, loading: true }))
    loadOptions(query, controller.signal).then(
      (options) => {
        if (!controller.signal.aborted) {
          setState({ options, loading: false })
        }
      },
      () => {
        if (!controller.signal.aborted) {
          setState((s) => ({ ...s, loading: false }))
        }
      },
    )
    return () => controller.abort()
  }, [loadOptions, query, open])
  return loadOptions ? state : { options: field.options ?? [], loading: false }
}

function OptionValuePicker({
  filters,
  filter,
  field,
  seen,
  open,
  onOpenChange,
  trigger,
}: PickerProps) {
  const strings = useStrings()
  const matches = useQueryMatch()
  const [query, setQuery] = useState('')
  const multiple = isMultiple(field)
  const loaded = useLoadedOptions(field, query.trim(), open)
  for (const option of loaded.options) {
    seen.set(option.value, option)
  }
  const searchable =
    field.searchable ?? (Boolean(field.loadOptions) || (field.options?.length ?? 0) > 8)
  const needle = query.trim()
  const selected = filter.values
  // A chosen option stays listed while typing, so it can still be unticked; chosen values the
  // options no longer hold are listed first, under their remembered names.
  const missing = selected
    .filter((v) => !loaded.options.some((o) => o.value === v))
    .map((v): FilterOption => seen.get(v) ?? { value: v, label: field.valueLabel?.(v) ?? v })
  const all = [...missing, ...loaded.options]
  const options =
    needle && !field.loadOptions
      ? all.filter(
          (o) => selected.includes(o.value) || matches(needle, o.label, o.description, o.group),
        )
      : all
  const set = (values: string[]) => filters.update(filter.field, { values })

  const content = (option: FilterOption) => (
    <>
      {option.icon && <span className="flex shrink-0 [&_svg]:size-3.5">{option.icon}</span>}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">{option.label}</span>
        {option.description && (
          <span className="truncate text-[11px] text-(--theme-muted-text-color)">
            {option.description}
          </span>
        )}
      </span>
      {option.count !== undefined && (
        <span className="shrink-0 text-[11px] tabular-nums text-(--theme-muted-text-color)">
          {COUNT.format(option.count)}
        </span>
      )}
    </>
  )
  const row = (option: FilterOption) => {
    const checked = selected.includes(option.value)
    return multiple ? (
      <MenuCheckboxItem
        key={option.value}
        checked={checked}
        closeOnClick={false}
        onCheckedChange={() =>
          set(checked ? selected.filter((v) => v !== option.value) : [...selected, option.value])
        }
      >
        {content(option)}
      </MenuCheckboxItem>
    ) : (
      <MenuRadioItem key={option.value} value={option.value}>
        {content(option)}
      </MenuRadioItem>
    )
  }
  // Options under their headings, in the order the headings first appear.
  const groups: { label: string | undefined; options: FilterOption[] }[] = []
  for (const option of options) {
    const last = groups.find((g) => g.label === option.group)
    if (last) {
      last.options.push(option)
    } else {
      groups.push({ label: option.group, options: [option] })
    }
  }
  const rows = groups.map((g) =>
    g.label ? (
      <Menu.Group key={g.label}>
        <MenuGroupLabel>{g.label}</MenuGroupLabel>
        {g.options.map(row)}
      </Menu.Group>
    ) : (
      g.options.map(row)
    ),
  )
  const list = multiple ? (
    rows
  ) : (
    <Menu.RadioGroup value={selected[0] ?? null} onValueChange={(v: string) => set([v])}>
      {rows}
    </Menu.RadioGroup>
  )
  if (searchable) {
    return (
      <SearchablePicker
        options={options}
        selected={selected}
        multiple={multiple}
        loading={loaded.loading}
        open={open}
        onOpenChange={(next) => {
          onOpenChange(next)
          if (!next) {
            setQuery('')
          }
        }}
        onQueryChange={setQuery}
        onValuesChange={set}
        trigger={trigger}
      />
    )
  }
  return (
    <Menu.Root open={open} onOpenChange={onOpenChange}>
      <Menu.Trigger render={trigger} />
      <MenuPopup className="w-max min-w-56 max-w-[min(28rem,var(--available-width))]">
        {list}
        {!loaded.loading && options.length === 0 && (
          <div className="px-3 py-1.5 text-[13px] text-(--theme-muted-text-color)">
            {strings.dropdown.noOptionsFound}
          </div>
        )}
      </MenuPopup>
    </Menu.Root>
  )
}

/** A long list's picker, such as of people: typing narrows it and Enter takes the first match,
 *  and only the rows in view are drawn. */
function SearchablePicker({
  options,
  selected,
  multiple,
  loading,
  open,
  onOpenChange,
  onQueryChange,
  onValuesChange,
  trigger,
}: {
  options: readonly FilterOption[]
  selected: readonly string[]
  multiple: boolean
  loading: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onQueryChange: (query: string) => void
  onValuesChange: (values: string[]) => void
  trigger: ReactElement
}) {
  const strings = useStrings()
  // Options under their headings, in the order the headings first appear.
  const items: (ComboboxItem | ComboboxGroup)[] = []
  const groups = new Map<string, ComboboxItem[]>()
  for (const option of options) {
    const item: ComboboxItem = {
      value: option.value,
      label: option.label,
      description: option.description,
      icon: option.icon && <span className="flex [&_svg]:size-3.5">{option.icon}</span>,
      hint: option.count === undefined ? undefined : COUNT.format(option.count),
    }
    if (!option.group) {
      items.push(item)
      continue
    }
    let group = groups.get(option.group)
    if (!group) {
      group = []
      groups.set(option.group, group)
      items.push({ label: option.group, items: group })
    }
    group.push(item)
  }
  const shared = {
    items,
    placeholder: strings.list.searchOptions,
    open,
    onOpenChange,
    // The host narrows the list, so chosen values stay listed to be unticked.
    onQueryChange,
    loading: loading && options.length === 0,
    trigger,
  }
  return multiple ? (
    <Combobox<string> {...shared} multiple value={selected} onValueChange={onValuesChange} />
  ) : (
    <Combobox<string>
      {...shared}
      value={selected[0] ?? null}
      onValueChange={(value) => {
        if (value !== null) {
          onValuesChange([value])
        }
      }}
    />
  )
}

const COUNT = new Intl.NumberFormat()

function BooleanValuePicker({ filters, filter, open, onOpenChange, trigger }: PickerProps) {
  const t = useStrings().filters
  return (
    <Menu.Root open={open} onOpenChange={onOpenChange}>
      <Menu.Trigger render={trigger} />
      <MenuPopup>
        <Menu.RadioGroup
          value={filter.values[0] ?? 'true'}
          onValueChange={(v: string) => filters.update(filter.field, { values: [v] })}
        >
          <MenuRadioItem value="true">{t.yes}</MenuRadioItem>
          <MenuRadioItem value="false">{t.no}</MenuRadioItem>
        </Menu.RadioGroup>
      </MenuPopup>
    </Menu.Root>
  )
}

function DateValuePicker({ filters, filter, open, onOpenChange, trigger }: PickerProps) {
  const t = useStrings().filters
  const [custom, setCustom] = useState(false)
  const [first, second] = filter.values
  const choosePreset = (preset: string) => {
    filters.update(filter.field, { op: 'is', values: [preset] })
    onOpenChange(false)
  }
  const showCalendar = custom || filter.op !== 'is' || (first !== undefined && !isDatePreset(first))
  const range = filter.op === 'between' || (custom && filter.op === 'is')
  return (
    <Popover
      aria-label={t.changeValue('')}
      trigger={trigger}
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) {
          setCustom(false)
        }
      }}
      align="start"
      initialFocus="first-control"
      className="p-0"
    >
      {filter.op === 'is' && (
        <div
          className={cx('flex flex-col p-1', showCalendar && 'border-b border-(--theme-border)')}
        >
          {DATE_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              aria-pressed={first === preset}
              onClick={() => choosePreset(preset)}
              className="flex h-7 cursor-pointer items-center justify-between gap-4 rounded px-2 text-left text-[13px] outline-none hover:bg-(--theme-hover) focus-visible:bg-(--theme-hover)"
            >
              {t.datePreset(preset)}
              {first === preset && <CheckIcon aria-hidden="true" className="size-3" />}
            </button>
          ))}
          {!showCalendar && (
            <button
              type="button"
              onClick={() => setCustom(true)}
              className="flex h-7 cursor-pointer items-center rounded px-2 text-left text-[13px] outline-none hover:bg-(--theme-hover) focus-visible:bg-(--theme-hover)"
            >
              {t.customDate}
            </button>
          )}
        </div>
      )}
      {showCalendar &&
        (range ? (
          <Calendar
            mode="range"
            autoFocus={custom}
            selected={{ from: parseDay(first), to: parseDay(second) }}
            onSelect={(next) => {
              if (!next?.from) {
                return
              }
              const from = toDay(next.from)
              const to = next.to ? toDay(next.to) : ''
              filters.update(filter.field, { op: 'between', values: to ? [from, to] : [from] })
              if (to && from !== to) {
                onOpenChange(false)
              }
            }}
          />
        ) : (
          <Calendar
            mode="single"
            autoFocus
            selected={parseDay(first)}
            onSelect={(day) => {
              if (day) {
                filters.update(filter.field, { values: [toDay(day)] })
                onOpenChange(false)
              }
            }}
          />
        ))}
    </Popover>
  )
}

function TextValuePicker({ filters, filter, field, open, onOpenChange, trigger }: PickerProps) {
  const t = useStrings().filters
  const [text, setText] = useState(filter.values[0] ?? '')
  useEffect(() => {
    if (open) {
      setText(filter.values[0] ?? '')
    }
  }, [open, filter.values])
  return (
    <Popover
      aria-label={field.label}
      trigger={trigger}
      open={open}
      onOpenChange={onOpenChange}
      align="start"
      className="w-64 p-2"
    >
      <Input
        size="sm"
        aria-label={field.label}
        placeholder={t.textPlaceholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            const value = text.trim()
            filters.update(filter.field, { values: value ? [value] : [] })
            onOpenChange(false)
          }
        }}
      />
    </Popover>
  )
}

// --- Add filter ------------------------------------------------------------

export interface AddFilterMenuProps {
  filters: ListFilters
  /** The button that opens it: the toolbar's Filter button, or the row's "+ Filter". */
  trigger: ReactElement
  /** Where it opens against its trigger. */
  align?: 'start' | 'end'
}

/** The fields a filter can be added on. Picking one adds its chip and opens its value picker
 *  there; a field already in use opens its chip's picker. */
export function AddFilterMenu({ filters, trigger, align = 'start' }: AddFilterMenuProps) {
  const strings = useStrings()
  const t = strings.filters
  const matches = useQueryMatch()
  const [query, setQuery] = useState('')
  // The field picked, begun once the menu has closed and handed focus back.
  const picked = useRef<string | null>(null)
  const used = new Set(filters.active.map((f) => f.field))
  const searchable = filters.fields.length > 8
  const needle = query.trim()
  const fields = needle ? filters.fields.filter((f) => matches(needle, f.label)) : filters.fields
  const removable = filters.active.some(
    (f) => !filters.fields.find((x) => x.key === f.field)?.required,
  )
  const resetting = filters.hasDefaults
  const showClear = resetting ? !filters.isDefault : removable
  const rows = fields.map((f) => (
    <MenuItem
      key={f.key}
      onClick={() => {
        picked.current = f.key
      }}
    >
      {f.icon && (
        <span className="flex shrink-0 text-(--theme-muted-text-color) [&_svg]:size-3.5">
          {f.icon}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate">{f.label}</span>
      {used.has(f.key) && <CheckIcon aria-hidden="true" className="size-3.5 shrink-0 opacity-80" />}
    </MenuItem>
  ))
  const menu = (
    <Menu.Root
      onOpenChange={(next) => {
        if (!next) {
          setQuery('')
        }
      }}
      onOpenChangeComplete={(next) => {
        const key = picked.current
        picked.current = null
        if (!next && key) {
          filters.begin(key)
        }
      }}
    >
      <Menu.Trigger render={trigger} />
      <MenuPopup align={align} className="w-56">
        <div className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-(--theme-muted-text-color)">
          {t.addFilter}
        </div>
        {searchable ? (
          <>
            <div className="sticky top-0 z-[1] -mx-1 mb-1 border-y border-(--theme-border) bg-(--theme-app-bg) px-3 py-1.5">
              <Menu.Input
                placeholder={t.searchFields}
                aria-label={t.searchFields}
                className="w-full bg-transparent text-[13px] text-(--theme-app) outline-none placeholder:text-(--theme-placeholder)"
              />
            </div>
            <Menu.List>{rows}</Menu.List>
          </>
        ) : (
          rows
        )}
        {fields.length === 0 && (
          <div className="px-3 py-1.5 text-[13px] text-(--theme-muted-text-color)">
            {strings.dropdown.noOptionsFound}
          </div>
        )}
        {/* Last, so Enter on the first item a key opened the menu to never empties the list. */}
        {showClear && (
          <>
            <MenuSeparator />
            <MenuItem onClick={resetting ? filters.reset : filters.clear}>
              {resetting ? strings.common.reset : strings.common.clear}
            </MenuItem>
          </>
        )}
      </MenuPopup>
    </Menu.Root>
  )
  return searchable ? (
    <Menu.FilterProvider filter={null} value={query} onValueChange={setQuery}>
      {menu}
    </Menu.FilterProvider>
  ) : (
    menu
  )
}

// --- Row -------------------------------------------------------------------

export interface ListFilterBarProps {
  filters: ListFilters | undefined
  /** At the row's end, such as Save view or Update view. */
  trailing?: ReactNode
  /** Names the row; defaults to the provider's `filters.activeFilters`. */
  label?: string | undefined
  className?: string | undefined
}

/** The chips that say what narrows a list, under its toolbar: one per filter, each editable in
 *  place, then "+ Filter" and Clear (or Reset, where the page has default filters). It shows
 *  only while a filter is on or a field is required. At phone width it stops at two lines and
 *  a "+n filters" chip opens the rest in a sheet. */
export function ListFilterBar({ filters, trailing, label, className }: ListFilterBarProps) {
  const strings = useStrings()
  const t = strings.filters
  const registerBar = filters?.registerBar
  useEffect(() => registerBar?.(), [registerBar])
  const row = useRef<HTMLDivElement>(null)
  const [narrow, setNarrow] = useState(false)
  const [width, setWidth] = useState(0)
  const [limit, setLimit] = useState<number | null>(null)
  const [sheet, setSheet] = useState(false)
  const [focusAt, setFocusAt] = useState<number | null>(null)

  const chips = filters ? orderedChips(filters) : []
  const fieldOf = (key: string) => filters?.fields.find((f) => f.key === key)
  const empty = chips.length === 0
  const chipKeys = chips.map((c) => c.filter.field).join('\u0000')

  // The row mounts again once it has chips, so it is measured again then.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `empty` is what remounts the row
  useLayoutEffect(() => {
    const el = row.current
    if (!el) {
      return
    }
    const measure = () => {
      const w = el.getBoundingClientRect().width
      setWidth(w)
      setNarrow(w > 0 && w < NARROW_PX)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [empty])

  // A change in width or chips starts over from every chip shown.
  // biome-ignore lint/correctness/useExhaustiveDependencies: width and the chips are what restart the fit
  useLayoutEffect(() => setLimit(null), [width, chipKeys, narrow])

  // Drops chips into the sheet until the row fits on two lines.
  useLayoutEffect(() => {
    const el = row.current
    if (!el || !narrow) {
      return
    }
    const tops = new Set<number>()
    for (const child of el.children) {
      tops.add(Math.round((child as HTMLElement).offsetTop))
    }
    const shown = limit ?? chips.length
    if (tops.size > 2 && shown > 1) {
      setLimit(shown - 1)
    }
  })

  // Focus moves on from a chip Backspace removed: to the next chip, else to "+ Filter".
  useEffect(() => {
    if (focusAt === null || !row.current) {
      return
    }
    const remaining = row.current.querySelectorAll<HTMLElement>('[data-filter-chip]')
    const target =
      remaining[focusAt]?.querySelector<HTMLElement>('button') ??
      row.current.querySelector<HTMLElement>('[data-filter-add]')
    target?.focus()
    setFocusAt(null)
  }, [focusAt])

  const visible = narrow && limit !== null ? limit : chips.length
  const shownChips = chips.filter((c, i) => i < visible || c.filter.field === filters?.draft)
  const overflow = chips.length - shownChips.length

  // A request for a chip the row has put in the sheet opens the sheet.
  const request = filters?.editRequest
  const hiddenRequest =
    request &&
    !shownChips.some((c) => c.filter.field === request.field) &&
    chips.some((c) => c.filter.field === request.field)
  useEffect(() => {
    if (hiddenRequest) {
      setSheet(true)
    }
  }, [hiddenRequest])

  if (!filters || empty) {
    return null
  }
  const removable = filters.active.some((f) => !fieldOf(f.field)?.required)
  const resetting = filters.hasDefaults
  const showClear = resetting ? !filters.isDefault : removable
  const clearButton = showClear && (
    <button
      type="button"
      onClick={resetting ? filters.reset : filters.clear}
      className={buttonClasses({ variant: 'ghost', size: 'sm' })}
    >
      {resetting ? strings.common.reset : strings.common.clear}
    </button>
  )
  const addButton = (
    <AddFilterMenu
      filters={filters}
      trigger={
        <button
          type="button"
          data-filter-add=""
          className={buttonClasses({ variant: 'ghost', size: 'sm' })}
        >
          <AddIcon aria-hidden="true" />
          {t.addFilter}
        </button>
      }
    />
  )

  return (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset is for form controls; this groups chips
    <div
      ref={row}
      role="group"
      aria-label={label ?? t.activeFilters}
      className={cx('flex flex-wrap items-center gap-1.5 py-1.5', className)}
    >
      {shownChips.map(({ filter, field }, i) => (
        <FilterChip
          key={filter.field}
          filters={filters}
          filter={filter}
          field={field}
          answers={!sheet}
          onRemoved={() => setFocusAt(i)}
        />
      ))}
      {overflow > 0 && (
        <button
          type="button"
          onClick={() => setSheet(true)}
          className="flex h-7 cursor-pointer items-center rounded-md border border-dashed border-(--theme-border) px-2 text-[12px] text-(--theme-app) hover:bg-(--theme-hover) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--theme-focus)"
        >
          {t.overflow(overflow)}
        </button>
      )}
      {addButton}
      {clearButton}
      {trailing && <div className="ml-auto flex items-center gap-1.5">{trailing}</div>}
      <Drawer
        open={sheet}
        onClose={() => setSheet(false)}
        title={t.sheetTitle}
        width={400}
        footer={
          <div className="flex w-full items-center gap-1.5">
            {addButton}
            {clearButton}
          </div>
        }
      >
        <div className="flex flex-col gap-2">
          {chips.map(({ filter, field }) => (
            <FilterChip
              key={filter.field}
              filters={filters}
              filter={filter}
              field={field}
              stretch
              answers={sheet}
            />
          ))}
        </div>
      </Drawer>
    </div>
  )
}

/** Required and pinned fields first, unset ones reading "Any", then filters in the order added. */
function orderedChips(filters: ListFilters): { filter: ActiveFilter; field: Field }[] {
  const out: { filter: ActiveFilter; field: Field }[] = []
  for (const field of filters.fields) {
    if (field.required || field.pinned) {
      out.push({
        field,
        filter: filters.chips.find((c) => c.field === field.key) ?? {
          field: field.key,
          op: fieldOperators(field)[0] ?? 'is',
          values: [],
        },
      })
    }
  }
  for (const filter of filters.chips) {
    const field = filters.fields.find((f) => f.key === filter.field)
    if (field && !field.required && !field.pinned) {
      out.push({ filter, field })
    }
  }
  return out
}

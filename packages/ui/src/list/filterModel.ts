import type { ReactNode } from 'react'

/** What a filter's value is, which decides its picker and its conditions. */
export type FilterKind = 'enum' | 'people' | 'date' | 'text' | 'boolean'

/** How a filter compares its values with a row's. */
export type FilterOperator =
  /** enum and people: "is A" or "is any of A, B"; date: a preset or a day ("is Last 7 days"). */
  | 'is'
  /** enum and people: "is not A" or "is none of A, B". */
  | 'isNot'
  /** enum on a field holding many values, such as labels: "includes all of A, B". */
  | 'includesAll'
  /** date: on or after the day. */
  | 'after'
  /** date: on or before the day. */
  | 'before'
  /** date: two days, both included. */
  | 'between'
  | 'contains'
  | 'notContains'
  /** Any kind: the row has a value at all ("has a due date"), with no values of its own. */
  | 'isSet'
  | 'isNotSet'

export interface FilterOption {
  value: string
  label: string
  /** A status dot, a label's color, an avatar. */
  icon?: ReactNode
  /** A second line in the picker, such as a cycle's dates. */
  description?: string | undefined
  /** How many rows hold it, shown at the end of its row in the picker. */
  count?: number | undefined
  /** A heading the option sits under in the picker, such as People or Agents. */
  group?: string | undefined
}

/** A value a row holds for a field, for the matching a field does on its own. A date is a
 *  `Date`, an ISO string or epoch milliseconds. */
export type FilterRowValue = string | number | boolean | Date | readonly string[] | null | undefined

export interface FilterField<T = never> {
  /** The URL and storage key: stable, never renamed. */
  key: string
  /** The chip's field part, such as "Status". */
  label: string
  icon?: ReactNode
  kind: FilterKind
  /** The conditions offered, in order; the first is the one a new filter starts with. Defaults:
   *  enum and people `is`, `isNot`; date `is`, `after`, `before`, `between`; text `contains`,
   *  `notContains`; boolean `is`. Add `includesAll` or `isSet` here. */
  operators?: readonly FilterOperator[] | undefined
  /** enum and people: the choices. */
  options?: readonly FilterOption[] | undefined
  /** enum and people: searches on the server as the reader types. Its results show as given. */
  loadOptions?:
    | ((query: string, signal: AbortSignal) => Promise<readonly FilterOption[]>)
    | undefined
  /** Names a value no option holds any more, such as a deleted label in a saved link. */
  valueLabel?: ((value: string) => string | undefined) | undefined
  /** enum and people: whether more than one value can be chosen (default true). */
  multiple?: boolean | undefined
  /** Whether the picker has a search field. Default: more than eight options, or `loadOptions`. */
  searchable?: boolean | undefined
  /** Always shows its chip, with no remove button, reading "Any" while unset; Clear leaves it. */
  required?: boolean | undefined
  /** Always shows its chip, reading "Any" while unset; its remove button only empties it. */
  pinned?: boolean | undefined
  /** One value across every page sharing the list's `sharedFiltersKey`, such as a namespace. */
  shared?: boolean | undefined
  /** The row's value, so the list can match the filter itself for every condition. */
  value?: ((row: T) => FilterRowValue) | undefined
  /** Whether a row passes, for matching `value` can't express. Omit both for a list filtered
   *  on the server. */
  matches?: ((row: T, filter: ActiveFilter) => boolean) | undefined
}

/** One filter in effect: plain data, so it can go in a URL, storage or a saved view. */
export interface ActiveFilter {
  field: string
  op: FilterOperator
  /** Dates are `yyyy-MM-dd` days or relative presets (`today`, `-7d`, `month`), which stay
   *  relative wherever they are saved. A boolean is `true` or `false`. */
  values: readonly string[]
}

/** The relative date presets the date picker offers, as a filter stores them. */
export const DATE_PRESETS = ['today', '-7d', '-30d', '-90d', 'month'] as const
export type DatePreset = (typeof DATE_PRESETS)[number]

const DEFAULT_OPERATORS: Record<FilterKind, readonly FilterOperator[]> = {
  enum: ['is', 'isNot'],
  people: ['is', 'isNot'],
  date: ['is', 'after', 'before', 'between'],
  text: ['contains', 'notContains'],
  boolean: ['is'],
}

// biome-ignore lint/suspicious/noExplicitAny: a field list holds fields of any row type
type AnyField = FilterField<any>

export function fieldOperators(field: AnyField): readonly FilterOperator[] {
  return field.operators?.length ? field.operators : DEFAULT_OPERATORS[field.kind]
}

export function isMultiple(field: AnyField): boolean {
  return (field.kind === 'enum' || field.kind === 'people') && field.multiple !== false
}

/** Whether a filter narrows anything yet: a value chosen, or a condition that needs none. */
export function isComplete(filter: ActiveFilter): boolean {
  if (filter.op === 'isSet' || filter.op === 'isNotSet') {
    return true
  }
  if (filter.op === 'between') {
    return filter.values.length === 2 && filter.values.every(Boolean)
  }
  return filter.values.some(Boolean)
}

/** Whether two sets of filters say the same, ignoring order, as Save or Update buttons ask. */
export function sameFilters(a: readonly ActiveFilter[], b: readonly ActiveFilter[]): boolean {
  const norm = (list: readonly ActiveFilter[]) =>
    list
      .filter(isComplete)
      .map((f) => `${f.field}\u0000${f.op}\u0000${[...f.values].sort().join('\u0001')}`)
      .sort()
      .join('\u0002')
  return norm(a) === norm(b)
}

// --- Storage ---------------------------------------------------------------

/** What storage holds per field: a plain list for `is`, the shape every earlier version wrote
 *  and still reads, or the condition beside its values. Key order keeps the order added. */
export type StoredFilters = Record<
  string,
  readonly string[] | { op: FilterOperator; values: readonly string[] }
>

export function fromStored(stored: unknown): ActiveFilter[] {
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) {
    return []
  }
  const out: ActiveFilter[] = []
  for (const [field, entry] of Object.entries(stored)) {
    if (Array.isArray(entry)) {
      const values = entry.filter((v): v is string => typeof v === 'string')
      if (values.length) {
        out.push({ field, op: 'is', values })
      }
    } else if (typeof entry === 'object' && entry !== null && typeof entry.op === 'string') {
      const values = Array.isArray(entry.values)
        ? entry.values.filter((v: unknown): v is string => typeof v === 'string')
        : []
      out.push({ field, op: entry.op as FilterOperator, values })
    }
  }
  return out
}

export function toStored(filters: readonly ActiveFilter[]): StoredFilters {
  const out: StoredFilters = {}
  for (const f of filters) {
    out[f.field] = f.op === 'is' ? [...f.values] : { op: f.op, values: [...f.values] }
  }
  return out
}

// --- URL -------------------------------------------------------------------

// Each condition is a suffix on the param's name, so `label!=bug` arrives as the param
// `label!` holding `bug`, and the link reads as it is meant.
const SUFFIX: Record<FilterOperator, string> = {
  is: '',
  isNot: '!',
  includesAll: '*',
  after: '>',
  before: '<',
  between: '',
  contains: '~',
  notContains: '!~',
  isSet: '',
  isNotSet: '!',
}
const SET = '_set'

// A comma joins values, so a value's own commas (and the escape) are escaped.
const escapeValue = (v: string) => v.replaceAll('%', '%25').replaceAll(',', '%2C')
const unescapeValue = (v: string) => v.replaceAll('%2C', ',').replaceAll('%25', '%')
const joinValues = (values: readonly string[]) => values.map(escapeValue).join(',')
const splitValues = (raw: string) =>
  raw === '' ? [] : raw.split(',').map(unescapeValue).filter(Boolean)

/** The URL params a set of filters reads as: `status=started,done&label!=bug&due>=2026-10-01`.
 *  Values are not URL-encoded here; the router or `URLSearchParams` does that. */
export function encodeFilters(filters: readonly ActiveFilter[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const f of filters) {
    if (!isComplete(f)) {
      continue
    }
    if (f.op === 'isSet' || f.op === 'isNotSet') {
      out[`${f.field}${SUFFIX[f.op]}`] = SET
    } else if (f.op === 'between') {
      out[`${f.field}>`] = escapeValue(f.values[0] ?? '')
      out[`${f.field}<`] = escapeValue(f.values[1] ?? '')
    } else {
      out[`${f.field}${SUFFIX[f.op]}`] = joinValues(f.values)
    }
  }
  return out
}

type SearchInput = URLSearchParams | Record<string, unknown>

function entriesOf(search: SearchInput): [string, string][] {
  if (search instanceof URLSearchParams) {
    return [...search.entries()]
  }
  const out: [string, string][] = []
  for (const [key, value] of Object.entries(search)) {
    if (typeof value === 'string') {
      out.push([key, value])
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      out.push([key, String(value)])
    } else if (Array.isArray(value)) {
      // A router that parsed `?label=a&label=b` into a list.
      out.push([key, value.map((v) => escapeValue(String(v))).join(',')])
    }
  }
  return out
}

/** The filters a URL's params name, for the given fields; `null` when it names none, so the
 *  remembered filters apply. A plain `key=value` is `is`, so links made before conditions
 *  existed keep working. Params of no field are left for the host. */
export function decodeFilters(
  search: SearchInput,
  fields: readonly AnyField[],
): ActiveFilter[] | null {
  const byKey = new Map(fields.map((f) => [f.key, f]))
  const out: ActiveFilter[] = []
  const dates = new Map<string, { after?: string; before?: string }>()
  let found = false
  for (const [rawKey, raw] of entriesOf(search)) {
    // Longest suffix first, so `!~` isn't read as `!`.
    const suffix = ['!~', '!', '*', '>', '<', '~'].find(
      (s) => rawKey.endsWith(s) && byKey.has(rawKey.slice(0, -s.length)),
    )
    const key = suffix ? rawKey.slice(0, -suffix.length) : rawKey
    const field = byKey.get(key)
    if (!field) {
      continue
    }
    found = true
    if (raw === SET && (suffix === undefined || suffix === '!')) {
      out.push({ field: key, op: suffix ? 'isNotSet' : 'isSet', values: [] })
      continue
    }
    if (suffix === '>' || suffix === '<') {
      const entry = dates.get(key) ?? {}
      entry[suffix === '>' ? 'after' : 'before'] = unescapeValue(raw)
      if (!dates.has(key)) {
        dates.set(key, entry)
        out.push({ field: key, op: 'after', values: [] })
      }
      continue
    }
    const op: FilterOperator =
      suffix === '!'
        ? 'isNot'
        : suffix === '*'
          ? 'includesAll'
          : suffix === '~'
            ? 'contains'
            : suffix === '!~'
              ? 'notContains'
              : field.kind === 'text'
                ? 'contains'
                : 'is'
    out.push({ field: key, op, values: splitValues(raw) })
  }
  const resolved = out.map((f): ActiveFilter => {
    const range = dates.get(f.field)
    if (!range || f.op !== 'after' || f.values.length) {
      return f
    }
    if (range.after && range.before) {
      return { field: f.field, op: 'between', values: [range.after, range.before] }
    }
    return range.after
      ? { field: f.field, op: 'after', values: [range.after] }
      : { field: f.field, op: 'before', values: [range.before ?? ''] }
  })
  return found ? resolved : null
}

/** Every param a field could use, so a host can drop stale ones before writing new. */
export function filterParamKeys(fields: readonly AnyField[]): string[] {
  return fields.flatMap((f) => ['', '!', '*', '>', '<', '~', '!~'].map((s) => `${f.key}${s}`))
}

/** A URL's params with the fields' params replaced by these filters, other params kept. */
export function withFilterParams<S extends Record<string, unknown>>(
  search: S,
  filters: readonly ActiveFilter[],
  fields: readonly AnyField[],
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...search }
  for (const key of filterParamKeys(fields)) {
    delete next[key]
  }
  return { ...next, ...encodeFilters(filters) }
}

// --- Dates -----------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, '0')
/** A local day as `yyyy-MM-dd`. */
export const toDay = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

/** The local day a `yyyy-MM-dd` value names. */
export function parseDay(value: string | undefined): Date | undefined {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) {
    return undefined
  }
  const [, y, m, d] = match.map(Number) as [number, number, number, number]
  const date = new Date(y, m - 1, d)
  return Number.isNaN(date.getTime()) ? undefined : date
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)

export function isDatePreset(value: string | undefined): value is DatePreset {
  return (DATE_PRESETS as readonly string[]).includes(value ?? '') || /^-\d+d$/.test(value ?? '')
}

/** The days a preset or a day covers, as `[first, last]` local days, both included. */
function presetDays(value: string, now: Date): [Date, Date] | undefined {
  const today = startOfDay(now)
  if (value === 'today') {
    return [today, today]
  }
  if (value === 'month') {
    return [new Date(today.getFullYear(), today.getMonth(), 1), today]
  }
  const days = value.match(/^-(\d+)d$/)
  if (days) {
    return [addDays(today, 1 - Number(days[1])), today]
  }
  const day = parseDay(value)
  return day ? [day, day] : undefined
}

/** The span a date filter covers right now: `from` included, `to` excluded (the start of the
 *  day after the last), either open. Relative presets resolve against `now`. */
export function dateFilterRange(
  filter: ActiveFilter,
  now: Date = new Date(),
): { from?: Date; to?: Date } | undefined {
  const [first, second] = filter.values
  const days = (v: string | undefined) => (v ? presetDays(v, now) : undefined)
  switch (filter.op) {
    case 'is': {
      const span = days(first)
      return span && { from: span[0], to: addDays(span[1], 1) }
    }
    case 'after': {
      const span = days(first)
      return span && { from: span[0] }
    }
    case 'before': {
      const span = days(first)
      return span && { to: addDays(span[1], 1) }
    }
    case 'between': {
      const a = days(first)
      const b = days(second)
      return a && b ? { from: a[0], to: addDays(b[1], 1) } : undefined
    }
    default:
      return undefined
  }
}

// --- Matching --------------------------------------------------------------

const isEmpty = (v: FilterRowValue) =>
  v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)

const asList = (v: FilterRowValue): string[] =>
  isEmpty(v) ? [] : Array.isArray(v) ? [...v] : [String(v)]

function asTime(v: FilterRowValue): number | undefined {
  if (v instanceof Date) {
    return v.getTime()
  }
  if (typeof v === 'number') {
    return v
  }
  if (typeof v === 'string' && v) {
    const day = parseDay(v)
    const t = day ? day.getTime() : Date.parse(v)
    return Number.isNaN(t) ? undefined : t
  }
  return undefined
}

/** Whether a row passes one filter, through the field's `matches` or its `value`. A field
 *  with neither passes every row: the host filters it on the server. */
export function matchFilter<T>(
  field: FilterField<T>,
  filter: ActiveFilter,
  row: T,
  now?: Date,
): boolean {
  if (field.matches) {
    return field.matches(row, filter)
  }
  if (!field.value) {
    return true
  }
  const v = field.value(row)
  switch (filter.op) {
    case 'isSet':
      return !isEmpty(v)
    case 'isNotSet':
      return isEmpty(v)
    case 'contains':
    case 'notContains': {
      const needle = (filter.values[0] ?? '').toLocaleLowerCase()
      const has = asList(v).some((s) => s.toLocaleLowerCase().includes(needle))
      return filter.op === 'contains' ? has : !has
    }
    case 'includesAll': {
      const held = asList(v)
      return filter.values.every((x) => held.includes(x))
    }
    case 'isNot':
      return !asList(v).some((x) => filter.values.includes(x))
    default:
      break
  }
  if (field.kind === 'date') {
    const range = dateFilterRange(filter, now)
    const t = asTime(v)
    if (!range || t === undefined) {
      return range === undefined
    }
    return (
      (range.from === undefined || t >= range.from.getTime()) &&
      (range.to === undefined || t < range.to.getTime())
    )
  }
  if (field.kind === 'boolean') {
    return String(Boolean(v)) === (filter.values[0] ?? 'true')
  }
  return asList(v).some((x) => filter.values.includes(x))
}

/** Rows passing every complete filter. */
export function applyFilterList<T>(
  rows: readonly T[],
  filters: readonly ActiveFilter[],
  fields: readonly FilterField<T>[],
  now: Date = new Date(),
): T[] {
  const checks = filters.flatMap((filter) => {
    const field = fields.find((f) => f.key === filter.field)
    return field && isComplete(filter) ? [{ field, filter }] : []
  })
  if (checks.length === 0) {
    return [...rows]
  }
  return rows.filter((row) =>
    checks.every(({ field, filter }) => matchFilter(field, filter, row, now)),
  )
}

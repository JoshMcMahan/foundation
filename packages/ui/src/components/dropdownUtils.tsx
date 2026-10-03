import type React from 'react'
import { CaretDownIcon } from '../icons'

export interface IOptions<T = unknown> {
  label: string
  value: T
  secondaryValue?: unknown | undefined
  disabled?: boolean | undefined
  icon?: React.ReactNode | undefined
  description?: string | undefined
  /** Hidden behind the category's toggle row until the category is expanded. */
  collapsible?: boolean | undefined
  /** Always listed regardless of the typed query (e.g. a trailing "Create new…" action). */
  pinned?: boolean | undefined
}

export interface ICategory<T = unknown> {
  category?: string | undefined
  options: IOptions<T>[]
}

export function isCategory<T>(option: ICategory<T> | IOptions<T> | string): option is ICategory<T> {
  return typeof option === 'object' && option !== null && 'options' in option
}

export function isOption<T>(option: ICategory<T> | IOptions<T> | string): option is IOptions<T> {
  return (
    typeof option === 'object' && 'label' in option && 'value' in option && !('category' in option)
  )
}

function normalizeOption<T>(
  option: ICategory<T> | IOptions<T> | string,
): IOptions<T> | ICategory<T> {
  if (typeof option === 'string') {
    return { label: option, value: option as unknown as T }
  }
  if (typeof option === 'object' && option !== null && 'options' in option) {
    return {
      category: option.category,
      options: Array.isArray(option.options) ? option.options : [],
    }
  }
  return option
}

export function flattenOptions<T>(
  options: (ICategory<T> | IOptions<T> | string)[],
): (IOptions<T> | ICategory<T>)[] {
  const result: (IOptions<T> | ICategory<T>)[] = []
  for (const opt of options) {
    const normalized = normalizeOption(opt)
    if (isCategory(normalized)) {
      const children = Array.isArray(normalized.options) ? normalized.options : []
      result.push(normalized)
      result.push(...children)
    } else {
      result.push(normalized)
    }
  }
  return result
}

// Hyphens are ignored so "us-east" and "useast" match each other.
const normalizeForMatch = (text: unknown) => String(text).toLowerCase().replace(/-/g, '')

export function filterOption<T>(option: IOptions<T>, query: string): boolean {
  if (query === '') {
    return true
  }
  const q = normalizeForMatch(query)
  return (
    normalizeForMatch(option.label ?? '').includes(q) ||
    (option.secondaryValue !== undefined && normalizeForMatch(option.secondaryValue).includes(q))
  )
}

export function toggleSetMember<T>(set: ReadonlySet<T>, member: T): Set<T> {
  const next = new Set(set)
  if (next.has(member)) {
    next.delete(member)
  } else {
    next.add(member)
  }
  return next
}

export type FlatDisplayOption = IOptions & {
  category?: boolean
  /** Set on a category's toggle row to the category it expands/collapses. */
  toggle?: string
}

function collapsedCategoryRows(
  category: string,
  filtered: IOptions[],
  collapsibleCount: number,
  expanded: boolean,
  collapsedLabel: (count: number) => string,
): FlatDisplayOption[] {
  const rows: FlatDisplayOption[] = []
  let togglePlaced = false
  for (const opt of filtered) {
    if (!opt.collapsible) {
      rows.push(opt)
      continue
    }
    if (!togglePlaced) {
      togglePlaced = true
      rows.push({
        label: collapsedLabel(collapsibleCount),
        value: `__toggle__:${category}`,
        disabled: true,
        toggle: category,
      })
    }
    if (expanded) {
      rows.push(opt)
    }
  }
  return rows
}

// The combobox renders a virtual list, so categories flatten into disabled
// header rows followed by their (query-filtered) members; a category whose
// members all miss the query disappears entirely. A query also bypasses
// collapsing so matches never hide behind a toggle row.
export function flattenDisplayOptions({
  options,
  query,
  expandedCategories,
  collapsedLabel,
  selectedValue,
  allowCustomValue,
  customValueLabel,
}: {
  options: (ICategory | IOptions)[]
  query: string
  expandedCategories?: ReadonlySet<string>
  collapsedLabel?: (count: number) => string
  selectedValue?: unknown
  allowCustomValue?: boolean
  customValueLabel?: string
}): FlatDisplayOption[] {
  const flatOptions: FlatDisplayOption[] = options.flatMap((option) => {
    if (!isCategory(option)) {
      return option.pinned || filterOption(option, query) ? [option] : []
    }
    const filtered = option.options.filter((opt) => filterOption(opt, query))
    if (filtered.length === 0) {
      return []
    }
    const category = option.category || ''
    const header: FlatDisplayOption = {
      label: category,
      value: category,
      disabled: true,
      category: true,
    }
    const collapsibleCount = filtered.filter((o) => o.collapsible).length
    if (query || collapsibleCount === 0 || !collapsedLabel) {
      return [header, ...filtered]
    }
    return [
      header,
      ...collapsedCategoryRows(
        category,
        filtered,
        collapsibleCount,
        expandedCategories?.has(category) ?? false,
        collapsedLabel,
      ),
    ]
  })
  if (allowCustomValue) {
    const customValue = query || selectedValue || ''
    flatOptions.unshift({
      label: `${customValueLabel} "${customValue}"`,
      value: customValue,
    })
  } else if (flatOptions.length === 0) {
    return [{ label: 'No options found', value: '', disabled: true }]
  }
  return flatOptions
}

export function DropdownCaret() {
  return (
    <CaretDownIcon className="text-neutral-400 absolute top-1/2 -translate-y-1/2 right-0 mr-3 inset-y-0 flex items-center rounded-r-md focus:outline-hidden" />
  )
}

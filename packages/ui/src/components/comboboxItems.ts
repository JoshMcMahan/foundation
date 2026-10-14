import type { ReactNode } from 'react'

export interface ComboboxItem<Value = string> {
  value: Value
  label: string
  description?: string | undefined
  icon?: ReactNode
  disabled?: boolean | undefined
}

export interface ComboboxGroup<Value = string> {
  label: string
  /** Leads the heading, such as a provider's logo. */
  icon?: ReactNode
  /** Follows the label, such as who shared the group or a status like "Not responding". */
  description?: string | undefined
  /** Empty for a group that only reports a status; a search finds it by its heading. */
  items: readonly ComboboxLeaf<Value>[]
}

/** One item: an option, or a bare string labeled by its value. */
export type ComboboxLeaf<Value = string> = ComboboxItem<Value> | (Value & string)

/** Items, groups under headings, or both: items between groups list where they sit, without a heading. */
export type ComboboxItems<Value = string> = readonly (ComboboxLeaf<Value> | ComboboxGroup<Value>)[]

export function isComboboxGroup<Value>(
  item: ComboboxLeaf<Value> | ComboboxGroup<Value>,
): item is ComboboxGroup<Value> {
  return typeof item === 'object' && 'items' in item
}

/** Every item, out of their groups. */
export function comboboxLeaves<Value>(items: ComboboxItems<Value>): ComboboxLeaf<Value>[] {
  return items.flatMap((item) => (isComboboxGroup(item) ? item.items : [item]))
}

import type { ReactNode } from 'react'
import { cx } from '../cx'
import { panelItemClassName } from './floating'

/** An option's row in a Select's or a Combobox's list, so both lists look alike: the icon, the
 *  label over its description, and the check at the end. */
export const pickerItemClassName = cx(panelItemClassName, 'data-selected:font-medium')

/** An option of a Select or a Combobox. */
export interface ComboboxItem<Value = string> {
  value: Value
  label: string
  description?: string | undefined
  /** Read after the label in place of `description`, for what the row shows in more than
   *  words, such as a count and a status: "24 members, synced". */
  accessibleDescription?: string | undefined
  icon?: ReactNode
  /** Beside the label, such as a tag that marks the option out. */
  badge?: ReactNode
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

/** How an option is named and described: by its label, with its description read after it. */
export function optionNaming(
  id: string,
  item: Pick<ComboboxItem<unknown>, 'description' | 'accessibleDescription'>,
) {
  return {
    'aria-labelledby': `${id}label`,
    'aria-describedby':
      item.accessibleDescription || item.description ? `${id}description` : undefined,
  }
}

export function isComboboxGroup<Value>(
  item: ComboboxLeaf<Value> | ComboboxGroup<Value>,
): item is ComboboxGroup<Value> {
  return typeof item === 'object' && 'items' in item
}

/** Every item, out of their groups. */
export function comboboxLeaves<Value>(items: ComboboxItems<Value>): ComboboxLeaf<Value>[] {
  return items.flatMap((item) => (isComboboxGroup(item) ? item.items : [item]))
}

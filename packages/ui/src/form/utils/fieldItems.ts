import { dequal } from 'dequal'
import type { ReactNode } from 'react'
import {
  type ComboboxItem,
  type ComboboxItems,
  type ComboboxLeaf,
  comboboxLeaves,
} from '../../components/comboboxItems'

/** A choice as workflow YAML writes it, or as a host's option hook builds one. */
export interface FieldOptionItem<Value = string> {
  label: string
  value: Value
  description?: string | undefined
  /** The older key for description. */
  secondaryLabel?: string | undefined
  /** What choosing this sets the field's `secondaryField` to. */
  secondaryValue?: unknown
  disabled?: boolean | undefined
  icon?: ReactNode
}

/** Choices under a heading. */
export interface FieldOptionGroup<Value = string> {
  category?: string | undefined
  options: readonly (FieldOptionItem<Value> | string)[]
}

/** A dropdown option: a bare string is a choice labelled by its value. */
export type FieldOption<Value = string> = string | FieldOptionItem<Value> | FieldOptionGroup<Value>

/** A picker item that also sets other fields when chosen, through `secondaryField`. */
export type ChoiceItem<Value = unknown> = ComboboxItem<Value> & { secondaryValue?: unknown }

const isGroup = <Value>(option: FieldOption<Value>): option is FieldOptionGroup<Value> =>
  typeof option === 'object' && 'options' in option

function toItem<Value>(option: FieldOptionItem<Value> | string): ChoiceItem<Value> | string {
  if (typeof option === 'string') {
    return option
  }
  const { label, value, description, secondaryLabel, secondaryValue, disabled, icon } = option
  return {
    label,
    value,
    description: description ?? secondaryLabel,
    disabled,
    icon,
    ...(secondaryValue === undefined ? {} : { secondaryValue }),
  }
}

/** Options as picker items, groups kept where they sit. */
export function toFieldItems<Value>(options: readonly FieldOption<Value>[]): ComboboxItems<Value> {
  return options.map((option) =>
    isGroup(option)
      ? { label: option.category ?? '', items: option.options.map(toItem) as ComboboxLeaf<Value>[] }
      : (toItem(option) as ComboboxLeaf<Value>),
  )
}

/** Every item, groups flattened. */
export const leaves = (items: ComboboxItems<unknown>) =>
  comboboxLeaves(items) as (ChoiceItem | string)[]

export const itemValue = (item: ChoiceItem | string) =>
  typeof item === 'string' ? item : item.value

/** The item among `items` holding `value`, with what it sets through `secondaryField`. */
export function findChoice(items: ComboboxItems<unknown>, value: unknown): ChoiceItem | undefined {
  return leaves(items).find(
    (item): item is ChoiceItem => typeof item === 'object' && dequal(item.value, value),
  )
}

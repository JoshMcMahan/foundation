import type { ComboboxItem } from '../../components/Combobox'

/** A dropdown option as workflow YAML writes it. */
export type FieldOption<Value = string> =
  | string
  | { label: string; value: Value; description?: string; secondaryLabel?: string }

/** YAML options as picker items. secondaryLabel is the older key for description. */
export function toFieldItems<Value>(
  options: readonly FieldOption<Value>[],
): (ComboboxItem<Value> | string)[] {
  return options.map((option) =>
    typeof option === 'string'
      ? option
      : {
          label: option.label,
          value: option.value,
          description: option.description ?? option.secondaryLabel,
        },
  )
}

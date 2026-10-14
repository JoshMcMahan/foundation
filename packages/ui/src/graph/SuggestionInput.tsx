import { Autocomplete, type AutocompleteProps, type ComboboxItem } from '../components/Combobox'

/** A value a typed field offers, with what it means. */
export interface Suggestion {
  value: string
  label?: string | undefined
}

/** A labeled suggestion shows its meaning, with the value it writes beneath. */
export function suggestionItems(suggestions: Suggestion[]): ComboboxItem[] {
  return suggestions.map(({ value, label }) =>
    label ? { value, label, description: value } : { value, label: value },
  )
}

/** A field that takes any typed value, offering `suggestions` as it's typed. */
export function SuggestionInput({
  suggestions,
  ...props
}: Omit<AutocompleteProps, 'items' | 'defaultValue'> & {
  suggestions: Suggestion[]
}) {
  return <Autocomplete {...props} items={suggestionItems(suggestions)} />
}

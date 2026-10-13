import { Autocomplete, type AutocompleteProps, type ComboboxItem } from '../components/Combobox'

/** A value a typed field offers, with what it means. */
export interface Suggestion {
  value: string
  label?: string | undefined
}

/** A labelled suggestion shows its meaning, with the value it writes beneath. */
export function suggestionItems(suggestions: Suggestion[]): ComboboxItem[] {
  return suggestions.map(({ value, label }) =>
    label ? { value, label, description: value } : { value, label: value },
  )
}

// Input's box, so a field with suggestions sits level with the text fields beside it.
export const FIELD_TEXT_BOX = 'py-3 pl-4 rounded-lg text-sm !bg-[var(--theme-muted-panel-bg)]'

/** A field that takes any typed value, offering `suggestions` as it's typed. */
export function SuggestionInput({
  suggestions,
  ...props
}: Omit<AutocompleteProps, 'items' | 'className' | 'defaultValue'> & {
  suggestions: Suggestion[]
}) {
  return <Autocomplete {...props} className={FIELD_TEXT_BOX} items={suggestionItems(suggestions)} />
}

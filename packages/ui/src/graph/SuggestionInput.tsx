import cx from 'classnames'
import Dropdown, { type IProps as DropdownProps } from '../components/Dropdown'
import type { IOptions } from '../components/dropdownUtils'

/** A value a typed field offers, with what it means. */
export interface Suggestion {
  value: string
  label?: string | undefined
}

export function suggestionOptions(suggestions: Suggestion[]): (IOptions | string)[] {
  return suggestions.map(({ value, label }) =>
    label ? { label, value, description: value } : value,
  )
}

// Input's box, so a field with suggestions sits level with the text fields beside it.
export const FIELD_TEXT_BOX = 'py-3 pl-4 rounded-lg text-sm !bg-[var(--theme-muted-panel-bg)]'

/**
 * The dropdown for a field that takes any typed value as well as the ones it offers. Any of
 * the dropdown's own props can still be passed, such as `allowCustomValue={false}`.
 */
export function SuggestionInput({
  value,
  onChange,
  suggestions,
  allowCustomValue = true,
  ...props
}: Omit<DropdownProps, 'options' | 'value' | 'onChange'> & {
  value: string
  onChange: (value: string) => void
  suggestions: Suggestion[]
}) {
  return (
    <Dropdown
      showCaret={suggestions.length > 0}
      {...props}
      textBoxClassName={cx(FIELD_TEXT_BOX, props.textBoxClassName)}
      allowCustomValue={allowCustomValue}
      value={value}
      options={suggestionOptions(suggestions)}
      onChange={(next) => onChange(next === undefined ? '' : String(next))}
    />
  )
}

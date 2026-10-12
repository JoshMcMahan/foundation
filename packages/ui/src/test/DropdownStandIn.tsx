import type { IProps } from '../components/Dropdown'

// Dropdown's virtual list draws nothing in jsdom, so tests read this one's options through
// aria-controls instead.
export default function Dropdown({
  options,
  value,
  onChange,
  ariaLabel,
  id,
  placeholder,
  disabled,
  'aria-describedby': describedBy,
}: IProps) {
  const all = options.flatMap((option) =>
    typeof option === 'string'
      ? [{ label: option, value: option }]
      : 'options' in option
        ? option.options
        : [option],
  )
  const listId = `${id ?? ariaLabel ?? 'field'}-options`
  const picked = all.find((option) => option.value === value)
  return (
    <>
      <input
        role="combobox"
        aria-expanded={false}
        aria-label={ariaLabel}
        id={id}
        aria-describedby={describedBy}
        aria-controls={listId}
        placeholder={placeholder}
        disabled={disabled}
        value={picked?.label ?? String(value ?? '')}
        onChange={(e) => onChange(e.target.value)}
      />
      <div id={listId} role="listbox" hidden>
        {all.map((option) => (
          <div
            key={String(option.value)}
            role="option"
            tabIndex={-1}
            aria-selected={false}
            data-value={String(option.value)}
            data-label={option.label === option.value ? undefined : option.label}
          />
        ))}
      </div>
    </>
  )
}

/** The options this stand-in lists for a field, read through its aria-controls. */
export function suggestionsOf(input: HTMLElement) {
  const list = document.getElementById(input.getAttribute('aria-controls') ?? '')
  return [...(list?.querySelectorAll('[role="option"]') ?? [])].map((option) => ({
    value: option.getAttribute('data-value') ?? '',
    label: option.getAttribute('data-label') ?? '',
  }))
}

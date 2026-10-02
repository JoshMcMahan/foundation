import cx from 'classnames'

/** A labeled + described radio option row, used inside a SettingsCard to pick
 * between modes (e.g. default vs custom). Stacked rows share the card's
 * dividers via `isFirst`. */
export function SettingModeOption({
  name,
  checked,
  onSelect,
  label,
  description,
  isFirst,
  disabled,
}: {
  /** Radio group name; shared across the options of one picker. */
  name: string
  checked: boolean
  onSelect: () => void
  label: string
  description: string
  isFirst?: boolean
  disabled?: boolean
}) {
  return (
    <label
      className={cx(
        'flex items-start gap-3 px-5 py-4',
        disabled ? 'cursor-default opacity-60' : 'cursor-pointer',
        !isFirst && 'border-t theme-border',
      )}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onSelect}
        disabled={disabled}
        className="mt-0.5 w-4 h-4 theme-input shrink-0"
      />
      <div className="min-w-0">
        <div className="font-semibold theme-text leading-tight">{label}</div>
        <div className="theme-muted-text text-xs leading-snug mt-0.5">{description}</div>
      </div>
    </label>
  )
}

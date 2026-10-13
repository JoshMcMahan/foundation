import { clsx as cx } from 'clsx'
import { Radio } from './Radio'

/** A labeled + described choice in a SettingsCard, picking between modes (e.g.
 * default vs custom). Stack them in a `RadioGroup`, which holds the value;
 * stacked rows share the card's dividers via `isFirst`. */
export function SettingModeOption({
  value,
  label,
  description,
  isFirst,
  disabled,
}: {
  value: string
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
      <Radio value={value} disabled={disabled} className="mt-0.5" />
      <div className="min-w-0">
        <div className="font-semibold theme-text leading-tight">{label}</div>
        <div className="theme-muted-text text-xs leading-snug mt-0.5">{description}</div>
      </div>
    </label>
  )
}

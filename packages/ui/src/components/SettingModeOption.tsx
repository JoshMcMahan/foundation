import { cx } from '../cx'
import { Radio } from './Radio'

/** A named and described choice in a SettingsCard, picking between modes such
 *  as default or custom. Stack them in a `RadioGroup`, which holds the value. */
export function SettingModeOption({
  value,
  label,
  description,
  disabled,
}: {
  value: string
  label: string
  description: string
  disabled?: boolean
}) {
  return (
    <label
      className={cx(
        'flex items-start gap-3 px-5 py-4',
        disabled ? 'cursor-default opacity-60' : 'cursor-pointer',
        'border-t border-(--theme-border) first:border-t-0',
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

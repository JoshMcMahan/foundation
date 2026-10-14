import { useId } from 'react'
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
  disabled?: boolean | undefined
}) {
  const id = useId()
  return (
    <label
      className={cx(
        'flex items-start gap-3 px-5 py-4',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
        'border-t border-(--theme-border) first:border-t-0',
      )}
    >
      {/* Named by the label alone, with the description read after it, rather than both as one name. */}
      <Radio
        value={value}
        disabled={disabled}
        aria-labelledby={`${id}label`}
        aria-describedby={`${id}description`}
        className="mt-0.5"
      />
      <div className="min-w-0">
        <div id={`${id}label`} className="font-semibold theme-text leading-tight">
          {label}
        </div>
        <div id={`${id}description`} className="theme-muted-text text-xs leading-snug mt-0.5">
          {description}
        </div>
      </div>
    </label>
  )
}

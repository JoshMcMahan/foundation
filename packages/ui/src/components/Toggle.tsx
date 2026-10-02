import cx from 'classnames'

export function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  label?: string
}) {
  return (
    <label
      role="none"
      onClick={(e) => e.stopPropagation()}
      className={cx(
        'relative inline-flex items-center',
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
      )}
    >
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        aria-label={label}
      />
      <div className='h-6 w-11 rounded-full bg-(--theme-muted-panel-bg) transition-colors peer-checked:bg-(--theme-element) peer-focus-visible:ring-2 peer-focus-visible:ring-[color-mix(in_srgb,var(--theme-element)_25%,transparent)] after:absolute after:start-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow-sm after:transition-transform after:content-[""] motion-reduce:after:transition-none peer-checked:after:translate-x-5' />
    </label>
  )
}

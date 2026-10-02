import cx from 'classnames'
import type React from 'react'

interface SwitchToggleSmallProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'value'> {
  value?: boolean
}

export default function SwitchToggleSmall({
  value = false,
  disabled = false,
  className,
  ...buttonProps
}: SwitchToggleSmallProps) {
  return (
    <button
      disabled={disabled}
      {...buttonProps}
      role="switch"
      aria-checked={value}
      className={cx(
        'relative w-11 h-6 rounded-full transition-colors duration-400 ease-in-out',
        'before:content-[""] before:absolute before:w-4 before:h-4 before:top-1 before:left-1',
        'before:bg-white before:rounded-full before:transition-transform before:duration-400 before:ease-in-out',
        disabled ? 'bg-(--theme-border) cursor-not-allowed' : 'cursor-pointer',
        !disabled && value ? 'bg-(--theme-element) before:translate-x-5' : 'bg-(--theme-border)',
        className,
      )}
    />
  )
}

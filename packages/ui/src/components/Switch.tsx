import { Switch as BaseSwitch } from '@base-ui/react/switch'
import { clsx as cx } from 'clsx'

const sizes = {
  sm: { root: 'h-5 w-9', thumb: 'size-4 data-checked:translate-x-4' },
  md: { root: 'h-6 w-11', thumb: 'size-5 data-checked:translate-x-5' },
}

export interface SwitchProps extends Omit<BaseSwitch.Root.Props, 'className' | 'children'> {
  size?: keyof typeof sizes
  className?: string | undefined
}

/**
 * An on/off control. Name it with an enclosing `<label>`, or `aria-label`. A
 * sibling `<label htmlFor>` needs `nativeButton render={<button />}`, which
 * puts the id on the button the label points at.
 */
export function Switch({ size = 'md', className, ...props }: SwitchProps) {
  return (
    <BaseSwitch.Root
      {...props}
      className={cx(
        'inline-flex shrink-0 items-center rounded-full p-0.5 bg-(--theme-border) transition-colors duration-200 cursor-pointer outline-none',
        'data-checked:bg-(--theme-element)',
        'focus-visible:ring-2 focus-visible:ring-(--theme-focus-ring) aria-invalid:ring-2 aria-invalid:ring-(--theme-error)',
        'data-disabled:cursor-not-allowed data-disabled:opacity-50',
        sizes[size].root,
        className,
      )}
    >
      <BaseSwitch.Thumb
        className={cx(
          'rounded-full bg-white shadow-sm transition-transform duration-200',
          sizes[size].thumb,
        )}
      />
    </BaseSwitch.Root>
  )
}

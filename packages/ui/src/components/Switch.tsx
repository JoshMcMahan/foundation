import { Switch as BaseSwitch } from '@base-ui/react/switch'
import { cx } from '../cx'

const sizes = {
  sm: { root: 'h-5 w-9', thumb: 'size-4 data-checked:translate-x-4' },
  md: { root: 'h-6 w-11', thumb: 'size-5 data-checked:translate-x-5' },
}

export interface SwitchProps extends Omit<BaseSwitch.Root.Props, 'className' | 'children'> {
  size?: keyof typeof sizes
  className?: string | undefined
  /** The on state's own name, such as "Enabled", shown beside the switch while it's on. */
  onLabel?: string | undefined
  /** The off state's own name, shown beside the switch while it's off. */
  offLabel?: string | undefined
}

/**
 * An on/off control. Name it with an enclosing `<label>`, or `aria-label`. A
 * sibling `<label htmlFor>` needs `nativeButton render={<button />}`, which
 * puts the id on the button the label points at.
 */
export function Switch({ size = 'md', className, onLabel, offLabel, ...props }: SwitchProps) {
  const control = (
    <BaseSwitch.Root
      {...props}
      className={cx(
        'peer inline-flex shrink-0 items-center rounded-full p-0.5 bg-(--theme-border) transition-colors duration-200 cursor-pointer outline-none',
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
  if (onLabel === undefined && offLabel === undefined) {
    return control
  }
  // The switch announces its state already; the name repeats it for sight, following the
  // switch's own data-checked so it holds controlled or not.
  return (
    <span className="inline-flex items-center gap-2 text-sm text-(--theme-app)">
      {control}
      <span aria-hidden="true" className="peer-data-checked:hidden">
        {offLabel}
      </span>
      <span aria-hidden="true" className="hidden peer-data-checked:inline">
        {onLabel}
      </span>
    </span>
  )
}

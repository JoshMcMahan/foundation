import { Switch as BaseSwitch } from '@base-ui/react/switch'
import { cx } from '../cx'
import { useFieldControlId } from './Field'
import { focusOutline } from './fieldBox'

const sizes = {
  // The thumb slides toward the end of the line, which is the left in a right-to-left page.
  sm: {
    root: 'h-5 w-9',
    thumb: 'size-4 data-checked:translate-x-4 rtl:data-checked:-translate-x-4',
  },
  md: {
    root: 'h-6 w-11',
    thumb: 'size-5 data-checked:translate-x-5 rtl:data-checked:-translate-x-5',
  },
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
  const id = useFieldControlId(props.id)
  const control = (
    <BaseSwitch.Root
      {...props}
      id={id}
      className={cx(
        // The off track takes the control edge, which holds 3:1 against the page and keeps the
        // white thumb showing on it. On, the track fills with the focus color: the accent as
        // picked, or, for an accent too pale for the page, one solved darker than the off track,
        // so on always reads as the heavier state.
        'peer inline-flex shrink-0 items-center rounded-full p-0.5 bg-(--theme-border-strong) transition-colors duration-200 cursor-pointer motion-reduce:transition-none',
        'data-checked:bg-(--theme-focus)',
        focusOutline,
        'aria-invalid:ring-2 aria-invalid:ring-(--theme-error)',
        'data-disabled:cursor-not-allowed data-disabled:opacity-50',
        sizes[size].root,
        className,
      )}
    >
      <BaseSwitch.Thumb
        className={cx(
          'rounded-full bg-white shadow-sm transition-transform duration-200 motion-reduce:transition-none',
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

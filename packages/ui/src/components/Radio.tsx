import { Radio as BaseRadio } from '@base-ui/react/radio'
import { cx } from '../cx'
import { focusOutline } from './fieldBox'

export { RadioGroup } from '@base-ui/react/radio-group'

export interface RadioProps<Value> extends Omit<BaseRadio.Root.Props<Value>, 'className'> {
  className?: string | undefined
}

/** One choice in a `RadioGroup`, which holds the value. Name it with an
 *  enclosing `<label>`, or a `FieldOption` inside a `Field`. */
export function Radio<Value>({ className, ...props }: RadioProps<Value>) {
  return (
    <BaseRadio.Root
      {...props}
      className={cx(
        'flex size-4 shrink-0 items-center justify-center rounded-full border border-(--theme-border-strong) bg-(--theme-input-bg) cursor-pointer transition-colors motion-reduce:transition-none',
        focusOutline,
        'data-checked:border-(--theme-accent) data-checked:bg-(--theme-accent)',
        'aria-invalid:border-(--theme-error)',
        'data-disabled:cursor-not-allowed data-disabled:opacity-50',
        className,
      )}
    >
      <BaseRadio.Indicator className="size-1.5 rounded-full bg-(--theme-accent-text)" />
    </BaseRadio.Root>
  )
}

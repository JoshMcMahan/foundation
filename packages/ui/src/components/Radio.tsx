import { Radio as BaseRadio } from '@base-ui/react/radio'
import { clsx as cx } from 'clsx'

export { RadioGroup } from '@base-ui/react/radio-group'

export interface RadioProps<Value> extends Omit<BaseRadio.Root.Props<Value>, 'className'> {
  className?: string | undefined
}

/** One choice in a `RadioGroup`, which holds the value. Name it with an
 *  enclosing `<label>`. */
export function Radio<Value>({ className, ...props }: RadioProps<Value>) {
  return (
    <BaseRadio.Root
      {...props}
      className={cx(
        'flex size-4 shrink-0 items-center justify-center rounded-full border border-(--theme-border) bg-(--theme-input-bg) cursor-pointer outline-none transition-colors',
        'data-checked:border-(--theme-element) data-checked:bg-(--theme-element)',
        'focus-visible:ring-2 focus-visible:ring-(--theme-focus-ring) aria-invalid:border-(--theme-error)',
        'data-disabled:cursor-not-allowed data-disabled:opacity-50',
        className,
      )}
    >
      <BaseRadio.Indicator className="size-1.5 rounded-full bg-(--theme-element-text)" />
    </BaseRadio.Root>
  )
}

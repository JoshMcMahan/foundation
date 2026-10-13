import { Checkbox as BaseCheckbox } from '@base-ui/react/checkbox'
import { cx } from '../cx'
import { CheckIcon, MinusIcon } from '../icons'

export { CheckboxGroup } from '@base-ui/react/checkbox-group'

export interface CheckboxProps extends Omit<BaseCheckbox.Root.Props, 'className'> {
  className?: string | undefined
}

/** A box that ticks on and off, or shows a mixed state with `indeterminate`. Name it with an
 *  enclosing `<label>`, or `aria-label` when it stands alone, as in a table row. In a
 *  `CheckboxGroup`, `value` identifies it and the group holds which are ticked. */
export function Checkbox({ className, ...props }: CheckboxProps) {
  return (
    <BaseCheckbox.Root
      {...props}
      className={cx(
        'flex size-4 shrink-0 items-center justify-center rounded border border-(--theme-border) bg-(--theme-input-bg) text-(--theme-accent-text) cursor-pointer outline-none transition-colors',
        'data-checked:border-(--theme-accent) data-checked:bg-(--theme-accent)',
        'data-indeterminate:border-(--theme-accent) data-indeterminate:bg-(--theme-accent)',
        'focus-visible:ring-2 focus-visible:ring-(--theme-focus-ring) aria-invalid:border-(--theme-error)',
        'data-disabled:cursor-not-allowed data-disabled:opacity-50',
        className,
      )}
    >
      <BaseCheckbox.Indicator
        className="flex"
        render={(indicatorProps, state) => (
          <span {...indicatorProps}>
            {state.indeterminate ? (
              <MinusIcon aria-hidden="true" className="size-3.5" />
            ) : (
              <CheckIcon aria-hidden="true" className="size-3" />
            )}
          </span>
        )}
      />
    </BaseCheckbox.Root>
  )
}

import { Checkbox as BaseCheckbox } from '@base-ui/react/checkbox'
import { cx } from '../cx'
import { CheckIcon, MinusIcon } from '../icons'
import { focusOutline } from './fieldBox'

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
        // The strong border holds a control's 3:1 against the page, so an empty box still shows.
        'flex size-4 shrink-0 items-center justify-center rounded border border-(--theme-border-strong) bg-(--theme-input-bg) text-(--theme-accent-text) cursor-pointer transition-colors motion-reduce:transition-none',
        focusOutline,
        'data-checked:border-(--theme-accent) data-checked:bg-(--theme-accent)',
        'data-indeterminate:border-(--theme-accent) data-indeterminate:bg-(--theme-accent)',
        'aria-invalid:border-(--theme-error)',
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

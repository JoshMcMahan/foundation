import { Checkbox as BaseCheckbox } from '@base-ui/react/checkbox'
import { cx } from '../cx'
import { CheckIcon, MinusIcon } from '../icons'
import { useFieldControlId, useFieldRequired } from './Field'
import { focusOutline } from './fieldBox'

export { CheckboxGroup } from '@base-ui/react/checkbox-group'

export interface CheckboxProps extends Omit<BaseCheckbox.Root.Props, 'className'> {
  className?: string | undefined
}

/** A box that ticks on and off, or shows a mixed state with `indeterminate`. Name it with an
 *  enclosing `<label>`, or `aria-label` when it stands alone, as in a table row. In a
 *  `CheckboxGroup`, `value` identifies it and the group holds which are ticked. `readOnly`
 *  shows a tick nobody here can change, such as a permission a role grants, filled grey; it
 *  stays focusable, so a tooltip can say what grants it. */
export function Checkbox({ className, ...props }: CheckboxProps) {
  const id = useFieldControlId(props.id)
  const required = useFieldRequired()
  return (
    <BaseCheckbox.Root
      {...props}
      id={id}
      aria-required={props['aria-required'] ?? required}
      className={cx(
        // The control edge holds 3:1 against the page, so an empty box still shows.
        'flex size-4 shrink-0 items-center justify-center rounded border border-(--theme-border-strong) bg-(--theme-input-bg) text-(--theme-accent-text) cursor-pointer transition-colors motion-reduce:transition-none',
        focusOutline,
        // Ticked, it fills with the accent as picked, and its edge takes the focus color, the
        // accent solved to at least 3:1, so a box still shows under an accent too pale for the page.
        'data-checked:border-(--theme-focus) data-checked:bg-(--theme-accent)',
        'data-indeterminate:border-(--theme-focus) data-indeterminate:bg-(--theme-accent)',
        'aria-invalid:border-(--theme-error)',
        'data-disabled:cursor-not-allowed data-disabled:opacity-50',
        // Read-only, it states a fact rather than offering a choice, such as a permission
        // something else grants: grey rather than the accent, at full strength, so it reads
        // apart from a disabled box.
        'data-readonly:cursor-default data-readonly:text-(--theme-app-bg)',
        'data-readonly:data-checked:border-(--theme-muted-text-color) data-readonly:data-checked:bg-(--theme-muted-text-color)',
        'data-readonly:data-indeterminate:border-(--theme-muted-text-color) data-readonly:data-indeterminate:bg-(--theme-muted-text-color)',
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

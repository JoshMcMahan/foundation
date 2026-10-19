import { NumberField } from '@base-ui/react/number-field'
import { cx } from '../cx'
import { ChevronDownIcon, ChevronUpIcon } from '../icons'
import { type FieldBoxSize, fieldBox } from './fieldBox'

export interface NumberInputProps
  extends Omit<NumberField.Root.Props, 'className' | 'children' | 'render'> {
  /** How the value reads in the box: grouping, currency, units, percent. Intl's own options, so
   *  `{ style: 'currency', currency: 'USD' }` or `{ style: 'unit', unit: 'gigabyte' }`. Digits
   *  are kept as typed unless the format limits them, and grouping is off unless it turns it on. */
  format?: Intl.NumberFormatOptions | undefined
  placeholder?: string | undefined
  /** Up and down buttons beside the value. */
  steppers?: boolean | undefined
  autoFocus?: boolean | undefined
  'aria-label'?: string | undefined
  'aria-labelledby'?: string | undefined
  'aria-describedby'?: string | undefined
  'aria-invalid'?: boolean | undefined
  /** Marks the field required for assistive technology without the native check `required` adds. */
  'aria-required'?: boolean | undefined
  /** `sm` for dense places such as toolbars and table cells, `lg` for a form that stands alone,
   *  such as sign-in. */
  size?: FieldBoxSize | undefined
  /** Applied to the box around the input and its steppers, such as a width. */
  className?: string | undefined
}

const stepperClassName =
  'flex flex-1 items-center justify-center px-1 text-(--theme-muted-text-color) hover:text-(--theme-app) cursor-pointer data-disabled:cursor-not-allowed data-disabled:opacity-40'

/** A number field: typing, arrow keys and the steppers move the value within `min` and `max`
 *  by `step`, and `format` shows it as Intl formats it in the reader's locale. The value is a
 *  number, or null while the box is empty. */
export function NumberInput({
  format,
  placeholder,
  steppers = true,
  autoFocus,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-required': ariaRequired,
  size = 'md',
  className,
  ...rootProps
}: NumberInputProps) {
  return (
    <NumberField.Root
      {...rootProps}
      format={{ maximumFractionDigits: 20, useGrouping: false, ...format }}
    >
      <NumberField.Group
        className={cx(fieldBox({ size, within: true, padded: false }), 'relative', className)}
      >
        <NumberField.Input
          placeholder={placeholder}
          autoFocus={autoFocus}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          aria-describedby={ariaDescribedBy}
          aria-invalid={ariaInvalid || undefined}
          aria-required={ariaRequired || undefined}
          data-1p-ignore
          className={cx(
            'h-full w-full min-w-0 bg-transparent tabular-nums outline-none',
            size === 'sm' ? 'px-2' : 'px-3',
            steppers && 'pr-6',
          )}
        />
        {steppers && (
          <div className="absolute inset-y-0 right-0 flex flex-col">
            <NumberField.Increment className={stepperClassName}>
              <ChevronUpIcon aria-hidden="true" className="size-3" />
            </NumberField.Increment>
            <NumberField.Decrement className={stepperClassName}>
              <ChevronDownIcon aria-hidden="true" className="size-3" />
            </NumberField.Decrement>
          </div>
        )}
      </NumberField.Group>
    </NumberField.Root>
  )
}

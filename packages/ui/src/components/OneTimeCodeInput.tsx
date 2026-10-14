import { OTPField } from '@base-ui/react/otp-field'
import { useId } from 'react'
import { cx } from '../cx'
import { type FieldBoxSize, fieldBox } from './fieldBox'
import { useStrings } from './Provider'

export interface OneTimeCodeInputProps
  extends Omit<OTPField.Root.Props, 'className' | 'render' | 'children' | 'length' | 'style'> {
  /** How many characters the code has. */
  length?: number | undefined
  /** `sm` for dense places such as toolbars and table cells. */
  size?: FieldBoxSize | undefined
  'aria-invalid'?: boolean | undefined
  'aria-required'?: boolean | undefined
  /** On the row of boxes: its margin or gap. */
  className?: string | undefined
}

/**
 * A one-time code, such as the six digits of a sign-in check, typed one character to a box. It
 * fills from the browser's or phone's code autofill (`autocomplete="one-time-code"`) and from a
 * paste of the whole code, moves on as each character is typed and back on Backspace, and opens a
 * number pad for a numeric code. The value is the code as one string; `onValueComplete` fires once
 * every box is filled, and `autoSubmit` submits the form then.
 *
 * Name it with a Field or a `<label>` for its `id`, which is the first box's, or with
 * `aria-label`.
 */
export function OneTimeCodeInput({
  length = 6,
  size = 'md',
  className,
  'aria-label': ariaLabel,
  'aria-invalid': ariaInvalid,
  'aria-required': ariaRequired,
  ...rootProps
}: OneTimeCodeInputProps) {
  const t = useStrings().oneTimeCode
  const labelId = useId()
  return (
    <OTPField.Root
      length={length}
      aria-label={ariaLabel}
      {...rootProps}
      className={cx('flex items-center', size === 'sm' ? 'gap-1' : 'gap-2', className)}
    >
      {/* The first box takes the field's label rather than an aria-label of its own, so a
          name given as aria-label reaches it through this. */}
      {ariaLabel && (
        <span id={labelId} hidden>
          {ariaLabel}
        </span>
      )}
      {Array.from({ length }, (_, index) => (
        <OTPField.Input
          // biome-ignore lint/suspicious/noArrayIndexKey: the boxes are positions, fixed by length
          key={index}
          {...(index > 0
            ? { 'aria-label': t.character(index + 1, length) }
            : ariaLabel
              ? { 'aria-labelledby': labelId }
              : {})}
          {...(ariaInvalid && { 'aria-invalid': true })}
          {...(ariaRequired && { 'aria-required': true })}
          className={cx(
            fieldBox({ size }),
            'px-0 text-center font-mono tabular-nums',
            size === 'sm' ? 'w-7' : 'w-9 text-base',
          )}
        />
      ))}
    </OTPField.Root>
  )
}

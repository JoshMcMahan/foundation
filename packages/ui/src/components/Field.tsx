import { Field as BaseField } from '@base-ui/react/field'
import { Fieldset } from '@base-ui/react/fieldset'
import {
  createContext,
  type FocusEvent,
  type KeyboardEvent,
  type OutputHTMLAttributes,
  type ReactNode,
  use,
  useEffect,
  useId,
  useState,
} from 'react'
import { cx } from '../cx'
import { EyeIcon, EyeOffIcon, WarningIcon } from '../icons'
import type { FieldBoxSize } from './fieldBox'
import { focusCameFromKeyboard, trackFocusModality } from './focus'
import { formatInfoTipContent, InfoTip } from './InfoTip'
import { useStrings } from './Provider'
import { RequiredMark } from './RequiredMark'

/** What a field's control takes to be named, described and marked by its field. Spread it
 *  on the control: `{(control) => <input {...control} />}`. */
export interface FieldControlProps {
  id: string
  /** Set for a group, which its legend names rather than a label. */
  'aria-labelledby'?: string | undefined
  'aria-describedby'?: string | undefined
  'aria-invalid'?: true | undefined
  'aria-required'?: true | undefined
}

const ControlContext = createContext<{ control: FieldControlProps; labelId: string } | null>(null)

/** Set by a layout that lines up the fields in a row, as a form's grid does: a stacked field's
 *  label and control take the row's label and control tracks, so controls under labels of
 *  different lengths line up. The layout makes the field's box a subgrid of two rows. */
export const FieldRowContext = createContext(false)

/** The surrounding Field's control props, for a control drawn further down than the Field's
 *  own children. Null outside a Field. */
export function useFieldControl(): FieldControlProps | null {
  return use(ControlContext)?.control ?? null
}

/** The label's id, for a control that isn't a Base UI one and so isn't named by the label's
 *  `for`, such as a button that opens a picker. */
export function useFieldLabelId(): string | undefined {
  return use(ControlContext)?.labelId
}

export type FieldLayout = 'stacked' | 'inline'

export interface FieldProps {
  label: ReactNode
  /** Beside the label and outside it, so it stays out of the control's name, such as a count. For
   *  help text, use `help`. */
  hint?: ReactNode
  /** More about the field, behind a ? beside the label. It is read with the control as part of
   *  its description, so the ? is hidden from assistive technology and Tab passes over it. It
   *  opens on hover or press of the ?, and while the control has keyboard focus, until Escape.
   *  `[text](url)` links and line breaks show as such; a link keeps the ? in the Tab order, as
   *  the keyboard's way to it. */
  help?: string | undefined
  /** Buttons at the far end of the label's row that act on the field, such as one that
   *  switches its control to a typed expression. */
  actions?: ReactNode
  /** Help under the control, read with it. */
  description?: ReactNode
  /** A message under the control. It also marks the control invalid. */
  error?: ReactNode
  /** Marks the control invalid without a message, for one shown elsewhere. */
  invalid?: boolean | undefined
  required?: boolean | undefined
  disabled?: boolean | undefined
  /** `stacked` puts the label above the control. `inline` puts it in a column to the left, as a
   *  form lays out its fields. */
  layout?: FieldLayout | undefined
  /** With `inline`, the label takes only its own width rather than the column's. */
  compact?: boolean | undefined
  /** Matches the label to a control of the same `size`. At `sm` the label is a small, muted
   *  caption for a compact control, such as a picker in a toolbar, and an inline label's row
   *  is the `sm` control's height. Set the control's own `size` to match. */
  size?: FieldBoxSize | undefined
  /** A set of controls, such as radios or checkboxes, that a legend names instead of a label. */
  group?: boolean | undefined
  /** The control's id; one is made up when left out. */
  id?: string | undefined
  className?: string | undefined
  /** The control, or a function that places the control props on it. Any control of this
   *  package, such as Input, Select, Combobox, NumberInput, Switch or DatePicker, takes its label,
   *  description and invalid state from the Field on its own; a native element needs the
   *  function. A value shown but not edited goes in a `FieldValue`. */
  children: ReactNode | ((control: FieldControlProps) => ReactNode)
}

// A compact control reads first, so its label steps back to a caption.
const labelSizes = {
  sm: {
    text: 'text-xs text-(--theme-muted-text-color)',
    inlineHeight: 'min-h-7',
    stackGap: 'gap-1',
  },
  md: { text: 'text-sm text-(--theme-app)', inlineHeight: 'min-h-9', stackGap: 'gap-1.5' },
} satisfies Record<FieldBoxSize, Record<string, string>>
const labelClassName = 'flex items-center gap-1 font-medium'
const actionsClassName = 'ml-auto flex shrink-0 items-center gap-1'
const errorTextClassName = 'flex items-center gap-1.5 text-xs text-(--theme-error-text)'

/** An error in the look a Field gives its own, for a control outside a Field, or for a part of
 *  one rather than the whole of it, such as a row of a list editor. Give it an `id` and name it
 *  in the control's `aria-describedby` so the error is read with the control. */
export function ErrorText({ id, children }: { id?: string | undefined; children: ReactNode }) {
  return children ? (
    <div id={id} role="alert" className={errorTextClassName}>
      <WarningIcon aria-hidden="true" className="size-3.5 shrink-0" />
      {children}
    </div>
  ) : null
}

/** A control with its label, help and error, tied to it for assistive technology. One frame
 *  for every field, in a form or standing alone. */
export function Field({
  label,
  hint,
  help,
  actions,
  description,
  error,
  invalid,
  required = false,
  disabled = false,
  layout = 'stacked',
  compact = false,
  size = 'md',
  group = false,
  id: ownId,
  className,
  children,
}: FieldProps) {
  const uid = useId()
  const id = ownId ?? `${uid}control`
  const labelId = `${uid}label`
  const descriptionId = description ? `${uid}description` : undefined
  const helpId = help ? `${uid}help` : undefined
  const errorId = error ? `${uid}error` : undefined
  const isInvalid = Boolean(error) || Boolean(invalid)
  const describedBy = [descriptionId, helpId, errorId].filter(Boolean).join(' ')
  // Only what is set, so spreading it never clears a control's own attribute.
  const control: FieldControlProps = {
    id,
    ...(group && { 'aria-labelledby': labelId }),
    ...(describedBy && { 'aria-describedby': describedBy }),
    ...(isInvalid && { 'aria-invalid': true }),
    ...(required && { 'aria-required': true }),
  }

  const controlContext = { control, labelId }

  const inline = layout === 'inline'
  // In a row of fields, the label and the control take the row's two tracks, the label at the
  // foot of its track so it stays by its control.
  const inRow = use(FieldRowContext) && !inline && !group
  const labelSize = labelSizes[size]
  // Opened by keyboard focus or by the pointer on the ?, which decides where it may go.
  const [helpOpen, setHelpOpen] = useState<'focus' | 'pointer' | false>(false)
  useEffect(() => {
    if (help) {
      trackFocusModality()
    }
  }, [help])
  // Over the label rather than under the control, so it covers neither the control nor the
  // field after it, and the form doesn't shift as focus moves down it.
  const helpTip = help && (
    <InfoTip
      text={help}
      describesControl
      open={Boolean(helpOpen)}
      onOpenChange={(open) => setHelpOpen(open && 'pointer')}
      // Flipped under the ?, it would cover the control being typed in.
      keepSide={helpOpen === 'focus'}
    />
  )
  // Shown for keyboard focus only: a click already says where the person is looking, and a
  // text box matches :focus-visible on a click too.
  const helpFocus = help
    ? {
        onFocus: () => {
          if (focusCameFromKeyboard()) {
            setHelpOpen('focus')
          }
        },
        onBlur: (event: FocusEvent) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            setHelpOpen(false)
          }
        },
        // Escape closes the help first, as it would any popup, rather than also the dialog
        // the field sits in.
        onKeyDown: (event: KeyboardEvent) => {
          if (event.key === 'Escape' && helpOpen) {
            event.stopPropagation()
            setHelpOpen(false)
          }
        },
      }
    : {}
  const labelBox = cx(
    labelClassName,
    labelSize.text,
    inline && cx(labelSize.inlineHeight, 'shrink-0', compact ? 'mr-2 w-fit' : 'w-52 pr-3'),
    inRow && 'row-start-1 self-end',
  )
  const labelContent = (
    <>
      <span>
        {label}
        {required && <RequiredMark />}
      </span>
      {helpTip}
      {hint}
      {actions && <span className={actionsClassName}>{actions}</span>}
    </>
  )
  const placed = typeof children === 'function' ? children(control) : children
  const body = (
    <div
      className={cx('flex w-full min-w-0 flex-col gap-1', inRow && 'row-start-2')}
      {...helpFocus}
    >
      {/* A field inside this one, such as in a group, starts its own row. */}
      <FieldRowContext value={false}>
        <ControlContext value={controlContext}>
          {inline ? (
            // A control shorter than the label's row, such as a switch or a row of radios,
            // centers on it. A grid rather than a flex row, so a control still fills the width.
            <div className={cx('grid items-center', labelSize.inlineHeight)}>{placed}</div>
          ) : (
            placed
          )}
        </ControlContext>
      </FieldRowContext>
      {description && (
        <BaseField.Description
          id={descriptionId}
          className="text-xs leading-relaxed text-(--theme-muted-text-color)"
        >
          {description}
        </BaseField.Description>
      )}
      {help && (
        // What the control reads as its description; the ? shows it to sighted people. A
        // description may name hidden text, so this one stays out of the way.
        <BaseField.Description id={helpId} hidden>
          {formatInfoTipContent(help)}
        </BaseField.Description>
      )}
      {error && (
        <BaseField.Error id={errorId} match role="alert" className={errorTextClassName}>
          <WarningIcon aria-hidden="true" className="size-3.5 shrink-0" />
          {error}
        </BaseField.Error>
      )}
    </div>
  )
  const frame = inRow
    ? cx('contents', className)
    : cx('flex w-full', inline ? 'items-start' : cx('flex-col', labelSize.stackGap), className)

  if (group) {
    return (
      <BaseField.Root
        invalid={isInvalid}
        disabled={disabled}
        // The fieldset is the group itself, so a set of checkboxes needs no second one inside.
        render={
          <Fieldset.Root
            aria-describedby={control['aria-describedby']}
            aria-invalid={control['aria-invalid']}
          />
        }
      >
        <div className={frame}>
          <Fieldset.Legend id={labelId} className={labelBox}>
            {labelContent}
          </Fieldset.Legend>
          {body}
        </div>
      </BaseField.Root>
    )
  }
  return (
    <BaseField.Root
      invalid={isInvalid}
      disabled={disabled}
      className={frame}
      data-field-row={inRow || undefined}
    >
      {/* The hint sits beside the label rather than in it, so a help button doesn't name the control. */}
      <div className={labelBox}>
        <BaseField.Label
          // A Base UI control tells the label its id; a function's control takes the one made here.
          {...(typeof children === 'function' || ownId !== undefined ? { htmlFor: id } : {})}
          id={labelId}
          data-field-label
        >
          {label}
          {required && <RequiredMark />}
        </BaseField.Label>
        {helpTip}
        {hint}
        {actions && <span className={actionsClassName}>{actions}</span>}
      </div>
      {body}
    </BaseField.Root>
  )
}

/** One checkbox or radio and its label inside a Field, such as an option of a group. A bare
 *  `<label>` there would take the Field's label as its own, so every option read as the field. */
export function FieldOption({
  disabled,
  className,
  children,
}: {
  disabled?: boolean | undefined
  className?: string | undefined
  children: ReactNode
}) {
  return (
    <BaseField.Item
      disabled={disabled}
      // biome-ignore lint/a11y/noLabelWithoutControl: the option's checkbox or radio and its text are the children.
      render={<label />}
      className={cx(disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer', className)}
    >
      {children}
    </BaseField.Item>
  )
}

/** The eye button inside a secret's box that shows or hides what was typed. Give the box
 *  room for it on the right, such as `pr-9`. */
export function RevealToggle({
  revealed,
  onRevealedChange,
  disabled,
}: {
  revealed: boolean
  onRevealedChange: (revealed: boolean) => void
  disabled?: boolean | undefined
}) {
  const { common: t } = useStrings()
  const Icon = revealed ? EyeOffIcon : EyeIcon
  return (
    <button
      type="button"
      aria-label={revealed ? t.hideValue : t.showValue}
      aria-pressed={revealed}
      disabled={disabled}
      onClick={() => onRevealedChange(!revealed)}
      className="absolute inset-y-0 right-0 flex w-9 cursor-pointer items-center justify-center text-(--theme-muted-text-color) hover:text-(--theme-app) disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Icon aria-hidden="true" className="size-4" />
    </button>
  )
}

export interface FieldValueProps extends OutputHTMLAttributes<HTMLOutputElement> {
  /** Matches the height and text of the controls around it, as `size` does on a control. */
  size?: FieldBoxSize | undefined
}

/** A value a Field shows that nobody edits, such as one worked out from other fields. It is an
 *  `<output>`, which the Field's label names and which reads out when the value changes; list
 *  the controls it is worked out from in `htmlFor`. It keeps a control's height, so it lines
 *  up with the fields around it. For a set of names and values on their own, use
 *  DescriptionList. */
export function FieldValue({ size = 'md', className, children, ...props }: FieldValueProps) {
  const control = useFieldControl()
  // An output isn't a Base UI control, so the Field's label names it by id rather than by `for`.
  const labelId = useFieldLabelId()
  return (
    <output
      id={control?.id}
      aria-labelledby={labelId}
      aria-describedby={control?.['aria-describedby']}
      {...props}
      className={cx(
        'flex min-w-0 items-center break-words text-(--theme-app)',
        size === 'sm' ? 'min-h-7 text-xs' : 'min-h-9 text-sm',
        className,
      )}
    >
      {children}
    </output>
  )
}

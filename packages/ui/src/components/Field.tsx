import { Field as BaseField } from '@base-ui/react/field'
import { Fieldset } from '@base-ui/react/fieldset'
import {
  createContext,
  type FocusEvent,
  type KeyboardEvent,
  type OutputHTMLAttributes,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
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

interface ControlContextValue {
  control: FieldControlProps
  labelId: string
  /** Called by a control the label names by id rather than by `for`; returns its release. */
  claimLabel: () => () => void
}

const ControlContext = createContext<ControlContextValue | null>(null)

/** Set by a layout that lines up the fields in a row, as a form's grid does: a stacked field's
 *  label and control take the row's label and control tracks, so controls under labels of
 *  different lengths line up. The layout makes the field's box a subgrid of two rows. */
export const FieldRowContext = createContext(false)

/** The surrounding Field's control props, for a control drawn further down than the Field's
 *  own children. Null outside a Field. */
export function useFieldControl(): FieldControlProps | null {
  return use(ControlContext)?.control ?? null
}

/** The surrounding Field's control props for a control that isn't a Base UI one, such as a
 *  code editor, a button that opens a picker or an `<output>`, which the label's `for` can't
 *  name. The props name it by the label's id instead, and while it is mounted the label drops
 *  its `for`, which would point at no element, and focuses the control by its id when clicked.
 *  Null outside a Field. */
export function useFieldLabelledControl():
  | (FieldControlProps & { 'aria-labelledby': string })
  | null {
  const context = use(ControlContext)
  const claim = context?.claimLabel
  // Before paint, so the label never shows a `for` to nothing.
  useLayoutEffect(() => claim?.(), [claim])
  return context ? { ...context.control, 'aria-labelledby': context.labelId } : null
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
  /** Puts a checkbox, a switch or a lone radio before its label, as such a control reads: the
   *  control, then its label and ?, with the description and error under the label. A click on
   *  the label sets the control. A checkbox or a radio sits on the label's first line; a switch
   *  centers on the text's first two lines, such as the label and its description, and stays
   *  there under longer text. Inline it sits in the control column, under the controls above
   *  it; in a row of fields, its first line centers on the controls beside it, a switch's too.
   *  Not for a `group`, whose options are each a `FieldOption`. */
  controlFirst?: boolean | undefined
  /** The control's id; one is made up when left out. */
  id?: string | undefined
  className?: string | undefined
  /** The control, or a function that places the control props on it. Any control of this
   *  package, such as Input, Select, Combobox, NumberInput, Switch or DatePicker, takes its label,
   *  description and invalid state from the Field on its own; a native element needs the
   *  function. A value shown but not edited goes in a `FieldValue`. */
  children: ReactNode | ((control: FieldControlProps) => ReactNode)
}

// A compact control reads first, so its label steps back to a caption. `inlineLine` lowers a
// control-first field's first line, a switch's height, onto the middle of the controls beside it
// in a row of fields: half of what their height leaves over it. Only above, so the row ends where
// its last line does. `controlFirstHeight` is a switch's height, the label's line and 2px over and
// under it, and `controlFirstStackedHeight` adds the 4px a stacked one starts in.
const labelSizes = {
  sm: {
    text: 'text-xs text-(--theme-muted-text-color)',
    inlineHeight: 'min-h-7',
    stackGap: 'gap-1',
    narrowStack: 'max-sm:flex-col max-sm:items-stretch max-sm:gap-1',
    inlineLine: 'pt-1',
    controlFirstHeight: 'min-h-5',
    controlFirstStackedHeight: 'min-h-6',
  },
  md: {
    text: 'text-sm text-(--theme-app)',
    inlineHeight: 'min-h-8',
    stackGap: 'gap-1.5',
    narrowStack: 'max-sm:flex-col max-sm:items-stretch max-sm:gap-1.5',
    inlineLine: 'pt-1',
    controlFirstHeight: 'min-h-6',
    controlFirstStackedHeight: 'min-h-7',
  },
  lg: {
    text: 'text-sm text-(--theme-app)',
    inlineHeight: 'min-h-10',
    stackGap: 'gap-2',
    narrowStack: 'max-sm:flex-col max-sm:items-stretch max-sm:gap-2',
    inlineLine: 'pt-2',
    controlFirstHeight: 'min-h-6',
    controlFirstStackedHeight: 'min-h-7',
  },
} satisfies Record<FieldBoxSize, Record<string, string>>
const labelClassName = 'flex items-center gap-1 font-medium'
const actionsClassName = 'ml-auto flex shrink-0 items-center gap-1'
const controlFirstExtrasClassName = 'ms-1 inline-flex items-center gap-1 align-[-0.125em]'
// A switch sets what its label and description name together, and on the label's line alone it
// sits high beside them, so it centers on both, as in a list of settings; under longer text it
// stays on those two lines rather than drifting to the middle of a paragraph. A checkbox starts
// a sentence such as "I agree to…", so it stays on the first line. The Field doesn't know its
// control, so the cell asks whether it holds a switch.
const switchOnTwoLines = 'has-[[role=switch]]:max-h-[2lh]'
// A description's line is shorter than a label's, so two lines of label and description are too.
const switchOnLabelAndDescription = 'has-[[role=switch]]:max-h-[calc(1lh+1rem)]'
// Centered on two lines, a switch starts under the label's letters, so they are the row's top
// edge rather than the switch. The row moves up by the 4px they sit into it, to start at them as
// a row with a lone label starts at its switch, and the space the eye sees between rows stays.
const switchRowStartsAtText = 'has-[[role=switch]]:-mt-1'
// The icon keeps to the message's first line, so a message that wraps doesn't pull it
// down between its lines: a 14px icon on a 16px line, a pixel down.
const errorTextClassName = 'items-start gap-1.5 text-xs text-(--theme-error-text)'
const errorIconClassName = 'mt-px size-3.5 shrink-0'

export interface ErrorTextProps {
  id?: string | undefined
  /** `sm` is a Field's own error, under one control; `md` is for an error
   *  about a whole form or an action, such as a Save that failed. */
  size?: 'sm' | 'md' | undefined
  /** Sits in a line of text instead of a line of its own, in that text's size; `size`
   *  applies only on a line of its own. */
  inline?: boolean | undefined
  /** Places it, such as its margins, or a card footer's rule and padding. */
  className?: string | undefined
  /** Nothing renders without it, so an error that may be absent needs no guard. */
  children: ReactNode
}

/** An error in the look a Field gives its own, for a control outside a Field, or for a part of
 *  one rather than the whole of it, such as a row of a list editor; `size="md"` for an error
 *  under a whole form or after an action. It is announced as it appears. Give it an `id` and
 *  name it in the control's `aria-describedby` so the error is read with the control. */
export function ErrorText({
  id,
  size = 'sm',
  inline = false,
  className,
  children,
}: ErrorTextProps) {
  if (!children) {
    return null
  }
  if (inline) {
    // Inside a sentence it takes the sentence's size and sits on its baseline: the icon is
    // an em box nudged down onto the text's middle, as an inline icon reads in prose. A flex
    // box would set its baseline at the icon's foot and lift the message off the line.
    return (
      <span id={id} role="alert" className={cx('text-(--theme-error-text)', className)}>
        <WarningIcon aria-hidden="true" className="me-[0.3em] inline size-[1em] align-[-0.125em]" />
        {children}
      </span>
    )
  }
  return (
    <div
      id={id}
      role="alert"
      className={cx(
        'flex',
        size === 'md' ? 'items-start gap-2 text-sm text-(--theme-error-text)' : errorTextClassName,
        className,
      )}
    >
      {/* At md the message may run to lines of its own, so the icon keeps to the first. */}
      <WarningIcon
        aria-hidden="true"
        className={size === 'md' ? 'mt-0.5 size-4 shrink-0' : errorIconClassName}
      />
      {children}
    </div>
  )
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
  controlFirst = false,
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

  // How many controls under the label name themselves by its id; while any do, it has no `for`.
  const [labelledBy, setLabelledBy] = useState(0)
  const claimLabel = useCallback(() => {
    setLabelledBy((n) => n + 1)
    return () => setLabelledBy((n) => n - 1)
  }, [])
  const controlContext = { control, labelId, claimLabel }

  const inline = layout === 'inline'
  // In a row of fields, the label and the control take the row's two tracks, the label at the
  // foot of its track so it stays by its control.
  const inRow = use(FieldRowContext) && !inline && !group
  const labelSize = labelSizes[size]
  // Opened by keyboard focus or by the pointer on the ?, which decides where it may go.
  const [helpOpen, setHelpOpen] = useState<'focus' | 'pointer' | false>(false)
  const [controlBox, setControlBox] = useState<HTMLDivElement | null>(null)
  useEffect(() => {
    if (help) {
      trackFocusModality()
    }
  }, [help])
  // Opened by the pointer, the tip sits over the ? it came from. Opened as Tab reaches the
  // control, it sits beside the control, where it covers neither the control nor the field above
  // it, or a dialog's title over a first field; where there is no room beside it, as on a phone,
  // it goes under the control, over the field Tab reaches next. The form never shifts.
  const besideControl = helpOpen === 'focus'
  const helpTip = help && (
    <InfoTip
      text={help}
      describesControl
      open={Boolean(helpOpen)}
      onOpenChange={(open) => setHelpOpen(open && 'pointer')}
      side={besideControl ? 'right' : 'top'}
      anchor={besideControl ? controlBox : undefined}
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
    inline &&
      cx(
        labelSize.inlineHeight,
        'shrink-0',
        compact ? 'mr-2 w-fit' : 'w-52 pr-3 max-sm:min-h-0 max-sm:w-full max-sm:pr-0',
      ),
    inRow && 'row-start-1 self-end',
  )
  const nameContent = (
    <>
      {label}
      {required && <RequiredMark />}
    </>
  )
  // Beside the label rather than in it, so a help button doesn't name the control.
  const labelExtras = (
    <>
      {helpTip}
      {hint}
      {actions && <span className={actionsClassName}>{actions}</span>}
    </>
  )
  const placed = typeof children === 'function' ? children(control) : children
  // A field inside this one, such as in a group, starts its own row.
  const controlInContext = (
    <FieldRowContext value={false}>
      <ControlContext value={controlContext}>{placed}</ControlContext>
    </FieldRowContext>
  )
  const messages = (
    <>
      {description && (
        <BaseField.Description
          id={descriptionId}
          className={cx(
            'text-xs text-(--theme-muted-text-color)',
            // Under a control-first label it is the label's second line, as close as the label's
            // own lines, so the row ends where its text does rather than a half-line under it.
            controlFirst && !group ? 'leading-4' : 'leading-relaxed',
          )}
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
        <BaseField.Error id={errorId} match role="alert" className={cx('flex', errorTextClassName)}>
          <WarningIcon aria-hidden="true" className={errorIconClassName} />
          {error}
        </BaseField.Error>
      )}
    </>
  )
  const fieldLabel = (className?: string) => (
    <BaseField.Label
      // A Base UI control tells the label its id; a function's control takes the one made here.
      // One named by the label's id has no `for` to take, so a click focuses it instead.
      {...(labelledBy > 0
        ? {
            htmlFor: undefined,
            onClick: () => document.getElementById(id)?.focus(),
          }
        : typeof children === 'function' || ownId !== undefined
          ? { htmlFor: id }
          : {})}
      id={labelId}
      className={className}
      data-field-label
    >
      {nameContent}
    </BaseField.Label>
  )

  if (controlFirst && !group) {
    return (
      <BaseField.Root
        invalid={isInvalid}
        disabled={disabled}
        className={
          inRow
            ? cx('contents', className)
            : cx(
                'flex w-full items-start',
                // The cell below stops at the text, which on one line ends 2px over the switch,
                // so the field holds the switch's bottom itself.
                inline ? labelSize.controlFirstHeight : labelSize.controlFirstStackedHeight,
                className,
              )
        }
        data-field-row={inRow || undefined}
      >
        {/* The label column stays empty, so the control lines up with the controls under it. */}
        {inline && !compact && <div aria-hidden="true" className="w-52 shrink-0 max-sm:hidden" />}
        <div
          ref={help ? setControlBox : undefined}
          className={cx(
            'flex w-fit max-w-full min-w-0 items-start gap-2',
            // Inline, the label column beside it is empty, so nothing shares its first line and
            // the row starts at the switch, as a text field's row starts at its box. Stacked, a
            // text field's row starts with its label, whose letters sit about 4px into their
            // line, so a switch starts that far in too and the gaps between rows look the same.
            inRow ? labelSize.inlineLine : !inline && 'pt-1',
            inRow && 'row-start-2',
            !inRow && (description || error) && switchRowStartsAtText,
          )}
        >
          {/* The control centers on the cell, which starts where the text does and spans its
              lines up to a cap: the first line for a checkbox, the first two for a switch. It
              never takes padding under it, which would sit under a description and widen the
              gap to the next row. In a row of fields the first line
              centers on the controls beside it, and a switch lower than that would leave the
              row's controls out of line, so there every control keeps to the first line: a
              switch's height, 2px over and under it. */}
          <div
            className={cx(
              'box-content flex shrink-0 items-center',
              inRow
                ? 'h-lh py-0.5'
                : cx(
                    'min-h-lh max-h-lh self-stretch pt-0.5',
                    description ? switchOnLabelAndDescription : switchOnTwoLines,
                  ),
              labelSize.text,
            )}
            {...helpFocus}
          >
            {/* No height of its own, so the switch, taller than the label's line, doesn't
                stretch the cell, and the cell's center stays the text's. */}
            <div className="flex h-0 items-center">{controlInContext}</div>
          </div>
          <div className="flex min-w-0 flex-col pt-0.5">
            {/* Text flow rather than a flex row, so the ? follows the label's last word as it
                wraps. */}
            <div className={cx('font-medium', labelSize.text, disabled && 'opacity-60')}>
              {fieldLabel(disabled ? 'cursor-not-allowed' : 'cursor-pointer')}
              {/* The ? and the actions sit on the text's middle; a hint is text, on its
                  baseline. */}
              {helpTip && <span className={controlFirstExtrasClassName}>{helpTip}</span>}
              {hint && <span className="ms-1">{hint}</span>}
              {actions && <span className={controlFirstExtrasClassName}>{actions}</span>}
            </div>
            {messages}
          </div>
        </div>
      </BaseField.Root>
    )
  }

  const body = (
    <div
      ref={help ? setControlBox : undefined}
      className={cx('flex w-full min-w-0 flex-col gap-1', inRow && 'row-start-2')}
      {...helpFocus}
    >
      {inline ? (
        // A control shorter than the label's row, such as a switch or a row of radios,
        // centers on it. A grid rather than a flex row, so a control still fills the width.
        <div className={cx('grid items-center', labelSize.inlineHeight)}>{controlInContext}</div>
      ) : (
        controlInContext
      )}
      {messages}
    </div>
  )
  const frame = inRow
    ? cx('contents', className)
    : cx(
        'flex w-full',
        // Below sm an inline field stacks too: beside a 208px label, a phone leaves the control
        // a sliver.
        inline
          ? cx('items-start', !compact && labelSize.narrowStack)
          : cx('flex-col', labelSize.stackGap),
        className,
      )

  if (group) {
    return (
      <BaseField.Root
        invalid={isInvalid}
        disabled={disabled}
        // A fieldset sizes to its content in a flex row, so it takes the row's width itself.
        className="w-full min-w-0"
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
            <span>{nameContent}</span>
            {labelExtras}
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
      <div className={labelBox}>
        {fieldLabel()}
        {labelExtras}
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
  // An output isn't a Base UI control, so the Field's label names it by id rather than by `for`.
  const control = useFieldLabelledControl()
  return (
    <output
      id={control?.id}
      aria-labelledby={control?.['aria-labelledby']}
      aria-describedby={control?.['aria-describedby']}
      {...props}
      className={cx(
        'flex min-w-0 items-center break-words text-(--theme-app)',
        { sm: 'min-h-7 text-xs', md: 'min-h-8 text-sm', lg: 'min-h-10 text-base' }[size],
        className,
      )}
    >
      {children}
    </output>
  )
}

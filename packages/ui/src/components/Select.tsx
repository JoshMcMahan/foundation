import { Select as BaseSelect } from '@base-ui/react/select'
import { type KeyboardEventHandler, type ReactElement, type ReactNode, useId } from 'react'
import { cx } from '../cx'
import { CheckIcon, ChevronDownIcon } from '../icons'
import {
  type ComboboxItem,
  optionNaming,
  pickerEndClassName,
  pickerHintClassName,
  pickerItemClassName,
} from './comboboxItems'
import { useFieldControl, useFieldControlId } from './Field'
import { type FieldBoxSize, fieldBox } from './fieldBox'
import { panelClassName, panelListClassName, positionerClassName } from './floating'
import { OptionDescription } from './OptionDescription'
import { usePopupContainer } from './popupContainer'
import { Tooltip } from './Tooltip'

/** An option of a Select: the same shape as a Combobox's, so a list moves between them as is. */
export type SelectItem<Value> = ComboboxItem<Value>

type SelectValueChange<Value, Multiple extends boolean | undefined> = (
  value: Multiple extends true ? Value[] : Value,
  details: BaseSelect.Root.ChangeEventDetails,
) => void

export type SelectProps<Value, Multiple extends boolean | undefined = false> = Omit<
  BaseSelect.Root.Props<Value, Multiple>,
  'items' | 'children' | 'onValueChange'
> & {
  items: readonly SelectItem<Value>[]
  /** Called with the value picked. A single Select never passes null unless an item's value is
   *  null, such as a "None" option, so the value is always one of the items'. */
  onValueChange?: SelectValueChange<Value, Multiple> | undefined
  placeholder?: string | undefined
  /** Applied to the trigger. */
  className?: string | undefined
  'aria-label'?: string | undefined
  'aria-labelledby'?: string | undefined
  'aria-describedby'?: string | undefined
  'aria-invalid'?: boolean | undefined
  'aria-required'?: boolean | undefined
  /** Renders the field as this button, for compact pickers such as a toolbar pill. The
   *  button shows the selection itself; `placeholder` and `className` then go unused. */
  trigger?: ReactElement | undefined
  /** A hint on the trigger button. */
  triggerTooltip?: ReactNode
  /** `sm` for dense places such as toolbars and table cells, `lg` for a form that stands alone,
   *  such as sign-in. */
  size?: FieldBoxSize | undefined
  /** `fill` takes the width of its row, as a form's fields do; `content` takes the width of its
   *  longest label, as in a toolbar or beside text. By default it fills inside a Field and
   *  sizes to its content anywhere else. */
  width?: 'fill' | 'content' | undefined
  /** Why the field can't be changed, with `disabled`: shown as a tooltip and read after its
   *  name. The field stays focusable, so the keyboard reaches the reason too. */
  disabledReason?: string | undefined
  /** The edge of the field the open list lines up with, when the list is wider. */
  align?: 'start' | 'end' | undefined
  /** On the trigger, such as to keep a key from a host's own shortcuts. */
  onKeyDown?: KeyboardEventHandler<HTMLElement> | undefined
  /** The item a person is on as they move through the open list, then undefined once it
   *  closes, such as to preview a theme before it is chosen. */
  onItemHighlighted?: ((value: Value | undefined) => void) | undefined
}

const triggerClassName = 'flex cursor-pointer items-center justify-between gap-2 pr-1.5 text-left'

// The disabled look, on a trigger that stays focusable to tell why it is disabled.
const explainedDisabledClassName =
  'cursor-not-allowed hover:border-(--theme-border-field) bg-(--theme-input-disabled-bg) text-(--theme-placeholder)'

/** Picks one value, or several with `multiple`, from a short list. Use
 *  Combobox when the list is long enough to need filtering. */
export function Select<Value, Multiple extends boolean | undefined = false>({
  items,
  placeholder,
  className,
  'aria-label': ariaLabel,
  'aria-labelledby': labelledBy,
  'aria-describedby': describedBy,
  'aria-invalid': invalid,
  'aria-required': required,
  trigger,
  triggerTooltip,
  size = 'md',
  width,
  disabledReason,
  align = 'start',
  onKeyDown,
  onItemHighlighted,
  onValueChange,
  ...rootProps
}: SelectProps<Value, Multiple>) {
  const portal = usePopupContainer()
  const uid = useId()
  const inField = useFieldControl() !== null
  const id = useFieldControlId(rootProps.id)
  const content = (width ?? (inField ? 'fill' : 'content')) === 'content'
  const labelOf = (value: Value) => items.find((item) => Object.is(item.value, value))?.label
  // Disabled with a reason, the field is read-only and shut instead, which keeps it focusable.
  const explained = Boolean(rootProps.disabled && disabledReason)
  const reasonId = `${uid}reason`
  const triggerProps = {
    // On the trigger, which the label names; the root's id doesn't reach it.
    id,
    'aria-label': ariaLabel,
    'aria-labelledby': labelledBy,
    'aria-describedby': cx(describedBy, explained && reasonId) || undefined,
    'aria-invalid': invalid || undefined,
    'aria-required': required || undefined,
    'aria-disabled': explained || undefined,
    onKeyDown,
  }
  const nullable = items.some((item) => item.value === null)
  const tip = explained ? disabledReason : triggerTooltip
  return (
    <BaseSelect.Root
      items={items}
      {...rootProps}
      disabled={explained ? false : rootProps.disabled}
      readOnly={explained || rootProps.readOnly}
      {...(explained && { open: false })}
      onValueChange={(next, details) => {
        // Base UI's single value may be null, which a list without a null item never means.
        if (next === null && !rootProps.multiple && !nullable) {
          return
        }
        onValueChange?.(next as Multiple extends true ? Value[] : Value, details)
      }}
      onOpenChange={(open, details) => {
        rootProps.onOpenChange?.(open, details)
        if (!open) {
          onItemHighlighted?.(undefined)
        }
      }}
    >
      {trigger ? (
        <Tooltip content={tip}>
          <BaseSelect.Trigger {...triggerProps} render={trigger} />
        </Tooltip>
      ) : (
        <Tooltip content={tip}>
          <BaseSelect.Trigger
            {...triggerProps}
            className={cx(
              fieldBox({ size }),
              triggerClassName,
              // In a row of other things it keeps its width rather than cutting off its own
              // choice; `max-w-full` still holds it to a narrower row.
              content && 'w-fit max-w-full shrink-0',
              explained && explainedDisabledClassName,
              className,
            )}
          >
            <BaseSelect.Value
              placeholder={placeholder}
              className={cx(
                'truncate',
                rootProps.multiple && 'data-placeholder:text-(--theme-placeholder)',
                // Every label stacks in one cell, so the field is as wide as the longest one
                // and keeps its width as the choice changes.
                content && !rootProps.multiple && 'grid',
              )}
            >
              {rootProps.multiple
                ? (values: Value[]) =>
                    values.length > 0 ? values.map(labelOf).join(', ') : placeholder
                : (value: Value | null) => {
                    // An option whose value is empty, such as "All teams" for '', is still a
                    // choice and reads as one; only a value no option has shows the placeholder.
                    const label = labelOf(value as Value)
                    const shown = label ?? (
                      <span className="text-(--theme-placeholder)">{placeholder}</span>
                    )
                    return content ? (
                      <>
                        <span className="col-start-1 row-start-1 truncate">{shown}</span>
                        {[placeholder, ...items.map((item) => item.label)].map(
                          (text, index) =>
                            text && (
                              <span
                                // biome-ignore lint/suspicious/noArrayIndexKey: labels may repeat; their order is fixed
                                key={index}
                                aria-hidden="true"
                                className="invisible col-start-1 row-start-1 h-0 overflow-hidden whitespace-nowrap"
                              >
                                {text}
                              </span>
                            ),
                        )}
                      </>
                    ) : (
                      shown
                    )
                  }}
            </BaseSelect.Value>
            <BaseSelect.Icon className="shrink-0 text-(--theme-muted-text-color)">
              <ChevronDownIcon aria-hidden="true" />
            </BaseSelect.Icon>
          </BaseSelect.Trigger>
        </Tooltip>
      )}
      {explained && (
        <span id={reasonId} hidden>
          {disabledReason}
        </span>
      )}
      <BaseSelect.Portal {...portal}>
        <BaseSelect.Positioner
          alignItemWithTrigger={false}
          align={align}
          sideOffset={4}
          className={positionerClassName}
        >
          <BaseSelect.Popup
            className={cx(
              'min-w-(--anchor-width) max-w-[min(20rem,var(--available-width))]',
              panelClassName,
            )}
          >
            <BaseSelect.List
              className={cx(
                'max-h-[min(15rem,var(--available-height))] overflow-y-auto',
                panelListClassName,
              )}
            >
              {items.map((item, index) => (
                <BaseSelect.Item
                  key={String(item.value)}
                  value={item.value}
                  disabled={item.disabled}
                  {...optionNaming(`${uid}${index}`, item)}
                  // Select highlights an item by focusing it.
                  onFocus={onItemHighlighted && (() => onItemHighlighted(item.value))}
                  className={pickerItemClassName}
                >
                  {item.icon && <span className="flex shrink-0 items-center">{item.icon}</span>}
                  <span className="flex min-w-0 flex-col">
                    <span className="flex min-w-0 items-center gap-2">
                      <BaseSelect.ItemText id={`${uid}${index}label`} className="truncate">
                        {item.label}
                      </BaseSelect.ItemText>
                      {item.badge}
                    </span>
                    <OptionDescription id={`${uid}${index}description`} item={item} />
                  </span>
                  <span className={pickerEndClassName}>
                    {item.hint && (
                      <span id={`${uid}${index}hint`} className={pickerHintClassName}>
                        {item.hint}
                      </span>
                    )}
                    {/* Beside a hint, the check keeps its place while unchosen, so hints line up. */}
                    <span className={cx('flex items-center', item.hint && 'w-3.5')}>
                      <BaseSelect.ItemIndicator className="flex items-center">
                        <CheckIcon aria-hidden="true" className="size-3.5" />
                      </BaseSelect.ItemIndicator>
                    </span>
                  </span>
                </BaseSelect.Item>
              ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  )
}

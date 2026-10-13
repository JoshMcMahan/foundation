import { Select as BaseSelect } from '@base-ui/react/select'
import type { ReactElement, ReactNode } from 'react'
import { cx } from '../cx'
import { AngleDownIcon, CheckIcon } from '../icons'
import { fieldBox } from './fieldBox'
import { panelClassName, panelItemClassName, positionerClassName } from './floating'
import { Tooltip } from './Tooltip'

export interface SelectItem<Value> {
  value: Value
  label: string
  /** A second line under the label, such as what an option does. */
  description?: string | undefined
  icon?: ReactNode
  disabled?: boolean | undefined
}

export type SelectProps<Value, Multiple extends boolean | undefined = false> = Omit<
  BaseSelect.Root.Props<Value, Multiple>,
  'items' | 'children'
> & {
  items: readonly SelectItem<Value>[]
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
  /** `sm` for dense places such as toolbars and table cells. */
  size?: 'sm' | 'md' | undefined
  /** The item a person is on as they move through the open list, then undefined once it
   *  closes, such as to preview a theme before it is chosen. */
  onItemHighlighted?: ((value: Value | undefined) => void) | undefined
}

const triggerClassName = 'flex cursor-pointer items-center justify-between gap-2 pr-1.5 text-left'

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
  onItemHighlighted,
  ...rootProps
}: SelectProps<Value, Multiple>) {
  const labelOf = (value: Value) => items.find((item) => Object.is(item.value, value))?.label
  const triggerProps = {
    'aria-label': ariaLabel,
    'aria-labelledby': labelledBy,
    'aria-describedby': describedBy,
    'aria-invalid': invalid || undefined,
    'aria-required': required || undefined,
  }
  return (
    <BaseSelect.Root
      items={items}
      {...rootProps}
      onOpenChange={(open, details) => {
        rootProps.onOpenChange?.(open, details)
        if (!open) {
          onItemHighlighted?.(undefined)
        }
      }}
    >
      {trigger ? (
        <Tooltip content={triggerTooltip}>
          <BaseSelect.Trigger {...triggerProps} render={trigger} />
        </Tooltip>
      ) : (
        <BaseSelect.Trigger
          {...triggerProps}
          className={cx(fieldBox({ size }), triggerClassName, className)}
        >
          <BaseSelect.Value
            placeholder={placeholder}
            className="truncate data-placeholder:text-(--theme-muted-text-color)"
          >
            {rootProps.multiple
              ? (values: Value[]) =>
                  values.length > 0 ? values.map(labelOf).join(', ') : placeholder
              : undefined}
          </BaseSelect.Value>
          <BaseSelect.Icon className="shrink-0 text-(--theme-muted-text-color)">
            <AngleDownIcon aria-hidden="true" />
          </BaseSelect.Icon>
        </BaseSelect.Trigger>
      )}
      <BaseSelect.Portal>
        <BaseSelect.Positioner
          alignItemWithTrigger={false}
          sideOffset={4}
          className={positionerClassName}
        >
          <BaseSelect.Popup
            className={cx(
              'min-w-(--anchor-width) max-w-[min(20rem,var(--available-width))]',
              panelClassName,
            )}
          >
            <BaseSelect.List className="max-h-[min(15rem,var(--available-height))] overflow-y-auto py-1">
              {items.map((item) => (
                <BaseSelect.Item
                  key={String(item.value)}
                  value={item.value}
                  disabled={item.disabled}
                  // Select highlights an item by focusing it.
                  onFocus={onItemHighlighted && (() => onItemHighlighted(item.value))}
                  className={cx('grid grid-cols-[1rem_1fr]', panelItemClassName)}
                >
                  <BaseSelect.ItemIndicator className="col-start-1">
                    <CheckIcon className="size-3.5" />
                  </BaseSelect.ItemIndicator>
                  <span className="col-start-2 flex min-w-0 items-center gap-2">
                    {item.icon}
                    <BaseSelect.ItemText className="truncate">{item.label}</BaseSelect.ItemText>
                  </span>
                  {item.description && (
                    <span className="col-start-2 text-xs text-(--theme-muted-text-color)">
                      {item.description}
                    </span>
                  )}
                </BaseSelect.Item>
              ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  )
}

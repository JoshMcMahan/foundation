import { Select as BaseSelect } from '@base-ui/react/select'
import { clsx as cx } from 'clsx'
import type { ReactElement, ReactNode } from 'react'
import { AngleDownIcon, CheckIcon } from '../icons'
import {
  panelClassName,
  panelItemClassName,
  portalContainer,
  positionerClassName,
} from './floating'
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
  'aria-describedby'?: string | undefined
  'aria-invalid'?: boolean | undefined
  /** Renders the field as this button, for compact pickers such as a toolbar pill. The
   *  button shows the selection itself; `placeholder` and `className` then go unused. */
  trigger?: ReactElement | undefined
  /** A hint on the trigger button. */
  triggerTooltip?: ReactNode
  /** The item a person is on as they move through the open list, then undefined once it
   *  closes, such as to preview a theme before it is chosen. */
  onItemHighlighted?: ((value: Value | undefined) => void) | undefined
}

const triggerClassName = cx(
  'flex w-full items-center justify-between gap-2 rounded-md border border-(--theme-border) bg-(--theme-input-bg) py-2 pl-3 pr-2 text-left text-sm text-(--theme-app) cursor-pointer outline-none',
  'focus-visible:border-(--theme-element) focus-visible:ring-1 focus-visible:ring-(--theme-element)',
  'aria-invalid:border-(--theme-error) data-disabled:cursor-not-allowed data-disabled:bg-(--theme-input-disabled-bg) data-disabled:text-(--theme-input-disabled-text)',
)

/** Picks one value, or several with `multiple`, from a short list. Use
 *  Combobox when the list is long enough to need filtering. */
export function Select<Value, Multiple extends boolean | undefined = false>({
  items,
  placeholder,
  className,
  'aria-label': ariaLabel,
  'aria-describedby': describedBy,
  'aria-invalid': invalid,
  trigger,
  triggerTooltip,
  onItemHighlighted,
  ...rootProps
}: SelectProps<Value, Multiple>) {
  const labelOf = (value: Value) => items.find((item) => Object.is(item.value, value))?.label
  const triggerProps = {
    'aria-label': ariaLabel,
    'aria-describedby': describedBy,
    'aria-invalid': invalid || undefined,
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
        <BaseSelect.Trigger {...triggerProps} className={cx(triggerClassName, className)}>
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
      <BaseSelect.Portal container={portalContainer()}>
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
                  className={cx('grid grid-cols-[1rem_1fr]', panelItemClassName)}
                  // Select highlights an item by focusing it.
                  onFocus={onItemHighlighted && (() => onItemHighlighted(item.value))}
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

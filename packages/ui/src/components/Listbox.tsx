import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useState,
} from 'react'
import { cx } from '../cx'
import { pickerEndClassName, pickerHintClassName } from './comboboxItems'
import {
  type FloatingAnchor,
  panelClassName,
  panelItemClassName,
  panelListClassName,
} from './floating'
import { Popover } from './Popover'

export interface ListboxNavigationOptions<T> {
  items: readonly T[]
  /** Called with the highlighted item on Enter, a `chooseKeys` key or a click. */
  onChoose: (item: T, index: number) => void
  /** Called on Escape, such as to close the list until the text changes. */
  onDismiss?: (() => void) | undefined
  /** False while the list isn't shown: the keys are then the host's own. Default true. */
  open?: boolean | undefined
  /** Past the end comes the start, and before the start the end. Default true. */
  loop?: boolean | undefined
  /** Keys that choose besides Enter. Default `['Tab']`. */
  chooseKeys?: readonly string[] | undefined
  /** Home and End move to the first and last items rather than the caret, for a host whose
   *  text is a short query rather than prose. Default false. */
  homeEnd?: boolean | undefined
  /** An item that can't be chosen, which the highlight passes over. */
  isDisabled?: ((item: T) => boolean) | undefined
}

/** Keys are DOM or React keyboard events alike, as an editor plugin and an input pass them. */
type AnyKeyboardEvent = KeyboardEvent | ReactKeyboardEvent

/** The parts a highlighted list needs while focus stays on the box the reader types in, such
 *  as a text box, an editor or a search input: the highlight and its keys, and the ids that
 *  let assistive technology follow the highlight. Spread `hostProps` on the focused box,
 *  `listProps` on the list and `optionProps(i)` on each option, or draw them with
 *  ListboxPanel and ListboxOption. */
export function useListboxNavigation<T>({
  items,
  onChoose,
  onDismiss,
  open = true,
  loop = true,
  chooseKeys = ['Tab'],
  homeEnd = false,
  isDisabled,
}: ListboxNavigationOptions<T>) {
  const listId = useId()
  const [active, setActive] = useState(0)
  const count = items.length
  // A shorter list can leave the index past its end until the next key.
  const shown = count === 0 ? -1 : Math.min(Math.max(active, 0), count - 1)
  const shownOpen = open && count > 0
  const optionId = (index: number) => `${listId}-${index}`

  // The keyboard moves past what the list shows, so the highlighted option is kept in view.
  useEffect(() => {
    if (!shownOpen || shown < 0) {
      return
    }
    const element = document.getElementById(`${listId}-${shown}`)
    element?.scrollIntoView?.({ block: 'nearest' })
  }, [shownOpen, shown, listId])

  const step = (from: number, by: 1 | -1) => {
    for (let moved = 1; moved <= count; moved++) {
      let next = from + by * moved
      if (next < 0 || next >= count) {
        if (!loop) {
          return from
        }
        next = (next + count) % count
      }
      const item = items[next]
      if (item !== undefined && !isDisabled?.(item)) {
        return next
      }
    }
    return from
  }
  const choose = (index: number) => {
    const item = items[index]
    if (item !== undefined && !isDisabled?.(item)) {
      onChoose(item, index)
    }
  }

  /** Handles a key the list owns, and says whether it did; leave the rest to the host. */
  const handleKey = (event: AnyKeyboardEvent): boolean => {
    const composing = 'nativeEvent' in event ? event.nativeEvent.isComposing : event.isComposing
    if (!shownOpen || composing) {
      return false
    }
    const ctrlOnly = event.ctrlKey && !event.metaKey && !event.altKey
    switch (true) {
      case event.key === 'ArrowDown' || (ctrlOnly && event.key === 'n'):
        setActive(step(shown, 1))
        break
      case event.key === 'ArrowUp' || (ctrlOnly && event.key === 'p'):
        setActive(step(shown, -1))
        break
      case homeEnd && event.key === 'Home':
        setActive(step(-1, 1))
        break
      case homeEnd && event.key === 'End':
        setActive(step(count, -1))
        break
      case event.key === 'Escape':
        if (!onDismiss) {
          return false
        }
        onDismiss()
        break
      case event.key === 'Enter' || chooseKeys.includes(event.key): {
        if (event.shiftKey || event.altKey || event.metaKey || event.ctrlKey) {
          return false
        }
        choose(shown)
        break
      }
      default:
        return false
    }
    event.preventDefault()
    return true
  }

  return {
    /** The highlighted item's index, or -1 with nothing to show. */
    active: shown,
    setActive,
    handleKey,
    listId,
    /** For the box that keeps focus: it points at the list and its highlighted option. */
    hostProps: {
      'aria-autocomplete': 'list' as const,
      'aria-controls': shownOpen ? listId : undefined,
      'aria-activedescendant': shownOpen && shown >= 0 ? optionId(shown) : undefined,
    },
    listProps: { id: listId, role: 'listbox' as const },
    optionProps: (index: number) => {
      const item = items[index]
      const disabled = item !== undefined && isDisabled?.(item) === true
      return {
        id: optionId(index),
        role: 'option' as const,
        tabIndex: -1,
        'aria-selected': index === shown,
        'aria-disabled': disabled || undefined,
        'data-highlighted': index === shown || undefined,
        'data-disabled': disabled || undefined,
        // Keeps focus in the box, so typing carries on after a click.
        onMouseDown: (event: { preventDefault: () => void }) => event.preventDefault(),
        onMouseMove: () => {
          if (index !== shown && !disabled) {
            setActive(index)
          }
        },
        onClick: () => choose(index),
      }
    },
  }
}

export type ListboxNavigation<T> = ReturnType<typeof useListboxNavigation<T>>

export interface ListboxPanelProps {
  /** `listProps` from useListboxNavigation. */
  listProps: { id: string; role: 'listbox' }
  /** Names the list for assistive technology. */
  'aria-label': string
  /** Under the list, such as which keys choose and dismiss. */
  footer?: ReactNode
  /** In place of the options while there are none. */
  empty?: ReactNode
  /** Opens at this element or point, such as an editor's caret, over the page and inside a
   *  modal dialog alike; without one the panel stands where the host places it. */
  at?: FloatingAnchor | undefined
  /** With `at`: called when a press outside closes it. */
  onDismiss?: (() => void) | undefined
  /** On the panel: its width or place. */
  className?: string | undefined
  children: ReactNode
}

/** The panel of a highlighted list that the reader drives from a box that keeps focus. */
export function ListboxPanel({
  listProps,
  'aria-label': label,
  footer,
  empty,
  at,
  onDismiss,
  className,
  children,
}: ListboxPanelProps) {
  const hasOptions = Array.isArray(children) ? children.some(Boolean) : Boolean(children)
  const body = (
    <>
      <div
        id={listProps.id}
        role="listbox"
        aria-label={label}
        className={cx('max-h-96 overflow-y-auto overscroll-contain', panelListClassName)}
      >
        {hasOptions ? (
          children
        ) : empty ? (
          <div className="px-2 py-1.5 text-(--theme-muted-text-color)">{empty}</div>
        ) : null}
      </div>
      {footer && (
        <div className="border-t border-(--theme-border) px-3 py-1.5 text-xs text-(--theme-muted-text-color)">
          {footer}
        </div>
      )}
    </>
  )
  if (at) {
    return (
      <Popover
        at={at}
        open
        onOpenChange={(next) => {
          if (!next) {
            onDismiss?.()
          }
        }}
        side="bottom"
        align="start"
        initialFocus="none"
        finalFocus={false}
        aria-label={label}
        className={cx('w-72 overflow-hidden p-0', className)}
      >
        {body}
      </Popover>
    )
  }
  return <div className={cx('overflow-hidden', panelClassName, className)}>{body}</div>
}

export interface ListboxOptionProps {
  /** `optionProps(index)` from useListboxNavigation. */
  option: ReturnType<ListboxNavigation<unknown>['optionProps']>
  icon?: ReactNode
  label: ReactNode
  /** Under the label, or beside it with `inline`. */
  description?: ReactNode
  /** The description on the label's line, as a command's summary beside its name. */
  inline?: boolean | undefined
  /** Short muted text at the row's end, such as a key. */
  hint?: ReactNode
  className?: string | undefined
}

/** One option of a ListboxPanel: an icon, its label and description, and a hint at its end. */
export function ListboxOption({
  option,
  icon,
  label,
  description,
  inline = false,
  hint,
  className,
}: ListboxOptionProps) {
  return (
    // The box keeps focus and names the highlighted option, so options take no Tab stop; its
    // arrow keys and Enter choose.
    <div {...option} className={cx(panelItemClassName, inline && 'items-baseline', className)}>
      {icon && <span className="flex shrink-0 items-center self-center">{icon}</span>}
      <span className={cx('flex min-w-0', inline ? 'items-baseline gap-3' : 'flex-col')}>
        <span className="truncate">{label}</span>
        {description && (
          <span
            className={cx(
              'text-xs text-(--theme-muted-text-color)',
              inline ? 'truncate' : 'leading-snug',
            )}
          >
            {description}
          </span>
        )}
      </span>
      {hint && (
        <span className={pickerEndClassName}>
          <span className={pickerHintClassName}>{hint}</span>
        </span>
      )}
    </div>
  )
}

/** Options under a heading in a ListboxPanel. */
export function ListboxGroup({ label, children }: { label: ReactNode; children: ReactNode }) {
  const id = useId()
  return (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset is for form controls; this groups options
    <div role="group" aria-labelledby={id}>
      <div id={id} className="px-2 pt-2 pb-1 text-xs text-(--theme-muted-text-color)">
        {label}
      </div>
      {children}
    </div>
  )
}

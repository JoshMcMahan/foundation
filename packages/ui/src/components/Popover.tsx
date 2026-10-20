import { Popover as BasePopover } from '@base-ui/react/popover'
import { createContext, type ReactElement, type ReactNode, use, useCallback, useRef } from 'react'
import { cx } from '../cx'
import {
  type FloatingAnchor,
  panelClassName,
  positionerClassName,
  tipArrowClassName,
  tipClassName,
  toPositionerAnchor,
} from './floating'
import { usePopupContainer } from './popupContainer'

/** A button that closes the popover it sits in. */
export const PopoverClose = BasePopover.Close

const CloseContext = createContext<() => void>(() => {})

/** Closes the popover the caller sits in, for an element that isn't a button,
 *  such as a link that leaves the panel: `<Link href onClick={close}>`. */
export function useClosePopover(): () => void {
  return use(CloseContext)
}

/** What a popover opens from: a trigger that opens it on press, or an anchor
 *  it opens at while `open`, such as the point where a selection ended. */
type PopoverOpener =
  | {
      /** The button that opens it. It receives the trigger's props and ref, so it must pass them to its element. */
      trigger: ReactElement
      at?: never
    }
  | {
      /** An element or pointer event it opens at, for a popover with no trigger. */
      at: FloatingAnchor
      trigger?: never
    }

export type PopoverProps = PopoverOpener & PopoverOptions

export interface PopoverOptions
  extends Omit<
    BasePopover.Popup.Props,
    'className' | 'children' | 'render' | 'title' | 'initialFocus'
  > {
  /** A heading at the top that names the popover. Without one, name it with `aria-label`. */
  title?: ReactNode
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  side?: BasePopover.Positioner.Props['side']
  align?: BasePopover.Positioner.Props['align']
  /** Also opens while the pointer rests on the trigger. A click or a tap still
   *  opens it, so touch and keyboard users reach it too. */
  openOnHover?: boolean
  /** Where focus goes on opening: the first control in it, the panel itself for
   *  a list read before one item in it is picked, or nowhere, for a popover that
   *  offers an action on what the reader is doing, such as copying a selection. */
  initialFocus?: 'first-control' | 'popup' | 'none'
  /** Placed against this element rather than its trigger, such as a tip beside the field it
   *  describes. It still opens and closes from the trigger. */
  anchor?: Element | null | undefined
  /** Stays on `side` where it doesn't fit rather than flipping to the other, for a popup that
   *  must not cover what is there, such as the control a tip describes while it is typed in. */
  keepSide?: boolean | undefined
  /** `panel` holds controls or a list; `tip` is a tooltip-sized note with an arrow. */
  variant?: 'panel' | 'tip'
  /** On the popup: its width, padding or text size. */
  className?: string
  children: ReactNode
}

/** A panel anchored to its trigger, over the page so no container clips it. It
 *  flips and shifts to stay on screen, closes on Escape or a press outside, and
 *  returns focus to the trigger. Use a Menu for a list of actions, and a
 *  HoverCard for a preview a link already leads to. */
export function Popover({
  trigger,
  at,
  title,
  open,
  defaultOpen,
  onOpenChange,
  side = 'bottom',
  align = 'center',
  openOnHover = false,
  initialFocus = 'first-control',
  anchor,
  keepSide = false,
  variant = 'panel',
  className,
  children,
  ...popupProps
}: PopoverProps) {
  const portal = usePopupContainer()
  const tip = variant === 'tip'
  const popup = useRef<HTMLDivElement>(null)
  const actions = useRef<BasePopover.Root.Actions>(null)
  // Stable, so the popover re-rendering doesn't re-render every consumer of it.
  const close = useCallback(() => actions.current?.close(), [])
  return (
    <BasePopover.Root
      actionsRef={actions}
      {...(open === undefined ? {} : { open })}
      {...(defaultOpen === undefined ? {} : { defaultOpen })}
      {...(onOpenChange ? { onOpenChange: (next: boolean) => onOpenChange(next) } : {})}
    >
      {trigger && (
        <BasePopover.Trigger
          render={trigger}
          openOnHover={openOnHover}
          {...(openOnHover ? { delay: 300, closeDelay: 150 } : {})}
        />
      )}
      <BasePopover.Portal {...portal}>
        <BasePopover.Positioner
          side={side}
          align={align}
          sideOffset={tip ? 8 : 6}
          collisionPadding={8}
          {...(keepSide && { collisionAvoidance: { side: 'none' } as const })}
          {...(at ? { anchor: toPositionerAnchor(at) } : anchor ? { anchor } : {})}
          className={positionerClassName}
        >
          <BasePopover.Popup
            {...popupProps}
            ref={popup}
            initialFocus={initialFocus === 'popup' ? popup : initialFocus === 'first-control'}
            className={cx(
              tip
                ? cx('max-w-sm text-left', tipClassName)
                : cx(
                    panelClassName,
                    'max-h-(--available-height) max-w-[calc(100vw-16px)] overflow-y-auto p-3',
                  ),
              className,
            )}
          >
            {tip && <BasePopover.Arrow className={tipArrowClassName} />}
            {title && (
              <BasePopover.Title className="mb-2 text-sm font-semibold">{title}</BasePopover.Title>
            )}
            <CloseContext value={close}>{children}</CloseContext>
          </BasePopover.Popup>
        </BasePopover.Positioner>
      </BasePopover.Portal>
    </BasePopover.Root>
  )
}

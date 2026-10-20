import { Popover as BasePopover } from '@base-ui/react/popover'
import { createContext, type ReactElement, type ReactNode, use, useCallback, useRef } from 'react'
import { cx } from '../cx'
import {
  type FloatingAnchor,
  panelClassName,
  positionerClassName,
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
  /** With `openOnHover`, how long the pointer rests on the trigger before it opens, in
   *  milliseconds. 0 opens it at once, as for a collapsed rail's flyout. */
  hoverDelay?: number | undefined
  /** With `openOnHover`, how long it stays open after the pointer leaves, in milliseconds,
   *  so the pointer can cross the gap to it. */
  hoverCloseDelay?: number | undefined
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
  /** At phone width, under 640px, opens as a sheet along the bottom of the screen, as wide as
   *  the screen and scrolling inside, rather than in the strip of page beside its trigger. On
   *  by default for a panel with a trigger; off for a tip and for a popover opened `at` a point,
   *  which belongs where the reader is. */
  sheet?: boolean | undefined
  /** `panel` holds controls or a list; `tip` is a tooltip-sized note in the tooltip's look. */
  variant?: 'panel' | 'tip'
  /** A panel's content reaches its edges, such as a list of suggestions whose rows pad
   *  themselves and highlight edge to edge. A title keeps its own padding. */
  flush?: boolean | undefined
  /** On the popup: its width, padding or text size. */
  className?: string
  children: ReactNode
}

// The positioner places itself with inline styles, so the sheet's own placement needs !important.
// The bottom gutter grows to clear a phone's home indicator.
const sheetPositionerClassName =
  'max-sm:fixed! max-sm:inset-x-2! max-sm:top-auto! max-sm:bottom-[max(8px,env(safe-area-inset-bottom))]! max-sm:transform-none!'

// Last in the class list, so it wins over a width or height the host set for the anchored panel.
const sheetPopupClassName =
  'max-sm:w-auto! max-sm:max-w-none! max-sm:max-h-[min(75dvh,calc(100dvh-16px))]! max-sm:origin-bottom!'

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
  hoverDelay = 300,
  hoverCloseDelay = 150,
  initialFocus = 'first-control',
  anchor,
  keepSide = false,
  variant = 'panel',
  sheet,
  flush = false,
  className,
  children,
  ...popupProps
}: PopoverProps) {
  const portal = usePopupContainer()
  const tip = variant === 'tip'
  const asSheet = sheet ?? (!tip && !at)
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
          {...(openOnHover ? { delay: hoverDelay, closeDelay: hoverCloseDelay } : {})}
        />
      )}
      <BasePopover.Portal {...portal}>
        <BasePopover.Positioner
          side={side}
          align={align}
          sideOffset={6}
          collisionPadding={8}
          {...(keepSide && { collisionAvoidance: { side: 'none' } as const })}
          {...(at ? { anchor: toPositionerAnchor(at) } : anchor ? { anchor } : {})}
          className={cx(positionerClassName, asSheet && sheetPositionerClassName)}
        >
          <BasePopover.Popup
            {...popupProps}
            ref={popup}
            initialFocus={initialFocus === 'popup' ? popup : initialFocus === 'first-control'}
            className={cx(
              tip
                ? cx('text-left', tipClassName)
                : cx(
                    panelClassName,
                    'max-h-(--available-height) max-w-[calc(100vw-16px)] overflow-y-auto',
                    !flush && 'p-3',
                  ),
              className,
              asSheet && sheetPopupClassName,
            )}
          >
            {title && (
              <BasePopover.Title
                className={cx('mb-2 text-sm font-semibold', flush && !tip && 'px-3 pt-3')}
              >
                {title}
              </BasePopover.Title>
            )}
            <CloseContext value={close}>{children}</CloseContext>
          </BasePopover.Popup>
        </BasePopover.Positioner>
      </BasePopover.Portal>
    </BasePopover.Root>
  )
}

import { PreviewCard } from '@base-ui/react/preview-card'
import type { PointerEventHandler, ReactElement, ReactNode, SyntheticEvent } from 'react'
import { cardClassName, positionerClassName } from './floating'
import { usePopupContainer } from './popupContainer'

/** What a hover card opens from: its own anchor, which opens it on hover or focus,
 *  or an element the host watches itself and opens it at, such as a term in
 *  rendered text that one listener on the page serves for every term. */
type HoverCardOpener =
  | {
      /** The anchor. It receives the trigger's props and ref, so it must pass them to its element. */
      children: ReactElement
      at?: never
    }
  | {
      /** The element it opens at while `open`. The host opens and closes it, with its own
       *  delays; Escape and a press outside ask it to close through `onOpenChange`. Null
       *  keeps it closed. */
      at: Element | null
      children?: never
    }

export type HoverCardProps = HoverCardOpener & {
  /** Mounted only while open, so a card that loads its own data loads on first hover. */
  card: ReactNode
  /** Opens on first render, for stories and screenshots. */
  defaultOpen?: boolean
  /** Open from outside, as with `at`. */
  open?: boolean | undefined
  onOpenChange?: ((open: boolean) => void) | undefined
  /** The pointer entered or left the card, so a host opening it with `at` can keep
   *  it open while the reader is over it. */
  onPointerEnter?: PointerEventHandler<HTMLDivElement> | undefined
  onPointerLeave?: PointerEventHandler<HTMLDivElement> | undefined
}

// React bubbles a portal's events through the tree it was rendered in, not
// the DOM it sits in, so a press inside the card would reach whatever holds
// its anchor: a row that opens on click or a menu on right click. The card is
// not part of that row, so its presses stop at its edge. Only presses stop:
// keys still reach the document, where Escape closes the card. Base UI's
// outside-press listeners capture, so this hides nothing from them.
const stop = (event: SyntheticEvent) => event.stopPropagation()
const pressHandlers = {
  onClick: stop,
  onAuxClick: stop,
  onDoubleClick: stop,
  onContextMenu: stop,
  onPointerDown: stop,
  onPointerUp: stop,
  onMouseDown: stop,
  onMouseUp: stop,
}

/** Detail about its anchor, such as a person's profile, after a short hover or
 *  on focus. A visual enhancement: whatever the card shows must also be
 *  reachable another way, such as the page the anchor links to. The card
 *  stays open while the pointer is over it. */
export function HoverCard({
  card,
  children,
  at,
  defaultOpen = false,
  open,
  onOpenChange,
  onPointerEnter,
  onPointerLeave,
}: HoverCardProps) {
  const portal = usePopupContainer()
  const delegated = at !== undefined
  // Opened at an element, it is closed while there is none to open at.
  const shown = delegated ? Boolean(open && at) : open
  return (
    <PreviewCard.Root
      defaultOpen={defaultOpen}
      {...(shown === undefined ? {} : { open: shown })}
      {...(onOpenChange ? { onOpenChange: (next: boolean) => onOpenChange(next) } : {})}
    >
      {children && <PreviewCard.Trigger delay={350} closeDelay={150} render={children} />}
      <PreviewCard.Portal {...portal}>
        <PreviewCard.Positioner
          side="bottom"
          align="start"
          sideOffset={8}
          collisionPadding={8}
          {...(at ? { anchor: at } : {})}
          className={positionerClassName}
        >
          <PreviewCard.Popup
            className={cardClassName}
            {...pressHandlers}
            onPointerEnter={onPointerEnter}
            onPointerLeave={onPointerLeave}
          >
            {card}
          </PreviewCard.Popup>
        </PreviewCard.Positioner>
      </PreviewCard.Portal>
    </PreviewCard.Root>
  )
}

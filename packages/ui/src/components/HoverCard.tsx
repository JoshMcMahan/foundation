import { PreviewCard } from '@base-ui/react/preview-card'
import type { ReactElement, ReactNode, SyntheticEvent } from 'react'
import { cardClassName, positionerClassName } from './floating'
import { usePopupContainer } from './popupContainer'

export interface HoverCardProps {
  /** Mounted only while open, so a card that loads its own data loads on first hover. */
  card: ReactNode
  /** The anchor. It receives the trigger's props and ref, so it must pass them to its element. */
  children: ReactElement
  /** Opens on first render, for stories and screenshots. */
  defaultOpen?: boolean
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
export function HoverCard({ card, children, defaultOpen = false }: HoverCardProps) {
  const portal = usePopupContainer()
  return (
    <PreviewCard.Root defaultOpen={defaultOpen}>
      <PreviewCard.Trigger delay={350} closeDelay={150} render={children} />
      <PreviewCard.Portal {...portal}>
        <PreviewCard.Positioner
          side="bottom"
          align="start"
          sideOffset={8}
          collisionPadding={8}
          className={positionerClassName}
        >
          <PreviewCard.Popup className={cardClassName} {...pressHandlers}>
            {card}
          </PreviewCard.Popup>
        </PreviewCard.Positioner>
      </PreviewCard.Portal>
    </PreviewCard.Root>
  )
}

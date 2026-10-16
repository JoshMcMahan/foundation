import { PreviewCard } from '@base-ui/react/preview-card'
import type { ReactElement, ReactNode } from 'react'
import { cardClassName, positionerClassName } from './floating'
import { useFullscreenContainer } from './fullscreen'

export interface HoverCardProps {
  /** Mounted only while open, so a card that loads its own data loads on first hover. */
  card: ReactNode
  /** The anchor. It receives the trigger's props and ref, so it must pass them to its element. */
  children: ReactElement
  /** Opens on first render, for stories and screenshots. */
  defaultOpen?: boolean
}

/** Detail about its anchor, such as a person's profile, after a short hover or
 *  on focus. A visual enhancement: whatever the card shows must also be
 *  reachable another way, such as the page the anchor links to. The card
 *  stays open while the pointer is over it. */
export function HoverCard({ card, children, defaultOpen = false }: HoverCardProps) {
  const fullscreen = useFullscreenContainer()
  return (
    <PreviewCard.Root defaultOpen={defaultOpen}>
      <PreviewCard.Trigger delay={350} closeDelay={150} render={children} />
      <PreviewCard.Portal container={fullscreen}>
        <PreviewCard.Positioner
          side="bottom"
          align="start"
          sideOffset={8}
          collisionPadding={8}
          className={positionerClassName}
        >
          <PreviewCard.Popup className={cardClassName}>{card}</PreviewCard.Popup>
        </PreviewCard.Positioner>
      </PreviewCard.Portal>
    </PreviewCard.Root>
  )
}

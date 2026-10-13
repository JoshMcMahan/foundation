import { Popover } from '@base-ui/react/popover'
import { clsx as cx } from 'clsx'
import { type ReactElement, type ReactNode, useRef } from 'react'
import { panelClassName, portalContainer, positionerClassName } from '../components/floating'

/** A toolbar button's panel, drawn over the page so the pane it sits in can't clip it.
 *  It opens above the button when there's room and below it otherwise, its right edge
 *  lined up with the button's. Escape closes it before the graph's own Escape sees the
 *  key, and focus goes back to the button. */
export function ToolbarPopover({
  trigger,
  label,
  open,
  onOpenChange,
  children,
}: {
  /** The button. It receives the trigger's props and ref, so it must pass them to its element. */
  trigger: ReactElement
  label: string
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
}) {
  const popup = useRef<HTMLDivElement>(null)
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger render={trigger} />
      <Popover.Portal container={portalContainer()}>
        <Popover.Positioner
          side="top"
          align="end"
          sideOffset={8}
          collisionPadding={8}
          className={positionerClassName}
        >
          <Popover.Popup
            ref={popup}
            aria-label={label}
            // The panel, not its first button: a list of problems shouldn't open on one picked.
            initialFocus={popup}
            className={cx(
              panelClassName,
              'w-96 max-w-[calc(100vw-16px)] max-h-(--available-height) overflow-y-auto p-3',
            )}
          >
            {/* Toolbar text: smaller than the panel's own. */}
            <div className="text-xs">{children}</div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}

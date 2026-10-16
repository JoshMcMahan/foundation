import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip'
import { createContext, Fragment, type ReactElement, type ReactNode, use, useState } from 'react'
import { positionerClassName, tipArrowClassName, tipClassName } from './floating'
import { useFullscreenContainer } from './fullscreen'
import { keyedByContent } from './keys'

export type TooltipSide = 'top' | 'bottom' | 'left' | 'right'

interface TooltipPayload {
  content: ReactNode
  shortcut?: string | undefined
  side: TooltipSide
}

type TooltipHandle = BaseTooltip.Handle<TooltipPayload>

const TooltipHandleContext = createContext<TooltipHandle | null>(null)

function KbdShortcut({ keys }: { keys: string }) {
  const parts = keys
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean)
  return (
    <span className="inline-flex items-center gap-1 align-middle">
      {keyedByContent(parts, (p) => p).map(({ key, item: part }, idx) => (
        <Fragment key={key}>
          {idx > 0 && <span className="opacity-60 text-[11px]">+</span>}
          <kbd className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded border border-current/30 bg-current/10 font-sans text-[11px] font-semibold leading-none">
            {part}
          </kbd>
        </Fragment>
      ))}
    </span>
  )
}

function TooltipPopup({ content, shortcut, side }: TooltipPayload) {
  const fullscreen = useFullscreenContainer()
  return (
    <BaseTooltip.Portal container={fullscreen}>
      <BaseTooltip.Positioner side={side} sideOffset={8} className={positionerClassName}>
        <BaseTooltip.Popup className={`max-w-xs ${tipClassName}`}>
          <BaseTooltip.Arrow className={tipArrowClassName} />
          {shortcut ? (
            <span className="inline-flex items-center gap-2">
              {content}
              <KbdShortcut keys={shortcut} />
            </span>
          ) : (
            content
          )}
        </BaseTooltip.Popup>
      </BaseTooltip.Positioner>
    </BaseTooltip.Portal>
  )
}

/** One popup serves every Tooltip below it, so each anchor costs only a trigger.
 *  UIProvider mounts it; nothing else needs to. */
export function TooltipProvider({ children }: { children: ReactNode }) {
  const [handle] = useState(() => BaseTooltip.createHandle<TooltipPayload>())
  return (
    <BaseTooltip.Provider>
      <TooltipHandleContext value={handle}>{children}</TooltipHandleContext>
      <BaseTooltip.Root handle={handle} onOpenChange={skipUnclipped}>
        {({ payload }) => payload && <TooltipPopup {...payload} />}
      </BaseTooltip.Root>
    </BaseTooltip.Provider>
  )
}

/** An overflowOnly anchor opens only while its text is cut off. */
function skipUnclipped(open: boolean, details: BaseTooltip.Root.ChangeEventDetails) {
  const anchor = details.trigger
  if (
    open &&
    anchor instanceof HTMLElement &&
    anchor.hasAttribute('data-overflow-only') &&
    anchor.scrollWidth <= anchor.clientWidth
  ) {
    details.cancel()
  }
}

/** Props beyond the tooltip's own go to the anchor, so a Tooltip can be another
 *  trigger's render target, such as a popover button with a hint. */
export interface TooltipProps
  extends Omit<
    BaseTooltip.Trigger.Props,
    'content' | 'children' | 'render' | 'handle' | 'payload'
  > {
  /** Nothing to show disables the tooltip. Newlines in a string break lines. */
  content: ReactNode
  /** The anchor. It receives the trigger's props and ref, so it must pass them to its element. */
  children: ReactElement
  side?: TooltipSide
  /** Keys shown beside the content, joined with +, such as ⌘+F. */
  shortcut?: string | undefined
  disabled?: boolean | undefined
  /** Opens only while the anchor's text is clipped, such as a truncated label. */
  overflowOnly?: boolean
}

/** A visual hint for sighted pointer and keyboard users. The anchor still needs
 *  its own accessible name; use InfoTip for content everyone must reach. */
export function Tooltip({
  content,
  children,
  side = 'top',
  shortcut,
  disabled = false,
  overflowOnly = false,
  ...anchorProps
}: TooltipProps) {
  const handle = use(TooltipHandleContext)
  const payload = { content, shortcut, side }
  const trigger = (
    <BaseTooltip.Trigger
      {...anchorProps}
      handle={handle ?? undefined}
      payload={payload}
      disabled={disabled || !content}
      data-overflow-only={overflowOnly || undefined}
      render={children}
    />
  )
  if (handle) {
    return trigger
  }
  // Outside UIProvider each tooltip brings its own root.
  return (
    <BaseTooltip.Root onOpenChange={skipUnclipped}>
      {trigger}
      <TooltipPopup {...payload} />
    </BaseTooltip.Root>
  )
}

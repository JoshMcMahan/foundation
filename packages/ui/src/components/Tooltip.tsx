import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip'
import {
  cloneElement,
  createContext,
  Fragment,
  type ReactElement,
  type ReactNode,
  use,
  useId,
  useState,
} from 'react'
import { positionerClassName, tipClassName } from './floating'
import { keyedByContent } from './keys'
import { usePopupContainer } from './popupContainer'

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
  const portal = usePopupContainer()
  return (
    <BaseTooltip.Portal {...portal}>
      <BaseTooltip.Positioner side={side} sideOffset={6} className={positionerClassName}>
        <BaseTooltip.Popup className={tipClassName}>
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

/** How long the pointer rests on an anchor before its tooltip opens, in milliseconds.
 *  Once one is open, the next opens at once. An anchor's own `delay` overrides it,
 *  such as 0 on a collapsed rail where the tooltip is the only label. */
const OPEN_DELAY = 400

/** One popup serves every Tooltip below it, so each anchor costs only a trigger.
 *  UIProvider mounts it; nothing else needs to. */
export function TooltipProvider({ children }: { children: ReactNode }) {
  const [handle] = useState(() => BaseTooltip.createHandle<TooltipPayload>())
  return (
    <BaseTooltip.Provider delay={OPEN_DELAY}>
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
  /** Also the anchor's accessible description, for a hint that adds to its name
   *  rather than repeating it, such as what Make default changes. Assistive
   *  technology reads it with the anchor whether or not the tooltip is open. */
  describesAnchor?: boolean | undefined
}

/** A visual hint for sighted pointer and keyboard users. The anchor still needs
 *  its own accessible name; `describesAnchor` also gives assistive technology the
 *  hint. Use InfoTip for content everyone must reach, such as on a touch screen. */
export function Tooltip({
  content,
  children,
  side = 'top',
  shortcut,
  disabled = false,
  overflowOnly = false,
  describesAnchor = false,
  ...anchorProps
}: TooltipProps) {
  const handle = use(TooltipHandleContext)
  const descriptionId = useId()
  const payload = { content, shortcut, side }
  const described = describesAnchor && !disabled && !!content
  const anchor = children as ReactElement<{ 'aria-describedby'?: string | undefined }>
  const ownDescription = anchor.props['aria-describedby']
  const describedBy = [ownDescription, anchorProps['aria-describedby'], descriptionId]
    .filter(Boolean)
    .join(' ')
  const trigger = (
    <BaseTooltip.Trigger
      {...anchorProps}
      // Outside UIProvider each tooltip has its own provider-less root, so it takes the delay itself.
      {...(!handle && anchorProps.delay === undefined && { delay: OPEN_DELAY })}
      handle={handle ?? undefined}
      payload={payload}
      disabled={disabled || !content}
      data-overflow-only={overflowOnly || undefined}
      // The anchor's own props win over the trigger's, so its description joins there.
      render={described ? cloneElement(anchor, { 'aria-describedby': describedBy }) : children}
    />
  )
  // The description stays in the DOM, hidden, so it is read whether or not the
  // shared popup is showing this anchor's tip.
  const description = described && (
    <span id={descriptionId} hidden>
      {content}
    </span>
  )
  if (handle) {
    return description ? (
      <>
        {trigger}
        {description}
      </>
    ) : (
      trigger
    )
  }
  // Outside UIProvider each tooltip brings its own root.
  return (
    <BaseTooltip.Root onOpenChange={skipUnclipped}>
      {trigger}
      {description}
      <TooltipPopup {...payload} />
    </BaseTooltip.Root>
  )
}

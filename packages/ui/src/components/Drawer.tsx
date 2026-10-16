import { Drawer as BaseDrawer } from '@base-ui/react/drawer'
import { type ReactNode, useLayoutEffect, useRef, useState } from 'react'
import { cx } from '../cx'
import { ArrowLeftIcon, CloseIcon } from '../icons'
import { closeHandler, dialogFooterClassName } from './dismiss'
import { useFullscreenContainer } from './fullscreen'
import { IconButton } from './IconButton'
import { useStrings } from './Provider'
import { useSplitter } from './splitter'

export interface DrawerProps
  extends Omit<BaseDrawer.Popup.Props, 'className' | 'children' | 'render' | 'title'> {
  open: boolean
  onClose: () => void
  /** The header's heading, which names the drawer. Without one, name it with `aria-label`. */
  title?: ReactNode
  /** A line under the title. */
  description?: ReactNode
  /** Adds a back arrow before the title, for a view the drawer opened over its first, such as
   *  a form; the drawer stays one drawer rather than another stacking on it. */
  onBack?: (() => void) | undefined
  /** Names the back arrow; defaults to the provider's `back`. */
  backLabel?: string | undefined
  /** Actions along the bottom edge, such as Cancel and Save; they stay in view as the body scrolls. */
  footer?: ReactNode
  /** The edge it slides in from, and the way a swipe dismisses it. */
  side?: 'left' | 'right'
  /** Its width: pixels, or any CSS length such as `'100%'` for as wide as the space allows. */
  width?: number | string
  /** Adds a handle on the inner edge that drags, or arrow keys move, to change the width. */
  resizable?: boolean
  /** The narrowest a drag leaves it, in pixels. */
  minWidth?: number
  /** False ignores the backdrop and Escape, so typed input isn't lost to a stray
   *  click; the drawer's own buttons still close it. */
  dismissible?: boolean
  /** True dims the page behind it, locks its scroll and keeps focus inside;
   *  `'trap-focus'` dims and keeps focus but leaves the page's scroll alone, as an
   *  embedded panel wants; false is a side panel the page stays usable beside. */
  modal?: boolean | 'trap-focus'
  /** False drops the header's close button, for a drawer whose footer closes it. */
  closeButton?: boolean
  /** Covers its nearest positioned ancestor instead of the window, as a drawer
   *  inside an embedded panel does. */
  contained?: boolean
  /** Keeps the content mounted while closed, so its scroll and state survive. */
  keepMounted?: boolean
  /** False drops the body's padding, for content that fills the drawer edge to edge. */
  padded?: boolean
  /** On the body. */
  className?: string
  children: ReactNode
}

/** A panel that slides in from an edge over the page. A swipe toward that edge,
 *  Escape or a press outside closes it, and focus returns where it was.
 *
 *  It leaves the host's fixed chrome uncovered: it starts below
 *  `--app-inset-top` (a top bar's height), and at its widest leaves the strip
 *  `--app-inset-start` (a start-side sidebar's width, at least 2.5rem). Set both
 *  on the document root. */
export function Drawer({
  open,
  onClose,
  title,
  description,
  onBack,
  backLabel,
  footer,
  side = 'right',
  width = 480,
  resizable = false,
  minWidth = 320,
  dismissible = true,
  modal = true,
  closeButton = true,
  contained = false,
  keepMounted = false,
  padded = true,
  className,
  children,
  ...popupProps
}: DrawerProps) {
  const fullscreen = useFullscreenContainer()
  const { common } = useStrings()
  const container = useRef<HTMLDivElement>(null)
  const viewport = useRef<HTMLDivElement>(null)
  // In state, not a ref: the portal mounts it a render after it opens.
  const [popup, setPopup] = useState<HTMLDivElement | null>(null)
  // A width the reader chose with the handle, which then wins over `width`.
  const [chosen, setChosen] = useState<number | null>(null)
  const rendered = useRenderedWidth(resizable ? popup : null)
  const splitter = useSplitter({
    width: chosen ?? rendered ?? (typeof width === 'number' ? width : minWidth),
    onWidthChange: setChosen,
    min: minWidth,
    max: () => innerWidth(viewport.current),
    side: side === 'right' ? 'left' : 'right',
  })
  const header = title !== undefined || description !== undefined || closeButton
  // A contained drawer fills its container; one over the window leaves the host's top bar uncovered.
  const area = contained ? 'absolute inset-0' : 'fixed inset-x-0 bottom-0 top-(--app-inset-top,0px)'

  const onOpenChange = closeHandler(dismissible, onClose)

  return (
    <BaseDrawer.Root
      open={open}
      onOpenChange={onOpenChange}
      swipeDirection={side}
      modal={modal}
      disablePointerDismissal={!dismissible}
    >
      {contained && <div ref={container} className="contents" />}
      <BaseDrawer.Portal
        container={contained ? container : fullscreen}
        keepMounted={keepMounted}
        className={contained ? 'contents' : undefined}
      >
        {modal !== false && (
          <BaseDrawer.Backdrop
            className={cx(
              area,
              'z-(--layer-drawer) bg-black/40 opacity-[calc(1-var(--drawer-swipe-progress))] transition-opacity duration-300 data-ending-style:opacity-0 data-starting-style:opacity-0 data-swiping:duration-0 motion-reduce:transition-none',
            )}
          />
        )}
        <BaseDrawer.Viewport
          ref={viewport}
          className={cx(
            area,
            // Passes presses through to the page beside the drawer when it isn't modal.
            'pointer-events-none z-(--layer-drawer) flex',
            side === 'right'
              ? 'justify-end pl-[max(var(--app-inset-start,0px),2.5rem)]'
              : 'justify-start pl-(--app-inset-start,0px) pr-10',
          )}
        >
          <BaseDrawer.Popup
            {...popupProps}
            ref={setPopup}
            className={cx(
              'pointer-events-auto relative flex h-full max-w-full flex-col border-(--theme-border) bg-(--theme-panel-bg) text-(--theme-app) shadow-xl outline-none',
              side === 'right' ? 'border-l' : 'border-r',
              'transition-transform duration-300 ease-in-out [transform:translateX(var(--drawer-swipe-movement-x))] data-swiping:select-none data-swiping:duration-0 motion-reduce:transition-none',
              side === 'right'
                ? 'data-ending-style:[transform:translateX(100%)] data-starting-style:[transform:translateX(100%)]'
                : 'data-ending-style:[transform:translateX(-100%)] data-starting-style:[transform:translateX(-100%)]',
            )}
            style={{ width: splitter.resizing || chosen !== null ? splitter.width : width }}
          >
            {resizable && (
              // Its drag resizes; it mustn't also swipe the drawer shut.
              <div {...splitter.separatorProps} data-base-ui-swipe-ignore="" />
            )}
            <BaseDrawer.Content className="flex min-h-0 flex-1 flex-col">
              {header && (
                <div className="flex shrink-0 items-start gap-3 border-b border-(--theme-border) px-4 py-3">
                  {onBack && (
                    <IconButton
                      icon={<ArrowLeftIcon />}
                      label={backLabel ?? common.back}
                      onClick={onBack}
                      className="-my-1 -ms-1.5"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    {title !== undefined && (
                      // A long name wraps rather than hiding its end, which may be what tells two apart.
                      <BaseDrawer.Title className="m-0 text-sm font-semibold wrap-break-word">
                        {title}
                      </BaseDrawer.Title>
                    )}
                    {description !== undefined && (
                      <BaseDrawer.Description className="mt-0.5 text-xs text-(--theme-muted-text-color)">
                        {description}
                      </BaseDrawer.Description>
                    )}
                  </div>
                  {closeButton && (
                    <BaseDrawer.Close
                      render={
                        <IconButton
                          icon={<CloseIcon />}
                          label={common.close}
                          className="-my-1 -me-1.5"
                        />
                      }
                    />
                  )}
                </div>
              )}
              <div
                className={cx(
                  'relative flex min-h-0 flex-1 flex-col overflow-y-auto',
                  padded && 'p-4',
                  className,
                )}
              >
                {children}
              </div>
              {footer && <div className={cx(dialogFooterClassName, 'px-4')}>{footer}</div>}
            </BaseDrawer.Content>
          </BaseDrawer.Popup>
        </BaseDrawer.Viewport>
      </BaseDrawer.Portal>
    </BaseDrawer.Root>
  )
}

/** The width an element renders at, which its CSS may hold below the width asked for. */
function useRenderedWidth(el: HTMLElement | null): number | null {
  const [rendered, setRendered] = useState<number | null>(null)
  useLayoutEffect(() => {
    if (!el) {
      return
    }
    const measure = () => setRendered(el.getBoundingClientRect().width || null)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [el])
  return rendered
}

/** The room inside the drawer's viewport, past its gutter; unbounded before layout, as in a test. */
function innerWidth(el: HTMLElement | null): number {
  if (!el?.clientWidth) {
    return Number.POSITIVE_INFINITY
  }
  const style = getComputedStyle(el)
  return (
    el.clientWidth -
    (Number.parseFloat(style.paddingLeft) || 0) -
    (Number.parseFloat(style.paddingRight) || 0)
  )
}

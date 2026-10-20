import { AlertDialog } from '@base-ui/react/alert-dialog'
import { Dialog } from '@base-ui/react/dialog'
import { type FormEvent, type ReactNode, useRef } from 'react'
import { cx } from '../cx'
import { CloseIcon } from '../icons'
import { closeHandler, dialogFooterClassName } from './dismiss'
import { IconButton } from './IconButton'
import { useStrings } from './Provider'
import { usePopupContainer } from './popupContainer'

/** The panel a modal draws by default; pass `panel={false}` to paint your own. */
export const modalPanelClassName =
  'rounded-xl border border-(--theme-border) bg-(--theme-panel-bg) text-(--theme-app) shadow-2xl'

// At phone width the actions take the footer's width between them and a thumb's height, and
// anything else in the footer, such as a hint, takes a line of its own above them.
const phoneFooterClassName =
  'max-sm:flex-wrap max-sm:[&>:is(button,a)]:h-10 max-sm:[&>:is(button,a)]:flex-1 max-sm:[&>:not(button,a)]:basis-full'

/** Names the modal for assistive technology; renders an `<h2>`. */
export const ModalTitle = Dialog.Title
/** Describes the modal for assistive technology; renders a `<p>`. */
export const ModalDescription = Dialog.Description

const sizeClasses = {
  sm: 'w-[400px]',
  md: 'w-[480px]',
  lg: 'w-[560px]',
  xl: 'w-[672px]',
} as const

export type ModalSize = keyof typeof sizeClasses

// A fade with a slight scale, as every popup has; with reduced motion it only fades.
const popupMotion =
  'transition-[transform,opacity] duration-150 ease-out data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0 motion-reduce:data-starting-style:scale-100 motion-reduce:data-ending-style:scale-100'
const backdropMotion =
  'transition-opacity duration-150 ease-out data-starting-style:opacity-0 data-ending-style:opacity-0'

const CONTROLS =
  'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]):not([data-modal-close]), a[href], [tabindex]:not([tabindex="-1"]):not([data-modal-close])'

/** The first control in a panel other than its close button, or the panel itself. */
function firstControlIn(panel: HTMLElement | null): HTMLElement | boolean {
  return panel?.querySelector<HTMLElement>(CONTROLS) ?? panel ?? true
}

export interface ModalProps
  extends Omit<Dialog.Popup.Props, 'className' | 'children' | 'render' | 'title' | 'onSubmit'> {
  open: boolean
  onClose: () => void
  /** The header's heading, which names the modal. Without one, name it with
   *  `aria-label`, or with a `ModalTitle` among the children. */
  title?: ReactNode
  /** A line under the title, which describes the modal. */
  description?: ReactNode
  /** Actions along the bottom edge, such as Cancel and Save, ruled off from the
   *  body; they stay in view as a tall body scrolls. */
  footer?: ReactNode
  /** Its width, which narrows to fit a small window. Without one, it's as wide
   *  as its content. */
  size?: ModalSize | undefined
  /** A confirmation the person must answer: it takes the alertdialog role and the
   *  backdrop doesn't close it. Escape still cancels while it's dismissible. */
  alert?: boolean | undefined
  /** False ignores the backdrop and Escape, so typed input isn't lost to a stray
   *  click; the modal's own buttons still close it. */
  dismissible?: boolean | undefined
  /** Where the panel sits: near the top of the window, or in its middle. */
  align?: 'top' | 'center' | undefined
  /** Draws the default panel surface around `className`. */
  panel?: boolean
  /** The backdrop's dimming, for a modal that needs a darker or blurred stage. */
  backdropClassName?: string
  /** Adds a close button at the header's end, for a modal whose footer doesn't close it,
   *  such as one that only shows something. It needs no title. */
  closeButton?: boolean | undefined
  /** Makes the header, body and footer one form, so a `type="submit"` button in the footer
   *  submits it, as Enter in a field does. The page never reloads: its default is prevented. */
  onSubmit?: ((event: FormEvent<HTMLFormElement>) => void) | undefined
  /** On the panel. */
  className?: string
  /** The body. With a title or a footer it sits padded between them and scrolls
   *  when the window is short; without either, it is the whole panel. */
  children?: ReactNode
}

/** A modal dialog: focus stays inside, the page behind is inert and doesn't scroll,
 *  and focus returns to where it was on close. Give it a `title`, a `description`
 *  and a `footer` for the standard layout, as a Drawer has, or lay out the whole
 *  panel with the children. */
export function Modal({
  open,
  onClose,
  title,
  description,
  footer,
  size,
  alert = false,
  dismissible = true,
  align = 'top',
  panel = true,
  // Darker in a dark scheme, where the same dimming barely shows against a dark page.
  backdropClassName = 'bg-(--theme-backdrop)',
  closeButton = false,
  onSubmit,
  className,
  children,
  initialFocus,
  ...popupProps
}: ModalProps) {
  const portal = usePopupContainer()
  const { common } = useStrings()
  const panelElement = useRef<HTMLDivElement | null>(null)
  const onOpenChange = closeHandler(dismissible, onClose)
  const titled = title !== undefined || description !== undefined
  const header = titled || closeButton
  const body = children !== undefined && children !== null && children !== false
  const laidOut = header || footer !== undefined || onSubmit !== undefined
  const sections = (
    <>
      {header && (
        <div className={cx('flex shrink-0 items-start gap-3 px-4 pt-4', !body && 'pb-4')}>
          {titled && (
            <div className="min-w-0 flex-1">
              {title !== undefined && (
                <ModalTitle className="m-0 text-lg font-semibold wrap-break-word">
                  {title}
                </ModalTitle>
              )}
              {description !== undefined && (
                <ModalDescription className="m-0 mt-1.5 text-sm text-(--theme-muted-text-color)">
                  {description}
                </ModalDescription>
              )}
            </div>
          )}
          {closeButton && (
            <Dialog.Close
              data-modal-close=""
              render={
                <IconButton
                  icon={<CloseIcon />}
                  label={common.close}
                  // Level with the title's first line, and flush with the panel's padding.
                  className="-me-1.5 ms-auto mt-0"
                />
              }
            />
          )}
        </div>
      )}
      {body && (
        // A short window scrolls the body alone, keeping the title and the actions in view.
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          {children}
        </div>
      )}
      {footer !== undefined && (
        <div className={cx(dialogFooterClassName, phoneFooterClassName)}>{footer}</div>
      )}
    </>
  )
  const content = (
    <Dialog.Portal {...portal}>
      <Dialog.Backdrop
        className={cx('fixed inset-0 z-(--layer-modal)', backdropMotion, backdropClassName)}
      />
      <Dialog.Viewport
        className={cx(
          // pb keeps tall panels (max-h-full) off the window's bottom edge, and
          // pt clears the toasts along the top so none covers the panel. At phone width the
          // panel takes the width less an 8px gutter, as a sheet does, so its fields keep room;
          // it stays near the top, where an on-screen keyboard doesn't cover it.
          'fixed inset-0 z-(--layer-modal) flex justify-center px-4 pt-20 pb-8 max-sm:px-2 max-sm:pb-[max(8px,env(safe-area-inset-bottom))]',
          align === 'center' ? 'items-center' : 'items-start sm:pt-[max(14vh,5rem)]',
        )}
      >
        <Dialog.Popup
          {...popupProps}
          ref={(element: HTMLDivElement | null) => {
            panelElement.current = element
            const forward = popupProps.ref
            if (typeof forward === 'function') {
              forward(element)
            } else if (forward) {
              forward.current = element
            }
          }}
          initialFocus={
            initialFocus ??
            // The close button comes first, but opening on it would greet the reader with its
            // ring and tip: focus starts on the first control after it, or the panel itself.
            (closeButton ? () => firstControlIn(panelElement.current) : undefined)
          }
          className={cx(
            panel && modalPanelClassName,
            size && [sizeClasses[size], 'max-w-full'],
            panel && (size || laidOut) && 'max-sm:w-full',
            laidOut && 'flex max-h-full flex-col',
            'outline-none',
            popupMotion,
            className,
          )}
        >
          {!laidOut ? (
            children
          ) : onSubmit ? (
            <form
              className="flex min-h-0 flex-1 flex-col"
              onSubmit={(event) => {
                event.preventDefault()
                onSubmit(event)
              }}
            >
              {sections}
            </form>
          ) : (
            sections
          )}
        </Dialog.Popup>
      </Dialog.Viewport>
    </Dialog.Portal>
  )
  // The alert root shares Dialog's parts; it differs in role and in ignoring the backdrop.
  return alert ? (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      {content}
    </AlertDialog.Root>
  ) : (
    <Dialog.Root open={open} disablePointerDismissal={!dismissible} onOpenChange={onOpenChange}>
      {content}
    </Dialog.Root>
  )
}

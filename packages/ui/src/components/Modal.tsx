import { AlertDialog } from '@base-ui/react/alert-dialog'
import { Dialog } from '@base-ui/react/dialog'
import { clsx as cx } from 'clsx'
import type { ReactNode } from 'react'
import { portalContainer } from './floating'

/** The panel a modal draws by default; pass `panel={false}` to paint your own. */
export const modalPanelClassName =
  'rounded-xl border border-(--theme-border) bg-(--theme-app-bg) text-(--theme-app) shadow-2xl'

/** Names the modal for assistive technology; renders an `<h2>`. */
export const ModalTitle = Dialog.Title
/** Describes the modal for assistive technology; renders a `<p>`. */
export const ModalDescription = Dialog.Description

export interface ModalProps extends Omit<Dialog.Popup.Props, 'className' | 'children' | 'render'> {
  open: boolean
  onClose: () => void
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
  className?: string
  children: ReactNode
}

/** A modal dialog: focus stays inside, the page behind is inert and doesn't scroll,
 *  and focus returns to where it was on close. Name it with `ModalTitle` or `aria-label`. */
export function Modal({
  open,
  onClose,
  alert = false,
  dismissible = true,
  align = 'top',
  panel = true,
  backdropClassName = 'bg-black/40',
  className,
  children,
  ...popupProps
}: ModalProps) {
  const onOpenChange = (next: boolean, details: Dialog.Root.ChangeEventDetails) => {
    if (next) {
      return
    }
    if (!dismissible && details.reason === 'escape-key') {
      details.cancel()
      return
    }
    onClose()
  }
  const content = (
    <Dialog.Portal container={portalContainer()}>
      <Dialog.Backdrop className={cx('fixed inset-0 z-[9990]', backdropClassName)} />
      <Dialog.Viewport
        className={cx(
          // pb keeps tall panels (max-h-full) off the window's bottom edge.
          'fixed inset-0 z-[9990] flex justify-center px-4 pb-8',
          align === 'center' ? 'items-center' : 'items-start pt-[14vh]',
        )}
      >
        <Dialog.Popup
          {...popupProps}
          className={cx(panel && modalPanelClassName, 'outline-none', className)}
        >
          {children}
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

import { AlertDialog } from '@base-ui/react/alert-dialog'
import { Dialog } from '@base-ui/react/dialog'
import type { ReactNode } from 'react'
import { cx } from '../cx'
import { closeHandler, dialogFooterClassName } from './dismiss'
import { usePopupContainer } from './popupContainer'

/** The panel a modal draws by default; pass `panel={false}` to paint your own. */
export const modalPanelClassName =
  'rounded-xl border border-(--theme-border) bg-(--theme-app-bg) text-(--theme-app) shadow-2xl'

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

export interface ModalProps
  extends Omit<Dialog.Popup.Props, 'className' | 'children' | 'render' | 'title'> {
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
  backdropClassName = 'bg-black/40',
  className,
  children,
  ...popupProps
}: ModalProps) {
  const portal = usePopupContainer()
  const onOpenChange = closeHandler(dismissible, onClose)
  const header = title !== undefined || description !== undefined
  const body = children !== undefined && children !== null && children !== false
  const laidOut = header || footer !== undefined
  const content = (
    <Dialog.Portal {...portal}>
      <Dialog.Backdrop className={cx('fixed inset-0 z-(--layer-modal)', backdropClassName)} />
      <Dialog.Viewport
        className={cx(
          // pb keeps tall panels (max-h-full) off the window's bottom edge, and
          // pt clears the toasts along the top so none covers the panel.
          'fixed inset-0 z-(--layer-modal) flex justify-center px-4 pt-20 pb-8',
          align === 'center' ? 'items-center' : 'items-start sm:pt-[max(14vh,5rem)]',
        )}
      >
        <Dialog.Popup
          {...popupProps}
          className={cx(
            panel && modalPanelClassName,
            size && [sizeClasses[size], 'max-w-full'],
            laidOut && 'flex max-h-full flex-col',
            'outline-none',
            className,
          )}
        >
          {laidOut ? (
            <>
              {header && (
                <div className={cx('shrink-0 px-4 pt-4', !body && 'pb-4')}>
                  {title !== undefined && (
                    <ModalTitle className="m-0 text-lg font-semibold">{title}</ModalTitle>
                  )}
                  {description !== undefined && (
                    <ModalDescription className="m-0 mt-1.5 text-sm text-(--theme-muted-text-color)">
                      {description}
                    </ModalDescription>
                  )}
                </div>
              )}
              {body && (
                // A short window scrolls the body alone, keeping the title and the actions in view.
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
                  {children}
                </div>
              )}
              {footer !== undefined && <div className={dialogFooterClassName}>{footer}</div>}
            </>
          ) : (
            children
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

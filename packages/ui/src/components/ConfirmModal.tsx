import type { ReactNode } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from './Button'
import { ErrorText } from './Field'
import { Modal, type ModalSize } from './Modal'
import { useStrings } from './Provider'

/** What the reader types or picks in, which takes focus ahead of the buttons. A checkbox or
 *  radio doesn't: a destructive dialog with one still opens on Cancel. Inputs a picker keeps
 *  out of the tab order, for its form value, aren't fields. */
const FIELDS = [
  'input:not([disabled]):not([type="hidden"]):not([type="checkbox"]):not([type="radio"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[role="combobox"]:not([disabled]):not([aria-disabled="true"])',
  '[contenteditable="true"]',
]
  .map((field) => `${field}:not([tabindex="-1"]):not([aria-hidden="true"])`)
  .join(', ')

export interface ConfirmModalProps {
  open: boolean
  onClose: () => void
  /** The question, which names the dialog: "Delete cluster?" */
  title: string
  /** What follows from confirming, which describes the dialog. */
  description?: ReactNode
  /** More to read or to choose before confirming, such as a field. */
  children?: ReactNode
  /** The verb that confirms, such as "Delete"; never "OK". */
  confirmLabel: string
  /** An async handler keeps both buttons disabled until it settles. One that
   *  rejects leaves the dialog open and rethrows, so report the error in the
   *  handler, or pass it back as `error` to show it in the dialog. */
  // biome-ignore lint/suspicious/noConfusingVoidType: accepts sync and async handlers
  onConfirm: () => void | Promise<unknown>
  confirmDisabled?: boolean | undefined
  /** An action that can't be undone: the confirm button reads as dangerous, and
   *  the dialog is an alertdialog that waits for an answer. */
  destructive?: boolean | undefined
  align?: 'top' | 'center' | undefined
  cancelLabel?: string | undefined
  /** When false, the dialog stays open after a successful confirm. */
  closeOnConfirm?: boolean | undefined
  /** What has focus as it opens. With a field in the body, such as a name to type, the first
   *  of them (`first-control`), so the reader types at once. Without one, Cancel for a
   *  destructive dialog, so a stray Enter destroys nothing, and the confirm button otherwise,
   *  so the keyboard answers at once. */
  initialFocus?: 'cancel' | 'confirm' | 'first-control' | undefined
  /** Work the host runs for it, such as a mutation already under way: the buttons wait, and
   *  the dialog can't be dismissed, as while its own handler runs. */
  pending?: boolean | undefined
  /** Why the last confirm failed, under the body, so the reader can try again. */
  error?: ReactNode
  size?: ModalSize | undefined
}

/** Asks before an action: its title the question, its description what follows,
 *  and Cancel beside a confirm button named for the action. */
export function ConfirmModal({
  open,
  onClose,
  title,
  description,
  children,
  confirmLabel,
  onConfirm,
  confirmDisabled = false,
  destructive = false,
  align = 'top',
  cancelLabel,
  closeOnConfirm = true,
  initialFocus,
  pending: pendingProp = false,
  error,
  size = 'md',
}: ConfirmModalProps) {
  const { common } = useStrings()
  const [running, setRunning] = useState(false)
  // A second press before the first settles, or a double click, confirms once. Once it has
  // confirmed and closed, it stays guarded through the closing animation until it reopens.
  const fired = useRef(false)
  const cancelButton = useRef<HTMLButtonElement>(null)
  const confirmButton = useRef<HTMLButtonElement>(null)
  const bodyElement = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (open) {
      fired.current = false
    }
  }, [open])
  const pending = running || pendingProp

  const runConfirm = async () => {
    if (fired.current || pendingProp) {
      return
    }
    fired.current = true
    setRunning(true)
    let closing = false
    try {
      await onConfirm()
      closing = closeOnConfirm
      if (closing) {
        onClose()
      }
    } finally {
      fired.current = closing
      setRunning(false)
    }
  }

  const body =
    children !== undefined && children !== null && children !== false ? (
      error ? (
        <div className="flex flex-col gap-3">
          {children}
          <ErrorText>{error}</ErrorText>
        </div>
      ) : (
        children
      )
    ) : error ? (
      <ErrorText>{error}</ErrorText>
    ) : undefined

  return (
    <Modal
      alert={destructive}
      open={open}
      onClose={onClose}
      align={align}
      dismissible={!pending}
      size={size}
      title={title}
      description={description}
      initialFocus={() => {
        const button = (
          initialFocus === 'cancel' || (initialFocus !== 'confirm' && destructive)
            ? cancelButton
            : confirmButton
        ).current
        if (initialFocus === 'cancel' || initialFocus === 'confirm') {
          return button ?? true
        }
        return bodyElement.current?.querySelector<HTMLElement>(FIELDS) ?? button ?? true
      }}
      footer={
        <>
          <Button ref={cancelButton} variant="ghost" size="sm" onClick={onClose} disabled={pending}>
            {cancelLabel ?? common.cancel}
          </Button>
          <Button
            ref={confirmButton}
            variant={destructive ? 'danger' : 'primary'}
            size="sm"
            onClick={runConfirm}
            disabled={confirmDisabled}
            loading={pending}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {body !== undefined && (
        // Laid out as if it weren't there; it only bounds the search for a field to focus.
        <div ref={bodyElement} className="contents">
          {body}
        </div>
      )}
    </Modal>
  )
}

/** What `confirm` asks: a ConfirmModal's props without the ones the hook manages. */
export interface ConfirmRequest
  extends Omit<ConfirmModalProps, 'open' | 'onClose' | 'error' | 'pending'> {
  /** Turns a rejected `onConfirm` into the line the dialog shows, and the dialog stays open
   *  for another try. Without it, a rejection still keeps the dialog open, silently. */
  errorMessage?: ((error: unknown) => ReactNode) | undefined
}

/** Asks from anywhere, such as a menu row, without keeping a dialog's state by hand:
 *  `const { confirm, dialog } = useConfirm()`, render `dialog` once, then
 *  `confirm({ title, confirmLabel, destructive, onConfirm })`. It resolves true once
 *  confirmed and `onConfirm` has settled, and false when the reader cancels. */
export function useConfirm(): {
  confirm: (request: ConfirmRequest) => Promise<boolean>
  dialog: ReactNode
} {
  // The request stays while the dialog animates closed, so its title doesn't go blank.
  const [request, setRequest] = useState<ConfirmRequest | null>(null)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<ReactNode>(undefined)
  const settle = useRef<((confirmed: boolean) => void) | null>(null)

  const finish = useCallback((confirmed: boolean) => {
    const resolve = settle.current
    settle.current = null
    resolve?.(confirmed)
  }, [])

  const confirm = useCallback(
    (next: ConfirmRequest) => {
      // A new question answers the one before it with no.
      finish(false)
      setRequest(next)
      setError(undefined)
      setOpen(true)
      return new Promise<boolean>((resolve) => {
        settle.current = resolve
      })
    },
    [finish],
  )

  const close = useCallback(() => {
    setOpen(false)
    finish(false)
  }, [finish])

  const dialog = request && (
    <ConfirmModal
      {...request}
      open={open}
      onClose={close}
      error={error}
      // It closes itself once the handler settles, so a rejection never leaves the handler.
      closeOnConfirm={false}
      onConfirm={async () => {
        // Answered already, and closing: a press during its exit does nothing.
        if (!settle.current) {
          return
        }
        setError(undefined)
        try {
          await request.onConfirm()
        } catch (failure) {
          setError(request.errorMessage?.(failure))
          return
        }
        finish(true)
        if (request.closeOnConfirm !== false) {
          setOpen(false)
        }
      }}
    />
  )

  return { confirm, dialog }
}

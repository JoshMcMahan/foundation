import type { ReactNode } from 'react'
import { useRef, useState } from 'react'
import { Button } from './Button'
import { Modal } from './Modal'
import { useStrings } from './Provider'

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
   *  handler, such as with a toast. */
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
}: ConfirmModalProps) {
  const { common } = useStrings()
  const [pending, setPending] = useState(false)
  // A second press before the first settles, or a double click, confirms once.
  const running = useRef(false)

  const runConfirm = async () => {
    if (running.current) {
      return
    }
    running.current = true
    setPending(true)
    try {
      await onConfirm()
      if (closeOnConfirm) {
        onClose()
      }
    } finally {
      running.current = false
      setPending(false)
    }
  }

  return (
    <Modal
      alert={destructive}
      open={open}
      onClose={onClose}
      align={align}
      dismissible={!pending}
      size="md"
      title={title}
      description={description}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={pending}>
            {cancelLabel ?? common.cancel}
          </Button>
          <Button
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
      {children}
    </Modal>
  )
}

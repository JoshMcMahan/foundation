import cx from 'classnames'
import type { ReactNode } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { BareModal, modalPanelClasses } from './BareModal'
import { dangerButtonClasses, ghostButtonClasses, primaryButtonClasses } from './ghostButton'
import { useStrings } from './Provider'

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
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: ReactNode
  children?: ReactNode
  confirmLabel: string
  /** An async handler keeps both buttons disabled until it settles. */
  // biome-ignore lint/suspicious/noConfusingVoidType: accepts sync and async handlers
  onConfirm: () => void | Promise<unknown>
  confirmDisabled?: boolean
  destructive?: boolean
  align?: 'top' | 'center'
  cancelLabel?: string
  /** When false, the dialog stays open after a successful confirm. */
  closeOnConfirm?: boolean
}) {
  const strings = useStrings()
  const [pending, setPending] = useState(false)
  const firedRef = useRef(false)

  useEffect(() => {
    if (open) {
      firedRef.current = false
    }
  }, [open])

  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const runConfirm = useCallback(async () => {
    if (firedRef.current) {
      return
    }
    firedRef.current = true
    setPending(true)
    try {
      await onConfirm()
      if (closeOnConfirm) {
        onCloseRef.current()
      } else {
        firedRef.current = false
      }
    } catch (error) {
      firedRef.current = false
      throw error
    } finally {
      setPending(false)
    }
  }, [onConfirm, closeOnConfirm])

  return (
    <BareModal
      open={open}
      onClose={onClose}
      ariaLabel={title}
      align={align}
      preventClose={pending}
      className={cx(modalPanelClasses, 'w-[480px] max-w-full')}
    >
      <div className="px-5 pt-5">
        <h2 className="text-lg font-semibold text-(--theme-app)">{title}</h2>
        {description !== null && description !== undefined && (
          <p className="mt-1.5 text-sm text-(--theme-muted-text-color)">{description}</p>
        )}
        {children !== null && children !== undefined && <div className="mt-4">{children}</div>}
      </div>
      <div className="mt-5 flex items-center justify-end gap-2 border-t border-(--theme-border) px-5 py-3">
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          className={cx(ghostButtonClasses, pending && 'cursor-wait')}
        >
          {cancelLabel ?? strings.modal.cancel}
        </button>
        <button
          type="button"
          onClick={runConfirm}
          disabled={confirmDisabled || pending}
          className={cx(
            destructive ? dangerButtonClasses : primaryButtonClasses,
            'disabled:cursor-not-allowed disabled:opacity-50',
            pending && 'cursor-wait',
          )}
        >
          {confirmLabel}
        </button>
      </div>
    </BareModal>
  )
}

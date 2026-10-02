import cx from 'classnames'
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
} from 'react'
import { useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

/** Omit when the content supplies its own panel styling. */
export const modalPanelClasses =
  'rounded-xl border border-(--theme-border) bg-(--theme-app-bg) text-(--theme-app) shadow-2xl'

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'

export function BareModal({
  open,
  onClose,
  ariaLabel,
  className,
  onPanelKeyDown,
  onPanelMouseDown,
  align = 'top',
  preventClose = false,
  children,
}: {
  open: boolean
  onClose: () => void
  ariaLabel?: string
  className?: string
  onPanelKeyDown?: (e: ReactKeyboardEvent<HTMLDivElement>) => void
  onPanelMouseDown?: (e: ReactMouseEvent<HTMLDivElement>) => void
  /** Vertical placement of the panel. Defaults to the ds top-anchored position. */
  align?: 'top' | 'center'
  /** Block the accidental-dismiss paths (backdrop click, Escape) so typed
   * input isn't lost. The explicit close controls still work. */
  preventClose?: boolean
  children: ReactNode
}) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open || preventClose) {
      return
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose, preventClose])

  // Body scroll lock while open; focus returns to the trigger on close.
  useEffect(() => {
    if (!open) {
      return
    }
    const previouslyFocused = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
      previouslyFocused?.focus?.()
    }
  }, [open])

  const trapFocus = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      const panel = panelRef.current
      // Leave Tab alone when focus sits outside the panel (e.g. a menu or
      // combobox list portalled to the body by Headless UI).
      if (e.key !== 'Tab' || !panel || !panel.contains(document.activeElement)) {
        onPanelKeyDown?.(e)
        return
      }
      const focusable = panel.querySelectorAll<HTMLElement>(FOCUSABLE)
      if (focusable.length === 0) {
        e.preventDefault()
        onPanelKeyDown?.(e)
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!first || !last) {
        onPanelKeyDown?.(e)
        return
      }
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
      onPanelKeyDown?.(e)
    },
    [onPanelKeyDown],
  )

  if (!open) {
    return null
  }

  return createPortal(
    <div
      data-testid="modal-backdrop"
      role="none"
      className={cx(
        // pb keeps tall panels (max-h-full) off the viewport's bottom edge.
        'fixed inset-0 z-[9990] flex justify-center px-4 pb-8',
        align === 'center' ? 'items-center' : 'items-start pt-[14vh]',
      )}
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.4)' }}
      onClick={preventClose ? undefined : onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        className={className}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={trapFocus}
        onMouseDown={onPanelMouseDown}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}

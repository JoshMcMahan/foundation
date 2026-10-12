import { type ReactNode, type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface Place {
  right: number
  top?: number
  bottom?: number
  maxHeight: number
}

const GAP = 8
// The panel's `w-96`, for before it has been laid out.
const PANEL_WIDTH = 384

// Above the button when there's more room there, below it otherwise, and never past the window: lined up
// with the button's right edge, unless that puts its left edge off the window, as for a button at the left.
function placeBy(anchor: HTMLElement, width: number): Place {
  const rect = anchor.getBoundingClientRect()
  const above = rect.top - GAP * 2
  const below = window.innerHeight - rect.bottom - GAP * 2
  const right = Math.max(
    GAP,
    Math.min(window.innerWidth - rect.right, window.innerWidth - GAP - width),
  )
  return above >= below
    ? { right, bottom: window.innerHeight - rect.top + GAP, maxHeight: above }
    : { right, top: rect.bottom + GAP, maxHeight: below }
}

/** A toolbar button's panel, drawn over the page so the pane it sits in can't clip it. */
export function ToolbarPopover({
  anchor,
  label,
  onClose,
  children,
}: {
  anchor: RefObject<HTMLElement | null>
  label: string
  onClose: () => void
  children: ReactNode
}) {
  const panel = useRef<HTMLDivElement>(null)
  const [place, setPlace] = useState<Place | null>(null)
  const close = useRef(onClose)
  close.current = onClose

  useLayoutEffect(() => {
    const update = () => {
      if (anchor.current) {
        setPlace(placeBy(anchor.current, panel.current?.offsetWidth || PANEL_WIDTH))
      }
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [anchor])

  useEffect(() => {
    panel.current?.focus({ preventScroll: true })
    const away = (e: PointerEvent) => {
      const target = e.target as Node
      if (!panel.current?.contains(target) && !anchor.current?.contains(target)) {
        close.current()
      }
    }
    // Ahead of the graph's own Escape, which would clear its selection instead.
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        close.current()
        anchor.current?.focus({ preventScroll: true })
      }
    }
    window.addEventListener('pointerdown', away, true)
    window.addEventListener('keydown', onEscape, true)
    return () => {
      window.removeEventListener('pointerdown', away, true)
      window.removeEventListener('keydown', onEscape, true)
    }
  }, [anchor])

  // The --theme-* tokens live on the document root, so the body-level portal resolves them.
  return createPortal(
    <div
      ref={panel}
      role="dialog"
      aria-label={label}
      tabIndex={-1}
      className="fixed z-50 w-96 max-w-[calc(100vw-16px)] overflow-y-auto rounded-md border theme-border bg-(--theme-panel-bg) p-3 text-xs text-(--theme-app) shadow-lg outline-none"
      style={place ?? { visibility: 'hidden' }}
    >
      {children}
    </div>,
    document.body,
  )
}

import cx from 'classnames'
import type { ReactNode } from 'react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type HoverCoords = { x: number; y: number }

export function useHoverCard<T extends HTMLElement>() {
  const triggerRef = useRef<T>(null)
  const [coords, setCoords] = useState<HoverCoords | null>(null)
  const openTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(
    () => () => {
      clearTimeout(openTimer.current)
      clearTimeout(closeTimer.current)
    },
    [],
  )

  const scheduleOpen = () => {
    clearTimeout(closeTimer.current)
    openTimer.current = setTimeout(() => {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (rect) {
        setCoords({ x: rect.left, y: rect.bottom })
      }
    }, 350)
  }
  const scheduleClose = () => {
    clearTimeout(openTimer.current)
    closeTimer.current = setTimeout(() => setCoords(null), 150)
  }
  const keepOpen = () => clearTimeout(closeTimer.current)

  return { triggerRef, coords, scheduleOpen, scheduleClose, keepOpen }
}

export function HoverCardSurface({
  x,
  y,
  widthClassName,
  padded = true,
  relayoutKey,
  onKeepOpen,
  onLeave,
  children,
}: {
  x: number
  y: number
  widthClassName: string
  /** Pass false when the card paints its own edge-to-edge header. */
  padded?: boolean
  relayoutKey?: unknown
  onKeepOpen: () => void
  onLeave: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  // biome-ignore lint/correctness/useExhaustiveDependencies: relayoutKey is the caller's signal that the content changed size.
  useLayoutEffect(() => {
    if (!ref.current) {
      return
    }
    const { width, height } = ref.current.getBoundingClientRect()
    const pad = 8
    const left = Math.max(pad, Math.min(x, window.innerWidth - width - pad))
    const top = y + 8 + height + pad > window.innerHeight ? Math.max(pad, y - 8 - height) : y + 8
    setPos({ left, top })
  }, [x, y, relayoutKey])

  return createPortal(
    <div
      ref={ref}
      role="none"
      onMouseEnter={onKeepOpen}
      onMouseLeave={onLeave}
      onFocus={onKeepOpen}
      onBlur={onLeave}
      className={cx(
        'fixed z-[9999] overflow-hidden rounded-xl border border-(--theme-border) bg-(--theme-panel-bg) shadow-xl backdrop-blur-xl',
        padded && 'p-3',
        widthClassName,
      )}
      style={{
        left: pos?.left ?? x,
        top: pos?.top ?? y + 8,
        visibility: pos ? 'visible' : 'hidden',
      }}
    >
      {children}
    </div>,
    document.querySelector('.ds-root') ?? document.body,
  )
}

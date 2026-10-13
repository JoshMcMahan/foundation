import type {
  HTMLAttributes,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from 'react'
import { useRef, useState } from 'react'
import { cx } from '../cx'
import { useStrings } from './Provider'

const KEYBOARD_STEP_PX = 16

export interface SplitterOptions {
  /** The committed width. Keep it in `useState`, or in `usePersistedState` to remember it. */
  width: number
  /** Hears the width once a drag ends, and on each key press. */
  onWidthChange: (width: number) => void
  min: number
  /** The widest it goes; a function for a bound that moves with the window. */
  max: number | (() => number)
  /** The panel edge the handle sits on. Dragging away from the panel widens it. */
  side: 'left' | 'right'
  /** What a double-click restores. */
  defaultWidth?: number | undefined
  /** Names the handle when "Resize panel" doesn't say which panel. */
  label?: string | undefined
}

export interface Splitter {
  /** The width to draw: the live one during a drag, the committed one otherwise. */
  width: number
  resizing: boolean
  /** Spread on the handle: a focusable window splitter on the panel's edge. */
  separatorProps: HTMLAttributes<HTMLDivElement>
}

/** A panel edge that a drag, the arrow keys, Home and End resize. The width is
 *  the caller's state; a drag commits it once, when it ends. */
export function useSplitter({
  width,
  onWidthChange,
  min,
  max,
  side,
  defaultWidth,
  label,
}: SplitterOptions): Splitter {
  const t = useStrings().common
  const [live, setLive] = useState<number | null>(null)
  const drag = useRef<{ x: number; width: number } | null>(null)
  // The handle on a panel's left edge widens it when moved left.
  const grows = side === 'left' ? -1 : 1
  const maxWidth = () => (typeof max === 'function' ? max() : max)
  const clamp = (px: number) => Math.round(Math.max(min, Math.min(px, maxWidth())))
  const shown = live ?? width

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    drag.current = { x: e.clientX, width }
    setLive(width)
  }
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current) {
      setLive(clamp(drag.current.width + (e.clientX - drag.current.x) * grows))
    }
  }
  const onPointerUp = () => {
    if (drag.current && live !== null && live !== width) {
      onWidthChange(live)
    }
    drag.current = null
    setLive(null)
  }
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const direction = { ArrowLeft: -1, ArrowRight: 1 }[e.key]
    if (direction !== undefined) {
      onWidthChange(clamp(width + direction * grows * KEYBOARD_STEP_PX))
    } else if (e.key === 'Home') {
      onWidthChange(min)
    } else if (e.key === 'End') {
      onWidthChange(clamp(Number.POSITIVE_INFINITY))
    } else {
      return
    }
    e.preventDefault()
  }

  const now = Math.round(shown)
  const bound = maxWidth()
  return {
    width: shown,
    resizing: live !== null,
    separatorProps: {
      role: 'separator',
      'aria-label': label ?? t.resizePanel,
      'aria-orientation': 'vertical',
      'aria-valuenow': now,
      'aria-valuemin': min,
      ...(Number.isFinite(bound) ? { 'aria-valuemax': Math.round(bound) } : {}),
      'aria-valuetext': t.panelWidth(now),
      tabIndex: 0,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onKeyDown,
      ...(defaultWidth === undefined ? {} : { onDoubleClick: () => onWidthChange(defaultWidth) }),
      className: cx(
        'absolute inset-y-0 z-10 w-1.5 cursor-col-resize touch-none transition-colors focus-visible:bg-(--theme-link) focus-visible:outline-none',
        side === 'left' ? '-left-0.75' : '-right-0.75',
        live === null ? 'hover:bg-(--theme-border)' : 'bg-(--theme-accent)',
      ),
    },
  }
}

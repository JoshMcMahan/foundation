import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { cx } from '../cx'
import { CopyIcon } from '../icons'
import { buttonClasses } from './buttonClasses'
import { useStrings } from './Provider'
import { useCopy } from './useCopy'

interface Place {
  x: number
  y: number
  text: string
}

// The button's half width, so it stays inside the block at either edge.
const EDGE = 40

/** Text to read and copy from in part, such as a run's YAML or a log: selecting some of it
 *  shows a Copy button under the end of the selection, which copies just that and says so.
 *  The button is a real one inside the block, so Tab reaches it after the text; a selection
 *  made from the keyboard shows it too, and Escape or a press elsewhere puts it away. The
 *  browser's own copy keeps working. */
export function SelectionCopy({
  children,
  className,
}: {
  children: ReactNode
  className?: string | undefined
}) {
  const { common: t } = useStrings()
  const { copy } = useCopy()
  const root = useRef<HTMLDivElement>(null)
  const pointerDown = useRef(false)
  const [place, setPlace] = useState<Place | null>(null)

  const read = useCallback(() => {
    const el = root.current
    const selection = typeof window === 'undefined' ? null : window.getSelection()
    if (!el || !selection || selection.isCollapsed || selection.rangeCount === 0) {
      setPlace(null)
      return
    }
    const range = selection.getRangeAt(0)
    const text = selection.toString()
    if (!el.contains(range.commonAncestorContainer) || !text.trim()) {
      setPlace(null)
      return
    }
    const rects = range.getClientRects()
    const end = rects[rects.length - 1] ?? range.getBoundingClientRect()
    const box = el.getBoundingClientRect()
    const x = end.right - box.left
    setPlace({
      x: box.width > EDGE * 2 ? Math.min(Math.max(x, EDGE), box.width - EDGE) : box.width / 2,
      y: end.bottom - box.top + 4,
      text,
    })
  }, [])

  useEffect(() => {
    // A drag changes the selection at every step; the button waits for it to end.
    const onChange = () => {
      if (!pointerDown.current) {
        read()
      }
    }
    const onUp = () => {
      if (pointerDown.current) {
        pointerDown.current = false
        read()
      }
    }
    document.addEventListener('selectionchange', onChange)
    document.addEventListener('pointerup', onUp)
    return () => {
      document.removeEventListener('selectionchange', onChange)
      document.removeEventListener('pointerup', onUp)
    }
  }, [read])

  useEffect(() => {
    if (!place) {
      return
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPlace(null)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [place])

  const copySelection = async () => {
    if (!place) {
      return
    }
    if (await copy(place.text)) {
      window.getSelection()?.removeAllRanges()
      setPlace(null)
    }
  }

  return (
    <div
      ref={root}
      className={cx('relative', className)}
      onPointerDown={(e) => {
        if (!(e.target as Element).closest?.('[data-selection-copy]')) {
          pointerDown.current = true
          setPlace(null)
        }
      }}
      // The button would drift from its text as the block scrolls under it.
      onScrollCapture={() => setPlace(null)}
    >
      {children}
      {place && (
        <button
          type="button"
          data-selection-copy=""
          aria-label={t.copySelection}
          // Pressing it keeps the selection it copies.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => void copySelection()}
          className={cx(
            buttonClasses({ variant: 'secondary', size: 'xs' }),
            'absolute z-10 -translate-x-1/2 shadow-(--theme-shadow)',
          )}
          style={{ left: place.x, top: place.y }}
        >
          <CopyIcon aria-hidden="true" />
          {t.copy}
        </button>
      )}
    </div>
  )
}

import { type ReactNode, useLayoutEffect, useRef, useState } from 'react'

// Height (and optionally width) reveal that grows a box with its content. Height
// animates via a grid row (0fr → 1fr, natively interpolated). Both are plain CSS
// transitions, so they stay smooth even while the dependency graph re-renders
// every frame to re-route connectors — a framer height:auto animation stutters
// under that load. Overflow is clipped only while animating (clean wipe) and
// released once open.
//
// The grid wrapper stays mounted (so the transition runs without mount-timing
// hacks), but the children are rendered only while open and during the collapse
// animation — a closed row costs one empty div instead of re-rendering its whole
// subtree on every connector invalidation. Any nested subgraph is also gated by
// its own Collapse.
//
// growWidth (graph only): also animates width to the content's measured pixel
// width, so a node box grows/shrinks horizontally instead of snapping. The width
// transition is armed only for this Reveal's own open/close (via `open` flipping);
// when a nested Reveal (a matrix member's steps) widens the content, we track it
// instantly instead of re-transitioning, else the outer box trails the inner
// reveal by its own 200ms. Off (the summary sidebar) leaves width to normal flow
// so long names/icons wrap.
const EASE = 'cubic-bezier(0.25, 0.1, 0.25, 1)'
const ROWS_TRANSITION = `grid-template-rows 200ms ${EASE}`
const FULL_TRANSITION = `${ROWS_TRANSITION}, width 200ms ${EASE}`

export function Reveal({
  open,
  children,
  growWidth = false,
  onSettled,
}: {
  open: boolean
  children: ReactNode
  growWidth?: boolean
  onSettled?: () => void
}) {
  const contentRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [prevOpen, setPrevOpen] = useState(open)
  const [clipped, setClipped] = useState(!open)
  const [toggling, setToggling] = useState(false)
  const [renderChildren, setRenderChildren] = useState(open)

  // Adjust state during render the frame `open` flips: render children (so they
  // reveal immediately) and arm the transition + clip on the same commit that
  // starts the animation.
  if (open && !renderChildren) {
    setRenderChildren(true)
  }
  if (prevOpen !== open) {
    setPrevOpen(open)
    setToggling(true)
    setClipped(true)
  }

  useLayoutEffect(() => {
    if (!growWidth || !renderChildren) {
      return
    }
    const el = contentRef.current
    if (!el) {
      return
    }
    const measure = () => setWidth(el.offsetWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [growWidth, renderChildren])

  return (
    <div
      className="grid"
      style={{
        gridTemplateRows: open ? '1fr' : '0fr',
        overflow: clipped ? 'hidden' : 'visible',
        ...(growWidth
          ? {
              width: open ? width : 0,
              transition: toggling ? FULL_TRANSITION : ROWS_TRANSITION,
            }
          : { transition: ROWS_TRANSITION }),
      }}
      onTransitionEnd={(e) => {
        if (e.target === e.currentTarget && e.propertyName === 'grid-template-rows') {
          setToggling(false)
          setClipped(!open)
          if (!open) {
            setRenderChildren(false)
          }
          onSettled?.()
        }
      }}
    >
      <div
        ref={contentRef}
        className="min-h-0"
        {...(growWidth ? { style: { width: 'max-content' } } : {})}
      >
        {renderChildren ? children : null}
      </div>
    </div>
  )
}

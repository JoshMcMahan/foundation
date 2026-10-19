/** How far out the view zooms: far enough to show the shape of a graph of thousands of jobs. */
export const MIN_SCALE = 0.01
/** How far in the view zooms, past where a fit stops, to read a node up close. */
export const MAX_SCALE = 2
/** The closest a fit comes, where a small graph's nodes read at a comfortable size. */
export const FIT_MAX_SCALE = 0.6
/** An exponent of the scale, so presses in and out change it by the same factor. */
export const ZOOM_STEP = 0.25

export interface View {
  x: number
  y: number
  scale: number
}

export interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

const clampScale = (scale: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))

/** The way the view can zoom no further, if it is at a limit. */
export function zoomLimit(scale: number): 'in' | 'out' | null {
  return scale >= MAX_SCALE * 0.999 ? 'in' : scale <= MIN_SCALE * 1.001 ? 'out' : null
}

/** The view scaled by `factor` about `at`, a point in the panel, which stays where it is. */
export function zoomAround(view: View, at: { x: number; y: number }, factor: number): View {
  const scale = clampScale(view.scale * factor)
  return {
    x: at.x - ((at.x - view.x) / view.scale) * scale,
    y: at.y - ((at.y - view.y) / view.scale) * scale,
    scale,
  }
}

// A wheel's lines and pages, as pixels.
const LINE_PX = 16
const PAGE_PX = 800
// The scale changes by e^(-delta·rate): a mouse notch (100px) by about a fifth, a trackpad's
// small deltas smoothly. A pinch arrives as small deltas with ctrlKey, so it zooms faster.
const WHEEL_RATE = 0.002
const PINCH_RATE = 0.01
const MAX_WHEEL_PX = 120

/** The factor a wheel event scales the view by, the same at every zoom. */
export function wheelFactor(event: Pick<WheelEvent, 'deltaY' | 'deltaMode' | 'ctrlKey'>): number {
  const px = event.deltaY * (event.deltaMode === 1 ? LINE_PX : event.deltaMode === 2 ? PAGE_PX : 1)
  const clamped = Math.max(-MAX_WHEEL_PX, Math.min(MAX_WHEEL_PX, px))
  return Math.exp(-clamped * (event.ctrlKey ? PINCH_RATE : WHEEL_RATE))
}

/** The space a fit leaves around a graph in a panel. */
export function fitMargin(panel: { width: number; height: number }): number {
  return Math.min(panel.width, panel.height) * 0.05
}

/** The view that shows all of `bounds` in a panel from its top left, no closer than a fit comes. */
export function fitView(bounds: Bounds, panel: { width: number; height: number }): View | null {
  const width = bounds.maxX - bounds.minX
  const height = bounds.maxY - bounds.minY
  if (width <= 0 || height <= 0) {
    return null
  }
  const margin = fitMargin(panel)
  const scale = Math.max(
    MIN_SCALE,
    Math.min(
      (panel.width - margin * 2) / width,
      (panel.height - margin * 2) / height,
      FIT_MAX_SCALE,
    ),
  )
  return { x: margin - bounds.minX * scale, y: margin - bounds.minY * scale, scale }
}

/** The least shift that brings [start, end] inside [low, high]; none when it can't all fit, so the view stays. */
export function intoView(start: number, end: number, low: number, high: number) {
  if (end - start > high - low) {
    return 0
  }
  if (start < low) {
    return low - start
  }
  return end > high ? high - end : 0
}

/** A box on screen, as `getBoundingClientRect` gives it. */
export interface Rect {
  left: number
  top: number
  width: number
  height: number
}

/** The smallest box around all of `rects`, which must not be empty. */
export function enclosing(rects: readonly Rect[]): Rect {
  const left = Math.min(...rects.map((r) => r.left))
  const top = Math.min(...rects.map((r) => r.top))
  const right = Math.max(...rects.map((r) => r.left + r.width))
  const bottom = Math.max(...rects.map((r) => r.top + r.height))
  return { left, top, width: right - left, height: bottom - top }
}

const within = (inner: Rect, outer: Rect, margin: number) =>
  inner.left >= outer.left + margin &&
  inner.top >= outer.top + margin &&
  inner.left + inner.width <= outer.left + outer.width - margin &&
  inner.top + inner.height <= outer.top + outer.height - margin

// Where on one axis a view puts the start of a region, in `visible`'s span: the whole region in the
// middle where it fits; otherwise the target in, with as much of the region before it as fits.
function placeOnAxis(
  region: { start: number; size: number },
  target: { start: number; size: number },
  visible: { start: number; size: number },
  margin: number,
): number {
  const low = visible.start + margin
  const high = visible.start + visible.size - margin
  if (region.size <= high - low) {
    return visible.start + (visible.size - region.size) / 2
  }
  const before = target.start - region.start
  if (target.size > high - low) {
    return visible.start + (visible.size - target.size) / 2 - before
  }
  return Math.min(low, high - target.size - before)
}

/**
 * The view that shows `region`, a job or step and what it is in, in `visible`, zoomed in to `readable`
 * if it is further out: all of it in the middle where it fits, or else `target`, a part of it, with as
 * much of the rest before it as fits. None while all of it already shows, readable. Boxes are on screen,
 * and a view's x and y count from `origin`, where the pan and zoom place the graph.
 */
export function viewShowing(
  region: Rect,
  target: Rect,
  visible: Rect,
  origin: { left: number; top: number },
  view: View,
  readable: number,
): View | null {
  const margin = fitMargin(visible)
  if (view.scale >= readable && within(region, visible, margin)) {
    return null
  }
  const scale = Math.max(view.scale, readable)
  const grow = scale / view.scale
  // In the graph's own space at the new scale, from its origin.
  const x = (left: number) => ((left - origin.left - view.x) / view.scale) * scale
  const y = (top: number) => ((top - origin.top - view.y) / view.scale) * scale
  const left = placeOnAxis(
    { start: x(region.left), size: region.width * grow },
    { start: x(target.left), size: target.width * grow },
    { start: visible.left, size: visible.width },
    margin,
  )
  const top = placeOnAxis(
    { start: y(region.top), size: region.height * grow },
    { start: y(target.top), size: target.height * grow },
    { start: visible.top, size: visible.height },
    margin,
  )
  return {
    x: left - origin.left - x(region.left),
    y: top - origin.top - y(region.top),
    scale,
  }
}

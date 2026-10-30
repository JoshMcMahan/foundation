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

/** How a fit may differ from showing everything. */
export interface FitOptions {
  /** The farthest out it goes: a graph too big to read at this scale shows from its start,
   *  its top left, for the rest to be panned to. */
  minScale?: number | undefined
  /** Room kept clear at the panel's top, such as under a bar over it, when the fit stops at
   *  `minScale`. */
  top?: number | undefined
  /** Fits the graph's width alone, for one that runs down the panel to be panned along: centered
   *  across the panel, from its top below `top`. */
  width?: boolean | undefined
  /** Room kept clear at the panel's top at any scale, such as under buttons over a small panel:
   *  the graph fits in the rest. */
  clear?: number | undefined
  /** Centers a graph that fits in the room left, for a panel that doesn't shrink to its graph. */
  center?: boolean | undefined
}

/** The view that shows all of `bounds` in a panel from its top left, no closer than a fit comes. */
export function fitView(
  bounds: Bounds,
  panel: { width: number; height: number },
  {
    minScale = MIN_SCALE,
    top = 0,
    width: byWidth = false,
    clear = 0,
    center = false,
  }: FitOptions = {},
): View | null {
  const width = bounds.maxX - bounds.minX
  const height = bounds.maxY - bounds.minY
  if (width <= 0 || height <= 0) {
    return null
  }
  const margin = fitMargin(panel)
  const fit = Math.min(
    (panel.width - margin * 2) / width,
    byWidth ? FIT_MAX_SCALE : (panel.height - clear - margin * 2) / height,
    FIT_MAX_SCALE,
  )
  const floor = Math.min(Math.max(MIN_SCALE, minScale), FIT_MAX_SCALE)
  const scale = Math.max(floor, fit)
  // Cut off, the graph starts below what covers the panel's top, so its first jobs show whole.
  const y = (fit < floor || byWidth ? Math.max(margin, top + margin) : margin) + clear
  // By width, centered: a graph running down centers its rows, so a wider one cut off at both sides
  // still shows its chain of jobs down the middle.
  let x = byWidth ? (panel.width - width * scale) / 2 : margin
  let shownTop = y
  if (center) {
    const roomX = panel.width - margin * 2
    const roomY = panel.height - clear - margin * 2
    if (width * scale <= roomX) {
      x = margin + (roomX - width * scale) / 2
    }
    if (height * scale <= roomY) {
      shownTop = clear + margin + (roomY - height * scale) / 2
    }
  }
  return { x: x - bounds.minX * scale, y: shownTop - bounds.minY * scale, scale }
}

/** A still graph's view, its width across the panel's and no taller than `maxHeight`, centered
 *  across with `padding` around it, and the height of the panel it leaves: the graph's at that
 *  view. */
export function fitStill(
  bounds: Bounds,
  width: number,
  maxHeight: number,
  padding = 12,
): { view: View; height: number } | null {
  const graphWidth = bounds.maxX - bounds.minX
  const graphHeight = bounds.maxY - bounds.minY
  if (graphWidth <= 0 || graphHeight <= 0 || width <= 0) {
    return null
  }
  const scale = clampScale(
    Math.min(
      (width - padding * 2) / graphWidth,
      (maxHeight - padding * 2) / graphHeight,
      FIT_MAX_SCALE,
    ),
  )
  return {
    view: {
      x: (width - graphWidth * scale) / 2 - bounds.minX * scale,
      y: padding - bounds.minY * scale,
      scale,
    },
    height: Math.min(maxHeight, Math.ceil(graphHeight * scale + padding * 2)),
  }
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

/** How much of a graph a pan or pinch leaves in its panel, at the least: half the panel's shorter
 *  side, or all of a graph smaller than that. */
export function reachKept(panel: { width: number; height: number }): number {
  return Math.min(panel.width, panel.height) / 2
}

/** The least shift that brings at least `keep` of `graph` back inside `panel` on each axis, so a
 *  pan or a fling never leaves the graph out of reach; none while that much already shows. */
export function intoReach(graph: Rect, panel: Rect, keep: number): { dx: number; dy: number } {
  const axis = (start: number, size: number, low: number, span: number) => {
    if (size <= 0) {
      return 0
    }
    const least = Math.min(keep, size, span)
    if (start + size < low + least) {
      return low + least - (start + size)
    }
    return start > low + span - least ? low + span - least - start : 0
  }
  return {
    dx: axis(graph.left, graph.width, panel.left, panel.width),
    dy: axis(graph.top, graph.height, panel.top, panel.height),
  }
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

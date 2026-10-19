import { describe, expect, it } from 'vitest'
import {
  enclosing,
  FIT_MAX_SCALE,
  fitView,
  intoView,
  MAX_SCALE,
  MIN_SCALE,
  type Rect,
  viewShowing,
  wheelFactor,
  zoomAround,
  zoomLimit,
} from './viewport'

describe('zoomAround', () => {
  it('keeps the point zoomed about where it is on screen', () => {
    const view = { x: 40, y: -20, scale: 0.5 }
    const at = { x: 300, y: 200 }
    const next = zoomAround(view, at, 2)
    expect(next.scale).toBe(1)
    // The content under `at` before and after.
    expect((at.x - view.x) / view.scale).toBeCloseTo((at.x - next.x) / next.scale)
    expect((at.y - view.y) / view.scale).toBeCloseTo((at.y - next.y) / next.scale)
  })

  it('stops at the zoom limits', () => {
    expect(zoomAround({ x: 0, y: 0, scale: 1.5 }, { x: 0, y: 0 }, 10).scale).toBe(MAX_SCALE)
    expect(zoomAround({ x: 0, y: 0, scale: 0.05 }, { x: 0, y: 0 }, 0.001).scale).toBe(MIN_SCALE)
  })
})

describe('zoomLimit', () => {
  it('names the way the view can zoom no further', () => {
    expect(zoomLimit(MAX_SCALE)).toBe('in')
    expect(zoomLimit(MIN_SCALE)).toBe('out')
    expect(zoomLimit(FIT_MAX_SCALE)).toBeNull()
  })
})

describe('wheelFactor', () => {
  const wheel = (deltaY: number, deltaMode = 0, ctrlKey = false) =>
    wheelFactor({ deltaY, deltaMode, ctrlKey })

  it('zooms in and out of a notch by the same factor', () => {
    expect(wheel(-100)).toBeGreaterThan(1)
    expect(wheel(-100) * wheel(100)).toBeCloseTo(1)
  })

  it('reads lines and pages as pixels, and no event as more than a notch or so', () => {
    expect(wheel(3, 1)).toBeCloseTo(wheel(48))
    expect(wheel(1, 2)).toBe(wheel(10000))
  })

  it('zooms a pinch faster than a scroll of the same delta', () => {
    expect(wheel(-10, 0, true)).toBeGreaterThan(wheel(-10))
  })
})

describe('fitView', () => {
  const panel = { width: 1000, height: 500 }

  it('shows all of a graph from its top left, within the panel’s margin', () => {
    const view = fitView({ minX: 100, minY: 0, maxX: 9100, maxY: 1000 }, panel)
    // The width decides: 9000 across 1000 less 25 each side.
    expect(view?.scale).toBeCloseTo(950 / 9000)
    expect(view?.x).toBeCloseTo(25 - 100 * (950 / 9000))
    expect(view?.y).toBe(25)
  })

  it('comes no closer than a fit does, and goes no further out than the view', () => {
    expect(fitView({ minX: 0, minY: 0, maxX: 10, maxY: 10 }, panel)?.scale).toBe(FIT_MAX_SCALE)
    expect(fitView({ minX: 0, minY: 0, maxX: 1e7, maxY: 10 }, panel)?.scale).toBe(MIN_SCALE)
  })

  it('has nothing to fit without a graph', () => {
    expect(fitView({ minX: 0, minY: 0, maxX: 0, maxY: 0 }, panel)).toBeNull()
  })
})

describe('intoView', () => {
  it('shifts the least that shows a span, and not at all when it can’t all show', () => {
    expect(intoView(-10, 50, 0, 100)).toBe(10)
    expect(intoView(60, 120, 0, 100)).toBe(-20)
    expect(intoView(10, 50, 0, 100)).toBe(0)
    expect(intoView(-10, 200, 0, 100)).toBe(0)
  })
})

describe('viewShowing', () => {
  // A panel 400 wide and 600 tall at (100, 100) on screen, whose top 50 a view bar covers.
  const visible: Rect = { left: 100, top: 150, width: 400, height: 550 }
  const origin = { left: 100, top: 100 }
  // Where a box at (x, y, w, h) in the graph's own space is on screen under a view.
  const onScreen = (view: { x: number; y: number; scale: number }, box: Rect): Rect => ({
    left: origin.left + view.x + box.left * view.scale,
    top: origin.top + view.y + box.top * view.scale,
    width: box.width * view.scale,
    height: box.height * view.scale,
  })
  const middle = (r: Rect) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 })

  it('leaves a view that already shows the job and what it is in, readably', () => {
    const view = { x: 0, y: 0, scale: 0.6 }
    const region = onScreen(view, { left: 100, top: 200, width: 200, height: 100 })
    expect(viewShowing(region, region, visible, origin, view, 0.5)).toBeNull()
  })

  it('brings a row under the view bar to the middle of what the bar leaves showing', () => {
    const view = { x: 0, y: 0, scale: 0.6 }
    // Its top row sits where the bar covers it.
    const box = { left: 100, top: 20, width: 200, height: 100 }
    const next = viewShowing(onScreen(view, box), onScreen(view, box), visible, origin, view, 0.5)
    expect(next).not.toBeNull()
    const after = middle(onScreen(next as typeof view, box))
    expect(after.x).toBeCloseTo(middle(visible).x)
    expect(after.y).toBeCloseTo(middle(visible).y)
    expect(onScreen(next as typeof view, box).top).toBeGreaterThan(visible.top)
  })

  it('zooms a far-out view in to read, about the region', () => {
    const view = { x: 10, y: 10, scale: 0.1 }
    const box = { left: 300, top: 400, width: 600, height: 300 }
    const next = viewShowing(onScreen(view, box), onScreen(view, box), visible, origin, view, 0.5)
    expect(next?.scale).toBe(0.5)
    expect(middle(onScreen(next as typeof view, box)).y).toBeCloseTo(middle(visible).y)
  })

  it('keeps the job or step in, under as much of what it is in as fits, where all of it can’t', () => {
    const view = { x: 0, y: 0, scale: 0.6 }
    const region = { left: 0, top: 0, width: 400, height: 3000 }
    const target = { left: 100, top: 2800, width: 100, height: 30 }
    const next = viewShowing(
      onScreen(view, region),
      onScreen(view, target),
      visible,
      origin,
      view,
      0.5,
    ) as typeof view
    const shown = onScreen(next, target)
    const margin = Math.min(visible.width, visible.height) * 0.05
    // At the bottom of what shows, so what it is in fills the rest above it.
    expect(shown.top + shown.height).toBeCloseTo(visible.top + visible.height - margin)
    expect(onScreen(next, region).top).toBeLessThan(visible.top)
    // The region's width fits, so it stays in the middle across.
    expect(middle(onScreen(next, region)).x).toBeCloseTo(middle(visible).x)
  })

  it('keeps the top of what the job or step is in where all of it fits but the panel is short', () => {
    const view = { x: 0, y: 0, scale: 0.6 }
    const region = { left: 0, top: 0, width: 400, height: 1000 }
    const target = { left: 100, top: 100, width: 100, height: 30 }
    const next = viewShowing(
      onScreen(view, region),
      onScreen(view, target),
      visible,
      origin,
      view,
      0.5,
    ) as typeof view
    const margin = Math.min(visible.width, visible.height) * 0.05
    expect(onScreen(next, region).top).toBeCloseTo(visible.top + margin)
  })

  it('encloses every box', () => {
    expect(
      enclosing([
        { left: 10, top: 40, width: 20, height: 10 },
        { left: 0, top: 50, width: 5, height: 30 },
      ]),
    ).toEqual({ left: 0, top: 40, width: 30, height: 40 })
  })
})

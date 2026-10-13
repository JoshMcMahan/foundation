import { describe, expect, it } from 'vitest'
import {
  FIT_MAX_SCALE,
  fitView,
  intoView,
  MAX_SCALE,
  MIN_SCALE,
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

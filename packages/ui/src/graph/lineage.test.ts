import { afterEach, describe, expect, it, vi } from 'vitest'
import { highlightOf, Lineage } from './lineage'

// a → b → c, and d on its own.
const hops: Record<string, Record<string, number>> = {
  a: { a: 0, b: 1, c: 2 },
  b: { a: 1, b: 0, c: 1 },
  c: { a: 2, b: 1, c: 0 },
  d: { d: 0 },
}
const lineage = () =>
  new Lineage((job) => new Map(Object.entries(hops[job] ?? {})), {
    animT: 0.1,
  })

afterEach(() => {
  vi.useRealTimers()
})

describe('Lineage', () => {
  it('lights the hovered job’s lineage, and nothing else', () => {
    const l = lineage()
    l.hover('b')
    expect(l.hovering).toBe(true)
    expect(['a', 'b', 'c', 'd'].map((job) => l.node(job))).toEqual([2, 2, 2, 0])
    expect(highlightOf(l.between('a', 'b'))).toMatchObject({ lit: true, out: false })
    expect(l.between('c', 'd')).toBe('')
  })

  it('delays each connector by its hops from the hovered job, drawing away from it', () => {
    const l = lineage()
    l.hover('c')
    // a → b is a hop further from c than b → c, and draws back toward a.
    expect(highlightOf(l.between('a', 'b'))).toEqual({
      lit: true,
      out: false,
      delay: 0.1,
      back: true,
    })
    expect(highlightOf(l.between('b', 'c'))).toEqual({
      lit: true,
      out: false,
      delay: 0,
      back: true,
    })
    l.hover('a')
    expect(highlightOf(l.between('b', 'c')).back).toBe(false)
  })

  it('draws the lineage back out after unhover, from its furthest hop, then shows none', () => {
    vi.useFakeTimers()
    const l = lineage()
    l.hover('c')
    l.hover(null)
    expect(l.hovering).toBe(false)
    expect(l.node('a')).toBe(1)
    // b → c, nearest c, draws out last.
    expect(highlightOf(l.between('b', 'c'))).toEqual({
      lit: false,
      out: true,
      delay: 0.2,
      back: true,
    })
    vi.advanceTimersByTime(1000)
    expect(l.node('a')).toBe(0)
    expect(l.between('b', 'c')).toBe('')
  })

  it('tells its listeners of every change, until they leave', () => {
    vi.useFakeTimers()
    const l = lineage()
    const listener = vi.fn()
    const leave = l.subscribe(listener)
    l.hover('a')
    l.hover(null)
    vi.advanceTimersByTime(1000)
    expect(listener).toHaveBeenCalledTimes(3)
    leave()
    l.hover('b')
    expect(listener).toHaveBeenCalledTimes(3)
  })

  it('keeps a lineage hovered again before its draw-out ends, and drops it once disposed', () => {
    vi.useFakeTimers()
    const l = lineage()
    l.hover('a')
    l.hover(null)
    l.hover('a')
    vi.advanceTimersByTime(1000)
    expect(l.node('a')).toBe(2)
    l.hover(null)
    l.dispose()
    vi.advanceTimersByTime(1000)
    // Disposed, its draw-out never finishes.
    expect(l.node('a')).toBe(1)
  })
})

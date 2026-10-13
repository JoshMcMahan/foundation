import { describe, expect, it } from 'vitest'
import { arcRadius, type Box, connectorPath, routeConnectors, sameBoxes } from './connectorGeometry'

describe('connectorPath', () => {
  it('runs straight between level ends', () => {
    expect(connectorPath({ x: 0, y: 10 }, { x: 100, y: 10 }, 8, 40)).toEqual({
      d: 'M 0 10 L 100 10',
      reversed: 'M 100 10 L 0 10',
    })
  })

  it('bends in the gap before its target, down or up', () => {
    const down = connectorPath({ x: 0, y: 0 }, { x: 200, y: 100 }, 8, 40)
    // Across to the first bend, down, and across into the target half a gap later.
    expect(down.d).toBe('M 0 0 L 172 0 A 8 8 0 0 1 180 8 L 180 92 A 8 8 0 0 0 188 100 L 200 100')
    const up = connectorPath({ x: 0, y: 100 }, { x: 200, y: 0 }, 8, 40)
    expect(up.d).toBe('M 0 100 L 172 100 A 8 8 0 0 0 180 92 L 180 8 A 8 8 0 0 1 188 0 L 200 0')
  })

  it('reverses from the target back to the source', () => {
    const { reversed } = connectorPath({ x: 0, y: 0 }, { x: 200, y: 100 }, 8, 40)
    expect(reversed.startsWith('M 200 100')).toBe(true)
    expect(reversed.endsWith('L 0 0')).toBe(true)
  })
})

describe('arcRadius', () => {
  it('takes a quarter of the least rise, within half the column gap and a maximum', () => {
    expect(arcRadius(40, 100)).toBe(10)
    expect(arcRadius(400, 100)).toBe(16)
    expect(arcRadius(400, 12)).toBe(6)
    expect(arcRadius(Number.POSITIVE_INFINITY, 100)).toBe(16)
  })
})

describe('routeConnectors', () => {
  const boxes = new Map<string, Box>([
    ['a', { x: 0, y: 0, width: 100 }],
    ['b', { x: 200, y: 0, width: 100 }],
    ['c', { x: 200, y: 200, width: 100 }],
    ['d', { x: 600, y: 0, width: 100 }],
  ])

  it('joins each node to its needs, at the height connectors meet nodes', () => {
    const edges = routeConnectors(
      [[['a']], [['b'], ['c']]],
      false,
      { b: ['a'], c: ['a'] },
      boxes,
      37,
    )
    expect(edges.map(({ from, to, start, end }) => ({ from, to, start, end }))).toEqual([
      { from: 'a', to: 'b', start: { x: 98, y: 37 }, end: { x: 202, y: 37 } },
      { from: 'a', to: 'c', start: { x: 98, y: 37 }, end: { x: 202, y: 237 } },
    ])
  })

  it('draws nothing for a need on a node not laid out', () => {
    expect(routeConnectors([[['b']]], false, { b: ['gone'] }, boxes, 37)).toEqual([])
  })

  it('bends in the first gap, or with columns left empty, the narrowest', () => {
    const spread = new Map<string, Box>([
      ['a', { x: 0, y: 0, width: 100 }],
      ['b', { x: 400, y: 200, width: 100 }],
      ['d', { x: 600, y: 0, width: 100 }],
    ])
    const route = (spaced: boolean) =>
      routeConnectors([[['a']], [['b']], [['d']]], spaced, { d: ['b'] }, spread, 0)[0]?.path.d
    // Gaps of 300, then 100; the bend ends half a gap less its radius short of the target.
    expect(route(false)).toContain('A 16 16 0 0 1 468 0')
    expect(route(true)).toContain('A 16 16 0 0 1 568 0')
  })
})

describe('sameBoxes', () => {
  it('holds only when every node is where it was, and no node came or went', () => {
    const a = new Map<string, Box>([['a', { x: 0, y: 0, width: 10 }]])
    expect(sameBoxes(a, new Map([['a', { x: 0, y: 0, width: 10 }]]))).toBe(true)
    expect(sameBoxes(a, new Map([['a', { x: 0, y: 1, width: 10 }]]))).toBe(false)
    expect(sameBoxes(a, new Map([['b', { x: 0, y: 0, width: 10 }]]))).toBe(false)
    expect(sameBoxes(a, new Map())).toBe(false)
  })
})

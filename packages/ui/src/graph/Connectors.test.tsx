// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConnectorLayers } from './Connectors'
import { type Box, routeConnectors } from './connectorGeometry'
import { Lineage, LineageContext } from './lineage'

// Each connector and dot reads its highlight once a render, so the reads count their renders.
const reads = vi.hoisted(() => ({ count: 0 }))
vi.mock('./lineage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./lineage')>()
  return {
    ...actual,
    highlightOf: (value: string) => {
      reads.count++
      return actual.highlightOf(value)
    },
  }
})

afterEach(cleanup)

// Columns of one-job nodes, 200px apart and 100px wide, rows 100px apart.
function graph(cols: string[][], deps: Record<string, string[]>) {
  const boxes = new Map<string, Box>()
  cols.forEach((col, c) => {
    col.forEach((job, r) => {
      boxes.set(job, { x: c * 200, y: r * 100, width: 100 })
    })
  })
  const edges = routeConnectors(
    cols.map((col) => col.map((job) => [job])),
    false,
    deps,
    boxes,
    37,
  )
  const lineage = new Lineage(
    (job) => {
      // Hops along `deps` both ways, enough for these small graphs.
      const hops = new Map([[job, 0]])
      for (let changed = true; changed; ) {
        changed = false
        for (const [to, froms] of Object.entries(deps)) {
          for (const from of froms) {
            const near = hops.get(to) ?? hops.get(from)
            for (const end of [from, to]) {
              if (near !== undefined && !hops.has(end)) {
                hops.set(end, near + 1)
                changed = true
              }
            }
          }
        }
      }
      return hops
    },
    { animT: 0.1 },
  )
  const view = render(
    <LineageContext value={lineage}>
      <ConnectorLayers edges={edges} zBase={0} />
    </LineageContext>,
  )
  return { ...view, lineage, edges }
}

describe('ConnectorLayers', () => {
  const fan = (count: number) => {
    const many = Array.from({ length: count }, (_, i) => `n${i}`)
    return graph([['a'], many], Object.fromEntries(many.map((n) => [n, ['a']])))
  }

  it('draws the same few elements however many connectors there are', () => {
    const few = fan(2).container.querySelectorAll('*').length
    cleanup()
    const { container } = fan(200)
    expect(container.querySelectorAll('svg')).toHaveLength(3)
    expect(container.querySelectorAll('*')).toHaveLength(few)
  })

  it('draws one dot where connectors meet a node’s side, however many meet there', () => {
    const { container } = graph([['a', 'b'], ['c']], { c: ['a', 'b'] })
    const dots = container.querySelector('path[fill="var(--theme-border)"]')?.getAttribute('d')
    // Out of a, out of b, and one into c.
    expect(dots?.match(/M/g)).toHaveLength(3)
  })

  it('draws a lit connector again above the nodes, and its dots in the highlight', () => {
    const { container, lineage } = graph([['a'], ['b'], ['c']], { b: ['a'], c: ['b'] })
    const [, top] = container.querySelectorAll('svg')
    const lines = () =>
      top?.querySelector('path[stroke="var(--theme-border)"]')?.getAttribute('d')?.match(/M/g)
        ?.length ?? 0
    expect(lines()).toBe(0)
    act(() => lineage.hover('b'))
    expect(lines()).toBe(2)
    expect(container.querySelectorAll('circle[fill="var(--theme-element)"]')).toHaveLength(4)
  })

  it('renders only the connectors and dots of the lineage shown', () => {
    const { lineage } = graph(
      [
        ['a', 'c'],
        ['b', 'd'],
      ],
      { b: ['a'], d: ['c'] },
    )
    reads.count = 0
    act(() => lineage.hover('a'))
    // a → b and its two dots; c → d draws nothing of its own.
    expect(reads.count).toBe(3)
  })

  it('adds its keyframes to the page once, before any level has connectors', () => {
    render(
      <>
        <ConnectorLayers edges={[]} zBase={0} />
        <ConnectorLayers edges={[]} zBase={0} />
      </>,
    )
    const sheets = document.querySelectorAll('style[data-href="dependency-graph-highlight"]')
    expect(sheets).toHaveLength(1)
    expect(sheets[0]?.textContent).toContain('@keyframes dag-draw-in')
  })

  it('draws a connector back out after unhover, until its lineage is gone', () => {
    vi.useFakeTimers()
    const { container, lineage } = graph([['a'], ['b']], { b: ['a'] })
    const highlight = () => container.querySelector('path[pathLength="1"]')
    act(() => lineage.hover('a'))
    expect(highlight()?.getAttribute('stroke-dashoffset')).toBe('0')
    act(() => lineage.hover(null))
    // Drawn out to its end, the line no longer lit above the nodes.
    expect(highlight()?.getAttribute('stroke-dashoffset')).toBe('1')
    act(() => vi.advanceTimersByTime(1000))
    expect(highlight()).toBeNull()
    vi.useRealTimers()
  })
})

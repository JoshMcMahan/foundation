// @vitest-environment jsdom
// What re-renders, and what doesn't, on a graph of many jobs: the work that grows with the graph runs
// only when what it draws changes.
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver
global.requestAnimationFrame = (() => 0) as typeof requestAnimationFrame
global.cancelAnimationFrame = (() => {}) as typeof cancelAnimationFrame
Element.prototype.getAnimations = () => []

vi.mock('../components/Provider', async (importOriginal) =>
  (await import('../test/engine')).mockEngineHooks(importOriginal),
)
vi.mock('./AnnotationBanner', () => ({ AnnotationBanner: () => null }))

const panZoom = vi.hoisted(() => ({
  onTransform: undefined as ((ref: unknown, state: { scale: number }) => void) | undefined,
}))
vi.mock('react-zoom-pan-pinch', () => ({
  TransformWrapper: ({
    children,
    onTransform,
  }: {
    children: () => ReactNode
    onTransform: (ref: unknown, state: { scale: number }) => void
  }) => {
    panZoom.onTransform = onTransform
    return children()
  },
  TransformComponent: ({ children }: { children: ReactNode }) => children,
}))

// Every job list rendered, the graph's own and the summary's.
const lists = vi.hoisted(() => ({ renders: 0 }))
vi.mock('./JobSummary', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./JobSummary')>()
  return {
    ...actual,
    Joblist: (props: Parameters<typeof actual.Joblist>[0]) => {
      lists.renders++
      return actual.Joblist(props)
    },
  }
})

import DependencyGraph from './DependencyGraph'
import { layeredJobs, nestedJobs } from './stories/generate'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const runOf = (jobs: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  number: 1,
  slug: 'run',
  workflowName: 'wf',
  status: 'running',
  executedJobs: jobs,
  ...extra,
})

describe('DependencyGraph on many jobs', () => {
  const jobs = layeredJobs(300, { columns: 10 })
  const nodes = () => [...document.querySelectorAll<HTMLElement>('[id^="node_"]')]

  it('re-renders no job list as a job is hovered, and only its lineage', () => {
    render(<DependencyGraph run={runOf(jobs)} preview />)
    const [first, ...rest] = nodes()
    lists.renders = 0
    act(() => {
      fireEvent.mouseEnter(first as HTMLElement)
    })
    expect(lists.renders).toBe(0)
    // The hovered node rises over the connectors with its lineage; the rest stay.
    const raised = rest.filter((node) => node.style.zIndex === '25')
    expect(first?.style.zIndex).toBe('25')
    expect(raised.length).toBeGreaterThan(0)
    expect(raised.length).toBeLessThan(rest.length)
    act(() => {
      fireEvent.mouseLeave(first as HTMLElement)
    })
    expect(lists.renders).toBe(0)
  })

  it('ticks a running run’s time without re-rendering the graph', () => {
    vi.useFakeTimers()
    const createdAt = new Date().toISOString()
    render(<DependencyGraph run={runOf(jobs, { createdAt })} />)
    lists.renders = 0
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(screen.getByText(/5s/)).toBeInTheDocument()
    expect(lists.renders).toBe(0)
  })

  it('pans and zooms without re-rendering the graph', () => {
    render(<DependencyGraph run={runOf(jobs)} preview />)
    lists.renders = 0
    for (const scale of [0.4, 0.1, 0.02, 1.5]) {
      act(() => panZoom.onTransform?.(null, { scale }))
    }
    expect(lists.renders).toBe(0)
  })

  it('opens subworkflows three levels deep at once, and closes them', () => {
    const nested = nestedJobs(3, 6, 3)
    render(<DependencyGraph run={runOf(nested)} preview />)
    const top = nodes().length
    fireEvent.click(screen.getByRole('button', { name: 'Expand All' }))
    // Every level's nodes, each namespaced by the subworkflows it sits in.
    const depth = (id: string) => id.split('subworkflows/').length - 1
    const ids = nodes().map((node) => node.id)
    expect(new Set(ids.map(depth))).toEqual(new Set([0, 1, 2, 3]))
    expect(ids.length).toBeGreaterThan(top)
    fireEvent.click(screen.getByRole('button', { name: 'Collapse All' }))
    expect(screen.getByRole('button', { name: 'Expand All' })).toBeInTheDocument()
  })

  // A node's box, which dims and fades, inside the element its id is on.
  const boxOf = (node: Element) => node.children[1] as HTMLElement

  it('dims a hovered level by a class only its own nodes answer to', () => {
    render(<DependencyGraph run={runOf(nestedJobs(2, 6, 3))} preview />)
    fireEvent.click(screen.getByRole('button', { name: 'Expand All' }))
    const [top] = nodes()
    act(() => {
      fireEvent.mouseEnter(top as HTMLElement)
    })
    expect(document.querySelectorAll('.dag-dim-0')).toHaveLength(1)
    expect(document.querySelector('.dag-dim-1')).toBeNull()
    const nested = nodes().filter((node) => node.id.includes('subworkflows/'))
    expect(nested.length).toBeGreaterThan(0)
    for (const node of nested) {
      expect(boxOf(node)).not.toHaveClass('dag-node-0')
    }
    act(() => {
      fireEvent.mouseLeave(top as HTMLElement)
    })
    expect(document.querySelector('.dag-dim-0')).toBeNull()
  })

  it('fades a small level’s nodes as they dim, and dims a large one’s at once', () => {
    render(<DependencyGraph run={runOf(layeredJobs(20, { columns: 4 }))} preview />)
    expect(nodes().every((node) => boxOf(node).style.transition !== '')).toBe(true)
    cleanup()
    render(<DependencyGraph run={runOf(layeredJobs(400, { columns: 10 }))} preview />)
    expect(nodes().length).toBeGreaterThan(300)
    expect(nodes().every((node) => boxOf(node).style.transition === '')).toBe(true)
  })
})

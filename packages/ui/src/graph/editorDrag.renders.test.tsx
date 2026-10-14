// @vitest-environment jsdom
// What a drag re-renders in the graph editor: a drag is a new object on every pointer move, so
// anything that reads it whole re-renders that often.
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, expect, it, vi } from 'vitest'

vi.mock('../components/Provider', async (importOriginal) =>
  (await import('../test/engine')).mockEngineHooks(importOriginal),
)
if (!('PointerEvent' in window)) {
  Object.defineProperty(window, 'PointerEvent', { value: MouseEvent })
}
vi.mock('react-zoom-pan-pinch', () => ({
  TransformWrapper: ({ children }: { children: unknown }) =>
    typeof children === 'function' ? (children as () => unknown)() : children,
  TransformComponent: ({ children }: { children: ReactNode }) => (
    <div className="react-transform-wrapper">{children}</div>
  ),
}))
vi.mock('../logviewer', () => ({ LogViewer: () => null }))
vi.mock('./AnnotationBanner', () => ({ AnnotationBanner: () => null }))

// Every tooltip in the graph, a port circle's among them, counted as it renders.
const tooltips = vi.hoisted(() => ({ renders: 0 }))
vi.mock('../components/Tooltip', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../components/Tooltip')>()
  return {
    ...actual,
    Tooltip: (props: Parameters<typeof actual.Tooltip>[0]) => {
      tooltips.renders++
      return actual.Tooltip(props)
    },
  }
})

import { DependencyGraphPreview } from './DependencyGraph'

afterEach(cleanup)
document.elementFromPoint = () => null

it('re-renders no port circle while a connection is dragged across the graph', async () => {
  const jobs: Record<string, unknown> = {}
  for (let i = 0; i < 20; i++) {
    jobs[`job_${i}`] = { needs: i ? [`job_${i - 1}`] : [], steps: [{ run: 'x' }] }
  }
  render(
    <DependencyGraphPreview
      yml={{ jobs }}
      editor={{ onEdit: () => undefined, canUndo: false, canRedo: false, onUndo() {}, onRedo() {} }}
    />,
  )
  const node = document.getElementById('node_job_0') as HTMLElement
  act(() => {
    fireEvent.mouseEnter(node)
  })
  act(() => {
    fireEvent.mouseLeave(node)
  })
  // The editor's overlays load lazily.
  const port = await waitFor(
    () => {
      const found = document.querySelector('[data-dag-port="out"][data-dag-node="job_0"]')
      expect(found).not.toBeNull()
      return found as HTMLElement
    },
    { timeout: 10000 },
  )
  fireEvent.pointerDown(port, { button: 0, clientX: 10, clientY: 10 })
  act(() => {
    fireEvent.pointerMove(window, { clientX: 20, clientY: 20 })
  })
  // Once the drag has begun, the tooltips are off; moving on re-renders none of them.
  tooltips.renders = 0
  for (let x = 30; x < 130; x += 10) {
    act(() => {
      fireEvent.pointerMove(window, { clientX: x, clientY: x })
    })
  }
  expect(tooltips.renders).toBe(0)
  act(() => {
    fireEvent.pointerUp(window, { clientX: 130, clientY: 130 })
  })
}, 20000)

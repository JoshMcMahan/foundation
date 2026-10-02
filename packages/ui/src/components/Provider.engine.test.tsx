// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, render, screen } from '@testing-library/react'
import { Suspense } from 'react'
import type { WorkflowEngine } from '../engine'
import { testEngine } from '../test/engine'
import {
  UIProvider,
  useOptionalWorkflowEngine,
  useWorkflowEngine,
  useWorkflowEngineLoader,
} from './Provider'

function StepLabel() {
  const engine = useWorkflowEngine()
  return <span>{engine.stepLabel({ name: 'build' })}</span>
}

function deferred() {
  let resolve!: (engine: WorkflowEngine) => void
  const promise = new Promise<WorkflowEngine>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

describe('UIProvider engine', () => {
  it('passes an engine object straight through', () => {
    render(
      <UIProvider engine={testEngine}>
        <StepLabel />
      </UIProvider>,
    )
    expect(screen.getByText('build')).toBeInTheDocument()
  })

  it('suspends on a loader until it resolves, then renders', async () => {
    const pending = deferred()
    const load = vi.fn(() => pending.promise)
    await act(async () => {
      render(
        <UIProvider engine={load}>
          <Suspense fallback={<span>loading</span>}>
            <StepLabel />
          </Suspense>
        </UIProvider>,
      )
    })
    expect(screen.getByText('loading')).toBeInTheDocument()
    await act(async () => {
      pending.resolve(testEngine)
    })
    expect(await screen.findByText('build')).toBeInTheDocument()
    expect(load).toHaveBeenCalledOnce()
  })

  it('starts the loader on mount, before anything asks for the engine', () => {
    const load = vi.fn(() => deferred().promise)
    render(
      <UIProvider engine={load}>
        <span>page</span>
      </UIProvider>,
    )
    expect(load).toHaveBeenCalledOnce()
  })

  it('throws a clear error when a workflow surface has no engine', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<StepLabel />)).toThrow(/need a UIProvider with an engine/)
  })

  it('leaves the optional engine undefined when not requested or not provided', () => {
    let seen: unknown = 'unset'
    function Probe({ enabled }: { enabled: boolean }) {
      seen = useOptionalWorkflowEngine(enabled)
      return null
    }
    render(
      <UIProvider engine={testEngine}>
        <Probe enabled={false} />
      </UIProvider>,
    )
    expect(seen).toBeUndefined()
    render(<Probe enabled />)
    expect(seen).toBeUndefined()
  })

  it('resolves a loader without suspending for async callers', async () => {
    let loader: (() => Promise<WorkflowEngine | undefined>) | undefined
    function Probe() {
      loader = useWorkflowEngineLoader()
      return <span>editor</span>
    }
    render(
      <UIProvider engine={async () => testEngine}>
        <Probe />
      </UIProvider>,
    )
    expect(screen.getByText('editor')).toBeInTheDocument()
    expect(await loader?.()).toBe(testEngine)
  })
})

import { createWorkflowEngine } from '@parallelworks/workflow-parser'
import { vi } from 'vitest'
import type { EvaluateOptions, WorkflowEngine } from '../engine'

const real = createWorkflowEngine()
const evaluate = vi.fn(({ obj }: EvaluateOptions<unknown>) => obj)

/** The parser's engine with expressions left unevaluated, so form tests need no wasm. */
export const testEngine = {
  ...real,
  init: vi.fn(),
  isReady: vi.fn(() => true),
  onReady: vi.fn((listener: (ready: boolean) => void) => {
    listener(true)
    return () => {}
  }),
  evaluate: evaluate as typeof evaluate & WorkflowEngine['evaluate'],
  convertInputs: vi.fn((inputs: Record<string, unknown>) => inputs),
  inputDependencies: vi.fn(() => ({
    inputDeps: new Set<string>(),
    hasExpressions: false,
  })),
} satisfies WorkflowEngine

/** For `vi.mock('<path>/components/Provider', mockEngineHooks)`. */
export async function mockEngineHooks(
  importOriginal: () => Promise<typeof import('../components/Provider')>,
) {
  return {
    ...(await importOriginal()),
    useWorkflowEngine: () => testEngine,
    useOptionalWorkflowEngine: () => testEngine,
    useWorkflowEngineLoader: () => async () => testEngine,
  }
}

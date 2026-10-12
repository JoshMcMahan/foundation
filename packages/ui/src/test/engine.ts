import * as parser from '@parallelworks/workflow-parser'
import { vi } from 'vitest'
import type { WorkflowEditing } from '../editing'
import type { EvaluateOptions, WorkflowEngine } from '../engine'
import { TEST_ACTIONS } from './actions'

const real = parser.createWorkflowEngine()
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
  // The parser's own functions, as a host passes them, so its editing and ui's types can't drift.
  editing: parser satisfies WorkflowEditing,
} satisfies WorkflowEngine

const loadTestEngine = async () => testEngine

/** For `vi.mock('<path>/components/Provider', mockEngineHooks)`. */
export async function mockEngineHooks(
  importOriginal: () => Promise<typeof import('../components/Provider')>,
) {
  return {
    ...(await importOriginal()),
    useWorkflowEngine: () => testEngine,
    useOptionalWorkflowEngine: () => testEngine,
    useWorkflowEngineLoader: () => loadTestEngine,
    useLoadedWorkflowEngine: () => testEngine,
    useWorkflowEditing: () => testEngine.editing,
    useWorkflowActions: () => TEST_ACTIONS,
  }
}

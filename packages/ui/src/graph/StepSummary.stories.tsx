import { createWorkflowEngine } from '@parallelworks/workflow-parser'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { type RunFileResult, UIProvider } from '../components/Provider'
import DependencyGraph from './DependencyGraph'

const engine = createWorkflowEngine()

const SUMMARY = [
  '## Tests',
  '',
  '| Suite | Passed | Failed |',
  '| --- | --- | --- |',
  '| unit | 120 | 3 |',
  '',
  '<details><summary>3 failures</summary>',
  '',
  '```text',
  'test_residual_converges: residual 3.2e-4 > 1e-6',
  '```',
  '',
  '</details>',
].join('\n')

const FILES: Record<string, string> = {
  'logs/test/step_0/summary.md': SUMMARY,
  'logs/test/step_0/logs.out': 'collected 123 items\n120 passed, 3 failed in 41.2s',
  'logs/test/step_0/script-unstable-redacted.sh': 'pytest -q tests/ --junitxml=results.xml',
  'logs/test/step_1/logs.out': 'Uploaded results.xml (18.4 KB)',
}

const useRunFile = (_slug: string, path: string | null): RunFileResult => ({
  data: path ? FILES[path] : undefined,
  isLoading: false,
  error: undefined,
})

const meta: Meta<typeof DependencyGraph> = {
  title: 'UI/Workflow/DependencyGraph',
  component: DependencyGraph,
  argTypes: { openStep: { control: 'object' }, sidebarStickyTop: { control: 'number' } },
  decorators: [
    (Story) => (
      <UIProvider engine={engine} data={{ useRunFile }}>
        <Story />
      </UIProvider>
    ),
  ],
}
export default meta

const RUN = {
  id: 'run-12',
  number: 12,
  slug: 'solver-sweep-00012',
  workflowName: 'solver-sweep',
  status: 'completed',
  executedJobs: {
    test: {
      status: 'completed',
      steps: [
        { name: 'Run tests', status: 'completed', summary: { bytes: SUMMARY.length } },
        { name: 'Upload results', status: 'completed' },
      ],
    },
  },
}

export const StepWithSummary: StoryObj<typeof DependencyGraph> = {
  args: { run: RUN, openStep: { job: 'test', step: 0 } },
}

// A host's own content, such as its list of step summaries, sits under the annotations and above the graph.
export const ContentAboveGraph: StoryObj<typeof DependencyGraph> = {
  args: {
    run: RUN,
    children: <div className="panel border rounded-lg px-4 py-2.5 text-sm">Step summaries</div>,
  },
}

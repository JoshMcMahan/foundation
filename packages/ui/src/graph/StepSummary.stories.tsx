import { createWorkflowEngine } from '@parallelworks/workflow-parser'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, screen, userEvent, within } from 'storybook/test'
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

const TESTS_312 = [
  '## Tests',
  '',
  '| Suite | Passed | Failed |',
  '| --- | --- | --- |',
  '| unit | 120 | 3 |',
  '| integration | 41 | 0 |',
  '',
  '<details><summary>3 failures</summary>',
  '',
  '```text',
  'test_residual_converges: residual 3.2e-4 > 1e-6',
  'test_cfl_stable[dt=0.02]: CFL 1.31 > 1.0',
  'test_restart_roundtrip: checkpoint step 400 != 401',
  '```',
  '',
  '</details>',
].join('\n')

const BUILD = [
  '## Build',
  '',
  '| Artifact | Size | Target |',
  '| --- | --- | --- |',
  '| `solver` | 18.2 MB | linux-amd64 |',
  '| `solver-mpi` | 21.7 MB | linux-amd64 |',
].join('\n')

// Long enough to pass the card's cap, so it opens on Show more.
const MESH = [
  '## Mesh refinement',
  '',
  'Converged after 12 passes at a 0.4 mm minimum edge length.',
  '',
  '| Pass | Cells | Max residual | Wall time |',
  '| --- | --- | --- | --- |',
  ...Array.from({ length: 12 }, (_, i) => {
    const pass = i + 1
    return `| ${pass} | ${Math.round(182_400 * 1.6 ** i).toLocaleString('en-US')} | ${(4.1e-2 / 4.6 ** i).toExponential(1)} | ${3 * pass}m ${(7 * pass) % 60}s |`
  }),
].join('\n')

const TESTS_311 = [
  '## Tests',
  '',
  '| Suite | Passed | Failed |',
  '| --- | --- | --- |',
  '| unit | 123 | 0 |',
  '| integration | 41 | 0 |',
].join('\n')

const RUN_FILES: Record<string, string> = {
  'logs/build/step_1/summary.md': BUILD,
  'logs/build/step_1/logs.out': 'make -j16 solver solver-mpi',
  'logs/test-0/step_0/summary.md': TESTS_312,
  'logs/test-0/step_0/logs.out': 'collected 164 items\n161 passed, 3 failed in 52.0s',
  'logs/test-1/step_0/summary.md': TESTS_311,
  'logs/test-1/step_0/logs.out': 'collected 123 items\n123 passed in 48.7s',
  'subworkflows/sweep/step_0/logs/mesh_refine/step_1/summary.md': MESH,
  'subworkflows/sweep/step_0/logs/mesh_refine/step_1/logs.out':
    'pass 12: residual 8.1e-7, converged',
}

const matrix = (index: number) => ({
  originaljob: 'test',
  index,
  totalingroup: 2,
  groupjobs: ['test-0', 'test-1'],
  values: { python: ['3.12', '3.11'][index] },
  failfast: false,
  maxparallel: 2,
})

// A run whose summaries come from a plain job, a matrix with a failed member, and a step inside a subworkflow.
const SWEEP_RUN = {
  ...RUN,
  status: 'failed',
  executedJobs: {
    build: {
      status: 'completed',
      completedAt: '2026-10-16T17:02:00Z',
      steps: [
        { name: 'Check out', status: 'completed' },
        { name: 'Compile solver', status: 'completed', summary: { bytes: BUILD.length } },
      ],
    },
    'test-0': {
      status: 'failed',
      needs: ['build'],
      completedAt: '2026-10-16T17:04:00Z',
      _matrix: matrix(0),
      steps: [{ name: 'Run tests', status: 'failed', summary: { bytes: TESTS_312.length } }],
    },
    'test-1': {
      status: 'completed',
      needs: ['build'],
      completedAt: '2026-10-16T17:05:00Z',
      _matrix: matrix(1),
      steps: [{ name: 'Run tests', status: 'completed', summary: { bytes: TESTS_311.length } }],
    },
    sweep: {
      status: 'completed',
      needs: ['build'],
      completedAt: '2026-10-16T17:40:00Z',
      steps: [
        {
          name: 'Refine mesh',
          status: 'completed',
          subworkflow: {
            jobs: {
              mesh_refine: {
                status: 'completed',
                steps: [
                  { name: 'Prepare', status: 'completed' },
                  { name: 'Converge', status: 'completed', summary: { bytes: MESH.length } },
                ],
              },
            },
          },
        },
      ],
    },
  },
}

// Each step that wrote a summary gets a card under the graph, in the order its job completed.
export const StepSummariesUnderGraph: StoryObj<typeof DependencyGraph> = {
  args: { run: SWEEP_RUN },
  decorators: [
    (Story) => (
      <UIProvider
        engine={engine}
        data={{
          useRunFile: (_slug, path) => ({
            data: path ? RUN_FILES[path] : undefined,
            isLoading: false,
            error: undefined,
          }),
        }}
      >
        <Story />
      </UIProvider>
    ),
  ],
}

// The summary mark beside a step in the job list opens that step on its summary.
export const SummaryMarkOpensSummary: StoryObj<typeof DependencyGraph> = {
  args: { run: RUN },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // The job list beside the graph and the graph's own node both name the job.
    await userEvent.click(canvas.getAllByText('Test')[0] as HTMLElement)
    await userEvent.click(canvas.getAllByRole('button', { name: 'Step summary' })[0] as HTMLElement)
    const dialog = await screen.findByRole('dialog')
    await expect(within(dialog).getByRole('heading', { name: 'Tests' })).toBeVisible()
    await expect(screen.getByRole('tab', { name: 'Summary' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  },
}

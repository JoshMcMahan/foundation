import { createWorkflowEngine } from '@parallelworks/workflow-parser'
import type { Decorator, Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, within } from 'storybook/test'
import { type ProblemMessage, UIProvider } from '../components/Provider'
import DependencyGraph, { type ViewMode } from './DependencyGraph'
import type { RunWarning } from './runWarnings'
import {
  ALWAYS_WARNING,
  FAN_JOBS,
  NOT_COMPLETED_WARNING,
  PIPELINE_JOBS,
  RUNNING_WARNED_JOBS,
  WARNED_JOBS,
} from './stories/runFixtures'
import type { WorkflowJob } from './types'

interface RunGraphArgs {
  jobs: Record<string, WorkflowJob>
  status: 'completed' | 'running'
  warnings: RunWarning[]
  viewMode: ViewMode
  bleed?: boolean
  workflowName?: string
  completedAt?: string
}

/** A run's page as a host draws it: the graph of its jobs, with the view toggle the host keeps. */
function RunGraph({
  jobs,
  status,
  warnings,
  viewMode,
  bleed,
  workflowName = 'release',
  completedAt = '2026-01-01T09:10:00.000Z',
}: RunGraphArgs) {
  const [mode, setMode] = useState(viewMode)
  const [picked, setPicked] = useState(viewMode)
  if (picked !== viewMode) {
    setPicked(viewMode)
    setMode(viewMode)
  }
  const running = status === 'running'
  // A running run's time counts from a few minutes ago rather than from the day the fixtures name.
  const [createdAt] = useState(() =>
    running ? new Date(Date.now() - 4 * 60_000).toISOString() : '2026-01-01T09:00:00.000Z',
  )
  return (
    <DependencyGraph
      run={{
        id: 'run-12',
        number: 12,
        slug: `${workflowName}-12`,
        workflowName,
        status,
        createdAt,
        ...(running ? {} : { completedAt }),
        executedJobs: jobs,
        warnings,
      }}
      viewMode={mode}
      setViewMode={setMode}
      bleed={bleed}
    />
  )
}

const meta: Meta<typeof RunGraph> = {
  title: 'UI/Workflow/Run graph',
  component: RunGraph,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          '`DependencyGraph` showing a run. A run’s `warnings` are listed over the graph, each linking to the job or step it is about, and marked on that job or step, so one skipped without a log is still flagged.',
      },
    },
  },
  args: { jobs: WARNED_JOBS, status: 'completed', warnings: [], viewMode: 'dag' },
  argTypes: {
    warnings: {
      control: 'object',
      description:
        'The run’s `warnings`: each one’s `message`, its `job`, its `step` index when it is about a step, and the `path` of subworkflow steps it is under, such as `["release", "step_1"]`. A warning may also carry a problem `code` and `params`, which the host’s `useProblemMessage` words in the reader’s language, and a `type`, the page it links to, which `useProblemMessage` gets too, to pick the messages of the application it names.',
    },
    viewMode: {
      control: 'inline-radio',
      options: ['dag', 'tree'],
      description: 'The graph, or the list of jobs and steps.',
    },
    status: { control: 'inline-radio', options: ['completed', 'running'] },
    bleed: {
      control: 'boolean',
      description:
        'On a phone, the graph’s or list’s panel reaches past the page’s `p-4` to its edges.',
    },
    jobs: { control: false, description: 'The run’s `executedJobs`.' },
  },
}
export default meta

type Story = StoryObj<typeof RunGraph>

/** Follows a warning's link to its job or step, which opens around it and takes focus. */
function follow(where: string, row: string): NonNullable<Story['play']> {
  return async ({ canvasElement }) => {
    const list = within(within(canvasElement).getByTestId('run-warnings'))
    await userEvent.click(list.getByRole('button', { name: where }))
    await expect(document.activeElement).toHaveAttribute('data-run-row', row)
  }
}

/** A job its `if:` skipped: its warning has nowhere else to show, since the job wrote no log. */
export const SkippedJob: Story = {
  args: { warnings: [{ job: 'deploy', message: NOT_COMPLETED_WARNING }] },
}

/** A step its `if:` skipped: its job is marked, and the warning's link opens the job to the step. */
export const SkippedStep: Story = {
  args: { warnings: [{ job: 'test', step: 1, message: NOT_COMPLETED_WARNING }] },
  play: follow('Test › report failures', 'test:1'),
}

/** A step under way with a warning, which its log also reports as an annotation. */
export const RunningStep: Story = {
  args: {
    jobs: RUNNING_WARNED_JOBS,
    status: 'running',
    warnings: [{ job: 'train', step: 0, message: ALWAYS_WARNING }],
  },
  play: follow('Train › fit', 'train:0'),
}

/** A step in a subworkflow: the step that runs it is marked, and the link opens the subworkflow in place. */
export const SubworkflowStep: Story = {
  args: {
    warnings: [
      { path: ['release', 'step_1'], job: 'upload', step: 1, message: NOT_COMPLETED_WARNING },
    ],
  },
  play: follow('Release › publish › Upload › roll back', 'subworkflows/release/step_1/upload:1'),
}

const engine = createWorkflowEngine()

// A host's catalog in Spanish, as `useCodeMessage` from `@parallelworks/problem/react` gives it: a
// message for one code, none for any other.
const spanishMessage: ProblemMessage = (code, params) =>
  code === 'undefined_input'
    ? `No hay ninguna entrada "${params?.['name']}". ¿Quisiste decir "${params?.['suggestion']}"?`
    : undefined
const useSpanishMessage = () => spanishMessage
const withSpanishCatalog: Decorator = (Story) => (
  <UIProvider engine={engine} data={{ useProblemMessage: useSpanishMessage }}>
    <Story />
  </UIProvider>
)

const UNDEFINED_INPUT = {
  message: 'There’s no input "rundir". Did you mean "run_dir"?',
  code: 'undefined_input',
  params: { name: 'rundir', suggested: 'true', suggestion: 'run_dir' },
}

/** A warning with a code the host has a message for: it reads in the host's language. */
export const CodedInTheHostsLanguage: Story = {
  decorators: [withSpanishCatalog],
  args: { warnings: [{ job: 'deploy', ...UNDEFINED_INPUT }] },
  play: async ({ canvasElement }) => {
    const list = within(within(canvasElement).getByTestId('run-warnings'))
    await expect(list.getByText(/No hay ninguna entrada "rundir"/)).toBeInTheDocument()
  },
}

/** A warning with a code the host has no message for: it keeps the text the server sent. */
export const CodedWithoutAMessage: Story = {
  decorators: [withSpanishCatalog],
  args: {
    warnings: [{ job: 'deploy', message: NOT_COMPLETED_WARNING, code: 'replaced_keyword' }],
  },
}

/** A warning whose type names a page: it links there, in a new tab. One whose type is
 *  `about:blank`, or that has none, doesn't. */
export const WithAPage: Story = {
  args: {
    warnings: [
      { job: 'deploy', ...UNDEFINED_INPUT, type: '/problems/workflow/undefined_input' },
      { job: 'test', step: 1, message: NOT_COMPLETED_WARNING, type: 'about:blank' },
    ],
  },
  play: async ({ canvasElement }) => {
    const list = within(within(canvasElement).getByTestId('run-warnings'))
    const links = list.getAllByRole('link', { name: /About this warning/ })
    await expect(links).toHaveLength(1)
    await expect(links[0]).toHaveAttribute('href', '/problems/workflow/undefined_input')
  },
}

/** Every kind at once, in the list of jobs and steps, opened; a link goes back to the graph. */
export const TreeView: Story = {
  args: {
    viewMode: 'tree',
    warnings: [
      { job: 'build', step: 1, message: ALWAYS_WARNING },
      { job: 'test', step: 1, message: NOT_COMPLETED_WARNING },
      { path: ['release', 'step_1'], job: 'upload', step: 1, message: NOT_COMPLETED_WARNING },
      { job: 'deploy', message: NOT_COMPLETED_WARNING },
    ],
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Expand all' }))
  },
}

const PIPELINE: Partial<RunGraphArgs> = {
  jobs: PIPELINE_JOBS,
  workflowName: 'variant-calling',
  completedAt: '2026-01-01T09:35:25.000Z',
}

/** A sixteen-job pipeline: the whole graph fits a desktop panel. */
export const APipeline: Story = { args: PIPELINE }

/** The pipeline as a list: each name takes the room its time leaves, and the job that waits on four
 *  lanes wraps its chips, each one whole. */
export const APipelineAsAList: Story = { args: { ...PIPELINE, viewMode: 'tree' } }

const phone = { viewport: { value: 'mobile1', isRotated: false } }

/** On a phone the graph runs down the screen, its ranks as rows, fit to the width at a scale its
 *  jobs read at, in a panel most of the screen tall to pan down through. Connectors leave each
 *  node's bottom for the top of the next. With `bleed`, its panel reaches the screen's edges. */
export const APipelineOnAPhone: Story = {
  args: { ...PIPELINE, bleed: true },
  globals: phone,
}

/** The list on a phone, edge to edge with `bleed`: names show whole where they fit, and a long list
 *  of what a job depends on wraps. */
export const APipelineAsAListOnAPhone: Story = {
  args: { ...PIPELINE, viewMode: 'tree', bleed: true },
  globals: phone,
}

const FAN: Partial<RunGraphArgs> = {
  jobs: FAN_JOBS,
  workflowName: 'variant-calling',
  completedAt: '2026-01-01T09:16:06.000Z',
}

/** A run that fans out four lanes wide and back in, each lane its own jobs. */
export const AWideFan: Story = { args: FAN }

/** The fan on a phone, running down: four lanes are wider than the screen at a size they read at,
 *  so the row pans sideways, from the middle. */
export const AWideFanOnAPhone: Story = { args: { ...FAN, bleed: true }, globals: phone }

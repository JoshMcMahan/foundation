import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, within } from 'storybook/test'
import DependencyGraph, { type ViewMode } from './DependencyGraph'
import type { RunWarning } from './runWarnings'
import {
  ALWAYS_WARNING,
  NOT_COMPLETED_WARNING,
  RUNNING_WARNED_JOBS,
  WARNED_JOBS,
} from './stories/runFixtures'
import type { WorkflowJob } from './types'

interface RunGraphArgs {
  jobs: Record<string, WorkflowJob>
  status: 'completed' | 'running'
  warnings: RunWarning[]
  viewMode: ViewMode
}

/** A run's page as a host draws it: the graph of its jobs, with the view toggle the host keeps. */
function RunGraph({ jobs, status, warnings, viewMode }: RunGraphArgs) {
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
        slug: 'release-12',
        workflowName: 'release',
        status,
        createdAt,
        ...(running ? {} : { completedAt: '2026-01-01T09:10:00.000Z' }),
        executedJobs: jobs,
        warnings,
      }}
      viewMode={mode}
      setViewMode={setMode}
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
        'The run’s `warnings`: each one’s `message`, its `job`, its `step` index when it is about a step, and the `path` of subworkflow steps it is under, such as `["release", "step_1"]`.',
    },
    viewMode: {
      control: 'inline-radio',
      options: ['dag', 'tree'],
      description: 'The graph, or the list of jobs and steps.',
    },
    status: { control: 'inline-radio', options: ['completed', 'running'] },
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

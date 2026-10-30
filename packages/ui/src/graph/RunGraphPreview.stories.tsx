import type { Meta, StoryObj } from '@storybook/react-vite'
import { HoverCard } from '../components/HoverCard'
import { RunStatusLabel } from '../components/StatusLabel'
import type { RunStatus } from '../engine'
import DependencyGraph from './DependencyGraph'
import { chainJobs, type GeneratedJob, layeredJobs } from './stories/generate'
import { FAN_JOBS, PIPELINE_JOBS, RUN_JOBS } from './stories/runFixtures'
import type { WorkflowJob } from './types'

const at = (seconds: number) => new Date(Date.UTC(2026, 0, 1, 9, 0, seconds)).toISOString()

/** A run of generated jobs: the first `done` completed, the next `running` running and the rest
 *  not yet started; or, with `failed`, the jobs before it completed and those after it skipped. */
function ran(
  jobs: Record<string, GeneratedJob>,
  {
    done = Number.POSITIVE_INFINITY,
    running = 0,
    failed,
  }: { done?: number; running?: number; failed?: number } = {},
): Record<string, WorkflowJob> {
  return Object.fromEntries(
    Object.entries(jobs).map(([name, job], i) => {
      const status: RunStatus =
        failed !== undefined
          ? i < failed
            ? 'completed'
            : i === failed
              ? 'failed'
              : 'skipped-failed'
          : i < done
            ? 'completed'
            : i < done + running
              ? 'running'
              : ''
      const startedAt = status ? at(i) : undefined
      const completedAt = status && status !== 'running' ? at(i + 30) : undefined
      return [
        name,
        {
          status,
          ...(job.needs ? { needs: job.needs } : {}),
          ...(startedAt ? { startedAt } : {}),
          ...(completedAt ? { completedAt } : {}),
          steps: job.steps.map((step) => ({ name: step.name, status })),
        },
      ]
    }),
  )
}

interface PreviewArgs {
  jobs: Record<string, WorkflowJob>
  status: RunStatus
  still: boolean
  maxHeight: number
}

const graphOf = ({ jobs, status, still, maxHeight }: PreviewArgs) => (
  <DependencyGraph
    run={{
      id: 'run-7',
      number: 7,
      slug: 'pipeline-7',
      workflowName: 'pipeline',
      status,
      createdAt: at(0),
      executedJobs: jobs,
    }}
    still={still}
    maxHeight={maxHeight}
    removeBorder
  />
)

/** A still graph as a host's card holds it, as wide as a hover card. */
function Preview(args: PreviewArgs) {
  return (
    <div
      className="overflow-hidden rounded-lg border theme-border bg-(--theme-panel-bg)"
      style={{ width: 420 }}
    >
      {graphOf(args)}
    </div>
  )
}

const meta: Meta<typeof Preview> = {
  title: 'UI/Workflow/Run graph preview',
  component: Preview,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          '`DependencyGraph` with `still`: a run’s graph to glance at, as a hover card over a run’s status shows it. The graph fits the card’s width, the card is as tall as the graph up to `maxHeight`, and each job is tinted in its status’s tone, so a run too large to read by name still shows how far it got. Nothing in it pans, zooms or opens.',
      },
    },
  },
  args: { jobs: RUN_JOBS, status: 'failed', still: true, maxHeight: 240 },
  argTypes: {
    still: {
      control: 'boolean',
      description: 'The graph to glance at, with nothing around it and nothing in it to press.',
    },
    maxHeight: {
      control: { type: 'number', min: 80, max: 600, step: 20 },
      description: 'The tallest a still graph’s panel grows, in pixels.',
    },
    status: {
      control: 'inline-radio',
      options: ['completed', 'running', 'failed'],
    },
    jobs: { control: false, description: 'The run’s `executedJobs`.' },
  },
}
export default meta

type Story = StoryObj<typeof Preview>

/** A finished run: a checkout, a two-job matrix, a failed test and a skipped deploy. */
export const AFinishedRun: Story = {}

export const OneJob: Story = { args: { jobs: ran(chainJobs(1)), status: 'completed' } }

export const ThreeJobsRunning: Story = {
  args: { jobs: ran(chainJobs(3), { done: 1, running: 1 }), status: 'running' },
}

export const AWideFan: Story = { args: { jobs: FAN_JOBS, status: 'completed' } }

/** Thirty jobs six columns deep, partway through: names still read. */
export const ThirtyJobsRunning: Story = {
  args: {
    jobs: ran(layeredJobs(30, { columns: 6 }), { done: 14, running: 4 }),
    status: 'running',
  },
}

/** A hundred jobs: too small to read by name, the tints show how far the run got. */
export const AHundredJobsRunning: Story = {
  args: {
    jobs: ran(layeredJobs(100, { columns: 10 }), { done: 60, running: 8 }),
    status: 'running',
  },
}

export const FourHundredJobs: Story = {
  args: { jobs: ran(layeredJobs(400, { columns: 20 })), status: 'completed' },
}

/** A sixteen-job pipeline with long names, as wide as it is long. */
export const APipeline: Story = { args: { jobs: PIPELINE_JOBS, status: 'completed' } }

/** A chain twenty-five long, failed at its fifteenth job: a strip across the card. */
export const ALongChainFailed: Story = {
  args: { jobs: ran(chainJobs(25), { failed: 14 }), status: 'failed' },
}

/** Forty jobs two wide: the card stops at `maxHeight`, the graph narrow in its middle. */
export const TallAndNarrow: Story = {
  args: {
    jobs: ran(layeredJobs(40, { columns: 2 }), { done: 25, running: 5 }),
    status: 'running',
  },
}

/** As a host shows it: in a hover card over the run's status. */
export const InAHoverCard: Story = {
  render: (args) => (
    <HoverCard
      defaultOpen
      card={
        <div style={{ width: 420 }}>
          <div className="border-b theme-border px-3 py-2 text-sm">
            <RunStatusLabel status={args.status} />
          </div>
          {graphOf(args)}
        </div>
      }
    >
      <span className="inline-flex">
        <RunStatusLabel status={args.status} />
      </span>
    </HoverCard>
  ),
  args: {
    jobs: ran(layeredJobs(12, { columns: 6 }), { failed: 7 }),
    status: 'failed',
  },
}

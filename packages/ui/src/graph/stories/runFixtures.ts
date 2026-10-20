import type { WorkflowJob } from '../types'

const at = (minutes: number) => new Date(Date.UTC(2026, 0, 1, 9, minutes)).toISOString()

const matrix = (index: number) => ({
  originaljob: 'train',
  index,
  totalingroup: 2,
  groupjobs: ['train_0', 'train_1'],
  values: { gpu: index },
  failfast: false,
  maxparallel: 2,
})

/** A finished run: a checkout, a two-job matrix, a failed test with annotations and a skipped deploy. */
export const RUN_JOBS: Record<string, WorkflowJob> = {
  checkout: {
    status: 'completed',
    startedAt: at(0),
    completedAt: at(1),
    steps: [{ name: 'clone', status: 'completed', startedAt: at(0), completedAt: at(1) }],
  },
  train_0: {
    status: 'completed',
    needs: ['checkout'],
    startedAt: at(1),
    completedAt: at(9),
    _matrix: matrix(0),
    steps: [{ name: 'fit', status: 'completed', startedAt: at(1), completedAt: at(9) }],
  },
  train_1: {
    status: 'completed',
    needs: ['checkout'],
    startedAt: at(1),
    completedAt: at(8),
    _matrix: matrix(1),
    steps: [
      {
        name: 'fit',
        status: 'completed',
        startedAt: at(1),
        completedAt: at(8),
        annotations: [{ type: 'warning', message: 'Loss plateaued after epoch 40.' }],
      },
    ],
  },
  test: {
    status: 'failed',
    needs: ['train_0', 'train_1'],
    startedAt: at(9),
    completedAt: at(11),
    steps: [
      {
        name: 'unit tests',
        status: 'failed',
        startedAt: at(9),
        completedAt: at(11),
        annotations: [
          { type: 'error', title: 'Test failed', message: 'expected 0.93 to be above 0.95' },
          { type: 'notice', message: 'Coverage report written to coverage/index.html.' },
        ],
      },
    ],
  },
  deploy: { status: 'skipped', needs: ['test'], steps: [{ name: 'push', status: 'skipped' }] },
}

/** What a run warns about an `if:` that uses the older `always`. */
export const ALWAYS_WARNING = '`always` is the older spelling of `always()`; use `always()`'
/** What a run warns about an `if:` that reads a removed keyword as text, which is always true. */
export const NOT_COMPLETED_WARNING =
  '`completed` is the text "completed", which is always true, so `!completed` is always false; the if: keyword `!completed` is now `!success()`'

/** A finished run, one job after another, whose `if:`s skipped a job, a step and a step in a
 *  subworkflow. */
export const WARNED_JOBS: Record<string, WorkflowJob> = {
  build: {
    status: 'completed',
    startedAt: at(0),
    completedAt: at(3),
    steps: [
      { name: 'compile', status: 'completed', startedAt: at(0), completedAt: at(3) },
      { name: 'upload artifacts', status: 'completed', startedAt: at(3), completedAt: at(3) },
    ],
  },
  test: {
    status: 'completed',
    needs: ['build'],
    startedAt: at(3),
    completedAt: at(7),
    steps: [
      { name: 'unit tests', status: 'completed', startedAt: at(3), completedAt: at(7) },
      { name: 'report failures', status: 'skipped' },
    ],
  },
  release: {
    status: 'completed',
    needs: ['test'],
    startedAt: at(7),
    completedAt: at(10),
    steps: [
      { name: 'tag', status: 'completed', startedAt: at(7), completedAt: at(8) },
      {
        name: 'publish',
        uses: 'workflow/publish',
        status: 'completed',
        startedAt: at(8),
        completedAt: at(10),
        subworkflow: {
          jobs: {
            upload: {
              status: 'completed',
              startedAt: at(8),
              completedAt: at(10),
              steps: [
                { name: 'push', status: 'completed', startedAt: at(8), completedAt: at(10) },
                { name: 'roll back', status: 'skipped' },
              ],
            },
          },
        },
      },
    ],
  },
  deploy: {
    status: 'skipped',
    needs: ['release'],
    steps: [{ name: 'push', status: 'skipped' }],
  },
}

/** A running run whose step under way was written with the older `always`, as its log says too. */
export const RUNNING_WARNED_JOBS: Record<string, WorkflowJob> = {
  build: {
    status: 'completed',
    startedAt: at(0),
    completedAt: at(3),
    steps: [{ name: 'compile', status: 'completed', startedAt: at(0), completedAt: at(3) }],
  },
  train: {
    status: 'running',
    needs: ['build'],
    startedAt: at(3),
    steps: [
      {
        name: 'fit',
        status: 'running',
        startedAt: at(3),
        annotations: [{ type: 'warning', message: ALWAYS_WARNING }],
      },
      { name: 'save model', status: '' },
    ],
  },
  report: { status: '', needs: ['train'], steps: [{ name: 'summarize', status: '' }] },
}

// A pipeline's jobs, each after the ones it needs, at about three minutes a job.
const PIPELINE: [name: string, needs: string[], steps: string[]][] = [
  ['fetch-reference', [], ['download genome', 'index']],
  ['qc-reads', ['fetch-reference'], ['fastqc']],
  ['trim-adapters', ['qc-reads'], ['trim']],
  ['align-lane-1', ['trim-adapters'], ['align', 'sort']],
  ['align-lane-2', ['trim-adapters'], ['align', 'sort']],
  ['align-lane-3', ['trim-adapters'], ['align', 'sort']],
  ['align-lane-4', ['trim-adapters'], ['align', 'sort']],
  ['merge-bams', ['align-lane-1', 'align-lane-2', 'align-lane-3', 'align-lane-4'], ['merge']],
  ['mark-duplicates', ['merge-bams'], ['mark']],
  ['base-recalibration', ['mark-duplicates'], ['model', 'apply']],
  ['call-variants', ['base-recalibration'], ['haplotypes']],
  ['filter-variants', ['call-variants'], ['filter']],
  ['annotate-variants', ['filter-variants'], ['annotate']],
  ['coverage-summary', ['merge-bams'], ['depth']],
  ['qc-report', ['annotate-variants', 'coverage-summary'], ['render']],
  ['upload-results', ['qc-report'], ['upload']],
]

// Four lanes, each aligned and then indexed apart, so each lane's jobs are nodes of their own: a fan
// four wide, then four in, to one merge.
const FAN: [name: string, needs: string[], steps: string[]][] = [
  ['fetch-reference', [], ['download genome']],
  ['split-reads', ['fetch-reference'], ['split']],
  ...[1, 2, 3, 4].flatMap((lane): [string, string[], string[]][] => [
    [`align-lane-${lane}`, ['split-reads'], ['align']],
    [`index-lane-${lane}`, [`align-lane-${lane}`], ['index']],
  ]),
  ['merge-bams', [1, 2, 3, 4].map((lane) => `index-lane-${lane}`), ['merge']],
  ['call-variants', ['merge-bams'], ['haplotypes']],
]

const pipelineAt = (seconds: number) => new Date(Date.UTC(2026, 0, 1, 9, 0, seconds)).toISOString()

/** A finished run of a sixteen-job pipeline with long job names: one job waits on four lanes, so its
 *  list of what it depends on is long, and the chain is too long to fit a phone's width readably. */
export const PIPELINE_JOBS: Record<string, WorkflowJob> = finished(PIPELINE)

/** A finished run that fans out four lanes wide, each lane its own two jobs, and back in. */
export const FAN_JOBS: Record<string, WorkflowJob> = finished(FAN)

function finished(pipeline: [name: string, needs: string[], steps: string[]][]) {
  const ends: Record<string, number> = {}
  const jobs: Record<string, WorkflowJob> = {}
  for (const [name, needs, steps] of pipeline) {
    const start = Math.max(0, ...needs.map((n) => ends[n] ?? 0))
    const end = start + 161
    ends[name] = end
    const per = Math.floor(161 / steps.length)
    jobs[name] = {
      status: 'completed',
      ...(needs.length ? { needs } : {}),
      startedAt: pipelineAt(start),
      completedAt: pipelineAt(end),
      steps: steps.map((step, i) => ({
        name: step,
        status: 'completed',
        startedAt: pipelineAt(start + i * per),
        completedAt: pipelineAt(i === steps.length - 1 ? end : start + (i + 1) * per),
      })),
    }
  }
  return jobs
}

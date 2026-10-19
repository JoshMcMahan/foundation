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

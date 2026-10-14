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

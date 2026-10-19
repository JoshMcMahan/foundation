import { describe, expect, it } from 'vitest'
import { locateWarnings, type RunWarning, WarningMarks } from './runWarnings'
import type { WorkflowJob } from './types'

const jobs: Record<string, WorkflowJob> = {
  build: {
    status: 'completed',
    steps: [
      { name: 'compile', status: 'completed' },
      {
        name: 'publish',
        status: 'completed',
        subworkflow: {
          jobs: {
            upload: {
              status: 'completed',
              steps: [
                { name: 'push', status: 'completed' },
                {
                  name: 'notify',
                  status: 'completed',
                  subworkflow: {
                    jobs: { send: { status: 'skipped', steps: [{ status: 'skipped' }] } },
                  },
                },
              ],
            },
          },
        },
      },
    ],
  },
  train_0: {
    status: 'completed',
    steps: [{ name: 'fit', status: 'completed' }],
    _matrix: {
      originaljob: 'train',
      index: 0,
      totalingroup: 2,
      groupjobs: ['train_0', 'train_1'],
      values: {},
      failfast: false,
      maxparallel: 2,
    },
  },
  train_1: {
    status: 'skipped',
    steps: [{ name: 'fit', status: 'skipped' }],
    _matrix: {
      originaljob: 'train',
      index: 1,
      totalingroup: 2,
      groupjobs: ['train_0', 'train_1'],
      values: {},
      failfast: false,
      maxparallel: 2,
    },
  },
  deploy: { status: 'skipped', steps: [{ name: 'push', status: 'skipped' }] },
}

const keysOf = (warning: RunWarning) =>
  locateWarnings([warning], jobs)[0]?.targets.map((t) => t.key)

describe('locateWarnings', () => {
  it('finds a job, and a step, at the run’s own level', () => {
    expect(keysOf({ job: 'deploy', message: 'm' })).toEqual(['deploy'])
    expect(keysOf({ job: 'deploy', step: 0, message: 'm' })).toEqual(['deploy:0'])
  })

  it('finds a step in a subworkflow, and one two subworkflows down, by the steps that run them', () => {
    const [nested] = locateWarnings(
      [{ path: ['build', 'step_1', 'upload', 'step_1'], job: 'send', step: 0, message: 'm' }],
      jobs,
    )
    expect(nested?.targets).toEqual([
      {
        via: [
          { prefix: '', job: 'build', step: 1 },
          { prefix: 'subworkflows/build/step_1/', job: 'upload', step: 1 },
        ],
        prefix: 'subworkflows/build/step_1/subworkflows/upload/step_1/',
        job: 'send',
        step: 0,
        key: 'subworkflows/build/step_1/subworkflows/upload/step_1/send:0',
      },
    ])
    expect(keysOf({ path: ['build', 'step_1'], job: 'upload', message: 'm' })).toEqual([
      'subworkflows/build/step_1/upload',
    ])
  })

  it('finds every run of a matrix by the job the workflow names', () => {
    expect(keysOf({ job: 'train', step: 0, message: 'm' })).toEqual(['train_0:0', 'train_1:0'])
  })

  it('finds nothing for a job or subworkflow the run doesn’t list', () => {
    expect(keysOf({ job: 'gone', message: 'm' })).toEqual([])
    expect(keysOf({ path: ['build', 'step_0'], job: 'upload', message: 'm' })).toEqual([])
    expect(keysOf({ path: ['build', 'first'], job: 'upload', message: 'm' })).toEqual([])
  })
})

describe('WarningMarks', () => {
  const step: RunWarning = { job: 'deploy', step: 0, message: 'a step' }
  const nested: RunWarning = {
    path: ['build', 'step_1', 'upload', 'step_1'],
    job: 'send',
    message: 'a job in a subworkflow',
  }
  const matrix: RunWarning = { job: 'train', message: 'a matrix' }
  const marks = new WarningMarks(locateWarnings([step, nested, matrix], jobs))

  it('marks a step, and the job it is in', () => {
    expect(marks.under('deploy:0')).toEqual([step])
    expect(marks.under('deploy')).toEqual([step])
    expect(marks.under('deploy:1')).toEqual([])
  })

  it('marks each job and step a subworkflow’s warning is under', () => {
    for (const key of [
      'build',
      'build:1',
      'subworkflows/build/step_1/upload',
      'subworkflows/build/step_1/upload:1',
      'subworkflows/build/step_1/subworkflows/upload/step_1/send',
    ]) {
      expect(marks.under(key)).toEqual([nested])
    }
    expect(marks.under('build:0')).toEqual([])
  })

  it('lists a matrix’s warning once across its runs', () => {
    expect(marks.under('train_0')).toEqual([matrix])
    expect(marks.under('train_1')).toEqual([matrix])
    expect(marks.underAny(['train_0', 'train_1'])).toEqual([matrix])
  })

  it('signs marks by what they mark, so a run’s job updates that move none keep them', () => {
    const again = new WarningMarks(
      locateWarnings([step, nested, matrix], {
        ...jobs,
        deploy: { status: 'skipped', steps: [{ name: 'push', status: 'skipped' }] },
      }),
    )
    expect(again.signature).toBe(marks.signature)
    expect(new WarningMarks(locateWarnings([step], jobs)).signature).not.toBe(marks.signature)
  })
})

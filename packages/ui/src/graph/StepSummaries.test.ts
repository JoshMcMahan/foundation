import { describe, expect, it } from 'vitest'
import { stepSummarySources } from './StepSummaries'
import type { WorkflowJob } from './types'

const summary = { bytes: 10 }

describe('stepSummarySources', () => {
  it('lists every step that wrote a summary, in the order its job completed', () => {
    const jobs: Record<string, WorkflowJob> = {
      running: { status: 'running', steps: [{ name: 'Watch', status: 'running', summary }] },
      late: {
        status: 'completed',
        completedAt: '2026-10-16T12:05:00Z',
        steps: [
          { name: 'First', status: 'completed', summary },
          { name: 'Quiet', status: 'completed' },
          { name: 'Second', status: 'completed', summary },
        ],
      },
      early: {
        status: 'failed',
        completedAt: '2026-10-16T12:01:00Z',
        steps: [{ name: 'Run tests', status: 'failed', summary }],
      },
    }
    expect(stepSummarySources(jobs).map(({ job, index }) => `${job}:${index}`)).toEqual([
      'early:0',
      'late:0',
      'late:2',
      'running:0',
    ])
  })

  it('names a subworkflow step after the jobs it runs in', () => {
    const jobs: Record<string, WorkflowJob> = {
      sweep: {
        status: 'completed',
        steps: [
          {
            name: 'Refine',
            status: 'completed',
            subworkflow: {
              jobs: {
                mesh_refine: {
                  status: 'completed',
                  steps: [{ name: 'Converge', status: 'completed', summary }],
                },
              },
            },
          },
        ],
      },
    }
    expect(stepSummarySources(jobs)).toMatchObject([
      {
        prefix: 'subworkflows/sweep/step_0/',
        job: 'mesh_refine',
        jobNames: ['Sweep', 'Mesh refine'],
        index: 0,
      },
    ])
  })
})

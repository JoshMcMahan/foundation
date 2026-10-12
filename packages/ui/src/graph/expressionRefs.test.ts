import { describe, expect, it } from 'vitest'
import { testEngine } from '../test/engine'
import { expressionRefs } from './expressionRefs'

const WORKFLOW = {
  env: { TOP: 'x' },
  sessions: { notebook: {} },
  needs: {
    organizationVariables: ['LICENSE_SERVER'],
    userVariables: { API_TOKEN: { hint: 'for the upload' } },
  },
  on: { execute: { inputs: { cluster: { type: 'compute-clusters' } } } },
  jobs: {
    build: {
      outputs: { version: '${{ needs.build.steps.v.outputs.v }}' },
      steps: [{ run: 'make' }],
    },
    test: {
      needs: ['build:any'],
      env: { OWN: 'y' },
      strategy: {
        matrix: { os: ['linux'], include: [{ os: 'mac', arch: 'arm' }] },
      },
      steps: [{ run: 'test' }],
    },
  },
}

describe('expressionRefs', () => {
  it('lists what an expression in a job can read', () => {
    expect(expressionRefs(testEngine.editing, WORKFLOW, 'test').map((ref) => ref.label)).toEqual([
      'inputs.cluster',
      'needs.build.outputs.version',
      'matrix.os',
      'matrix.arch',
      'org.LICENSE_SERVER',
      'var.API_TOKEN',
      'sessions.notebook',
      'env.TOP',
      'env.OWN',
    ])
  })

  it('leaves out job-only names outside a job', () => {
    expect(expressionRefs(testEngine.editing, WORKFLOW).map((ref) => ref.group)).not.toContain(
      'outputs',
    )
    expect(expressionRefs(testEngine.editing, WORKFLOW, 'build')[1]).toEqual({
      group: 'variables',
      label: 'org.LICENSE_SERVER',
      expression: '${{ org.LICENSE_SERVER }}',
    })
  })
})

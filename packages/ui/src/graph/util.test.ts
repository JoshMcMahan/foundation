import { describe, expect, it } from 'vitest'
import { jobLabel } from './util'

const MATRIX = {
  originaljob: 'align_lane',
  index: 0,
  totalingroup: 4,
  groupjobs: [],
  values: {},
  failfast: false,
  maxparallel: 0,
}

describe('jobLabel', () => {
  it.each([
    ['run_tests', 'Run tests'],
    ['merge-bams', 'Merge bams'],
    ['buildImage', 'Build image'],
    ['deploy.prod', 'Deploy prod'],
    ['push_to_GCR', 'Push to GCR'],
  ])('reads %s as %s', (name, label) => {
    expect(jobLabel(name)).toBe(label)
  })

  it('numbers a matrix member within its group', () => {
    const matrix = { ...MATRIX, index: 1, totalingroup: 4 }
    expect(jobLabel('align_lane-1', { _matrix: matrix })).toBe('Align lane (2/4)')
  })

  it('names a matrix that made one job as that job', () => {
    const matrix = { ...MATRIX, totalingroup: 1 }
    expect(jobLabel('align_lane-0', { _matrix: matrix })).toBe('Align lane')
  })
})

import { describe, expect, it } from 'vitest'
import { humanizeKey } from './humanizeKey'

describe('humanizeKey', () => {
  it.each([
    ['partition', 'Partition'],
    ['Name', 'Name'],
    ['max_nodes', 'Max nodes'],
    ['cpus_per_task', 'Cpus per task'],
    ['_private__key_', 'Private key'],
  ])('reads snake_case %s as %s', (key, label) => {
    expect(humanizeKey(key)).toBe(label)
  })

  it.each([
    ['scratch-dir', 'Scratch dir'],
    ['mail-type', 'Mail type'],
  ])('reads kebab-case %s as %s', (key, label) => {
    expect(humanizeKey(key)).toBe(label)
  })

  it.each([
    ['slurmPartition', 'Slurm partition'],
    ['cpusPerTask', 'Cpus per task'],
    ['MaxNodes', 'Max nodes'],
    ['thisIsIt', 'This is it'],
  ])('reads camelCase %s as %s', (key, label) => {
    expect(humanizeKey(key)).toBe(label)
  })

  it.each([
    ['numGPUs', 'Num GPUs'],
    ['enableMPI', 'Enable MPI'],
    ['GPUsPerNode', 'GPUs per node'],
    ['HTTPSProxy', 'HTTPS proxy'],
    ['userIDs', 'User IDs'],
    ['user_ID', 'User ID'],
    ['URL', 'URL'],
    ['posX', 'Pos X'],
  ])('keeps the acronym in %s: %s', (key, label) => {
    expect(humanizeKey(key)).toBe(label)
  })

  it('reads a key written in capitals as words', () => {
    expect(humanizeKey('MAX_NODES')).toBe('Max nodes')
    expect(humanizeKey('SLURM-PARTITION')).toBe('Slurm partition')
  })

  it.each([
    ['s3_bucket', 'S3 bucket'],
    ['s3Bucket', 'S3 bucket'],
    ['ipv4Address', 'Ipv4 address'],
    ['gpu_h100', 'Gpu h100'],
    ['disk_2', 'Disk 2'],
    ['node2Count', 'Node2 count'],
    ['HTTP2Server', 'HTTP2 server'],
    ['2fa_code', '2fa code'],
  ])('keeps digits with their word in %s: %s', (key, label) => {
    expect(humanizeKey(key)).toBe(label)
  })

  it('reads a path by its last name', () => {
    expect(humanizeKey('jobs.0.name')).toBe('Name')
    expect(humanizeKey('jobs[0].cpus_per_task')).toBe('Cpus per task')
    expect(humanizeKey('settings.slurmPartition')).toBe('Slurm partition')
    expect(humanizeKey('jobs.0')).toBe('Jobs')
  })

  it('returns a key with no words as given', () => {
    expect(humanizeKey('')).toBe('')
    expect(humanizeKey('___')).toBe('___')
    expect(humanizeKey('0')).toBe('0')
  })
})

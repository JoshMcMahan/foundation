import { collectPartitionDurationIssues, formatDuration, parseDuration } from './duration'

describe('parseDuration', () => {
  it.each([
    ['1-00:00:00', 86400],
    ['00:05:00', 300],
    ['2:00:00', 7200],
    ['168:00:00', 604800],
    ['7-00:00:00', 604800],
    ['1-12', 129600],
    ['1-12:30', 131400],
    ['0-00:00:30', 30],
    [' 02:00:00 ', 7200],
    ['1-23:59:59', 172799],
  ])('parses %s as %d seconds', (text, expected) => {
    expect(parseDuration(text)).toBe(expected)
  })

  it.each([
    '300',
    '',
    '  ',
    '5:00',
    '1:00',
    '1:60:00',
    '00:00:60',
    '1-24:00:00',
    '-1:00:00',
    '1-',
    'abc',
    '1-2:3:4:5',
    '1.5:00:00',
    '1:00:00:00',
  ])('rejects %s', (text) => {
    expect(parseDuration(text)).toBeNull()
  })
})

describe('formatDuration', () => {
  it.each([
    [300, '00:05:00'],
    [7200, '02:00:00'],
    [86400, '1-00:00:00'],
    [604800, '7-00:00:00'],
    [45, '00:00:45'],
    [10368000, '120-00:00:00'],
    [0, '00:00:00'],
  ])('formats %d as %s', (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected)
  })

  it('returns empty string for non-finite or negative input', () => {
    expect(formatDuration(Number.NaN)).toBe('')
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe('')
    expect(formatDuration(-5)).toBe('')
  })

  it.each([30, 300, 7200, 86400, 131400, 604800])(
    'round-trips %d through format and parse',
    (seconds) => {
      expect(parseDuration(formatDuration(seconds))).toBe(seconds)
    },
  )
})

describe('collectPartitionDurationIssues', () => {
  it('flags empty required fields on flex partitions', () => {
    const issues = collectPartitionDurationIssues([{ provisioningMode: 'flex' }], [])
    expect(issues).toEqual(
      expect.arrayContaining(['partitions[0].maxDuration', 'partitions[0].flexStartWaitTime']),
    )
    expect(issues).toHaveLength(2)
  })

  it('flags flex values outside the flex ranges', () => {
    const issues = collectPartitionDurationIssues(
      [
        {
          provisioningMode: 'flex',
          maxDuration: 100,
          flexStartWaitTime: 300,
        },
      ],
      [],
    )
    expect(issues).toEqual(['partitions[0].maxDuration'])
  })

  it('accepts an empty optional maxDuration on non-flex partitions', () => {
    expect(
      collectPartitionDurationIssues([{ provisioningMode: 'standard', maxDuration: '' }], []),
    ).toEqual([])
  })

  it('flags a non-flex maxDuration below the standard minimum', () => {
    expect(
      collectPartitionDurationIssues([{ provisioningMode: 'standard', maxDuration: 20 }], []),
    ).toEqual(['partitions[0].maxDuration'])
  })

  it('coerces legacy numeric strings before range checks', () => {
    expect(
      collectPartitionDurationIssues([{ provisioningMode: 'standard', maxDuration: '300' }], []),
    ).toEqual([])
  })

  it('merges registry paths, dedupes, and drops non-partition paths', () => {
    const issues = collectPartitionDurationIssues(
      [{ provisioningMode: 'flex', maxDuration: 700, flexStartWaitTime: 300 }],
      [
        'partitions[0].maxDuration',
        'partitions[0].maxDuration',
        'someOtherField',
        'partitions[0].instanceType',
      ],
    )
    expect(issues).toEqual(['partitions[0].maxDuration'])
  })

  it('handles undefined partitions', () => {
    expect(collectPartitionDurationIssues(undefined, [])).toEqual([])
  })

  it('accepts suspendTime registry paths and filters near-misses', () => {
    const issues = collectPartitionDurationIssues(
      [],
      ['partitions[0].suspendTime', 'partitions[0].suspendTimeX'],
    )
    expect(issues).toEqual(['partitions[0].suspendTime'])
  })

  it('does not flag the suspendTime never-suspend sentinel', () => {
    expect(
      collectPartitionDurationIssues([{ provisioningMode: 'standard', suspendTime: -1 }], []),
    ).toEqual([])
  })

  it('keeps Flex-start runtime separate from its capacity wait', () => {
    expect(
      collectPartitionDurationIssues(
        [
          {
            provisioningMode: 'flex',
            useNodeGroup: true,
            flexStartWaitTime: 604800,
            maxDuration: 600,
          },
        ],
        [],
      ),
    ).toEqual([])
    expect(
      collectPartitionDurationIssues(
        [
          {
            provisioningMode: 'flex',
            useNodeGroup: false,
            flexStartWaitTime: 28800,
            maxDuration: 600,
          },
        ],
        [],
      ),
    ).toEqual([])
  })

  // The group toggle is honoured in any mode, but only flex has a wait budget to validate.
  it('does not demand a flex wait from a standard partition on the group path', () => {
    expect(
      collectPartitionDurationIssues(
        [{ provisioningMode: 'standard', useNodeGroup: true, maxNodes: 4 }],
        [],
      ),
    ).toEqual([])
  })

  it("flags a flex maxDuration below GCP's runtime minimum", () => {
    expect(
      collectPartitionDurationIssues(
        [
          {
            provisioningMode: 'flex',
            flexStartWaitTime: 30,
            maxDuration: 599,
          },
        ],
        [],
      ),
    ).toEqual(['partitions[0].maxDuration'])
  })

  it("accepts a flex maxDuration at GCP's runtime minimum", () => {
    expect(
      collectPartitionDurationIssues(
        [
          {
            provisioningMode: 'flex',
            flexStartWaitTime: 604800,
            maxDuration: 600,
          },
        ],
        [],
      ),
    ).toEqual([])
  })

  it('leaves non-flex partitions unbound by the flex floor', () => {
    expect(
      collectPartitionDurationIssues(
        [
          {
            provisioningMode: 'standard',
            flexStartWaitTime: 7200,
            maxDuration: 60,
          },
        ],
        [],
      ),
    ).toEqual([])
  })
})

import { findChoice, toFieldItems } from './fieldItems'

describe('toFieldItems', () => {
  it('keeps what a choice sets and whether it can be picked', () => {
    expect(
      toFieldItems([
        'plain',
        { label: 'East', value: 'east', secondaryValue: 'east-1', disabled: true },
        { label: 'Old', value: 'old', secondaryLabel: 'the older key' },
      ]),
    ).toEqual([
      'plain',
      { label: 'East', value: 'east', secondaryValue: 'east-1', disabled: true },
      { label: 'Old', value: 'old', description: 'the older key' },
    ])
  })

  it('keeps groups where they sit among loose choices', () => {
    expect(
      toFieldItems([
        'first',
        { category: 'Zones', options: [{ label: 'A', value: 'a' }] },
        'second',
      ]),
    ).toEqual(['first', { label: 'Zones', items: [{ label: 'A', value: 'a' }] }, 'second'])
  })
})

describe('findChoice', () => {
  it('finds a choice inside a group by its value’s content', () => {
    const items = toFieldItems<unknown>([
      {
        category: 'Shared',
        options: [{ label: 'Bucket', value: { id: 'b' }, secondaryValue: 's3' }],
      },
    ])
    expect(findChoice(items, { id: 'b' })?.secondaryValue).toBe('s3')
  })
})

import { dependentOptions } from './dependentOptions'

const byRegion = {
  us: [{ label: 'Virginia', value: 'us-east' }],
  eu: [{ label: 'Frankfurt', value: 'eu-central' }],
}

describe('dependentOptions', () => {
  it('keys the options by the value they depend on', () => {
    expect(dependentOptions(byRegion, 'eu')).toEqual(byRegion.eu)
  })

  it('matches non-string parent values by their string form', () => {
    const options = { true: ['a'], 2: ['b'] }
    expect(dependentOptions(options, true)).toEqual(['a'])
    expect(dependentOptions(options, 2)).toEqual(['b'])
  })

  it('offers nothing until the parent has a value, or for a value with no list', () => {
    expect(dependentOptions(byRegion, undefined)).toEqual([])
    expect(dependentOptions(byRegion, null)).toEqual([])
    expect(dependentOptions(byRegion, 'ap')).toEqual([])
  })

  it('passes a plain list through', () => {
    const list = [{ label: 'One', value: '1' }]
    expect(dependentOptions(list, 'us')).toBe(list)
  })
})

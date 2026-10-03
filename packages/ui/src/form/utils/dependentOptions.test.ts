import { dependentOptions } from './dependentOptions'

const byRegion = {
  us: [{ label: 'Virginia', value: 'us-east' }],
  eu: [{ label: 'Frankfurt', value: 'eu-central' }],
}

describe('dependentOptions', () => {
  it('keys the options by the value at the depends_on path, not by the path', () => {
    const result = dependentOptions(byRegion, 'cluster.region', { cluster: { region: 'eu' } })
    expect(result).toEqual({ options: byRegion.eu, parentValue: 'eu' })
  })

  it('follows array paths the form resolves for a row', () => {
    const values = { rows: [{ region: 'us' }, { region: 'eu' }] }
    expect(dependentOptions(byRegion, 'rows[1].region', values).options).toEqual(byRegion.eu)
  })

  it('matches non-string parent values by their string form', () => {
    const options = { true: ['a'], 2: ['b'] }
    expect(dependentOptions(options, 'flag', { flag: true }).options).toEqual(['a'])
    expect(dependentOptions(options, 'n', { n: 2 }).options).toEqual(['b'])
  })

  it('offers nothing until the parent has a value, or for a value with no list', () => {
    expect(dependentOptions(byRegion, 'region', {}).options).toEqual([])
    expect(dependentOptions(byRegion, 'region', { region: null }).options).toEqual([])
    expect(dependentOptions(byRegion, 'region', { region: 'ap' }).options).toEqual([])
  })

  it('passes a plain list through and offers nothing for a keyed list without depends_on', () => {
    const list = [{ label: 'One', value: '1' }]
    expect(dependentOptions(list, 'region', { region: 'us' }).options).toBe(list)
    expect(dependentOptions(byRegion, undefined, { region: 'us' }).options).toEqual([])
  })
})

import { filterOption, flattenDisplayOptions, type ICategory } from './dropdownUtils'

const collapsedLabel = (count: number) => `${count} environments`

const cluster = (name: string, envs: number): ICategory => ({
  category: name,
  options: [
    { label: 'Login node', value: `login:${name}`, secondaryValue: name },
    ...Array.from({ length: envs }, (_, i) => ({
      label: `${name}-env-${i}`,
      value: `env:${name}:${i}`,
      secondaryValue: name,
      collapsible: true,
    })),
  ],
})

const flatten = (options: ICategory[], query = '', expanded: string[] = []) =>
  flattenDisplayOptions({
    options,
    query,
    expandedCategories: new Set(expanded),
    collapsedLabel,
  })

describe('filterOption', () => {
  it('matches the secondaryValue so generic labels are found by category name', () => {
    const option = {
      label: 'Login node',
      value: 'login:alpha',
      secondaryValue: 'alpha-cluster',
    }
    expect(filterOption(option, 'alpha')).toBe(true)
    expect(filterOption(option, 'login')).toBe(true)
    expect(filterOption(option, 'beta')).toBe(false)
  })
})

describe('flattenDisplayOptions', () => {
  it('hides collapsible options behind a toggle row when collapsed', () => {
    const rows = flatten([cluster('alpha', 3), cluster('beta', 2)])
    expect(rows.map((r) => r.label)).toEqual([
      'alpha',
      'Login node',
      '3 environments',
      'beta',
      'Login node',
      '2 environments',
    ])
    const toggle = rows[2]
    expect(toggle?.toggle).toBe('alpha')
    expect(toggle?.disabled).toBe(true)
  })

  it('shows collapsible options for expanded categories', () => {
    const rows = flatten([cluster('alpha', 2), cluster('beta', 2)], '', ['alpha'])
    expect(rows.map((r) => r.label)).toEqual([
      'alpha',
      'Login node',
      '2 environments',
      'alpha-env-0',
      'alpha-env-1',
      'beta',
      'Login node',
      '2 environments',
    ])
  })

  it('bypasses collapsing when a query is set', () => {
    const rows = flatten([cluster('alpha', 2), cluster('beta', 2)], 'alpha')
    expect(rows.map((r) => r.label)).toEqual(['alpha', 'Login node', 'alpha-env-0', 'alpha-env-1'])
    expect(rows.some((r) => r.toggle !== undefined)).toBe(false)
  })

  it('drops categories with no matching options', () => {
    const rows = flatten([cluster('alpha', 2)], 'nomatch')
    expect(rows).toEqual([{ label: 'No options found', value: '', disabled: true }])
  })

  it('leaves categories without collapsible options unchanged', () => {
    const rows = flatten([{ category: 'plain', options: [{ label: 'one', value: '1' }] }])
    expect(rows.map((r) => r.label)).toEqual(['plain', 'one'])
  })
})

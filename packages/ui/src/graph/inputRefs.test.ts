import { describe, expect, it } from 'vitest'
import { testEngine } from '../test/engine'
import { equalsExpression, flagExpression, inputRefs, readRef, refExpression } from './inputRefs'

describe('inputRefs', () => {
  it('lists inputs where a run reads them', () => {
    const refs = inputRefs(testEngine.editing, {
      cluster: { type: 'compute-clusters', label: 'Cluster' },
      title: { type: 'header', text: 'Settings' },
      settings: { type: 'group', items: { size: { type: 'number' } } },
      flat: {
        type: 'group',
        flatten: true,
        items: { depth: { type: 'number' } },
      },
      hosts: { type: 'list', template: { host: { type: 'string' } } },
    })
    expect(refs.map((ref) => [ref.path, ref.type, ref.label])).toEqual([
      [['cluster'], 'compute-clusters', 'Cluster'],
      [['settings', 'size'], 'number', 'size'],
      [['depth'], 'number', 'depth'],
      [['hosts'], 'list', 'hosts'],
    ])
  })

  it('flattens wizard steps unless the wizard says not to', () => {
    const step = {
      type: 'step',
      title: 'One',
      options: { a: { type: 'string' } },
    }
    expect(inputRefs(testEngine.editing, { one: step }).map((ref) => ref.path)).toEqual([['a']])
    expect(
      inputRefs(testEngine.editing, { $meta: { wizard: { flatten: false } }, one: step }).map(
        (ref) => ref.path,
      ),
    ).toEqual([['one', 'a']])
  })
})

describe('input expressions', () => {
  it('reads back the input an expression names', () => {
    expect(readRef(refExpression(['settings', 'size']))).toEqual(['settings', 'size'])
    expect(readRef(refExpression(['cluster'], 'ip'), 'ip')).toEqual(['cluster'])
    expect(readRef('${{ inputs.cluster.user }}', 'ip')).toBeNull()
    expect(readRef('${{ !inputs.on }}')).toBeNull()
    expect(readRef('${{ inputs.a || inputs.b }}')).toBeNull()
  })

  it('writes a switch and its negation', () => {
    expect(flagExpression(['on'], true)).toBe('${{ !inputs.on }}')
    expect(flagExpression(['on'], false)).toBe('${{ inputs.on }}')
  })

  it('compares an input to a value it offers, a quote in it written twice', () => {
    expect(equalsExpression(['mode'], "it's on", true)).toBe("${{ inputs.mode != 'it''s on' }}")
    expect(equalsExpression(['mode'], 'fast')).toBe("${{ inputs.mode == 'fast' }}")
  })
})

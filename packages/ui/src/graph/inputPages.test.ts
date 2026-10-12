import * as editing from '@parallelworks/workflow-parser'
import { describe, expect, it } from 'vitest'
import { resolveFormLayout } from '../form/layout'
import { withInputLayouts } from './inputLayout'
import { splitIntoPagesEdits, unsplitPagesEdits } from './inputPages'
import { asRecord, type Json } from './records'

const appearance = {
  type: 'section',
  label: 'Resources',
  css: 'padding: 1rem;',
  children: [{ type: 'field', field: 'queue' }],
}
const form = (): Json => ({
  $meta: { labelPosition: 'top', layout: appearance },
  queue: { type: 'string' },
})
function apply(inputs: Json, edits: Parameters<typeof withInputLayouts>[2][]) {
  const result = editing.applyGraphEdit(
    { yml: editing.dumpYaml({ on: { execute: { inputs } } }), layout: undefined },
    withInputLayouts(editing, inputs, { type: 'batch', edits }),
  )
  return asRecord(editing.workflowInputsSchema(asRecord(editing.loadYaml(result.yml))))
}

describe('layout through wizard transitions', () => {
  it('moves the form layout onto its first page and restores it when pages are removed', () => {
    const inputs = form()
    const paged = apply(
      inputs,
      splitIntoPagesEdits(editing, inputs, [], undefined, 'Settings', 'Run'),
    )
    expect(asRecord(paged['$meta'])['layout']).toBeUndefined()
    const options = asRecord(asRecord(paged['step_1'])['options'])
    expect(asRecord(options['$meta'])['layout']).toEqual(appearance)
    const restored = apply(paged, unsplitPagesEdits(paged, [], undefined))
    expect(asRecord(restored['$meta'])['wizard']).toBeUndefined()
    expect(asRecord(restored['$meta'])['layout']).toEqual({ type: 'stack', children: [appearance] })
    expect(resolveFormLayout(asRecord(restored['$meta'])['layout'], ['queue']).issues).toEqual([])
  })
  it('stacks each page’s own layout when pages are removed, and pages them again whole', () => {
    const one = {
      type: 'section',
      label: 'One',
      css: 'padding: 1rem;',
      children: [
        { type: 'field', field: 'a' },
        { type: 'field', field: 'b' },
      ],
    }
    const two = {
      type: 'grid',
      columns: { base: 1, md: [2, 1] },
      children: [
        { type: 'field', field: 'c' },
        { type: 'field', field: 'd' },
      ],
    }
    const field = { type: 'string' }
    const inputs: Json = {
      $meta: { wizard: { mode: 'wizard' } },
      one: { type: 'step', title: 'One', options: { $meta: { layout: one }, a: field, b: field } },
      two: { type: 'step', title: 'Two', options: { $meta: { layout: two }, c: field, d: field } },
    }
    const restored = apply(inputs, unsplitPagesEdits(inputs, [], undefined))
    expect(Object.keys(restored)).toEqual(['$meta', 'a', 'b', 'c', 'd'])
    expect(restored['$meta']).toEqual({ layout: { type: 'stack', children: [one, two] } })
    const paged = apply(restored, splitIntoPagesEdits(editing, restored, [], undefined, 'Settings'))
    const options = asRecord(asRecord(paged['step_1'])['options'])
    expect(Object.keys(options)).toEqual(['a', 'b', 'c', 'd', '$meta'])
    expect(options['$meta']).toEqual({ layout: { type: 'stack', children: [one, two] } })
  })
  it('keeps nested group layouts and field definitions through both transitions', () => {
    const inputs = { group: { type: 'group', items: form() } }
    const paged = apply(
      inputs,
      splitIntoPagesEdits(editing, form(), ['group'], 'items', 'Settings'),
    )
    const items = asRecord(asRecord(paged['group'])['items'])
    expect(asRecord(items['$meta'])['layout']).toBeUndefined()
    expect(asRecord(asRecord(asRecord(items['step_1'])['options'])['$meta'])['layout']).toEqual(
      appearance,
    )
    const restored = apply(paged, unsplitPagesEdits(items, ['group'], 'items'))
    expect(asRecord(asRecord(restored['group'])['items'])['queue']).toEqual({ type: 'string' })
    expect(asRecord(asRecord(asRecord(restored['group'])['items'])['$meta'])['layout']).toEqual({
      type: 'stack',
      children: [appearance],
    })
  })
})

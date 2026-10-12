import * as editing from '@parallelworks/workflow-parser'
import { describe, expect, it } from 'vitest'
import type { GraphEdit } from '../editing'
import { resolveFormLayout } from '../form/layout'
import { resolveLayoutCSS } from '../form/layoutCSS'
import { dropLayoutEdits, inputLayout, resizeLayout, withInputLayouts } from './inputLayout'
import { asRecord, type Json } from './records'

const a = { type: 'field', field: 'a', css: 'color: #334455;' }
const b = { type: 'field', field: 'b' }
const c = { type: 'field', field: 'c' }
const form = (): Json => ({
  $meta: {
    labelPosition: 'top',
    layout: {
      type: 'section',
      label: 'Resources',
      css: 'padding: 1rem;',
      children: [{ type: 'grid', columns: { base: 1, sm: [2, 1] }, children: [a, b] }, c],
    },
  },
  a: { type: 'string' },
  b: { type: 'number' },
  c: { type: 'boolean' },
})
function apply(inputs: Json, edit: GraphEdit): Json {
  const result = editing.applyGraphEdit(
    { yml: editing.dumpYaml({ on: { execute: { inputs } } }), layout: undefined },
    edit,
  )
  return asRecord(editing.workflowInputsSchema(asRecord(editing.loadYaml(result.yml))))
}
function layout(inputs: Json) {
  return asRecord(inputs['$meta'])['layout']
}
function valid(inputs: Json) {
  expect(
    resolveFormLayout(
      layout(inputs),
      Object.keys(inputs).filter((name) => name !== '$meta'),
    ).issues,
  ).toEqual([])
}

describe('layout editing', () => {
  it('renames and deletes references without losing sections or appearance', () => {
    const inputs = form()
    const renamed = apply(
      inputs,
      withInputLayouts(editing, inputs, { type: 'updateInput', path: ['a'], name: 'queue' }),
    )
    valid(renamed)
    expect(JSON.stringify(layout(renamed))).toContain('"field":"queue"')
    expect(JSON.stringify(layout(renamed))).toContain('color: #334455;')
    const removed = apply(
      renamed,
      withInputLayouts(editing, renamed, { type: 'deleteInput', path: ['b'] }),
    )
    valid(removed)
    expect(asRecord(layout(removed))['label']).toBe('Resources')
  })
  it('duplicates beside the original reference and moves across groups', () => {
    const inputs = form()
    inputs['group'] = { type: 'group', items: { target: { type: 'string' } } }
    const duplicate = apply(
      inputs,
      withInputLayouts(editing, inputs, { type: 'duplicateInput', path: ['a'] }),
    )
    valid(duplicate)
    const move: GraphEdit = { type: 'moveInputs', paths: [['a']], parent: ['group'], index: 0 }
    const moved = apply(inputs, withInputLayouts(editing, inputs, move))
    valid(moved)
    const group = asRecord(asRecord(moved['group'])['items'])
    valid(group)
    expect(JSON.stringify(layout(group))).toContain('color: #334455;')
  })
  it('drops beside a field using responsive grid metadata', () => {
    const inputs = form()
    const move: GraphEdit = { type: 'moveInputs', paths: [['c']], parent: [], index: 1 }
    const edits = dropLayoutEdits(
      editing,
      inputs,
      [['c']],
      { parent: [], index: 1, beside: { path: ['a'], side: 'right' } },
      move,
    )
    const result = apply(inputs, { type: 'batch', edits: [move, ...edits] })
    valid(result)
    const [joined] = asRecord(layout(result))['children'] as Json[]
    expect(joined?.['columns']).toEqual({ base: 1, sm: [2, 1.5, 1] })
    expect(asRecord(layout(result))['css']).toBe('padding: 1rem;')
  })
  it('keeps an authored breakpoint and its weights when a field joins the grid', () => {
    const inputs = form()
    const [grid] = asRecord(layout(inputs))['children'] as Json[]
    asRecord(grid)['columns'] = { base: 1, md: [2, 1] }
    const move: GraphEdit = { type: 'moveInputs', paths: [['c']], parent: [], index: 1 }
    const edits = dropLayoutEdits(
      editing,
      inputs,
      [['c']],
      { parent: [], index: 1, beside: { path: ['b'], side: 'left' } },
      move,
    )
    const result = apply(inputs, { type: 'batch', edits: [move, ...edits] })
    valid(result)
    const [joined] = asRecord(layout(result))['children'] as Json[]
    expect(joined).toMatchObject({ columns: { base: 1, md: [2, 1.5, 1] } })
    expect(JSON.stringify(joined?.['children'])).toMatch(/"a".*"c".*"b"/)
  })
  it('keeps phones stacked when a field swaps places within its grid', () => {
    const inputs: Json = {
      $meta: { layout: { type: 'grid', columns: { base: 1, sm: 2 }, children: [a, b] } },
      a: { type: 'string' },
      b: { type: 'string' },
    }
    const move: GraphEdit = { type: 'moveInputs', paths: [['b']], parent: [], index: 0 }
    const edits = dropLayoutEdits(
      editing,
      inputs,
      [['b']],
      { parent: [], index: 0, beside: { path: ['a'], side: 'left' } },
      move,
    )
    const result = apply(inputs, { type: 'batch', edits: [move, ...edits] })
    valid(result)
    expect(layout(result)).toMatchObject({
      columns: { base: 1, sm: 2 },
      children: [{ field: 'b' }, { field: 'a' }],
    })
  })
  it("reorders a wizard's pages without a layout, root or nested, and keeps the wizard", () => {
    const pages = (): Json => ({
      $meta: { wizard: { mode: 'wizard' } },
      step_1: { type: 'step', title: 'One', options: { a: { type: 'string' } } },
      step_2: { type: 'step', title: 'Two', options: { b: { type: 'string' } } },
    })
    const root = pages()
    const move: GraphEdit = { type: 'moveInputs', paths: [['step_2']], parent: [], index: 0 }
    const drop = { parent: [], index: 0, stack: { path: ['step_1'], side: 'above' as const } }
    const moved = apply(root, {
      type: 'batch',
      edits: [move, ...dropLayoutEdits(editing, root, [['step_2']], drop, move)],
    })
    expect(asRecord(moved['$meta'])).toEqual({ wizard: { mode: 'wizard' } })
    expect(Object.keys(moved)).toEqual(['$meta', 'step_2', 'step_1'])

    const nested: Json = { group: { type: 'group', items: pages() } }
    const inner: GraphEdit = {
      type: 'moveInputs',
      paths: [['group', 'step_2']],
      parent: ['group'],
      index: 0,
    }
    const innerDrop = {
      ...drop,
      parent: ['group'],
      stack: { ...drop.stack, path: ['group', 'step_1'] },
    }
    const group = asRecord(
      asRecord(
        apply(nested, {
          type: 'batch',
          edits: [
            inner,
            ...dropLayoutEdits(editing, nested, [['group', 'step_2']], innerDrop, inner),
          ],
        })['group'],
      )['items'],
    )
    expect(asRecord(group['$meta'])).toEqual({ wizard: { mode: 'wizard' } })
    expect(Object.keys(group)).toEqual(['$meta', 'step_2', 'step_1'])
  })
  it('drops the old row hints from the fields once their layout is written, root or nested', () => {
    const legacy = (): Json => ({
      a: { type: 'string', width: '50%' },
      b: { type: 'string', 'anchor-below': true },
      c: { type: 'string', width: '50%' },
      d: { type: 'string' },
    })
    const hints = (list: Json) =>
      ['a', 'b', 'c', 'd'].flatMap((name) =>
        Object.keys(asRecord(list[name])).filter(
          (key) => key === 'width' || key === 'anchor-below',
        ),
      )
    const root = legacy()
    const move: GraphEdit = { type: 'moveInputs', paths: [['d']], parent: [], index: 0 }
    const drop = { parent: [], index: 0, stack: { path: ['a'], side: 'above' as const } }
    const moved = apply(root, {
      type: 'batch',
      edits: [move, ...dropLayoutEdits(editing, root, [['d']], drop, move)],
    })
    valid(moved)
    expect(JSON.stringify(layout(moved))).toContain('"sm":[50,50]')
    expect(hints(moved)).toEqual([])

    const nested: Json = { group: { type: 'group', items: legacy() } }
    const inner: GraphEdit = {
      type: 'moveInputs',
      paths: [['group', 'd']],
      parent: ['group'],
      index: 0,
    }
    const innerDrop = { ...drop, parent: ['group'], stack: { ...drop.stack, path: ['group', 'a'] } }
    const group = asRecord(
      asRecord(
        apply(nested, {
          type: 'batch',
          edits: [inner, ...dropLayoutEdits(editing, nested, [['group', 'd']], innerDrop, inner)],
        })['group'],
      )['items'],
    )
    valid(group)
    expect(JSON.stringify(layout(group))).toContain('"sm":[50,50]')
    expect(hints(group)).toEqual([])
  })
  it('resizes grid tracks while preserving mobile stacking and authored CSS', () => {
    const inputs = form()
    const edit = resizeLayout(editing, inputs, ['a'], ['b'], [50, 50])
    expect(edit).toBeDefined()
    if (!edit) return
    const result = apply(inputs, edit)
    valid(result)
    expect(JSON.stringify(layout(result))).toContain('"base":1')
    expect(JSON.stringify(layout(result))).toContain('"sm":[1.5,1.5]')
    expect(JSON.stringify(layout(result))).toContain('color: #334455;')
  })
  it('migrates old percent rows and anchored fields into grids and stacks', () => {
    const result = inputLayout({
      a: { type: 'string', width: '50%' },
      b: { type: 'string', 'anchor-below': true },
      c: { type: 'string', width: '50%' },
    })
    expect(resolveFormLayout(result, ['a', 'b', 'c']).issues).toEqual([])
    expect(result).toMatchObject({
      type: 'stack',
      children: [
        {
          type: 'grid',
          columns: { base: 1, sm: [50, 50] },
          children: [{ type: 'stack', children: [{ field: 'a' }, { field: 'b' }] }, { field: 'c' }],
        },
      ],
    })
  })
  it('migrates pixel widths and anchored fields’ own widths', () => {
    const result = inputLayout({
      seed: { type: 'number', width: 160 },
      a: { type: 'string', width: '50%' },
      b: { type: 'string', 'anchor-below': true, width: '25%' },
      c: { type: 'string', width: '50%' },
      d: { type: 'string', 'anchor-below': true, width: 96 },
      e: { type: 'string', width: 4800 },
      f: { type: 'string', 'anchor-below': true },
    })
    expect(resolveFormLayout(result, ['seed', 'a', 'b', 'c', 'd', 'e', 'f']).issues).toEqual([])
    expect(result).toEqual({
      type: 'stack',
      children: [
        { type: 'field', field: 'seed', css: 'width: 10rem;' },
        {
          type: 'grid',
          columns: { base: 1, sm: [50, 50] },
          children: [
            {
              type: 'stack',
              children: [
                { type: 'field', field: 'a' },
                {
                  type: 'grid',
                  columns: { base: 1, sm: [50, 50] },
                  children: [{ type: 'field', field: 'b' }],
                },
              ],
            },
            {
              type: 'stack',
              children: [
                { type: 'field', field: 'c' },
                { type: 'field', field: 'd', css: 'width: 6rem;' },
              ],
            },
          ],
        },
        {
          type: 'stack',
          children: [
            { type: 'field', field: 'e', css: 'width: 256rem;' },
            { type: 'field', field: 'f', css: 'width: 256rem;' },
          ],
        },
      ],
    })
    for (const css of ['width: 10rem;', 'width: 6rem;', 'width: 256rem;']) {
      expect(resolveLayoutCSS(css).issues).toEqual([])
    }
  })
  it('keeps the shares of a row short of the form, each taking the row’s total when it wraps', () => {
    const result = inputLayout({
      x: { type: 'string', width: '30%' },
      y: { type: 'string', width: '60%' },
      z: { type: 'string', width: '25%' },
    })
    expect(resolveFormLayout(result, ['x', 'y', 'z']).issues).toEqual([])
    expect(result).toEqual({
      type: 'stack',
      children: [
        {
          type: 'grid',
          columns: [90, 10],
          children: [
            {
              type: 'grid',
              columns: { base: 1, sm: [30, 60] },
              children: [
                { type: 'field', field: 'x' },
                { type: 'field', field: 'y' },
              ],
            },
          ],
        },
        { type: 'grid', columns: [25, 75], children: [{ type: 'field', field: 'z' }] },
      ],
    })
    expect(
      inputLayout({
        p: { type: 'string', width: '33%' },
        q: { type: 'string', width: '33%' },
        r: { type: 'string', width: '33%' },
      }),
    ).toEqual({
      type: 'stack',
      children: [
        {
          type: 'grid',
          columns: { base: 1, sm: [33, 33, 33] },
          children: [
            { type: 'field', field: 'p' },
            { type: 'field', field: 'q' },
            { type: 'field', field: 'r' },
          ],
        },
      ],
    })
  })
  it('gives a field dropped beside a migrated share the empty track, on the side it lands', () => {
    const inputs: Json = { z: { type: 'string', width: '25%' }, w: { type: 'string' } }
    const beside = (side: 'left' | 'right') => {
      const index = side === 'left' ? 0 : 1
      const move: GraphEdit = { type: 'moveInputs', paths: [['w']], parent: [], index }
      const drop = { parent: [], index, beside: { path: ['z'], side } }
      const moved = apply(inputs, {
        type: 'batch',
        edits: [move, ...dropLayoutEdits(editing, inputs, [['w']], drop, move)],
      })
      valid(moved)
      return layout(moved)
    }
    const w = { type: 'field', field: 'w' }
    const z = { type: 'field', field: 'z' }
    expect(beside('left')).toEqual({
      type: 'stack',
      children: [{ type: 'grid', columns: [75, 25], children: [w, z] }],
    })
    expect(beside('right')).toEqual({
      type: 'stack',
      children: [{ type: 'grid', columns: [25, 75], children: [z, w] }],
    })
    const three: Json = { ...inputs, v: { type: 'string' } }
    const move: GraphEdit = { type: 'moveInputs', paths: [['w'], ['v']], parent: [], index: 0 }
    const drop = { parent: [], index: 0, beside: { path: ['z'], side: 'left' as const } }
    const both = apply(three, {
      type: 'batch',
      edits: [move, ...dropLayoutEdits(editing, three, [['w'], ['v']], drop, move)],
    })
    valid(both)
    expect(layout(both)).toEqual({
      type: 'stack',
      children: [
        {
          type: 'grid',
          columns: [37.5, 37.5, 25],
          children: [w, { type: 'field', field: 'v' }, z],
        },
      ],
    })
  })
  it('keeps a field in equal columns as wide when more fields drop beside it than tracks are free', () => {
    const inputs: Json = {
      $meta: { layout: { type: 'grid', columns: 3, children: [{ type: 'field', field: 'z' }] } },
      z: { type: 'string' },
      a: { type: 'string' },
      b: { type: 'string' },
      c: { type: 'string' },
    }
    const paths = [['a'], ['b'], ['c']]
    const move: GraphEdit = { type: 'moveInputs', paths, parent: [], index: 1 }
    const drop = { parent: [], index: 1, beside: { path: ['z'], side: 'right' as const } }
    const moved = apply(inputs, {
      type: 'batch',
      edits: [move, ...dropLayoutEdits(editing, inputs, paths, drop, move)],
    })
    valid(moved)
    expect(layout(moved)).toMatchObject({
      type: 'stack',
      children: [{ type: 'grid', columns: [1, 2 / 3, 2 / 3, 2 / 3] }],
    })
  })
  it('keeps a pixel width through an unrelated move that writes the layout', () => {
    const inputs: Json = { seed: { type: 'number', width: 160 }, name: { type: 'string' } }
    const move: GraphEdit = { type: 'moveInputs', paths: [['name']], parent: [], index: 0 }
    const moved = apply(inputs, {
      type: 'batch',
      edits: [
        move,
        ...dropLayoutEdits(editing, inputs, [['name']], { parent: [], index: 0 }, move),
      ],
    })
    valid(moved)
    expect(asRecord(moved['seed'])['width']).toBeUndefined()
    expect(layout(moved)).toEqual({
      type: 'stack',
      children: [
        { type: 'field', field: 'name' },
        { type: 'field', field: 'seed', css: 'width: 10rem;' },
      ],
    })
  })
  it('repairs successive operations inside a single undoable batch', () => {
    const inputs = form()
    const result = apply(
      inputs,
      withInputLayouts(editing, inputs, {
        type: 'batch',
        edits: [
          { type: 'updateInput', path: ['a'], name: 'queue' },
          { type: 'deleteInput', path: ['b'] },
        ],
      }),
    )
    valid(result)
    expect(JSON.stringify(layout(result))).toContain('"field":"queue"')
  })
})

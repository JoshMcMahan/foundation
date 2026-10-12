// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { inputCell, linesIn, snapSplit } from './inputRows'

describe('snapSplit', () => {
  it('splits at the pointer in 5% steps, keeping each side at least 10%', () => {
    expect(snapSplit(100, 37)).toEqual([35, 65])
    expect(snapSplit(100, 3)).toEqual([10, 90])
    expect(snapSplit(100, 99)).toEqual([90, 10])
    expect(snapSplit(66, 40)).toEqual([40, 26])
  })
})

describe('layout grid geometry', () => {
  it('groups fields by the grid track wrapper, including a stack within one track', () => {
    const root = document.createElement('div')
    root.innerHTML = `<div data-layout-boundary><div data-layout-grid><div>
      <div data-layout-item id="left"><div data-input-path='["a"]'></div></div>
      <div data-layout-item id="right"><div><div data-input-path='["b"]'></div><div data-input-path='["c"]'></div></div></div>
    </div></div></div>`
    const rows = [...root.querySelectorAll<HTMLElement>('[data-input-path]')]
    expect(rows.map((row) => inputCell(row)?.id)).toEqual(['left', 'right', 'right'])
    expect(
      linesIn(root).map((line) => line.columns.map((column) => column.rows.map((row) => row.path))),
    ).toEqual([[[['a']], [['b'], ['c']]]])
  })
})

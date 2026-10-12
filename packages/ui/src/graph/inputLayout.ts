import type { GraphEdit, InputPath, WorkflowEditing } from '../editing'
import {
  type FormLayoutNode,
  type LayoutTracks,
  type ResponsiveLayout,
  resolveFormLayout,
  responsiveLayoutValues,
} from '../form/layout'
import { inputWidth } from '../form/lib'
import { asRecord, type Json } from './records'

interface Drop {
  parent: InputPath
  index: number
  beside?: { path: InputPath; side: 'left' | 'right' }
  stack?: { path: InputPath; side: 'above' | 'below' }
}

type Node = FormLayoutNode
type Container = Exclude<Node, { type: 'field' }>
const namesIn = (list: Json) => Object.keys(list).filter((name) => !name.startsWith('$'))
const field = (name: string): Node => ({ type: 'field', field: name })
const stack = (children: Node[]): Container => ({ type: 'stack', children })
const same = (a: InputPath, b: InputPath) => JSON.stringify(a) === JSON.stringify(b)
// The row hints a layout replaces, dropped with it so they can't come back if the layout goes.
const legacyKeys = ['width', 'anchor-below']

/** Whether a list of inputs is drawn as a wizard, one step at a time. */
export function isWizard(list: unknown): boolean {
  return asRecord(asRecord(asRecord(list)['$meta'])['wizard'])['mode'] === 'wizard'
}

export function layoutList(editing: WorkflowEditing, inputs: unknown, path: InputPath): Json {
  let list = asRecord(inputs)
  for (const name of path) {
    const definition = asRecord(list[name])
    list = asRecord(definition[editing.inputChildrenKey(definition['type']) ?? 'options'])
  }
  return list
}

export function inputLayout(list: Json): Node {
  const resolved = resolveFormLayout(asRecord(list['$meta'])['layout'], namesIn(list))
  if (resolved.layout) {
    const layout = structuredClone(resolved.layout)
    return resolved.remaining.length ? stack([layout, ...resolved.remaining.map(field)]) : layout
  }
  // Existing rows migrate once they are edited; later edits use only the tree. Shares of the list
  // become grid tracks; a width in pixels, which no track holds, stays on its field as CSS.
  const columns: { head: string; width: string | undefined; members: Node[] }[] = []
  const hidden: Node[] = []
  for (const name of namesIn(list)) {
    const definition = asRecord(list[name])
    if (definition['hidden'] === true || definition['ignore'] === true) {
      hidden.push(field(name))
      continue
    }
    const width = inputWidth(definition['width'])
    const last = columns.at(-1)
    if (definition['anchor-below'] === true && last) {
      last.members.push(member(name, width, last.width))
      continue
    }
    columns.push({ head: name, width, members: [] })
  }
  const rows: Node[] = []
  let row: Node[] = []
  let shares: number[] = []
  const flush = () => {
    if (row.length)
      rows.push(
        within(
          row.length === 1
            ? (row[0] ?? stack([]))
            : {
                type: 'grid',
                columns: { base: 1, sm: shares },
                children: row,
              },
          shares.reduce((a, b) => a + b, 0),
          false,
        ),
      )
    row = []
    shares = []
  }
  for (const { head, width, members } of columns) {
    const pixels = width?.endsWith('px') ? width : undefined
    const node = members.length
      ? stack([sized(field(head), pixels), ...members])
      : sized(field(head), pixels)
    // A track is a share of the row, so a column some pixels wide is a row of its own.
    if (pixels) {
      flush()
      rows.push(node)
      continue
    }
    const share = width ? Number.parseFloat(width) : 100
    if (shares.reduce((a, b) => a + b, 0) + share > 100 || row.length >= 12) flush()
    row.push(node)
    shares.push(share)
  }
  flush()
  return stack([...rows, ...hidden])
}

// A row short of the form, beyond rounding such as thirds at 33%, leaves the rest an empty track;
// wrapped, each of its fields takes the row's whole share. Anchored fields then fill their column.
function within(node: Node, share: number, wraps: boolean): Node {
  if (share >= 99) return node
  const tracks = [Math.round(share * 100) / 100, Math.round((100 - share) * 100) / 100]
  return { type: 'grid', columns: wraps ? { base: 1, sm: tracks } : tracks, children: [node] }
}

// An anchored field's own width was a share of the list, held to its column's width: it is now
// its share of that column, and in a column some pixels wide, the narrower of the two.
function member(name: string, own: string | undefined, column: string | undefined): Node {
  if (column?.endsWith('px'))
    return sized(
      field(name),
      own?.endsWith('px') && Number.parseFloat(own) < Number.parseFloat(column) ? own : column,
    )
  if (!own || own.endsWith('px')) return sized(field(name), own)
  const share = (Number.parseFloat(own) / (column ? Number.parseFloat(column) : 100)) * 100
  return within(field(name), share, true)
}

// Layout CSS takes lengths up to 256 of a unit, so pixels go as rem; no field outgrows its row.
function sized(node: Node, pixels: string | undefined): Node {
  return pixels
    ? { ...node, css: `width: ${Math.min(Number.parseFloat(pixels) / 16, 256)}rem;` }
    : node
}

function trail(node: Node, name: string, parents: Container[] = []): Node[] | undefined {
  if (node.type === 'field') return node.field === name ? [...parents, node] : undefined
  for (const child of node.children) {
    const found = trail(child, name, [...parents, node])
    if (found) return found
  }
  return undefined
}

// Breakpoints with a track per child follow the children; a breakpoint that wraps them stays.
function retrack(
  columns: ResponsiveLayout<LayoutTracks>,
  count: number,
  change: (weights: number[]) => number[],
  spare = false,
): ResponsiveLayout<LayoutTracks> {
  const responsive = typeof columns === 'object' && !Array.isArray(columns)
  const resize = (tracks: LayoutTracks, key?: string) => {
    const weights = Array.isArray(tracks) ? tracks : Array.from({ length: tracks }, () => 1)
    if (spare ? weights.length < count : weights.length !== count) return tracks
    // A one-column phone breakpoint stacks the grid; it isn't one track for a lone child.
    if (tracks === 1 && key === 'base' && responsive && Object.keys(columns).length > 1)
      return tracks
    const changed = change(weights)
    // A count is equal tracks, so tracks that no longer match stay as weights.
    return Array.isArray(tracks) || changed.some((weight) => weight !== changed[0])
      ? changed
      : changed.length
  }
  return responsive
    ? Object.fromEntries(Object.entries(columns).map(([key, tracks]) => [key, resize(tracks, key)]))
    : resize(columns)
}

function remove(node: Node, names: Set<string>): Node | undefined {
  if (node.type === 'field') return names.has(node.field) ? undefined : node
  const previous = node.children
  const retained: number[] = []
  node.children = node.children.flatMap((child, index) => {
    const kept = remove(child, names)
    if (kept) retained.push(index)
    return kept ? [kept] : []
  })
  if (node.type === 'grid' && previous.length !== node.children.length && node.children.length)
    node.columns = retrack(node.columns, previous.length, (weights) =>
      retained.map((index) => weights[index] ?? 1),
    )
  return node.children.length || node.type === 'section' || node.css ? node : undefined
}

function insert(
  root: Node,
  nodes: Node[],
  anchor: string | undefined,
  side: 'above' | 'below' | 'left' | 'right',
): Node {
  const path = anchor ? trail(root, anchor) : undefined
  if (!path)
    return root.type === 'stack'
      ? { ...root, children: [...root.children, ...nodes] }
      : stack([root, ...nodes])
  const beside = side === 'left' || side === 'right'
  let target = path.at(-1)
  if (!target) return stack(nodes)
  let parent = path.at(-2) as Container | undefined
  if (beside) {
    for (let i = path.length - 2; i >= 0; i--) {
      const candidate = path[i]
      if (!candidate) continue
      if (
        candidate.type === 'grid' &&
        candidate.align !== 'rows' &&
        candidate.children.length + nodes.length <= 12
      ) {
        parent = candidate
        target = path[i + 1] ?? target
        break
      }
    }
  }
  const before = side === 'above' || side === 'left'
  if (
    parent &&
    ((beside &&
      parent.type === 'grid' &&
      parent.align !== 'rows' &&
      parent.children.length + nodes.length <= 12) ||
      (!beside && parent.type === 'stack'))
  ) {
    const index = parent.children.indexOf(target) + (before ? 0 : 1)
    const count = parent.children.length
    if (parent.type === 'grid')
      parent.columns = retrack(
        parent.columns,
        count,
        (weights) => {
          const used = weights.slice(0, count)
          // Tracks past the children are room a migrated share left; dropped fields take them, and
          // split their room when there are more fields than tracks, so no other field narrows.
          const spare = weights.slice(count)
          const room = spare.reduce((a, b) => a + b, 0)
          const share = used.reduce((a, b) => a + b, 0) / used.length
          const fits = nodes.length <= spare.length
          const added = fits
            ? spare.slice(0, nodes.length)
            : nodes.map(() => (spare.length ? room / nodes.length : share))
          return [
            ...used.slice(0, index),
            ...added,
            ...used.slice(index),
            ...(fits ? spare.slice(nodes.length) : []),
          ]
        },
        true,
      )
    parent.children.splice(index, 0, ...nodes)
    return root
  }
  const children = before ? [...nodes, target] : [target, ...nodes]
  const replacement: Node = beside
    ? { type: 'grid', columns: { base: 1, sm: Math.min(12, children.length) }, children }
    : stack(children)
  if (!parent) return replacement
  parent.children[parent.children.indexOf(target)] = replacement
  return root
}

export function layoutEdit(
  editing: WorkflowEditing,
  inputs: unknown,
  parent: InputPath,
  layout: Node | undefined,
): GraphEdit {
  const list = layoutList(editing, inputs, parent)
  const legacy = layout
    ? namesIn(list).filter((name) => legacyKeys.some((key) => key in asRecord(list[name])))
    : []
  if (!parent.length) {
    const meta: GraphEdit = {
      type: 'updateWorkflow',
      inputsMeta: layout ? { set: { layout } } : { unset: ['layout'] },
    }
    return legacy.length
      ? {
          type: 'batch',
          edits: [
            meta,
            ...legacy.map(
              (name): GraphEdit => ({ type: 'updateInput', path: [name], unset: legacyKeys }),
            ),
          ],
        }
      : meta
  }
  const definition = asRecord(layoutList(editing, inputs, parent.slice(0, -1))[parent.at(-1) ?? ''])
  const { layout: _layout, ...meta } = asRecord(list['$meta'])
  const fields = { ...list }
  for (const name of legacy) {
    fields[name] = Object.fromEntries(
      Object.entries(asRecord(list[name])).filter(([key]) => !legacyKeys.includes(key)),
    )
  }
  return {
    type: 'updateInput',
    path: parent,
    set: {
      [editing.inputChildrenKey(definition['type']) ?? 'options']: {
        ...fields,
        $meta: { ...meta, ...(layout ? { layout } : {}) },
      },
    },
  }
}

function inputsAfter(editing: WorkflowEditing, inputs: unknown, edit: GraphEdit): Json {
  const source = editing.dumpYaml({ on: { execute: { inputs } }, jobs: {} })
  const result = editing.applyGraphEdit({ yml: source, layout: undefined }, edit)
  return asRecord(
    asRecord(asRecord(asRecord(editing.loadYaml(result.yml))['on'])['execute'])['inputs'],
  )
}

export function dropLayoutEdits(
  editing: WorkflowEditing,
  inputs: unknown,
  moving: InputPath[],
  drop: Drop,
  move: GraphEdit,
): GraphEdit[] {
  const after = inputsAfter(editing, inputs, move)
  const destination = layoutList(editing, inputs, drop.parent)
  const names = moving.map((path) => path.at(-1) ?? '')
  const nodes = moving.map((path) => {
    const root = inputLayout(layoutList(editing, inputs, path.slice(0, -1)))
    return trail(root, path.at(-1) ?? '')?.at(-1) ?? field(path.at(-1) ?? '')
  })
  const parents = [
    ...new Map(
      moving.map((path) => [JSON.stringify(path.slice(0, -1)), path.slice(0, -1)]),
    ).values(),
  ]
  const edits: GraphEdit[] = []
  for (const parent of parents.filter((parent) => !same(parent, drop.parent))) {
    const list = layoutList(editing, inputs, parent)
    if (asRecord(list['$meta'])['layout'] !== undefined) {
      edits.push(
        layoutEdit(
          editing,
          after,
          parent,
          remove(
            inputLayout(list),
            new Set(
              moving
                .filter((path) => same(path.slice(0, -1), parent))
                .map((path) => path.at(-1) ?? ''),
            ),
          ) ?? stack([]),
        ),
      )
    }
  }
  const root = remove(inputLayout(destination), new Set(names)) ?? stack([])
  const anchor =
    drop.beside?.path.at(-1) ??
    drop.stack?.path.at(-1) ??
    namesIn(destination)
      .slice(drop.index)
      .find((name) => !names.includes(name))
  // A wizard draws only its pages, in order, so the move alone places a page.
  if (isWizard(destination)) return edits
  const layout = insert(root, nodes, anchor, drop.beside?.side ?? drop.stack?.side ?? 'above')
  edits.push(layoutEdit(editing, after, drop.parent, layout))
  return edits
}

export function resizeLayout(
  editing: WorkflowEditing,
  inputs: unknown,
  left: InputPath,
  right: InputPath,
  split: [number, number],
): GraphEdit | undefined {
  const parent = left.slice(0, -1)
  const layout = inputLayout(layoutList(editing, inputs, parent))
  const a = trail(layout, left.at(-1) ?? '')
  const b = trail(layout, right.at(-1) ?? '')
  if (!a || !b) return undefined
  const grid = [...a].reverse().find((node) => node.type === 'grid' && b.includes(node))
  if (grid?.type !== 'grid') return undefined
  const i = grid.children.indexOf(a[a.indexOf(grid) + 1] ?? grid)
  const j = grid.children.indexOf(b[b.indexOf(grid) + 1] ?? grid)
  if (i === j || i < 0 || j < 0) return undefined
  const responsive = responsiveLayoutValues(grid.columns, 1)
  grid.columns = Object.fromEntries(
    Object.entries(responsive).map(([breakpoint, tracks]) => {
      const count = Array.isArray(tracks) ? tracks.length : tracks
      if (count !== grid.children.length) return [breakpoint, tracks]
      const weights = Array.isArray(tracks) ? [...tracks] : Array.from({ length: count }, () => 1)
      const total = (weights[i] ?? 1) + (weights[j] ?? 1)
      const shares = split[0] + split[1]
      weights[i] = (total * split[0]) / shares
      weights[j] = (total * split[1]) / shares
      return [breakpoint, weights]
    }),
  )
  return layoutEdit(editing, inputs, parent, layout)
}

/** Keeps layouts valid even with hosts whose editing engine predates layout metadata. */
function inputLayouts(editing: WorkflowEditing, inputs: unknown, edit: GraphEdit): GraphEdit {
  if (edit.type === 'batch') {
    let current = inputs
    const edits = edit.edits.map((item) => {
      const next = withInputLayouts(editing, current, item)
      current = inputsAfter(editing, current, next)
      return next
    })
    return { type: 'batch', edits }
  }
  if (edit.type === 'moveInputs') {
    const relevant = [...edit.paths.map((path) => path.slice(0, -1)), edit.parent].some(
      (parent) => asRecord(layoutList(editing, inputs, parent)['$meta'])['layout'] !== undefined,
    )
    return relevant
      ? {
          type: 'batch',
          edits: [
            edit,
            ...dropLayoutEdits(
              editing,
              inputs,
              edit.paths,
              { parent: edit.parent, index: edit.index },
              edit,
            ),
          ],
        }
      : edit
  }
  if (edit.type !== 'updateInput' && edit.type !== 'deleteInput' && edit.type !== 'duplicateInput')
    return edit
  if (edit.type === 'updateInput' && (!edit.name || edit.name === edit.path.at(-1))) return edit
  const parent = edit.path.slice(0, -1)
  const list = layoutList(editing, inputs, parent)
  const layout = resolveFormLayout(asRecord(list['$meta'])['layout'], namesIn(list)).layout
  if (!layout) return edit
  const after = inputsAfter(editing, inputs, edit)
  let updated = structuredClone(layout)
  const name = edit.path.at(-1) ?? ''
  if (edit.type === 'deleteInput') updated = remove(updated, new Set([name])) ?? stack([])
  else if (edit.type === 'updateInput') {
    const node = trail(updated, name)?.at(-1)
    if (node?.type === 'field') node.field = edit.name ?? name
  } else {
    const added = namesIn(layoutList(editing, after, parent)).find(
      (key) => !Object.hasOwn(list, key),
    )
    if (added) {
      const original = trail(updated, name)?.at(-1)
      updated = insert(
        updated,
        [{ ...(original?.type === 'field' ? original : {}), type: 'field', field: added }],
        name,
        'below',
      )
    }
  }
  return { type: 'batch', edits: [edit, layoutEdit(editing, after, parent, updated)] }
}

export function withInputLayouts(
  editing: WorkflowEditing,
  inputs: unknown,
  edit: GraphEdit,
): GraphEdit {
  try {
    return inputLayouts(editing, inputs, edit)
  } catch {
    return edit
  }
}

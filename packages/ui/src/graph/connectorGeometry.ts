export interface Point {
  x: number
  y: number
}

/** A connector's path both ways, so its highlight can draw from either end. */
export interface ConnectorPath {
  d: string
  reversed: string
}

const MAX_ARC_R = 16

/**
 * The corner radius every connector of a graph shares: a quarter of the least rise any connector
 * makes, and no more than half the narrowest gap between columns, so bends never overlap.
 */
export function arcRadius(minRise: number, colGap: number): number {
  return Math.min(Number.isFinite(minRise) ? minRise / 4 : MAX_ARC_R, colGap / 2, MAX_ARC_R)
}

/**
 * A connector from a node's right side to a later node's left: straight when level, otherwise
 * across, a bend, down or up, a bend and across. The bends sit in the gap before `end`'s column, so
 * a connector spanning several columns runs level until it nears its target.
 */
export function connectorPath(start: Point, end: Point, r: number, colGap: number): ConnectorPath {
  const { x: x1, y: y1 } = start
  const { x: x2, y: y2 } = end
  const dy = y2 - y1
  if (dy === 0) {
    return { d: `M ${x1} ${y1} L ${x2} ${y2}`, reversed: `M ${x2} ${y2} L ${x1} ${y1}` }
  }
  const s = dy > 0 ? 1 : -1
  // The bend nearer the target ends half a column gap short of it.
  const ax2end = x2 - (colGap / 2 - r)
  const ax = ax2end - 2 * r
  const sw1 = dy > 0 ? 1 : 0
  const sw2 = dy > 0 ? 0 : 1
  return {
    d: [
      `M ${x1} ${y1}`,
      `L ${ax} ${y1}`,
      `A ${r} ${r} 0 0 ${sw1} ${ax + r} ${y1 + s * r}`,
      `L ${ax + r} ${y2 - s * r}`,
      `A ${r} ${r} 0 0 ${sw2} ${ax2end} ${y2}`,
      `L ${x2} ${y2}`,
    ].join(' '),
    // The same points from the other end, each bend's sweep flipped.
    reversed: [
      `M ${x2} ${y2}`,
      `L ${ax2end} ${y2}`,
      `A ${r} ${r} 0 0 ${sw1} ${ax + r} ${y2 - s * r}`,
      `L ${ax + r} ${y1 + s * r}`,
      `A ${r} ${r} 0 0 ${sw2} ${ax} ${y1}`,
      `L ${x1} ${y1}`,
    ].join(' '),
  }
}

/** Which way a graph runs: ranks as columns, left to right, or as rows, top to bottom. */
export type GraphDirection = 'right' | 'down'

/** A connector from a node's bottom to a later row's node's top: `connectorPath` turned a quarter,
 *  with the bends in the gap above `end`'s row. */
export function connectorPathDown(
  start: Point,
  end: Point,
  r: number,
  rowGap: number,
): ConnectorPath {
  const across = connectorPath({ x: start.y, y: start.x }, { x: end.y, y: end.x }, r, rowGap)
  return { d: transposed(across.d), reversed: transposed(across.reversed) }
}

// A path mirrored across the diagonal: every point's x and y swapped, and each arc's sweep flipped,
// since a mirror turns a clockwise bend counterclockwise.
function transposed(d: string): string {
  const parts = d.split(' ')
  const out: string[] = []
  for (let i = 0; i < parts.length; ) {
    const op = parts[i++] ?? ''
    if (op === 'A') {
      const [rx, ry, rot, large, sweep, x, y] = parts.slice(i, i + 7)
      out.push(
        'A',
        ry ?? '',
        rx ?? '',
        rot ?? '',
        large ?? '',
        sweep === '1' ? '0' : '1',
        y ?? '',
        x ?? '',
      )
      i += 7
    } else {
      const [x, y] = parts.slice(i, i + 2)
      out.push(op, y ?? '', x ?? '')
      i += 2
    }
  }
  return out.join(' ')
}

/** A node's place in its graph level, as laid out. */
export interface Box {
  x: number
  y: number
  width: number
  /** Where a graph runs down, its height, which places the connectors leaving its bottom. */
  height?: number | undefined
}

/** Whether two layouts put every node in the same place. */
export function sameBoxes(a: Map<string, Box>, b: Map<string, Box>): boolean {
  if (a.size !== b.size) {
    return false
  }
  for (const [job, box] of a) {
    const other = b.get(job)
    if (
      !other ||
      other.x !== box.x ||
      other.y !== box.y ||
      other.width !== box.width ||
      other.height !== box.height
    ) {
      return false
    }
  }
  return true
}

/** A connector as drawn, from a need's node to the node that needs it. */
export interface DrawnEdge {
  from: string
  to: string
  start: Point
  end: Point
  path: ConnectorPath
}

/**
 * Every connector of a graph level, from its nodes' boxes, keyed by each node's first job. A node's
 * jobs share their needs, so its first job's needs are the node's; a need naming a node not laid out
 * draws nothing. `connectorY` is how far below a node's top its connectors meet it.
 */
export function routeConnectors(
  cols: string[][][],
  /** Whether columns are left empty between those drawn, so gaps between them differ. */
  spaced: boolean,
  deps: Record<string, string[]>,
  boxes: Map<string, Box>,
  connectorY: number,
  /** `down` joins a node's bottom to the top of one in a later row, at their middles. */
  direction: GraphDirection = 'right',
): DrawnEdge[] {
  if (direction === 'down') {
    return routeDown(cols, deps, boxes)
  }
  const heads = (c: number) => cols[c]?.[0]?.[0]
  const gapAfter = (c: number) => {
    const left = boxes.get(heads(c) ?? '')
    const right = boxes.get(heads(c + 1) ?? '')
    return left && right ? right.x - (left.x + left.width) : undefined
  }
  // Bends fit the gap between columns: the first, or with columns left empty, the narrowest.
  let colGap = gapAfter(0) ?? 32
  if (spaced) {
    for (let c = 1; c + 1 < cols.length; c++) {
      colGap = Math.min(colGap, gapAfter(c) ?? colGap)
    }
  }

  const ends: Omit<DrawnEdge, 'path'>[] = []
  let minRise = Number.POSITIVE_INFINITY
  for (const col of cols) {
    for (const [to] of col) {
      const target = to === undefined ? undefined : boxes.get(to)
      if (to === undefined || !target) {
        continue
      }
      for (const from of deps[to] ?? []) {
        const source = boxes.get(from)
        if (!source) {
          continue
        }
        const start = { x: source.x + source.width - 2, y: source.y + connectorY }
        const end = { x: target.x + 2, y: target.y + connectorY }
        const rise = Math.abs(end.y - start.y)
        if (rise > 0) {
          minRise = Math.min(minRise, rise)
        }
        ends.push({ from, to, start, end })
      }
    }
  }
  const r = arcRadius(minRise, colGap)
  return ends.map((edge) => ({ ...edge, path: connectorPath(edge.start, edge.end, r, colGap) }))
}

// Connectors of a graph that runs down, its ranks as rows: from the middle of a need's bottom to the
// middle of the top of the node needing it, the bends in the narrowest gap between rows.
function routeDown(
  rows: string[][][],
  deps: Record<string, string[]>,
  boxes: Map<string, Box>,
): DrawnEdge[] {
  const top = (row: string[][]) =>
    Math.min(...row.map(([head]) => boxes.get(head ?? '')?.y ?? Number.POSITIVE_INFINITY))
  const bottom = (row: string[][]) =>
    Math.max(
      ...row.map(([head]) => {
        const box = boxes.get(head ?? '')
        return box ? box.y + (box.height ?? 0) : Number.NEGATIVE_INFINITY
      }),
    )
  let rowGap = Number.POSITIVE_INFINITY
  for (let r = 0; r + 1 < rows.length; r++) {
    const gap = top(rows[r + 1] ?? []) - bottom(rows[r] ?? [])
    if (Number.isFinite(gap)) {
      rowGap = Math.min(rowGap, gap)
    }
  }
  if (!Number.isFinite(rowGap)) {
    rowGap = 32
  }
  const ends: Omit<DrawnEdge, 'path'>[] = []
  let minShift = Number.POSITIVE_INFINITY
  for (const row of rows) {
    for (const [to] of row) {
      const target = to === undefined ? undefined : boxes.get(to)
      if (to === undefined || !target) {
        continue
      }
      for (const from of deps[to] ?? []) {
        const source = boxes.get(from)
        if (!source) {
          continue
        }
        const start = {
          x: Math.round(source.x + source.width / 2),
          y: source.y + (source.height ?? 0) - 2,
        }
        // Middles a few pixels apart, as nodes of nearly one width have, run straight.
        const middle = Math.round(target.x + target.width / 2)
        const end = { x: Math.abs(middle - start.x) <= 8 ? start.x : middle, y: target.y + 2 }
        const shift = Math.abs(end.x - start.x)
        if (shift > 0) {
          minShift = Math.min(minShift, shift)
        }
        ends.push({ from, to, start, end })
      }
    }
  }
  const r = arcRadius(minShift, rowGap)
  return ends.map((edge) => ({
    ...edge,
    path: connectorPathDown(edge.start, edge.end, r, rowGap),
  }))
}

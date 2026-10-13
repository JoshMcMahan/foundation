/** One measurement of a graph shape in one build, every time in milliseconds. */
export interface Sample {
  /** From drawing the graph to its connectors on screen. */
  mount: number
  /** From Expand All to the last subworkflow's nodes on screen, when the graph has any. */
  expand?: number
  hoverMedian: number
  hoverP90: number
  /** The slowest frame of a hover, which is when its lineage starts to draw. */
  hoverMax: number
  zoomMedian: number
  zoomP90: number
  elements: number
}

/** A build's samples of each shape. */
export interface Variant {
  name: string
  samples: Record<string, Sample[]>
}

type Metric = keyof Sample

const METRICS: { key: Metric; label: string; unit: string; noise: number }[] = [
  { key: 'mount', label: 'Mount', unit: 'ms', noise: 20 },
  { key: 'expand', label: 'Expand all', unit: 'ms', noise: 20 },
  { key: 'hoverMedian', label: 'Hover, median frame', unit: 'ms', noise: 4 },
  { key: 'hoverP90', label: 'Hover, p90 frame', unit: 'ms', noise: 8 },
  { key: 'hoverMax', label: 'Hover, slowest frame', unit: 'ms', noise: 20 },
  { key: 'zoomMedian', label: 'Wheel zoom, median frame', unit: 'ms', noise: 4 },
  { key: 'zoomP90', label: 'Wheel zoom, p90 frame', unit: 'ms', noise: 8 },
  { key: 'elements', label: 'Page elements', unit: '', noise: 0 },
]

/** How much slower than the base a result must be, and by more than its noise, to be flagged. */
const SLOWER = 1.25

export const MARKER = '<!-- dependency-graph-benchmark -->'

/** The value at `q` (0 to 1) of `values`, between the two nearest when it falls between them. */
export function quantile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b)
  const at = (sorted.length - 1) * q
  const below = sorted[Math.floor(at)] ?? Number.NaN
  const above = sorted[Math.ceil(at)] ?? Number.NaN
  return below + (above - below) * (at - Math.floor(at))
}

/** The median of a metric across samples, or none when no sample has it. */
function medianOf(samples: Sample[] | undefined, key: Metric): number | undefined {
  const values = (samples ?? []).map((sample) => sample[key]).filter((v) => v !== undefined)
  return values.length > 0 ? quantile(values, 0.5) : undefined
}

const show = (value: number | undefined, unit: string) =>
  value === undefined ? '–' : `${Math.round(value).toLocaleString('en-US')}${unit && ` ${unit}`}`

function change(base: number | undefined, head: number | undefined, noise: number): string {
  if (base === undefined || head === undefined || base === 0) {
    return '–'
  }
  const ratio = head / base
  const percent = `${ratio >= 1 ? '+' : '−'}${Math.round(Math.abs(ratio - 1) * 100)}%`
  return ratio > SLOWER && head - base > noise ? `**${percent}** ⚠️` : percent
}

/**
 * The results as Markdown: a table per shape of each metric's median across samples, and against
 * the base when there is one, flagging what got markedly slower.
 */
export function report(head: Variant, base?: Variant): string {
  const lines = [
    MARKER,
    '### Dependency graph benchmark',
    '',
    `Medians of ${countOf(head)} runs in headless Chrome on a shared runner; lower is better.` +
      (base
        ? ` Base and head run in turn on the same machine. ⚠️ marks a result more than ${Math.round((SLOWER - 1) * 100)}% slower than the base, beyond its usual noise.`
        : ' The base has no benchmark to compare with.'),
  ]
  for (const shape of Object.keys(head.samples)) {
    const rows = METRICS.flatMap(({ key, label, unit, noise }) => {
      const now = medianOf(head.samples[shape], key)
      if (now === undefined) {
        return []
      }
      if (!base) {
        return [`| ${label} | ${show(now, unit)} |`]
      }
      const was = medianOf(base.samples[shape], key)
      return [`| ${label} | ${show(was, unit)} | ${show(now, unit)} | ${change(was, now, noise)} |`]
    })
    lines.push(
      '',
      `#### ${shape}`,
      '',
      base ? '| | Base | Head | Change |' : '| | Head |',
      base ? '|---|---:|---:|---:|' : '|---|---:|',
      ...rows,
    )
  }
  return `${lines.join('\n')}\n`
}

const countOf = (variant: Variant) =>
  Math.max(0, ...Object.values(variant.samples).map((samples) => samples.length))

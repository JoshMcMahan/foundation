import { describe, expect, it } from 'vitest'
import { MARKER, quantile, report, type Sample, type Variant } from './report.ts'

const sample = (over: Partial<Sample> = {}): Sample => ({
  mount: 100,
  hoverMedian: 16,
  hoverP90: 18,
  hoverMax: 60,
  zoomMedian: 16,
  zoomP90: 17,
  elements: 8000,
  ...over,
})

const variant = (name: string, samples: Sample[]): Variant => ({ name, samples: { wide: samples } })

const row = (markdown: string, label: string) =>
  markdown.split('\n').find((line) => line.startsWith(`| ${label} |`))

describe('quantile', () => {
  it('takes the value at a fraction of the sorted values, between the two nearest', () => {
    expect(quantile([3, 1, 2], 0.5)).toBe(2)
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5)
    expect(quantile([10, 20], 0.9)).toBe(19)
  })
})

describe('report', () => {
  it('tables the median of each metric, marked so a later report can replace it', () => {
    const markdown = report(
      variant('head', [sample({ mount: 90 }), sample(), sample({ mount: 400 })]),
    )
    expect(markdown.startsWith(MARKER)).toBe(true)
    expect(markdown).toContain('#### wide')
    expect(row(markdown, 'Mount')).toBe('| Mount | 100 ms |')
    expect(row(markdown, 'Page elements')).toBe('| Page elements | 8,000 |')
    // No sample expanded anything.
    expect(row(markdown, 'Expand all')).toBeUndefined()
  })

  it('compares with the base, flagging only what got markedly slower beyond its noise', () => {
    const markdown = report(
      variant('head', [sample({ mount: 200, zoomMedian: 13, zoomP90: 12 })]),
      variant('base', [sample({ mount: 100, zoomMedian: 10, zoomP90: 17 })]),
    )
    expect(row(markdown, 'Mount')).toBe('| Mount | 100 ms | 200 ms | **+100%** ⚠️ |')
    // Nearly a third slower, but by less than a frame's noise.
    expect(row(markdown, 'Wheel zoom, median frame')).toBe(
      '| Wheel zoom, median frame | 10 ms | 13 ms | +30% |',
    )
    expect(row(markdown, 'Wheel zoom, p90 frame')).toBe(
      '| Wheel zoom, p90 frame | 17 ms | 12 ms | −29% |',
    )
  })

  it('shows a metric the base never measured as missing there', () => {
    const markdown = report(variant('head', [sample({ expand: 90 })]), variant('base', [sample()]))
    expect(row(markdown, 'Expand all')).toBe('| Expand all | – | 90 ms | – |')
  })
})

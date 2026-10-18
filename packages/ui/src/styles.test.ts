import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sheets = (readdirSync(import.meta.dirname, { recursive: true }) as string[])
  .filter((file) => file.endsWith('.css'))
  .map((file) => [file, readFileSync(join(import.meta.dirname, file), 'utf8')] as const)

describe('package styles', () => {
  // A rule that selects an element by its inline style and reaches past it makes the browser restyle
  // the whole subtree of any element whose inline style changes, on every page that loads the styles:
  // a graph's pan and zoom, which set a transform on every frame, then restyle everything they move.
  it.each(sheets)(
    'select nothing beyond an element matched by its style attribute: %s',
    (_, css) => {
      const selectors = css
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('{')
        .flatMap((before) => (before.split(/[;}]/).at(-1) ?? '').split(','))
      const beyond = selectors.filter((selector) => {
        const at = selector.indexOf('[style')
        // What follows the compound the attribute is part of, past the next combinator.
        return (
          at >= 0 &&
          selector
            .slice(selector.indexOf(']', at) + 1)
            .replace(/^[^\s>+~]*/, '')
            .trim()
        )
      })
      expect(beyond).toEqual([])
    },
  )
})

const sources = (readdirSync(import.meta.dirname, { recursive: true }) as string[])
  .filter((file) => /\.(css|tsx?)$/.test(file))
  .map((file) => [file, readFileSync(join(import.meta.dirname, file), 'utf8')] as const)

describe('package names', () => {
  // The package themes through its own --theme-* tokens; a host design system's prefixed classes or
  // variables would only work inside that host.
  it('use no design-system prefixed class or variable', () => {
    const found = sources.flatMap(([file, source]) =>
      (source.match(/(?<![\w-])(?:--|\.)?ds-[a-z][\w-]*/g) ?? []).map((name) => `${file}: ${name}`),
    )
    expect(found).toEqual([])
  })
})

describe('stacking', () => {
  const code = sources.filter(([file]) => !/\.(test|stories)\.tsx?$/.test(file))
  const base = readFileSync(join(import.meta.dirname, 'styles/base.css'), 'utf8')
  const zIndexOf = (layer: string) =>
    Number(base.match(new RegExp(`--layer-${layer}:\\s*(\\d+)`))?.[1])

  // A menu is open only because someone just opened it, so a toast that lands on it must not
  // swallow the press meant for an item; a toast still floats over a modal, which can stay open.
  it('opens a popup over a toast, and a toast over a modal', () => {
    expect(zIndexOf('popover')).toBeGreaterThan(zIndexOf('toast'))
    expect(zIndexOf('toast')).toBeGreaterThan(zIndexOf('modal'))
  })

  // Whatever lies over the page takes its z-index from the --layer-* scale in base.css; a number
  // picked to win fights the host's chrome and the package's other layers.
  it('lift nothing over the page except through the layer scale', () => {
    const found = code.flatMap(([file, source]) =>
      (source.match(/z-\[\d{3,}\]|z-index:\s*\d{3,}|zIndex:\s*\d{3,}/g) ?? []).map(
        (z) => `${file}: ${z}`,
      ),
    )
    expect(found).toEqual([])
  })

  it('reads only layers base.css defines', () => {
    const defined = new Set(base.match(/--layer-[a-z]+(?=:)/g))
    const used = new Set(code.flatMap(([, source]) => source.match(/--layer-[a-z]+/g) ?? []))
    expect([...used].filter((layer) => !defined.has(layer))).toEqual([])
  })
})

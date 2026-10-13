import { type CssNode, generate, lexer, parse, walk } from 'css-tree'
import type { CSSProperties } from 'react'
import { deriveTheme, isDarkColor } from '../theme/index'

const properties = new Set([
  'gap',
  'row-gap',
  'column-gap',
  'padding',
  'padding-inline',
  'padding-block',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'max-width',
  'width',
  'align-items',
  'justify-items',
  'align-self',
  'justify-self',
  'background-color',
  'color',
  'border',
  'border-top',
  'border-bottom',
  'border-left',
  'border-right',
  'border-color',
  'border-width',
  'border-style',
  'border-radius',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'line-height',
  'letter-spacing',
  'text-align',
])
const alignmentKeywords = ['auto', 'normal', 'start', 'end', 'center', 'stretch', 'baseline']
const borderKeywords = ['solid', 'dashed', 'dotted', 'double', 'none']
const keywords: Record<string, readonly string[]> = {
  gap: ['normal'],
  'row-gap': ['normal'],
  'column-gap': ['normal'],
  width: ['auto'],
  'max-width': ['none'],
  'align-items': alignmentKeywords,
  'justify-items': alignmentKeywords,
  'align-self': alignmentKeywords,
  'justify-self': alignmentKeywords,
  border: borderKeywords,
  'border-top': borderKeywords,
  'border-bottom': borderKeywords,
  'border-left': borderKeywords,
  'border-right': borderKeywords,
  'border-style': borderKeywords,
  'font-family': ['serif', 'sans-serif', 'monospace'],
  'font-style': ['normal', 'italic'],
  'line-height': ['normal'],
  'letter-spacing': ['normal'],
  'text-align': ['start', 'end', 'left', 'right', 'center'],
}
const proportionalLengths = new Set([
  'gap',
  'row-gap',
  'column-gap',
  'width',
  'max-width',
  'padding',
  'padding-inline',
  'padding-block',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
])
const functions = new Set(['min', 'max', 'clamp'])
const units = new Set(['px', 'rem', 'em', 'ch'])
const themeProperties = new Set(['--form-surface', '--form-accent'])
const opaqueHex = /^(?:[a-f\d]{3}|[a-f\d]{6})$/i
const expandHex = (hex: string) =>
  hex.length === 4 ? `#${[...hex.slice(1)].map((c) => c + c).join('')}` : hex

function validToken(node: CssNode, property: string): boolean {
  const color =
    property === 'color' || property === 'background-color' || themeProperties.has(property)
  const border = property.startsWith('border')
  switch (node.type) {
    case 'Value':
      return true
    case 'Hash':
      return (color || border) && opaqueHex.test(node.value)
    case 'Identifier':
      return keywords[property]?.includes(node.name.toLowerCase()) ?? false
    case 'String':
      return property === 'font-family' && ['Geist Sans', 'Geist Mono'].includes(node.value)
    case 'Function':
      return !color && !border && functions.has(node.name.toLowerCase())
    case 'Operator':
      return !color && node.value === ','
    case 'Number': {
      const n = Number(node.value)
      if (color) return false
      if (property === 'font-weight') return Number.isInteger(n) && n >= 100 && n <= 900
      if (property === 'line-height') return n >= 1 && n <= 2
      if (property === 'font-size') return false
      return n >= 0 && n <= (border || property === 'letter-spacing' ? 0 : 12)
    }
    case 'Percentage':
      return (
        proportionalLengths.has(property) && Number(node.value) >= 0 && Number(node.value) <= 100
      )
    case 'Dimension': {
      const n = Number(node.value)
      const unit = node.unit.toLowerCase()
      if (color || !units.has(unit)) return false
      if (property === 'font-size')
        return (unit === 'px' && n >= 12 && n <= 96) || (unit === 'rem' && n >= 0.75 && n <= 6)
      if (property === 'letter-spacing')
        return (unit === 'px' && n >= 0 && n <= 2) || (unit === 'em' && n >= 0 && n <= 0.1)
      if (property === 'line-height') return false
      if (border) {
        const cap = property === 'border-radius' ? 32 : 8
        return (unit === 'px' && n >= 0 && n <= cap) || (unit === 'rem' && n >= 0 && n <= cap / 16)
      }
      return n >= 0 && n <= 256
    }
    default:
      return false
  }
}

export interface LayoutCSSIssue {
  code: 'invalid_css' | 'unsupported_property' | 'unsupported_value'
  property?: string
}

/** Only generated declaration values reach React; authored CSS is never inserted into a stylesheet. */
export function resolveLayoutCSS(css: unknown): { style: CSSProperties; issues: LayoutCSSIssue[] } {
  if (css === undefined || css === '') return { style: {}, issues: [] }
  const issues: LayoutCSSIssue[] = []
  const style: Record<string, string> = {}
  if (typeof css !== 'string' || css.length > 4096)
    return { style, issues: [{ code: 'invalid_css' }] }
  try {
    const ast = parse(css, {
      context: 'declarationList',
      parseCustomProperty: true,
      onParseError: () => {
        throw new Error('Invalid CSS')
      },
    })
    if (ast.type !== 'DeclarationList' || ast.children.size > 32) throw new Error('Invalid CSS')
    ast.children.forEach((declaration) => {
      if (declaration.type !== 'Declaration') throw new Error('Invalid CSS')
      const property = declaration.property.startsWith('--')
        ? declaration.property
        : declaration.property.toLowerCase()
      if (!properties.has(property) && !themeProperties.has(property)) {
        issues.push({ code: 'unsupported_property', property })
        return
      }
      let valid = !declaration.important
      let tokens = 0
      walk(declaration.value, (node) => {
        if (++tokens > 128) valid = false
        valid &&= validToken(node, property)
      })
      if (
        !valid ||
        lexer.matchProperty(themeProperties.has(property) ? 'color' : property, declaration.value)
          .error
      ) {
        issues.push({ code: 'unsupported_value', property })
        return
      }
      style[
        themeProperties.has(property)
          ? property
          : property.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())
      ] = generate(declaration.value)
    })
  } catch {
    issues.push({ code: 'invalid_css' })
  }
  const surface = style['--form-surface']
  const accent = style['--form-accent']
  if (Boolean(surface) !== Boolean(accent)) {
    issues.push({
      code: 'unsupported_value',
      property: surface ? '--form-accent' : '--form-surface',
    })
  }
  if (issues.length) return { style: {}, issues }
  if (surface && accent) {
    // Only two validated color seeds can reach the theme generator. Authors cannot write theme tokens.
    const background = expandHex(surface)
    delete style['--form-surface']
    delete style['--form-accent']
    return {
      style: {
        ...deriveTheme({ interface: { base: background, accent: expandHex(accent) } }),
        backgroundColor: background,
        color: 'var(--theme-app)',
        colorScheme: isDarkColor(background) ? 'dark' : 'light',
        ...style,
      } as CSSProperties,
      issues,
    }
  }
  return { style, issues }
}

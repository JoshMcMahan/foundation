import { describe, expect, it } from 'vitest'
import { contrastRatio } from '../theme/index'
import { resolveLayoutCSS } from './layoutCSS'

describe('authored layout CSS', () => {
  it('compiles supported declarations to styles without emitting a stylesheet', () => {
    expect(
      resolveLayoutCSS('gap: 1.25rem; max-width: 28rem; width: clamp(10rem, 50%, 28rem);'),
    ).toEqual({
      style: {
        gap: '1.25rem',
        maxWidth: '28rem',
        width: 'clamp(10rem,50%,28rem)',
      },
      issues: [],
    })
    expect(
      resolveLayoutCSS('padding: clamp(0.5rem, 2%, 1rem); align-items: start;').issues,
    ).toEqual([])
  })

  it('accepts bounded visual styling and derives a complete local theme from two colors', () => {
    const result = resolveLayoutCSS(
      '--form-surface: #123; --form-accent: #d4ed7a; border: 2px solid #abcdef; border-radius: 1rem; font-family: "Geist Sans", sans-serif; font-size: 3rem; font-weight: 600; line-height: 1.1;',
    )
    expect(result.issues).toEqual([])
    expect(result.style).toMatchObject({
      '--theme-app-bg': '#112233',
      '--theme-accent': '#d4ed7a',
      backgroundColor: '#112233',
      colorScheme: 'dark',
      border: '2px solid #abcdef',
      fontSize: '3rem',
      fontWeight: '600',
    })
    expect(result.style).not.toHaveProperty('--form-surface')
    const theme = result.style as Record<string, string>
    expect(contrastRatio(theme['--theme-app']!, theme['--theme-app-bg']!)).toBeGreaterThan(4.5)
    expect(contrastRatio(theme['--theme-accent-text']!, theme['--theme-accent']!)).toBeGreaterThan(
      4.5,
    )
    expect(resolveLayoutCSS('color: #abc; background-color: #fff;').issues).toEqual([])
  })

  it.each([
    '@import "https://example.invalid/style.css";',
    'background: url(https://example.invalid/leak);',
    'gap: url(https://example.invalid/leak);',
    'gap: u\\72l(https://example.invalid/leak);',
    'gap: var(--secret);',
    '--secret: url(https://example.invalid/leak);',
    'width: attr(value px);',
    'width: expression(alert(1));',
    'body { display: none; }',
    '[value^="a"] { gap: 1rem; }',
    'position: fixed;',
    'z-index: 999;',
    'transform: translateX(-100%);',
    'margin: -1rem;',
    'display: none;',
    'opacity: 0;',
    'content: "Replacement instructions";',
    'grid-template-columns: repeat(1000000, 1fr);',
    'gap: 1e99px;',
    'gap: -1px;',
    'gap: 1px !important;',
    'gap: 1rem; broken',
    'gap: 1rem; </style><script>alert(1)</script>',
    'gap: 1rem; @media (width > 0px) { body { display: none } }',
    'color: red;',
    'color: #0000;',
    'background-color: url(https://example.invalid/leak);',
    '--form-surface: #fff;',
    '--form-accent: #fff;',
    '--form-surface: var(--secret); --form-accent: #fff;',
    '--form-surface: url(https://example.invalid/leak); --form-accent: #fff;',
    '--form-surface: #fff !important; --form-accent: #000;',
    '--theme-app: #fff;',
    '--layout-columns-base: 100vw;',
    '--FORM-SURFACE: #fff; --form-accent: #000;',
    'font-family: "An unapproved font";',
    'font-size: 0;',
    'font-size: 100rem;',
    'font-weight: 1000000;',
    'line-height: 0;',
    'line-height: 200px;',
    'border: 100px solid #fff;',
    'border-radius: 99rem;',
    'letter-spacing: 100em;',
    'font-family: auto;',
    'font-family: solid;',
    'font-family: normal;',
    'font-family: none;',
    'line-height: 0%;',
    'line-height: min(0%, 100%);',
    'color: inherit;',
    'color: revert-layer;',
    'all: unset;',
    'background-image: image-set(url(https://example.invalid/leak) 1x);',
    'background-color: light-dark(#fff, url(https://example.invalid/leak));',
    'padding: env(safe-area-inset-top);',
    'width: calc(1px + 1px);',
    'width: min(1px, var(--secret));',
    'width: clamp(1px, attr(value), 2px);',
    'gap: 1px; @font-face { font-family: serif; src: url(https://example.invalid/font) }',
    'gap: 1px; & input[value] { color: #fff }',
    'font-family: "Geist Sans; background: url(https://example.invalid/leak)";',
    'g\\61p: 1px; background: url(https://example.invalid/leak);',
    'gap: u\\000072l(https://example.invalid/leak);',
    'width: 1px !/**/important;',
    '-moz-binding: url(https://example.invalid/leak);',
    'behavior: url(https://example.invalid/leak);',
    '__proto__: #fff;',
    'constructor: #fff;',
  ])('rejects the entire block: %s', (css) => {
    const result = resolveLayoutCSS(`padding: 1rem; ${css}`)
    expect(result.style).toEqual({})
    expect(result.issues.length).toBeGreaterThan(0)
  })

  it('bounds input size and declaration count, including duplicate declarations', () => {
    expect(resolveLayoutCSS(' '.repeat(4097)).issues).not.toHaveLength(0)
    expect(resolveLayoutCSS('gap:1px;'.repeat(33)).style).toEqual({})
    expect(resolveLayoutCSS({ gap: '1rem' }).style).toEqual({})
  })

  it('fails closed for malformed and deeply nested values without mutating global prototypes', () => {
    const before = Object.getOwnPropertyDescriptors(Object.prototype)
    const payloads = [
      `width: ${'min('.repeat(250)}1px${')'.repeat(250)};`,
      `padding: min(${Array.from({ length: 200 }, () => '1px').join(',')});`,
      'gap: 1px;\u0000background: url(https://example.invalid/leak)',
      'padding: 1px; /*',
    ]
    for (const payload of payloads.slice(0, 3)) expect(resolveLayoutCSS(payload).style).toEqual({})
    expect(() => resolveLayoutCSS(payloads[3])).not.toThrow()
    expect(Object.getOwnPropertyDescriptors(Object.prototype)).toEqual(before)
  })
})

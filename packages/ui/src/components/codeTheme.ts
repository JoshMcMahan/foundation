// The syntax theme for highlighted code, written in the theme's code tokens so
// a code block follows whatever theme the host applies, live, in both modes and
// on wide-gamut screens, without re-highlighting.
import type { ThemeRegistration } from 'shiki'

const v = (token: string) => `var(--theme-code-${token})`

/** TextMate scopes for each code token. */
const SCOPES: [string, string[], string?][] = [
  ['comment', ['comment', 'punctuation.definition.comment'], 'italic'],
  [
    'keyword',
    [
      'keyword',
      'storage',
      'storage.type',
      'storage.modifier',
      'constant.language',
      'markup.heading',
      'markup.bold',
    ],
  ],
  ['string', ['string', 'markup.inline.raw', 'markup.fenced_code', 'string.regexp']],
  [
    'number',
    ['constant.numeric', 'constant.character', 'constant.other', 'variable.other.constant'],
  ],
  ['function', ['entity.name.function', 'support.function', 'meta.function-call.generic']],
  [
    'type',
    [
      'entity.name.type',
      'entity.name.class',
      'entity.other.inherited-class',
      'support.type',
      'support.class',
    ],
  ],
  [
    'property',
    [
      'entity.name.tag',
      'entity.other.attribute-name',
      'variable.other.property',
      'variable.other.object.property',
      'support.type.property-name',
      'meta.object-literal.key',
      'markup.underline.link',
    ],
  ],
  ['text', ['variable', 'punctuation', 'keyword.operator', 'meta.embedded']],
]

function registration(name: string, type: 'light' | 'dark'): ThemeRegistration {
  return {
    name,
    type,
    fg: v('text'),
    bg: v('bg'),
    colors: { 'editor.background': v('bg'), 'editor.foreground': v('text') },
    tokenColors: [
      ...SCOPES.map(([token, scope, fontStyle]) => ({
        scope,
        settings: { foreground: v(token), ...(fontStyle ? { fontStyle } : {}) },
      })),
      { scope: ['markup.inserted'], settings: { foreground: 'var(--theme-ansi-green)' } },
      { scope: ['markup.deleted'], settings: { foreground: 'var(--theme-ansi-red)' } },
    ],
  }
}

/** The light and dark registrations; they're the same tokens, so either mode follows the theme. */
export const CODE_THEMES: [ThemeRegistration, ThemeRegistration] = [
  registration('theme-code-light', 'light'),
  registration('theme-code-dark', 'dark'),
]

/** The name to highlight with when one theme is enough. */
export const CODE_THEME = CODE_THEMES[0]

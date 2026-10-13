import type * as monaco from 'monaco-editor'
import {
  DEFAULT_THEME,
  deriveTheme,
  type Mode,
  parseColor,
  schemeFor,
  type ThemeToken,
  toHex,
} from '../theme/index'

type ThemeData = monaco.editor.IStandaloneThemeData

export function expandShorthandHex(color: string): string {
  return /^#([0-9a-fA-F]{3,4})$/.test(color)
    ? '#' +
        color
          .slice(1)
          .split('')
          .map((c) => c + c)
          .join('')
    : color
}

const fallbacks: Partial<Record<Mode, Record<ThemeToken, string>>> = {}

/** A token as Monaco takes it: a 6-digit hex. Monaco can't read display-p3, so
 *  a wide-gamut value is mapped back into sRGB; the default theme fills in for
 *  a host that sets no tokens. */
function token(name: ThemeToken, mode: Mode): string {
  const set =
    typeof window === 'undefined'
      ? ''
      : getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  const color = parseColor(expandShorthandHex(set))
  if (color) {
    return toHex(color)
  }
  fallbacks[mode] ??= deriveTheme(schemeFor(DEFAULT_THEME, mode))
  return fallbacks[mode][name]
}

// Monaco's token names, across its languages, mapped to the theme's code tokens.
const RULES: [string, ThemeToken, string?][] = [
  ['', '--theme-code-text'],
  ['comment', '--theme-code-comment', 'italic'],
  ['keyword', '--theme-code-keyword'],
  ['string', '--theme-code-string'],
  ['attribute.value', '--theme-code-string'],
  ['regexp', '--theme-code-string'],
  ['number', '--theme-code-number'],
  ['constant', '--theme-code-number'],
  ['predefined', '--theme-code-function'],
  ['type', '--theme-code-type'],
  // YAML marks its keys as types.
  ['type.yaml', '--theme-code-property'],
  ['tag', '--theme-code-property'],
  ['attribute.name', '--theme-code-property'],
  ['delimiter', '--theme-code-text'],
  ['operators', '--theme-code-text'],
]

function editorTheme(mode: Mode, disabled: boolean): ThemeData {
  const c = (name: ThemeToken) => token(name, mode)
  const foreground = disabled ? c('--theme-muted-text-color') : c('--theme-code-text')
  const background = disabled ? c('--theme-input-disabled-bg') : c('--theme-panel-bg')
  return {
    base: mode === 'dark' ? 'vs-dark' : 'vs',
    inherit: true,
    rules: disabled
      ? [{ token: '', foreground: foreground.slice(1) }]
      : RULES.map(([name, t, fontStyle]) => ({
          token: name,
          foreground: c(t).slice(1),
          ...(fontStyle ? { fontStyle } : {}),
        })),
    colors: {
      'editor.foreground': foreground,
      'editor.background': background,
      'editor.border': c('--theme-border'),
      'editorCursor.foreground': disabled ? background : c('--theme-app'),
      'editor.lineHighlightBackground': disabled ? background : c('--theme-hover'),
      'editorLineNumber.foreground': c('--theme-placeholder'),
      'editorLineNumber.activeForeground': c('--theme-muted-text-color'),
      'editor.selectionBackground': c('--theme-accent-subtle'),
      'editor.inactiveSelectionBackground': c('--theme-hover'),
    },
  }
}

/** Monaco themes read from the document's tokens: call again after the host applies another theme. */
export function defineEditorThemes(monacoEditor: typeof monaco.editor): void {
  for (const mode of ['light', 'dark'] as const) {
    for (const disabled of [false, true]) {
      monacoEditor.defineTheme(getThemeName(mode === 'dark', disabled), editorTheme(mode, disabled))
    }
  }
}

/** Redefines the editor themes when the host applies other tokens to the document,
 *  and sets `current()` again, so an open editor follows a theme being edited. */
export function followThemeTokens(
  monacoEditor: typeof monaco.editor,
  current: () => string,
): () => void {
  if (typeof MutationObserver === 'undefined') {
    return () => {}
  }
  const observer = new MutationObserver(() => {
    defineEditorThemes(monacoEditor)
    monacoEditor.setTheme(current())
  })
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] })
  return () => observer.disconnect()
}

export function getThemeName(isDark: boolean, disabled?: boolean): string {
  return `app-${isDark ? 'dark' : 'light'}${disabled ? '-disabled' : ''}`
}

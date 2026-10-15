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
function token(style: CSSStyleDeclaration | undefined, name: ThemeToken, mode: Mode): string {
  const color = parseColor(expandShorthandHex(style?.getPropertyValue(name).trim() ?? ''))
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

function editorTheme(style: CSSStyleDeclaration | undefined, mode: Mode): ThemeData {
  const c = (name: ThemeToken) => token(style, name, mode)
  return {
    base: mode === 'dark' ? 'vs-dark' : 'vs',
    inherit: true,
    rules: RULES.map(([name, t, fontStyle]) => ({
      token: name,
      foreground: c(t).slice(1),
      ...(fontStyle ? { fontStyle } : {}),
    })),
    colors: {
      'editor.foreground': c('--theme-code-text'),
      'editor.background': c('--theme-panel-bg'),
      'editor.border': c('--theme-border'),
      'editorCursor.foreground': c('--theme-app'),
      'editor.lineHighlightBackground': c('--theme-hover'),
      'editorLineNumber.foreground': c('--theme-placeholder'),
      'editorLineNumber.activeForeground': c('--theme-muted-text-color'),
      // A dark scheme's subtle accent sits within a shade of its panel, which leaves a selection
      // all but invisible; the accent itself, seen through, stands out and keeps the text legible.
      ...(mode === 'dark'
        ? {
            'editor.selectionBackground': `${c('--theme-accent')}66`,
            'editor.inactiveSelectionBackground': `${c('--theme-accent')}40`,
          }
        : {
            'editor.selectionBackground': c('--theme-accent-subtle'),
            'editor.inactiveSelectionBackground': c('--theme-hover'),
          }),
    },
  }
}

// What each Monaco instance was last given, so a mutation that leaves the tokens as they were
// costs one style read rather than a redefinition and a repaint of every editor.
const definedFor = new WeakMap<typeof monaco.editor, string>()

/**
 * Defines the light and dark Monaco themes from the document's tokens. Call it again after the
 * host applies other tokens; it returns whether anything changed.
 */
export function defineEditorThemes(monacoEditor: typeof monaco.editor): boolean {
  const style =
    typeof window === 'undefined' ? undefined : getComputedStyle(document.documentElement)
  const themes = (['light', 'dark'] as const).map(
    (mode) => [mode, editorTheme(style, mode)] as const,
  )
  const snapshot = JSON.stringify(themes)
  if (definedFor.get(monacoEditor) === snapshot) {
    return false
  }
  definedFor.set(monacoEditor, snapshot)
  for (const [mode, data] of themes) {
    monacoEditor.defineTheme(getThemeName(mode === 'dark'), data)
  }
  return true
}

// One observer for every editor on the page, flushed once a frame: a theme being edited sets
// dozens of properties on the root, and each editor reading the tokens for each would stall it.
const followers = new Set<() => void>()
let observer: MutationObserver | undefined
let frame = 0

function flush() {
  frame = 0
  for (const follow of followers) {
    follow()
  }
}

/** Redefines the editor themes when the host applies other tokens or another scheme to the
 *  document, and sets `current()` again, so an open editor follows a theme being edited. */
export function followThemeTokens(
  monacoEditor: typeof monaco.editor,
  current: () => string,
): () => void {
  if (typeof MutationObserver === 'undefined') {
    return () => {}
  }
  const follow = () => {
    if (defineEditorThemes(monacoEditor)) {
      monacoEditor.setTheme(current())
    }
  }
  followers.add(follow)
  if (!observer) {
    observer = new MutationObserver(() => {
      frame ||= requestAnimationFrame(flush)
    })
    // The same attributes useCssIsDark watches: a host may switch palettes by class or data attribute.
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style', 'class', 'data-theme'],
    })
  }
  return () => {
    followers.delete(follow)
    if (followers.size === 0) {
      observer?.disconnect()
      observer = undefined
      cancelAnimationFrame(frame)
      frame = 0
    }
  }
}

export function getThemeName(isDark: boolean): string {
  return `app-${isDark ? 'dark' : 'light'}`
}

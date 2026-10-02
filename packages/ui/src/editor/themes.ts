import type * as monaco from 'monaco-editor'

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

function normalizeThemeColors(colors: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(colors).map(([key, value]) => [key, expandShorthandHex(value)]),
  )
}

// Editor themes read the unified --theme-* contract off the document at
// definition time; the fallbacks only matter for hosts that set no tokens.
function themeVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') {
    return fallback
  }
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

// The light enabled case uses monaco's stock 'vs' theme, matching the
// pre-token behavior where org colors only shaped the dark variants.
function createEditorThemes(): Record<string, ThemeData> {
  const dark = {
    foreground: themeVar('--theme-app', '#e6edf3'),
    background: themeVar('--theme-panel-bg', '#161b22'),
    border: themeVar('--theme-border', '#30363d'),
    lineHighlight: themeVar('--theme-muted-panel-bg', '#21262d'),
    lineNumber: themeVar('--theme-muted-text-color', '#8b949e'),
    selection: themeVar('--theme-element', '#2f81f7'),
    selectionFg: themeVar('--theme-element-text', '#ffffff'),
    disabledBg: themeVar('--theme-input-disabled-bg', '#1c2128'),
    disabledFg: themeVar('--theme-muted-text-color', '#8b949e'),
  }
  const light = {
    disabledBg: themeVar('--theme-input-disabled-bg', '#f3f4f6'),
    disabledFg: themeVar('--theme-muted-text-color', '#5f6b76'),
    border: themeVar('--theme-border', '#d1d5db'),
    selection: themeVar('--theme-element', '#2f81f7'),
    selectionFg: themeVar('--theme-element-text', '#ffffff'),
  }
  return {
    'app-dark': {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.foreground': dark.foreground,
        'editor.background': dark.background,
        'editor.border': dark.border,
        'editorCursor.foreground': dark.foreground,
        'editor.lineHighlightBackground': dark.lineHighlight,
        'editorLineNumber.foreground': dark.lineNumber,
        'editor.selectionBackground': dark.selection,
        'editor.selectionForeground': dark.selectionFg,
      },
    },
    'app-dark-disabled': {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.foreground': dark.disabledFg,
        'editor.background': dark.disabledBg,
        'editor.border': dark.border,
        'editorCursor.foreground': 'transparent',
        'editor.lineHighlightBackground': dark.disabledBg,
        'editorLineNumber.foreground': dark.disabledFg,
        'editor.selectionBackground': dark.selection,
        'editor.selectionForeground': dark.selectionFg,
      },
    },
    'app-light-disabled': {
      base: 'vs',
      inherit: true,
      rules: [],
      colors: {
        'editor.foreground': light.disabledFg,
        'editor.background': light.disabledBg,
        'editor.border': light.border,
        'editorCursor.foreground': 'transparent',
        'editor.lineHighlightBackground': light.disabledBg,
        'editorLineNumber.foreground': light.disabledFg,
        'editor.selectionBackground': light.selection,
        'editor.selectionForeground': light.selectionFg,
      },
    },
  }
}

export function defineEditorThemes(monacoEditor: typeof monaco.editor): void {
  const themes = createEditorThemes()
  for (const [name, themeData] of Object.entries(themes)) {
    monacoEditor.defineTheme(name, {
      ...themeData,
      colors: normalizeThemeColors(themeData.colors),
    })
  }
}

export function getThemeName(isDark: boolean, disabled?: boolean): string {
  if (isDark) {
    return disabled ? 'app-dark-disabled' : 'app-dark'
  }
  return disabled ? 'app-light-disabled' : 'vs'
}

import {
  DEFAULT_THEME,
  modeOf,
  parseTheme,
  resolveMode,
  schemeFor,
  serializeTheme,
  THEME_PRESETS,
  type Theme,
} from './index'

describe('parseTheme', () => {
  const theme: Theme = {
    version: 1,
    light: {
      interface: { base: '#ffffff', accent: '#06354f', contrast: 40 },
      sidebar: { base: '#06354f', accent: '#e11d48' },
    },
    dark: { interface: { base: 'oklch(0.2 0.01 250)', accent: '#2f81f7' } },
    code: 'vivid',
  }

  it('reads back what serializeTheme writes', () => {
    expect(parseTheme(serializeTheme(theme))).toEqual({ ok: true, theme })
    for (const preset of THEME_PRESETS) {
      expect(parseTheme(serializeTheme(preset.theme))).toEqual({ ok: true, theme: preset.theme })
    }
  })

  it('reads a parsed value as well as text, and a sidebar with only an accent', () => {
    const value = {
      version: 1,
      dark: { interface: { base: '#000', accent: '#fff' }, sidebar: { accent: '#f00' } },
    }
    expect(parseTheme(value)).toEqual({ ok: true, theme: value })
  })

  it.each([
    ['not json', '{', { code: 'json', path: '' }],
    ['not an object', '[]', { code: 'shape', path: '' }],
    ['another version', '{"version":2}', { code: 'version', path: 'version' }],
    [
      'a scheme without an interface',
      '{"version":1,"light":{}}',
      { code: 'shape', path: 'light.interface' },
    ],
    [
      'a color that isn’t one',
      '{"version":1,"light":{"interface":{"base":"#fff","accent":"blue"}}}',
      { code: 'color', path: 'light.interface.accent' },
    ],
    [
      'a contrast out of range',
      '{"version":1,"dark":{"interface":{"base":"#000","accent":"#fff","contrast":101}}}',
      { code: 'range', path: 'dark.interface.contrast' },
    ],
    [
      'a contrast that isn’t a number',
      '{"version":1,"dark":{"interface":{"base":"#000","accent":"#fff","contrast":"high"}}}',
      { code: 'shape', path: 'dark.interface.contrast' },
    ],
    [
      'a sidebar color that isn’t one',
      '{"version":1,"light":{"interface":{"base":"#fff","accent":"#000"},"sidebar":{"base":"x"}}}',
      { code: 'color', path: 'light.sidebar.base' },
    ],
    ['an unknown code style', '{"version":1,"code":"neon"}', { code: 'range', path: 'code' }],
  ])('refuses %s with where and why, never throwing', (_, input, error) => {
    expect(parseTheme(input)).toEqual({ ok: false, error })
  })

  it('writes small JSON: no keys for what is left out', () => {
    expect(
      serializeTheme({ version: 1, light: { interface: { base: '#fff', accent: '#000' } } }),
    ).toBe('{"version":1,"light":{"interface":{"base":"#fff","accent":"#000"}}}')
  })
})

describe('schemeFor', () => {
  it('derives a missing mode from the other, keeping the accent and contrast', () => {
    const dark = schemeFor(
      { version: 1, light: { interface: { base: '#faf8ff', accent: '#6d28d9', contrast: 60 } } },
      'dark',
    )
    expect(modeOf(dark)).toBe('dark')
    expect(dark.interface.accent).toBe('#6d28d9')
    expect(dark.interface.contrast).toBe(60)
    const light = schemeFor(
      { version: 1, dark: { interface: { base: '#0d1117', accent: '#2f81f7' } } },
      'light',
    )
    expect(modeOf(light)).toBe('light')
  })

  it('keeps a sidebar’s own accent but not its base, whose relation to the page doesn’t carry over', () => {
    const dark = schemeFor(
      {
        version: 1,
        light: {
          interface: { base: '#fff', accent: '#000' },
          sidebar: { base: '#06354f', accent: '#e11d48' },
        },
      },
      'dark',
    )
    expect(dark.sidebar).toEqual({ accent: '#e11d48' })
  })

  it('falls back to the default theme', () => {
    expect(schemeFor(undefined, 'light')).toBe(DEFAULT_THEME.light)
    expect(schemeFor({ version: 1 }, 'dark')).toBe(DEFAULT_THEME.dark)
  })
})

describe('resolveMode', () => {
  it('follows the device only for system', () => {
    expect(resolveMode('system', true)).toBe('dark')
    expect(resolveMode('system', false)).toBe('light')
    expect(resolveMode('light', true)).toBe('light')
    expect(resolveMode('dark', false)).toBe('dark')
  })
})

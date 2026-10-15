// @vitest-environment jsdom
import { defineEditorThemes, expandShorthandHex, followThemeTokens } from './themes'

const validColor = /^#?([0-9A-Fa-f]{6})([0-9A-Fa-f]{2})?$/

describe('expandShorthandHex', () => {
  it('expands 3-digit hex to 6-digit', () => {
    expect(expandShorthandHex('#fff')).toBe('#ffffff')
    expect(expandShorthandHex('#abc')).toBe('#aabbcc')
  })

  it('expands 4-digit rgba hex to 8-digit', () => {
    expect(expandShorthandHex('#ffff')).toBe('#ffffffff')
  })

  it('leaves 6- and 8-digit hex unchanged', () => {
    expect(expandShorthandHex('#ffffff')).toBe('#ffffff')
    expect(expandShorthandHex('#ffffffff')).toBe('#ffffffff')
    expect(expandShorthandHex('#2f81f7')).toBe('#2f81f7')
  })

  it('leaves non-hex values unchanged', () => {
    expect(expandShorthandHex('transparent')).toBe('transparent')
  })
})

describe('defineEditorThemes syntax', () => {
  it('colors syntax from the code tokens, mapping a display-p3 value back into hex', () => {
    document.documentElement.style.setProperty('--theme-code-keyword', 'color(display-p3 1 0 0)')
    document.documentElement.style.setProperty('--theme-code-string', '#00aa00')
    const themes = new Map<string, { rules: { token: string; foreground?: string }[] }>()
    defineEditorThemes({
      defineTheme: (name: string, data: { rules: { token: string; foreground?: string }[] }) =>
        themes.set(name, data),
    } as unknown as Parameters<typeof defineEditorThemes>[0])
    expect([...themes.keys()].sort()).toEqual(['app-dark', 'app-light'])
    const rule = (token: string) => themes.get('app-light')?.rules.find((r) => r.token === token)
    expect(rule('string')?.foreground).toBe('00aa00')
    // Display-p3 red is outside sRGB; Monaco gets its sRGB mapping.
    expect(rule('keyword')?.foreground).toMatch(/^[\da-f]{6}$/)
    document.documentElement.style.removeProperty('--theme-code-keyword')
    document.documentElement.style.removeProperty('--theme-code-string')
  })
})

describe('defineEditorThemes', () => {
  it('never emits colors Monaco would reject', () => {
    const captured: Record<string, string>[] = []
    const mock = {
      defineTheme: (_name: string, data: { colors: Record<string, string> }) => {
        captured.push(data.colors)
      },
    }

    defineEditorThemes(mock as unknown as Parameters<typeof defineEditorThemes>[0])

    expect(captured.length).toBeGreaterThan(0)
    for (const colors of captured) {
      for (const value of Object.values(colors)) {
        expect(validColor.test(value) || value === 'transparent').toBe(true)
      }
    }
  })
})

describe('followThemeTokens', () => {
  it('redefines once a frame for every editor, and only when the tokens changed', async () => {
    const defineTheme = vi.fn()
    const setTheme = vi.fn()
    const editor = { defineTheme, setTheme } as unknown as Parameters<typeof defineEditorThemes>[0]
    const stops = [
      followThemeTokens(editor, () => 'app-light'),
      followThemeTokens(editor, () => 'app-light'),
    ]
    defineEditorThemes(editor)
    defineTheme.mockClear()
    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve))

    document.documentElement.style.setProperty('--theme-code-string', '#112233')
    document.documentElement.style.setProperty('--theme-code-number', '#445566')
    await frame()
    await frame()
    // Two themes, defined once for both editors and both properties.
    expect(defineTheme).toHaveBeenCalledTimes(2)
    expect(setTheme).toHaveBeenCalledTimes(1)

    document.documentElement.classList.add('unrelated')
    await frame()
    await frame()
    expect(defineTheme).toHaveBeenCalledTimes(2)

    for (const stop of stops) {
      stop()
    }
    document.documentElement.classList.remove('unrelated')
    document.documentElement.style.removeProperty('--theme-code-string')
    document.documentElement.style.removeProperty('--theme-code-number')
  })
})

describe('defineEditorThemes selection', () => {
  it('selects in a dark scheme with the accent seen through, which stands out from the panel', () => {
    document.documentElement.style.setProperty('--theme-accent', '#5b9ccf')
    const themes = new Map<string, { colors: Record<string, string> }>()
    defineEditorThemes({
      defineTheme: (name: string, data: { colors: Record<string, string> }) =>
        themes.set(name, data),
    } as unknown as Parameters<typeof defineEditorThemes>[0])
    expect(themes.get('app-dark')?.colors).toMatchObject({
      'editor.selectionBackground': '#5b9ccf66',
      'editor.inactiveSelectionBackground': '#5b9ccf40',
    })
    document.documentElement.style.removeProperty('--theme-accent')
  })
})

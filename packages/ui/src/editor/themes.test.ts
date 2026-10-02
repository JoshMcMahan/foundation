import { defineEditorThemes, expandShorthandHex } from './themes'

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

import { deltaE, gamutMap, JND, oklch, parseColor, rendered, toHex, toP3 } from './color'
import { apcaContrast, contrastRatio, isDarkColor, solve } from './contrast'

describe('parseColor', () => {
  it('reads hex, oklch() and color(display-p3)', () => {
    expect(toHex(oklch('#06354f'))).toBe('#06354f')
    expect(toHex(oklch('#fff'))).toBe('#ffffff')
    expect(oklch('oklch(50% 0.1 120)')).toEqual({ l: 0.5, c: 0.1, h: 120 })
    expect(oklch('oklch(0.5 0.1 480)').h).toBe(120)
    expect(toHex(oklch('color(display-p3 1 1 1)'))).toBe('#ffffff')
  })

  it('returns null for what isn’t a color', () => {
    for (const bad of [
      'blue',
      '#12',
      '#gggggg',
      'oklch(2 0 0)',
      'rgb(0 0 0)',
      'color(display-p3 2 0 0)',
    ]) {
      expect(parseColor(bad)).toBeNull()
    }
  })
})

describe('gamut mapping', () => {
  it('leaves a color inside the gamut alone', () => {
    const color = oklch('#3b82f6')
    expect(deltaE(rendered(color), color)).toBeLessThan(0.001)
    expect(deltaE(rendered(color, 'p3'), color)).toBeLessThan(0.001)
  })

  it('reduces chroma at fixed lightness and hue, within a JND of the clipped color', () => {
    const vivid = { l: 0.7, c: 0.35, h: 145 }
    const srgb = rendered(vivid)
    expect(Math.abs(srgb.l - vivid.l)).toBeLessThan(0.02)
    expect(Math.abs(srgb.h - vivid.h)).toBeLessThan(3)
    expect(srgb.c).toBeLessThan(vivid.c)
    // Display-p3 shows more of it than sRGB does.
    expect(rendered(vivid, 'p3').c).toBeGreaterThan(srgb.c)
    expect(deltaE(rendered(vivid, 'p3'), srgb)).toBeGreaterThan(JND)
  })

  it('maps lightness past the ends to white and black', () => {
    expect(gamutMap({ l: 1.2, c: 0.1, h: 0 })).toEqual([1, 1, 1])
    expect(gamutMap({ l: -0.1, c: 0.1, h: 0 })).toEqual([0, 0, 0])
  })

  it('writes display-p3 with an optional alpha', () => {
    expect(toP3(oklch('#ffffff'))).toBe('color(display-p3 1 1 1)')
    expect(toP3(oklch('#000000'), 0.25)).toBe('color(display-p3 0 0 0 / 0.25)')
  })
})

describe('contrast', () => {
  it('measures WCAG 2 ratios', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2)
  })

  it('measures APCA as the published reference does', () => {
    expect(apcaContrast('#000000', '#ffffff')).toBeCloseTo(106.04, 1)
    expect(apcaContrast('#ffffff', '#000000')).toBeCloseTo(107.88, 1)
    expect(apcaContrast('#888888', '#ffffff')).toBeCloseTo(63.06, 1)
    expect(apcaContrast('#ffffff', '#888888')).toBeCloseTo(68.54, 1)
  })

  it('reads a background’s mode by which text reads better on it', () => {
    expect(isDarkColor('#0d1117')).toBe(true)
    expect(isDarkColor('#f3f4f6')).toBe(false)
  })

  it('solves the nearest lightness that meets a target, keeping a color that already does', () => {
    const navy = oklch('#06354f')
    expect(solve(navy, ['#ffffff'], { wcag: 4.5 })).toBe(navy)
    const pale = oklch('#c4a7e7')
    const solved = toHex(solve(pale, ['#ffffff'], { wcag: 4.5, apca: 60 }))
    expect(contrastRatio(solved, '#ffffff')).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(solved, '#ffffff')).toBeLessThan(5)
    expect(Math.abs(oklch(solved).h - pale.h)).toBeLessThan(5)
  })
})

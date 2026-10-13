// Contrast in two models. WCAG 2's ratio is the legal AA bar; APCA's lightness
// contrast (Lc) weighs which color is on top, so it doesn't overrate light text
// on dark grounds the way WCAG 2 does. A generated foreground meets both, in
// sRGB and again in display-p3.
import { type Gamut, type Oklch, p3Channels, toHex } from './color'

type Rgb = [number, number, number]

const hexChannels = (hex: string): Rgb =>
  [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255) as Rgb

// Each gamut's luminance weights: WCAG's from its primaries, APCA's as published for it.
const WEIGHTS: Record<Gamut, { wcag: Rgb; apca: Rgb }> = {
  srgb: {
    wcag: [0.2126, 0.7152, 0.0722],
    apca: [0.2126729, 0.7151522, 0.072175],
  },
  p3: {
    wcag: [0.2289745641, 0.6917385218, 0.0792869141],
    apca: [0.2289829595, 0.6917492626, 0.0792677779],
  },
}

function luminance(rgb: Rgb, gamut: Gamut): number {
  const w = WEIGHTS[gamut].wcag
  return rgb.reduce(
    (sum, v, i) =>
      sum + (w[i] as number) * (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4),
    0,
  )
}

function ratio(la: number, lb: number): number {
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

// The solver measures the same few backgrounds thousands of times.
const cache = new Map<string, number>()
function cachedLuminance(hex: string): number {
  let v = cache.get(hex)
  if (v === undefined) {
    if (cache.size > 4096) cache.clear()
    v = luminance(hexChannels(hex), 'srgb')
    cache.set(hex, v)
  }
  return v
}

/** WCAG 2's contrast ratio between two hex colors, 1–21. */
export function contrastRatio(a: string, b: string): number {
  return ratio(cachedLuminance(a), cachedLuminance(b))
}

/** Whether a background reads better under white text than black: the theme's mode. */
export function isDarkColor(hex: string): boolean {
  return contrastRatio(hex, '#ffffff') >= contrastRatio(hex, '#000000')
}

// APCA 0.0.98G-4g, from the published formula in the W3C draft (WCAG 3 "Silver").
const APCA = {
  exponent: 2.4,
  normBg: 0.56,
  normText: 0.57,
  revText: 0.62,
  revBg: 0.65,
  blackThreshold: 0.022,
  // biome-ignore lint/suspicious/noApproximativeNumericConstant: APCA's published exponent, not √2
  blackClamp: 1.414,
  scale: 1.14,
  offset: 0.027,
  minDeltaY: 0.0005,
  clip: 0.1,
} as const

function apcaY(rgb: Rgb, gamut: Gamut): number {
  const w = WEIGHTS[gamut].apca
  const y = rgb.reduce((sum, v, i) => sum + (w[i] as number) * Math.max(0, v) ** APCA.exponent, 0)
  return y > APCA.blackThreshold ? y : y + (APCA.blackThreshold - y) ** APCA.blackClamp
}

function lc(yText: number, yBg: number): number {
  if (Math.abs(yBg - yText) < APCA.minDeltaY) {
    return 0
  }
  if (yBg > yText) {
    const sapc = (yBg ** APCA.normBg - yText ** APCA.normText) * APCA.scale
    return sapc < APCA.clip ? 0 : (sapc - APCA.offset) * 100
  }
  const sapc = (yBg ** APCA.revBg - yText ** APCA.revText) * APCA.scale
  return sapc > -APCA.clip ? 0 : -(sapc + APCA.offset) * 100
}

/** APCA lightness contrast of text on a background, as a magnitude 0–~108. */
export function apcaContrast(text: string, background: string): number {
  return lc(apcaY(hexChannels(text), 'srgb'), apcaY(hexChannels(background), 'srgb'))
}

/** How much contrast a foreground needs: a WCAG 2 ratio and, for text, an APCA Lc. */
export interface ContrastTarget {
  wcag: number
  apca?: number
}

/** Whether a foreground meets a target on every background it sits on, in sRGB. */
export function meets(fg: string, backgrounds: readonly string[], target: ContrastTarget): boolean {
  return backgrounds.every(
    (bg) =>
      contrastRatio(fg, bg) >= target.wcag &&
      (target.apca === undefined || apcaContrast(fg, bg) >= target.apca),
  )
}

/** A color as a screen shows it: channels in the gamut it's written in. */
export interface Shown {
  rgb: Rgb
  gamut: Gamut
}

/** How a generated color shows when written in a gamut: as a hex for sRGB, as `color(display-p3)` for p3. */
export function shown(color: Oklch, gamut: Gamut): Shown {
  return { rgb: gamut === 'p3' ? p3Channels(color) : hexChannels(toHex(color)), gamut }
}

/** A translucent fill over a backdrop, composited in the fill's gamut. */
export function over(fill: Shown, alpha: number, backdrop: Oklch): Shown {
  const under = shown(backdrop, fill.gamut).rgb
  return {
    rgb: fill.rgb.map((v, i) => v * alpha + (under[i] as number) * (1 - alpha)) as Rgb,
    gamut: fill.gamut,
  }
}

/** Whether a shown foreground meets a target on every shown background. Each is measured in its own gamut. */
export function meetsIn(fg: Shown, backgrounds: readonly Shown[], target: ContrastTarget): boolean {
  const yWcag = luminance(fg.rgb, fg.gamut)
  const yApca = apcaY(fg.rgb, fg.gamut)
  return backgrounds.every(
    (bg) =>
      ratio(yWcag, luminance(bg.rgb, bg.gamut)) >= target.wcag - 1e-9 &&
      (target.apca === undefined || lc(yApca, apcaY(bg.rgb, bg.gamut)) >= target.apca - 1e-9),
  )
}

/** How a written color shows: a hex in sRGB, or `color(display-p3 …)` in display-p3. */
export function shownValue(value: string): Shown | null {
  const p3 = /^color\(\s*display-p3\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/i.exec(value.trim())
  if (p3) {
    return { rgb: [Number(p3[1]), Number(p3[2]), Number(p3[3])], gamut: 'p3' }
  }
  return /^#[\da-f]{6}$/i.test(value) ? { rgb: hexChannels(value), gamut: 'srgb' } : null
}

/** Both contrasts of a foreground on a background as written, in whichever gamut each is. */
export function measure(fg: Shown, bg: Shown): { wcag: number; apca: number } {
  return {
    wcag: ratio(luminance(fg.rgb, fg.gamut), luminance(bg.rgb, bg.gamut)),
    apca: lc(apcaY(fg.rgb, fg.gamut), apcaY(bg.rgb, bg.gamut)),
  }
}

/**
 * The color nearest `start` in lightness, at its hue and chroma, that meets
 * `target` on every background in sRGB. It moves away from the backgrounds
 * toward black on light grounds and white on dark ones; a color that already
 * meets the target comes back unchanged, so a brand color is kept wherever it
 * reads.
 */
export function solve(start: Oklch, backgrounds: readonly string[], target: ContrastTarget): Oklch {
  if (meets(toHex(start), backgrounds, target)) {
    return start
  }
  const pole = isDarkColor(backgrounds[0] ?? '#ffffff') ? 1 : 0
  const at = (t: number): Oklch => ({ ...start, l: start.l + (pole - start.l) * t })
  if (!meets(toHex(at(1)), backgrounds, target)) {
    // Nothing at this hue reaches the target: fall back to plain black or white.
    return { l: pole, c: 0, h: 0 }
  }
  let lo = 0
  let hi = 1
  while (hi - lo > 0.002) {
    const mid = (lo + hi) / 2
    if (meets(toHex(at(mid)), backgrounds, target)) {
      hi = mid
    } else {
      lo = mid
    }
  }
  return at(hi)
}

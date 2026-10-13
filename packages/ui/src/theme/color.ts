// Color math for the theme generator. Every color is generated in OKLCH, where
// equal lightness reads as equal lightness across hues, measured in OKLab, and
// brought into sRGB, and into display-p3 for wide-gamut screens, only at the
// end, each with the CSS Color 4 gamut mapping.

/** A color in OKLCH: lightness 0–1, chroma 0–~0.37, hue in degrees. */
export interface Oklch {
  l: number
  c: number
  h: number
}

type Vec3 = [number, number, number]

/** An RGB space the generator writes into. Both gamma-encode as sRGB does. */
export type Gamut = 'srgb' | 'p3'

const HEX = /^#?([\da-f]{3}|[\da-f]{6})$/i
const OKLCH = /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)(?:deg)?\s*\)$/i
const P3 = /^color\(\s*display-p3\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/i

/** Parses `#rgb`, `#rrggbb`, `oklch(L C H)` (L as 0–1 or a percentage) or
 *  `color(display-p3 r g b)`, or returns null. */
export function parseColor(input: string): Oklch | null {
  const text = input.trim()
  const hex = HEX.exec(text)?.[1]
  if (hex) {
    const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex
    const rgb = [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16) / 255) as Vec3
    return fromRgb(rgb)
  }
  const p3 = P3.exec(text)
  if (p3) {
    const rgb = [p3[1], p3[2], p3[3]].map(Number) as Vec3
    return rgb.every((v) => Number.isFinite(v) && v >= 0 && v <= 1) ? fromRgb(rgb, 'p3') : null
  }
  const m = OKLCH.exec(text)
  if (m) {
    const l = Number(m[1]) / (m[2] ? 100 : 1)
    const c = Number(m[3])
    const h = Number(m[4])
    if ([l, c, h].every(Number.isFinite) && l >= 0 && l <= 1) {
      return { l, c, h: ((h % 360) + 360) % 360 }
    }
  }
  return null
}

/** Like `parseColor`, for colors the code itself wrote. */
export function oklch(input: string): Oklch {
  const color = parseColor(input)
  if (!color) {
    throw new Error(`Invalid color: ${input}`)
  }
  return color
}

const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
const toGamma = (v: number) =>
  v <= 0.0031308 ? 12.92 * v : 1.055 * Math.sign(v) * Math.abs(v) ** (1 / 2.4) - 0.055

function linearSrgbToOklab([r, g, b]: Vec3): Vec3 {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

function oklabToLinearSrgb([L, a, b]: Vec3): Vec3 {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

// Linear sRGB ↔ linear display-p3, through CIE XYZ (D65).
const SRGB_TO_P3: [Vec3, Vec3, Vec3] = [
  [0.8224621209, 0.177537879, 0],
  [0.0331941989, 0.9668058011, 0],
  [0.0170826307, 0.0723974407, 0.9105199286],
]
const P3_TO_SRGB: [Vec3, Vec3, Vec3] = [
  [1.2249401763, -0.2249401763, 0],
  [-0.0420569547, 1.0420569547, 0],
  [-0.0196375546, -0.0786360456, 1.0982736001],
]
const multiply = (m: [Vec3, Vec3, Vec3], [r, g, b]: Vec3): Vec3 =>
  m.map((row) => row[0] * r + row[1] * g + row[2] * b) as Vec3

export function toOklab({ l, c, h }: Oklch): Vec3 {
  const rad = (h * Math.PI) / 180
  return [l, c * Math.cos(rad), c * Math.sin(rad)]
}

export function fromOklab([l, a, b]: Vec3): Oklch {
  const c = Math.hypot(a, b)
  const h = c < 1e-6 ? 0 : ((((Math.atan2(b, a) * 180) / Math.PI) % 360) + 360) % 360
  return { l, c, h }
}

/** The color that gamma-encoded channels in a gamut show. */
export function fromRgb(rgb: Vec3, gamut: Gamut = 'srgb'): Oklch {
  const linear = rgb.map(toLinear) as Vec3
  return fromOklab(linearSrgbToOklab(gamut === 'p3' ? multiply(P3_TO_SRGB, linear) : linear))
}

/** Gamma-encoded channels in a gamut, outside 0–1 when the color is out of it. */
function toRgb(color: Oklch, gamut: Gamut): Vec3 {
  const linear = oklabToLinearSrgb(toOklab(color))
  return (gamut === 'p3' ? multiply(SRGB_TO_P3, linear) : linear).map(toGamma) as Vec3
}

const EPSILON = 1e-6
const inGamut = (rgb: Vec3) => rgb.every((v) => v >= -EPSILON && v <= 1 + EPSILON)
const clip = (rgb: Vec3): Vec3 => rgb.map((v) => Math.min(1, Math.max(0, v))) as Vec3

/** The distance between two colors in OKLab (ΔEOK). */
export function deltaE(a: Oklch, b: Oklch): number {
  const [l1, a1, b1] = toOklab(a)
  const [l2, a2, b2] = toOklab(b)
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2)
}

/** About one just-noticeable difference in ΔEOK, as CSS Color 4 uses it. */
export const JND = 0.02

/** CSS Color 4's gamut mapping: lower chroma at fixed lightness and hue until
 *  clipping the rest is no longer noticeable. Returns channels, 0–1. */
export function gamutMap(color: Oklch, gamut: Gamut = 'srgb'): Vec3 {
  if (color.l >= 1) {
    return [1, 1, 1]
  }
  if (color.l <= 0) {
    return [0, 0, 0]
  }
  const direct = toRgb(color, gamut)
  if (inGamut(direct)) {
    return clip(direct)
  }
  const near = (c: Oklch) => deltaE(fromRgb(clip(toRgb(c, gamut)), gamut), c) < JND
  if (near(color)) {
    return clip(direct)
  }
  let lo = 0
  let hi = color.c
  let current = { ...color }
  while (hi - lo > 0.0001) {
    current = { ...color, c: (lo + hi) / 2 }
    const rgb = toRgb(current, gamut)
    if (inGamut(rgb)) {
      lo = current.c
    } else if (near(current)) {
      return clip(rgb)
    } else {
      hi = current.c
    }
  }
  return clip(toRgb(current, gamut))
}

/** The sRGB hex a color shows as, gamut-mapped. */
export function toHex(color: Oklch): string {
  return `#${gamutMap(color)
    .map((v) =>
      Math.round(v * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`
}

/** A color's display-p3 channels, gamut-mapped and rounded as `toP3` writes them. */
export function p3Channels(color: Oklch): Vec3 {
  return gamutMap(color, 'p3').map((v) => Number(v.toFixed(4))) as Vec3
}

/** `color(display-p3 …)` of a color, gamut-mapped into display-p3, with an optional alpha. */
export function toP3(color: Oklch, alpha?: number): string {
  const [r, g, b] = p3Channels(color)
  return `color(display-p3 ${r} ${g} ${b}${alpha === undefined ? '' : ` / ${Number(alpha.toFixed(3))}`})`
}

/** The color a generated color shows as in a gamut. */
export function rendered(color: Oklch, gamut: Gamut = 'srgb'): Oklch {
  return gamut === 'p3' ? fromRgb(p3Channels(color), 'p3') : oklch(toHex(color))
}

/** Part of the way from `a` to `b`, interpolated in OKLab. */
export function mixOklab(a: Oklch, b: Oklch, t: number): Oklch {
  const x = toOklab(a)
  const y = toOklab(b)
  return fromOklab(
    [0, 1, 2].map((i) => (x[i] as number) + ((y[i] as number) - (x[i] as number)) * t) as Vec3,
  )
}

/** `rgba()` of a hex color at an alpha. */
export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16))
  return `rgba(${r}, ${g}, ${b}, ${Number(alpha.toFixed(3))})`
}

/** A color written as a hex, or an `rgba()` over a backdrop, as the hex it shows as. */
export function composite(color: string, backdrop: string): string {
  const m = /^rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)$/.exec(color.trim())
  if (!m) {
    return color
  }
  const alpha = Number(m[4])
  const under = [1, 3, 5].map((i) => Number.parseInt(backdrop.slice(i, i + 2), 16))
  return `#${[1, 2, 3]
    .map((i, k) =>
      Math.round(Number(m[i]) * alpha + (under[k] as number) * (1 - alpha))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`
}

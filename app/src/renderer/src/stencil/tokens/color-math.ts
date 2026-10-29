/** Color math for the Stencil color tokens: OKLCH to sRGB, compositing, and WCAG contrast. */

/** sRGB, gamma-encoded, each channel 0 to 1. */
export type Rgb = [number, number, number]

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x))
const encode = (c: number): number => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)
const decode = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)

/** Converts OKLCH to sRGB, clipping channels that fall outside the sRGB gamut. */
export function oklchToRgb(l: number, c: number, h: number): Rgb {
  const a = c * Math.cos((h * Math.PI) / 180)
  const b = c * Math.sin((h * Math.PI) / 180)
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_
  ].map((channel) => clamp01(encode(channel))) as Rgb
}

/** Source-over compositing of a translucent foreground onto an opaque backdrop. */
export function over(fg: Rgb, alpha: number, backdrop: Rgb): Rgb {
  return fg.map((channel, i) => alpha * channel + (1 - alpha) * backdrop[i]) as Rgb
}

function luminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map(decode)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio between two opaque colors, from 1 to 21. */
export function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

export function toHex(rgb: Rgb): string {
  return (
    '#' +
    rgb
      .map((channel) =>
        Math.round(clamp01(channel) * 255)
          .toString(16)
          .padStart(2, '0')
      )
      .join('')
  )
}

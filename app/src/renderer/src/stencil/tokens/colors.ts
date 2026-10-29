/**
 * Stencil's color tokens: the palettes and the semantic layer that components use.
 * `render-colors-css.ts` turns this into `stencil/colors.css` (run `pnpm stencil:tokens`).
 *
 * Palettes follow Dialtone (~/Projects/dialtone, packages/dialtone-tokens): stops 50 and 100 to
 * 900, base 600 for color and 900 for black, with black also carrying 950 and 1000 for the dark
 * base surface and a 450 half stop for dark muted text. Black is tinted to hue 305 (Ryte cool). Blue is Ryte's: 400 is the accent
 * #0496ff and 600 the accent fill #0072c6, at hue 250 and inside sRGB.
 *
 * Components use only the semantic names (`--st-color-<property>-<variant>`); a theme remaps them.
 */
import { oklchToRgb, over, type Rgb } from './color-math'

export type Theme = 'dark' | 'light'
export type Family = 'black' | 'blue' | 'red' | 'green' | 'gold'
/** [lightness 0 to 1, chroma, hue in degrees] */
export type Oklch = [number, number, number]

interface Palette {
  base: string
  stops: Array<[stop: string, Oklch]>
}

const COOL = 305
const stops = (list: Record<string, [number, number, number]>): Palette['stops'] =>
  Object.entries(list)

export const PALETTES: Record<Family, Palette> = {
  black: {
    base: '900',
    stops: Object.entries({
      50: [1, 0],
      100: [0.9748, 0.0025],
      200: [0.9245, 0.0029],
      300: [0.8448, 0.0059],
      400: [0.7321, 0.0061],
      // The one half stop: dark muted text needs a step between 400 and 500 to keep 4.5:1 on sunken.
      450: [0.6706, 0.0047],
      500: [0.6114, 0.0032],
      600: [0.5134, 0.0063],
      700: [0.4355, 0.0055],
      800: [0.3436, 0.0055],
      900: [0.2572, 0.0063],
      950: [0.2083, 0.006],
      1000: [0.1595, 0.0045]
    }).map(([stop, [l, c]]) => [stop, [l, c, COOL]] as [string, Oklch])
  },
  blue: {
    base: '600',
    stops: stops({
      50: [0.9486, 0.0246, 250],
      100: [0.9037, 0.047, 250],
      200: [0.8437, 0.0781, 250],
      300: [0.7558, 0.1259, 250],
      400: [0.6627, 0.1865, 250],
      500: [0.6089, 0.1702, 250],
      600: [0.5447, 0.1557, 250],
      700: [0.4857, 0.1362, 250],
      800: [0.4126, 0.1161, 250],
      900: [0.3269, 0.0928, 250]
    })
  },
  red: {
    base: '600',
    stops: stops({
      50: [0.936, 0.0322, 22.46],
      100: [0.8774, 0.0653, 17.3],
      200: [0.8211, 0.1019, 12.69],
      300: [0.7713, 0.1367, 14.03],
      400: [0.6886, 0.204, 14.67],
      500: [0.6392, 0.25, 15.77],
      600: [0.5724, 0.2295, 18.56],
      700: [0.4703, 0.1879, 17.53],
      800: [0.385, 0.1541, 16.48],
      900: [0.3132, 0.1252, 14.67]
    })
  },
  green: {
    base: '600',
    stops: stops({
      50: [0.9766, 0.0201, 169.36],
      100: [0.961, 0.0564, 166.75],
      200: [0.9148, 0.0923, 165.26],
      300: [0.846, 0.1357, 162.49],
      400: [0.7945, 0.1694, 158.87],
      500: [0.7391, 0.1756, 156.11],
      600: [0.6083, 0.1511, 154.75],
      700: [0.5152, 0.1266, 155.2],
      800: [0.4299, 0.1047, 155.8],
      900: [0.3402, 0.0813, 156.77]
    })
  },
  gold: {
    base: '600',
    stops: stops({
      50: [0.9818, 0.0152, 77.07],
      100: [0.9436, 0.0483, 77.26],
      200: [0.9018, 0.0868, 77.62],
      300: [0.8585, 0.123, 75.69],
      400: [0.8105, 0.1572, 71.72],
      500: [0.7807, 0.1708, 66.55],
      600: [0.7336, 0.1746, 58.56],
      700: [0.5888, 0.1385, 59.7],
      800: [0.418, 0.0966, 61.59],
      900: [0.3218, 0.0723, 64.75]
    })
  }
}

/** Pure white and black, outside the palettes, for overlays and the strongest text. */
export const NEUTRALS: Record<'neutral-white' | 'neutral-black', Oklch> = {
  'neutral-white': [1, 0, 0],
  'neutral-black': [0, 0, 0]
}

export function paletteStops(family: Family): string[] {
  return PALETTES[family].stops.map(([stop]) => stop)
}

/** A palette stop or neutral, optionally translucent, or a literal OKLCH color. */
export type SemanticValue = { ref: string; alpha?: number } | { oklch: Oklch; alpha?: number }

type Tokens = Record<string, SemanticValue>

const white = (alpha: number): SemanticValue => ({ ref: 'neutral-white', alpha })
const black = (alpha: number): SemanticValue => ({ ref: 'neutral-black', alpha })
const ref = (name: string, alpha?: number): SemanticValue =>
  alpha === undefined ? { ref: name } : { ref: name, alpha }

const dark: Tokens = {
  // Surfaces by elevation. Sunken and raised are translucent so nested layers show through.
  'surface-sunken': white(0.05),
  'surface-base': ref('black-950'),
  'surface-raised': white(0.03),
  'surface-floating': ref('black-900'),
  'surface-hover': white(0.08),
  'surface-active': white(0.2),
  'surface-selected': ref('blue-400', 0.2),
  'surface-scrim': black(0.55),
  'surface-danger': ref('red-300', 0.08),
  'shell-tint': ref('black-1000', 0.8),
  'shell-sidebar': black(0.1),
  // Text tones, strongest first. `contrast` is text on the accent fill, `on-primary` on the primary fill.
  'text-strong': ref('neutral-white'),
  'text-primary': ref('black-200'),
  'text-secondary': ref('black-300'),
  'text-tertiary': ref('black-400'),
  'text-muted': ref('black-450'),
  'text-contrast': ref('black-50'),
  'text-on-primary': ref('black-950'),
  // Borders by emphasis.
  'border-subtle': white(0.08),
  'border-base': white(0.14),
  'border-strong': white(0.28),
  'border-contrast': white(0.5),
  'border-selected': ref('blue-400', 0.4),
  // Actions and status.
  accent: ref('blue-400'),
  'accent-fill': ref('blue-600'),
  'fill-primary': ref('black-50'),
  link: ref('blue-300'),
  'link-strong': ref('blue-200'),
  focus: ref('blue-300'),
  danger: ref('red-300'),
  success: ref('green-500'),
  warning: ref('gold-200'),
  info: ref('blue-300'),
  // A dark tint of the neutral hue, darker than the surface it falls on.
  shadow: { oklch: [0.1, 0.035, COOL] }
}

const light: Tokens = {
  'surface-sunken': black(0.04),
  'surface-base': ref('black-50'),
  'surface-raised': black(0.02),
  'surface-floating': ref('black-50'),
  'surface-hover': black(0.06),
  'surface-active': black(0.14),
  'surface-selected': ref('blue-400', 0.16),
  'surface-scrim': black(0.4),
  'surface-danger': ref('red-600', 0.06),
  'shell-tint': ref('black-100', 0.78),
  'shell-sidebar': white(0.35),
  'text-strong': ref('neutral-black'),
  'text-primary': ref('black-900'),
  'text-secondary': ref('black-800'),
  'text-tertiary': ref('black-700'),
  'text-muted': ref('black-600'),
  'text-contrast': ref('black-50'),
  'text-on-primary': ref('black-50'),
  'border-subtle': black(0.08),
  'border-base': black(0.14),
  'border-strong': black(0.28),
  'border-contrast': black(0.5),
  'border-selected': ref('blue-400', 0.45),
  accent: ref('blue-400'),
  'accent-fill': ref('blue-600'),
  'fill-primary': ref('black-900'),
  link: ref('blue-600'),
  'link-strong': ref('blue-800'),
  focus: ref('blue-600'),
  danger: ref('red-600'),
  success: ref('green-700'),
  warning: ref('gold-800'),
  info: ref('blue-600'),
  shadow: { oklch: [0.2, 0.03, COOL] }
}

export const SEMANTIC: Record<Theme, Tokens> = { dark, light }

/** How strongly the two shadow layers (near, far) draw. Dark needs more, since shadows are faint on near-black. */
export const SHADOW_STRENGTH: Record<Theme, { near: string; far: string }> = {
  dark: { near: '55%', far: '40%' },
  light: { near: '16%', far: '12%' }
}

export function semanticNames(): string[] {
  return Object.keys(SEMANTIC.dark).map((name) => `--st-color-${name}`)
}

const percent = (alpha: number): string => `${+(alpha * 100).toFixed(2)}%`

/** The CSS value for a semantic token or palette reference. */
export function cssValue(value: SemanticValue): string {
  if ('ref' in value) {
    const color = `var(--st-${value.ref})`
    return value.alpha === undefined
      ? color
      : `color-mix(in oklab, ${color} ${percent(value.alpha)}, transparent)`
  }
  const [l, c, h] = value.oklch
  return value.alpha === undefined
    ? `oklch(${l} ${c} ${h})`
    : `oklch(${l} ${c} ${h} / ${value.alpha})`
}

function refRgb(name: string): Rgb {
  const neutral = NEUTRALS[name as keyof typeof NEUTRALS]
  if (neutral) return oklchToRgb(...neutral)
  const [family, stop] = name.split('-') as [Family, string]
  const found = PALETTES[family]?.stops.find(([s]) => s === stop)
  if (!found) throw new Error(`Unknown palette reference ${name}`)
  return oklchToRgb(...found[1])
}

/** A semantic token's own color and opacity in a theme, before any compositing. */
export function resolveSemantic(theme: Theme, name: string): { rgb: Rgb; alpha: number } {
  const value = SEMANTIC[theme][name]
  if (!value) throw new Error(`Unknown semantic token ${name}`)
  const rgb = 'ref' in value ? refRgb(value.ref) : oklchToRgb(...value.oklch)
  return { rgb, alpha: value.alpha ?? 1 }
}

/**
 * The sRGB color a token resolves to in a theme. `palette:blue-400` reads a palette stop; any
 * other name is a semantic token. Translucent tokens are composited over `backdrop`, which
 * defaults to the theme's base surface.
 */
export function resolveColor(theme: Theme, name: string, backdrop?: Rgb): Rgb {
  if (name.startsWith('palette:')) return refRgb(name.slice('palette:'.length))
  const { rgb, alpha } = resolveSemantic(theme, name)
  if (alpha === 1) return rgb
  return over(rgb, alpha, backdrop ?? resolveColor(theme, 'surface-base'))
}

const oklchCss = ([l, c, h]: Oklch): string => `oklch(${l} ${c} ${h})`

const HEADER = `/*
 * Stencil color tokens: palettes, then the semantic layer for each theme, shadows, and rings.
 * GENERATED by \`pnpm stencil:tokens\` from stencil/tokens/colors.ts. Do not edit by hand.
 *
 * Components use the \`--st-color-*\` names. The dark theme is the base; light applies when the window
 * reports \`prefers-color-scheme: light\`. \`data-theme="dark|light"\` on any element forces a theme for it.
 */
`

const SHADOWS = [
  'sm: 0 1px 2px near, 0 2px 4px far',
  'md: 0 2px 4px near, 0 8px 24px far',
  'lg: 0 4px 8px near, 0 16px 48px far',
  'xl: 0 8px 16px near, 0 24px 72px far'
]

function shadowLines(): string[] {
  const layer = (strength: string): string =>
    `color-mix(in oklab, var(--st-color-shadow) var(--st-shadow-strength-${strength}), transparent)`
  return SHADOWS.map((line) => {
    const [name, spec] = line.split(': ')
    const value = spec.replace(/near/g, layer('near')).replace(/far/g, layer('far'))
    return `  --st-shadow-${name}: ${value};`
  })
}

function ringLines(): string[] {
  return ['subtle', 'base', 'strong', 'contrast'].map(
    (level) =>
      `  --st-ring-${level}: inset 0 0 0 var(--st-border-100) var(--st-color-border-${level});`
  )
}

function themeLines(theme: Theme, indent: string): string[] {
  const lines = Object.entries(SEMANTIC[theme]).map(
    ([name, value]) => `${indent}--st-color-${name}: ${cssValue(value)};`
  )
  lines.push(
    `${indent}--st-shadow-strength-near: ${SHADOW_STRENGTH[theme].near};`,
    `${indent}--st-shadow-strength-far: ${SHADOW_STRENGTH[theme].far};`
  )
  return lines
}

/**
 * One theme's tokens: semantic color, shadow strength, shadows, and rings. The shadows and rings
 * are repeated per theme block because a custom property with `var()` resolves where it is declared.
 */
function themeBlock(theme: Theme, indent: string): string[] {
  const lines = themeLines(theme, indent)
  lines.push('', `${indent}/* shadows */`, ...shadowLines().map((l) => indent + l.trimStart()))
  lines.push('', `${indent}/* rings */`, ...ringLines().map((l) => indent + l.trimStart()))
  return lines
}

/**
 * Renders the palettes and both themes as one stylesheet. Dark is the base and light follows the
 * window's `prefers-color-scheme`; `data-theme` on any element forces a theme for that subtree.
 */
export function renderColorsCss(): string {
  const lines: string[] = [HEADER.trimEnd(), '', ':root {', '  /* neutral */']
  for (const [name, value] of Object.entries(NEUTRALS)) {
    lines.push(`  --st-${name}: ${oklchCss(value)};`)
  }
  for (const [family, palette] of Object.entries(PALETTES)) {
    lines.push('', `  /* ${family} (base ${palette.base}) */`)
    for (const [stop, value] of palette.stops) {
      lines.push(`  --st-${family}-${stop}: ${oklchCss(value)};`)
    }
  }
  lines.push(
    '}',
    '',
    ":root,\n[data-theme='dark'] {",
    '  color-scheme: dark;',
    '',
    '  /* semantic, dark */'
  )
  lines.push(...themeBlock('dark', '  '), '}')
  lines.push(
    '',
    '@media (prefers-color-scheme: light) {',
    "  :root:not([data-theme='dark']) {",
    '    color-scheme: light;',
    '',
    '    /* semantic, light */',
    ...themeBlock('light', '    '),
    '  }',
    '}',
    '',
    "[data-theme='light'] {",
    '  color-scheme: light;',
    '',
    '  /* semantic, light */',
    ...themeBlock('light', '  '),
    '}',
    ''
  )
  return lines.join('\n')
}

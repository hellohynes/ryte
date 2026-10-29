/**
 * Stencil's size, type, border, and radius scales: the source of truth that
 * `render-css.ts` turns into `stencil/tokens.css` (run `pnpm stencil:tokens`).
 *
 * Modelled on the author's Dialtone tokens (~/Projects/dialtone, packages/dialtone-tokens):
 * a 100 system where a stop is the multiplier x 100 of a base size, so spacing `100` is the
 * base (8px), `200` is two bases, and `25` is a quarter base. Sizes are rem on a 10px root, so
 * one value (`--st-root-size`) scales spacing, block, layout, and type together.
 *
 * - space:  margin, padding, gap, offsets (the things inside a box). Base 8px.
 * - block:  small box sizes such as icons, avatars, and controls. Base 8px, stops to 600.
 * - layout: how big or tall a box is. Base 64px (8 x the space base), stops to 3000 (1920px).
 */

export interface StencilToken {
  /** The custom property name, e.g. `--st-space-100`. */
  name: string
  /** The CSS value as written in the stylesheet. */
  css: string
  /** The resolved size in px at the default root size, or null for unitless and percent values. */
  px: number | null
  /** The group the token is rendered under. */
  group: string
}

/** The default root font size. The interface is sized in rem, so changing it scales everything. */
export const ROOT_SIZE_PX = 10
/** The base unit in px at the default root size (0.8rem). */
export const BASE_PX = 8

const QUARTER_STOPS = [25, 50, 75, 100, 125, 150, 175, 200]

function halfStops(from: number, to: number): number[] {
  const stops: number[] = []
  for (let stop = from; stop <= to; stop += 50) stops.push(stop)
  return stops
}

/**
 * Spacing stops: 0, 1 (the one px escape), quarter stops to 200, half stops to 1250 (100px),
 * plus 525. The top stops exist for the left padding that clears the macOS window buttons.
 */
export const SPACE_STOPS: readonly number[] = [
  0,
  1,
  ...QUARTER_STOPS,
  ...halfStops(250, 500),
  525,
  ...halfStops(550, 1250)
]

/** Block stops: every spacing stop from 0 to 600, so no step is missing. */
export const BLOCK_STOPS: readonly number[] = SPACE_STOPS.filter((stop) => stop <= 600)

/** Layout stops: 0, quarter stops to 200, half stops to 3000 (1920px). */
export const LAYOUT_STOPS: readonly number[] = [0, ...QUARTER_STOPS, ...halfStops(250, 3000)]

/** Font size stops and their multiple of the root size (10px), as in Dialtone. */
export const FONT_SIZE_STOPS: Readonly<Record<number, number>> = {
  50: 1,
  75: 1.1,
  100: 1.2,
  125: 1.3,
  150: 1.4,
  200: 1.6,
  250: 1.8,
  300: 2,
  350: 2.2,
  400: 2.6,
  450: 2.9,
  500: 3.2,
  550: 3.6,
  600: 4.2,
  650: 4.6,
  700: 5.2,
  750: 5.8,
  800: 6.6
}

const LINE_HEIGHTS: Readonly<Record<number, string>> = {
  100: '1',
  200: '1.2',
  300: '1.4',
  400: '1.6',
  500: '1.8',
  600: '2'
}

/**
 * Type roles. A role is a kind of text (caption, body, label, headline, code) in a size; it bundles
 * a font size stop, a line height stop, a weight, and a family. Body is 14px by default; 13px
 * (`body-compact`) is for when a layout needs it.
 */
const TYPE_ROLES: ReadonlyArray<
  readonly [name: string, size: number, leading: number, weight: string, family: string]
> = [
  ['caption-sm', 50, 200, 'normal', 'ui'],
  ['caption-md', 75, 300, 'normal', 'ui'],
  ['body-sm', 100, 300, 'normal', 'ui'],
  ['body-compact', 125, 300, 'normal', 'ui'],
  ['body-md', 150, 300, 'normal', 'ui'],
  ['body-lg', 200, 400, 'normal', 'ui'],
  ['body-xl', 250, 400, 'normal', 'ui'],
  ['label-sm', 75, 200, 'semi-bold', 'ui'],
  ['label-md', 100, 300, 'semi-bold', 'ui'],
  ['label-lg', 150, 300, 'semi-bold', 'ui'],
  ['headline-sm', 200, 300, 'bold', 'ui'],
  ['headline-md', 300, 300, 'bold', 'ui'],
  ['headline-lg', 400, 200, 'bold', 'ui'],
  ['headline-xl', 450, 200, 'bold', 'ui'],
  ['code-sm', 75, 300, 'normal', 'ui-mono'],
  ['code-md', 100, 300, 'normal', 'ui-mono'],
  ['code-lg', 125, 400, 'normal', 'ui-mono']
]

const FONT_WEIGHTS: ReadonlyArray<readonly [string, number]> = [
  ['normal', 400],
  ['medium', 500],
  ['semi-bold', 600],
  ['bold', 700]
]

/** Border widths stay in px so hairlines stay crisp when the root size changes. */
const BORDER_WIDTHS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [50, 0.5],
  [100, 1],
  [150, 1.5],
  [200, 2],
  [300, 4],
  [400, 8]
]

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}

/** `var(--st-space-base)` at 100, a multiple of it otherwise. */
function multiple(base: string, stop: number): string {
  return stop === 100 ? `var(${base})` : `calc(var(${base}) * ${round(stop / 100)})`
}

function scaleTokens(
  prefix: string,
  baseName: string,
  basePx: number,
  stops: readonly number[],
  group: string
): StencilToken[] {
  return stops.map((stop) => {
    if (stop === 0) return { name: `${prefix}-0`, css: '0px', px: 0, group }
    if (stop === 1) return { name: `${prefix}-1`, css: '1px', px: 1, group }
    return {
      name: `${prefix}-${stop}`,
      css: multiple(baseName, stop),
      px: round((stop / 100) * basePx),
      group
    }
  })
}

function buildTokens(): StencilToken[] {
  const out: StencilToken[] = []

  out.push(
    { name: '--st-root-size', css: `${ROOT_SIZE_PX}px`, px: ROOT_SIZE_PX, group: 'base' },
    { name: '--st-size-base', css: '0.8rem', px: BASE_PX, group: 'base' },
    { name: '--st-space-base', css: 'var(--st-size-base)', px: BASE_PX, group: 'base' },
    { name: '--st-block-base', css: 'var(--st-size-base)', px: BASE_PX, group: 'base' },
    {
      name: '--st-layout-base',
      css: 'calc(var(--st-size-base) * 8)',
      px: BASE_PX * 8,
      group: 'base'
    },
    { name: '--st-font-size-root', css: '1rem', px: ROOT_SIZE_PX, group: 'base' }
  )

  const space = scaleTokens('--st-space', '--st-space-base', BASE_PX, SPACE_STOPS, 'space')
  out.push(...space)
  for (const token of space) {
    out.push({
      name: `${token.name}-negative`,
      css: token.px === 0 ? '0px' : `calc(var(${token.name}) * -1)`,
      px: token.px === 0 ? 0 : -(token.px as number),
      group: 'space (negative)'
    })
  }

  out.push(...scaleTokens('--st-block', '--st-block-base', BASE_PX, BLOCK_STOPS, 'block'))
  out.push(...scaleTokens('--st-layout', '--st-layout-base', BASE_PX * 8, LAYOUT_STOPS, 'layout'))

  for (const [stop, factor] of Object.entries(FONT_SIZE_STOPS)) {
    out.push({
      name: `--st-font-size-${stop}`,
      css: `calc(var(--st-font-size-root) * ${factor})`,
      px: round(factor * ROOT_SIZE_PX),
      group: 'font size'
    })
  }
  for (const [stop, value] of Object.entries(LINE_HEIGHTS)) {
    out.push({ name: `--st-line-height-${stop}`, css: value, px: null, group: 'line height' })
  }
  for (const [name, weight] of FONT_WEIGHTS) {
    out.push({
      name: `--st-font-weight-${name}`,
      css: String(weight),
      px: null,
      group: 'font weight'
    })
  }

  for (const [name, size, leading, weight, family] of TYPE_ROLES) {
    const prefix = `--st-type-${name}`
    const group = 'type role'
    out.push(
      {
        name: `${prefix}-size`,
        css: `var(--st-font-size-${size})`,
        px: round(FONT_SIZE_STOPS[size] * ROOT_SIZE_PX),
        group
      },
      { name: `${prefix}-leading`, css: `var(--st-line-height-${leading})`, px: null, group },
      { name: `${prefix}-weight`, css: `var(--st-font-weight-${weight})`, px: null, group },
      { name: `${prefix}-family`, css: `var(--st-font-${family})`, px: null, group },
      {
        name: prefix,
        css: `var(${prefix}-weight) var(${prefix}-size)/var(${prefix}-leading) var(${prefix}-family)`,
        px: null,
        group
      }
    )
  }

  // Reading preferences (D39) scale only the document, not the chrome. A later settings UI
  // overrides them on the content root. Size and measure match the Viewer's earlier look; leading
  // moved from 1.65 to the 400 stop (1.6) so it sits on the line-height scale.
  out.push(
    {
      name: '--st-reading-size',
      css: 'var(--st-font-size-200)',
      px: round(FONT_SIZE_STOPS[200] * ROOT_SIZE_PX),
      group: 'reading'
    },
    { name: '--st-reading-leading', css: 'var(--st-line-height-400)', px: null, group: 'reading' },
    { name: '--st-reading-measure', css: '100%', px: null, group: 'reading' }
  )

  for (const [stop, width] of BORDER_WIDTHS) {
    out.push({ name: `--st-border-${stop}`, css: `${width}px`, px: width, group: 'border' })
  }
  out.push(
    { name: '--st-radius-pill', css: '999px', px: null, group: 'radius' },
    { name: '--st-radius-circle', css: '50%', px: null, group: 'radius' }
  )

  return out
}

export const tokens: readonly StencilToken[] = buildTokens()

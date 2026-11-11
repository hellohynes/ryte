/**
 * The Stencil tokens and component props as one plain JSON document, for syncing a Figma library
 * (docs/stencil-figma.md). Values come from the token sources, not the CSS, so they are resolved:
 * colors are `#rrggbb` or `#rrggbbaa`, sizes are px numbers. Variable names are the Figma paths
 * (`color/text/primary`), so a sync finds a variable by name. Shadows, rings and layout are left out.
 */
import { toHex } from './color-math'
import { SEMANTIC, resolveSemantic, type Theme } from './colors'
import { BUTTON_VARIANTS } from '../components/button-props'
import { tokens, type StencilToken } from './scales'

export interface FigmaVariable {
  name: string
  type: 'COLOR' | 'FLOAT'
  values: Record<string, string | number>
  scopes: string[]
  /** The CSS variable, so Dev Mode shows the real token. */
  codeSyntax: string
}
export interface FigmaCollection {
  name: string
  modes: string[]
  variables: FigmaVariable[]
}
export interface FigmaExport {
  version: 1
  collections: FigmaCollection[]
  components: Array<{
    name: string
    props: Array<{ name: string; values: Array<string | boolean> }>
  }>
}

const COMPONENTS = [
  'StButton',
  'StIconButton',
  'StInput',
  'StSegmented',
  'StCheckbox',
  'StMenuItem'
]
const COLOR_GROUPS = ['surface', 'shell', 'text', 'border', 'accent', 'fill', 'link']
const MODES: Array<[string, Theme]> = [
  ['Light', 'light'],
  ['Dark', 'dark']
]
const css = (name: string): string => `var(--st-${name})`

function hex(theme: Theme, name: string): string {
  const { rgb, alpha } = resolveSemantic(theme, name)
  return alpha === 1
    ? toHex(rgb)
    : toHex(rgb) +
        Math.round(alpha * 255)
          .toString(16)
          .padStart(2, '0')
}

/** `text-primary` is `color/text/primary`; a group's own token (`accent`) is `color/accent/default`. */
function colorVariable(name: string): FigmaVariable {
  const [group, ...rest] = name.split('-')
  const grouped = COLOR_GROUPS.includes(group)
  const scopes = {
    surface: 'FRAME_FILL,SHAPE_FILL',
    shell: 'FRAME_FILL,SHAPE_FILL',
    text: 'SHAPE_FILL,TEXT_FILL',
    border: 'STROKE_COLOR'
  }[group]
  return {
    name: grouped ? `color/${group}/${rest.join('-') || 'default'}` : `color/${name}`,
    type: 'COLOR',
    values: Object.fromEntries(MODES.map(([mode, theme]) => [mode, hex(theme, name)])),
    scopes: (scopes ?? (name === 'shadow' ? 'EFFECT_COLOR' : 'ALL_FILLS,STROKE_COLOR')).split(','),
    codeSyntax: css(`color-${name}`)
  }
}

type Row = [name: string, value: number, token: string, scopes: string[]]
/** Rows for the scale tokens of one group: `prefix-100` becomes `prefix/100`. */
function rows(
  group: string,
  prefix: string,
  scopes: string[],
  value: (token: StencilToken) => number | null = (token) => token.px,
  name: (stop: string) => string = (stop) => stop
): Row[] {
  const found: Row[] = []
  for (const token of tokens.filter((t) => t.group === group)) {
    const bare = token.name.replace(/^--st-/, '')
    const number = value(token)
    if (number !== null)
      found.push([`${prefix}/${name(bare.slice(prefix.length + 1))}`, number, bare, scopes])
  }
  return found
}

function floats(name: string, list: Row[]): FigmaCollection {
  const variables = list.map(([variable, value, token, scopes]) => ({
    name: variable,
    type: 'FLOAT' as const,
    values: { Value: value },
    scopes,
    codeSyntax: css(token)
  }))
  return { name, modes: ['Value'], variables }
}

/** Literal values of a prop's type, `'a' | 'b'`, or true/false for a boolean. */
function propValues(type: string): Array<string | boolean> {
  if (type === 'boolean') return [true, false]
  if (type.startsWith('Exclude<ButtonVariant')) return BUTTON_VARIANTS.filter((v) => v !== 'link')
  return [...type.matchAll(/'([^']+)'/g)].map((match) => match[1])
}

export function buildFigmaExport(manifest: {
  components: Array<{ name: string; props: Array<{ name: string; type: string }> }>
}): FigmaExport {
  const gap = ['GAP']
  const asPercent = (token: StencilToken): number => Number(token.css) * 100
  const shape = (name: string): Row => [`radius/${name}`, 999, `radius-${name}`, ['CORNER_RADIUS']]
  return {
    version: 1,
    collections: [
      {
        name: 'Color',
        modes: MODES.map(([mode]) => mode),
        variables: Object.keys(SEMANTIC.dark).map(colorVariable)
      },
      floats('Space', [
        ...rows('space', 'space', gap),
        ...rows(
          'space (negative)',
          'space',
          gap,
          undefined,
          (stop) => `negative/${stop.replace('-negative', '')}`
        ),
        ...rows('block', 'block', ['WIDTH_HEIGHT', 'GAP'])
      ]),
      // Stencil has no radius scale: corners read the space tokens. Only these two are radii.
      floats('Radius', [shape('pill'), shape('circle')]),
      floats('Border', rows('border', 'border', ['STROKE_FLOAT'])),
      floats('Typography', [
        ...rows('font size', 'font-size', ['FONT_SIZE']),
        // No scopes on purpose: these are percents, and Figma reads a bound line-height number as px.
        ...rows('line height', 'line-height', [], asPercent),
        ...rows('font weight', 'font-weight', ['FONT_WEIGHT'], (token) => Number(token.css))
      ])
    ],
    components: manifest.components
      .filter((component) => COMPONENTS.includes(component.name))
      .map((component) => ({
        name: component.name,
        // Props with no short literal list (text, v-model, the icon name) are not Figma properties.
        props: component.props
          .map((prop) => ({ name: prop.name, values: propValues(prop.type) }))
          .filter((prop) => prop.values.length > 0 && prop.values.length <= 12)
      }))
  }
}

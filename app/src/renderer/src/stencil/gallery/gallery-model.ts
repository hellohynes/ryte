/** The data behind the Stencil gallery, built from the token sources so the page cannot drift from them. */
import { contrast, toHex } from '../tokens/color-math'
import { PALETTES, SEMANTIC, resolveColor, type Family, type SemanticValue } from '../tokens/colors'
import type { IconName } from '../icons/icons.generated'
import { tokens, type StencilToken } from '../tokens/scales'

/** How the gallery lists the icons. */
export const ICON_GROUPS: Array<{ title: string; names: IconName[] }> = [
  {
    title: 'Interface',
    names: [
      'archive',
      'arrow-down',
      'arrow-left',
      'arrow-right',
      'arrow-up',
      'check',
      'chevron-down',
      'chevron-left',
      'chevron-right',
      'chevron-up',
      'close',
      'columns',
      'connector',
      'copy',
      'drop',
      'file',
      'grid',
      'home',
      'library',
      'moon',
      'more-vertical',
      'plus',
      'refresh',
      'search',
      'settings',
      'sidebar',
      'sidebar-close',
      'sidebar-open',
      'sliders',
      'sun',
      'type'
    ]
  },
  {
    title: 'Editor',
    names: [
      'align-center',
      'align-left',
      'align-right',
      'bold',
      'checklist',
      'code',
      'code-block',
      'heading',
      'heading-1',
      'heading-2',
      'heading-3',
      'image',
      'italic',
      'link',
      'list-bullet',
      'list-ordered',
      'quote',
      'redo',
      'rule',
      'strikethrough',
      'table',
      'underline',
      'undo'
    ]
  },
  { title: 'Brand', names: ['anthropic', 'openai'] }
]

export interface PaletteSwatch {
  family: Family
  stop: string
  name: string
  token: string
  hex: string
  oklch: string
  base: boolean
}

/** Three decimals without the leading zero: 0.545 -> .545, 1 -> 1. */
const fixed = (n: number): string => String(+n.toFixed(3)).replace(/^0\./, '.')

const title = (family: string): string => family[0]!.toUpperCase() + family.slice(1)

export function paletteSwatches(family: Family): PaletteSwatch[] {
  const palette = PALETTES[family]
  return palette.stops.map(([stop, [l, c, h]]) => ({
    family,
    stop,
    name: `${title(family)} ${stop}`,
    token: `--st-${family}-${stop}`,
    hex: toHex(resolveColor('dark', `palette:${family}-${stop}`)),
    oklch: `L${fixed(l)} C${fixed(c)} H${Math.round(h)}`,
    base: stop === palette.base
  }))
}

/** Every semantic color token, in the order the gallery shows them. */
export const SEMANTIC_GROUPS: Array<{ title: string; names: string[] }> = [
  {
    title: 'Surface',
    names: ['surface-sunken', 'surface-base', 'surface-raised', 'surface-floating']
  },
  {
    title: 'State',
    names: [
      'surface-hover',
      'surface-active',
      'surface-selected',
      'surface-scrim',
      'surface-danger',
      'shell-tint',
      'shell-sidebar'
    ]
  },
  {
    title: 'Text',
    names: [
      'text-strong',
      'text-primary',
      'text-secondary',
      'text-tertiary',
      'text-muted',
      'text-contrast',
      'text-on-primary'
    ]
  },
  {
    title: 'Border',
    names: ['border-subtle', 'border-base', 'border-strong', 'border-contrast', 'border-selected']
  },
  {
    title: 'Action',
    names: ['accent', 'accent-fill', 'fill-primary', 'link', 'link-strong', 'focus']
  },
  { title: 'Status', names: ['danger', 'success', 'warning', 'info'] },
  { title: 'Shadow', names: ['shadow'] }
]

const describe = (value: SemanticValue): string => {
  if ('ref' in value) {
    return value.alpha === undefined ? value.ref : `${value.ref} ${Math.round(value.alpha * 100)}%`
  }
  const [l, c, h] = value.oklch
  return `oklch ${l} ${c} ${h}`
}

export interface SemanticSwatch {
  name: string
  token: string
  dark: string
  light: string
}

export function semanticSwatch(name: string): SemanticSwatch {
  return {
    name,
    token: `--st-color-${name}`,
    dark: describe(SEMANTIC.dark[name]!),
    light: describe(SEMANTIC.light[name]!)
  }
}

const TONES = ['strong', 'primary', 'secondary', 'tertiary', 'muted'] as const

export interface ToneContrast {
  tone: string
  token: string
  dark: number
  light: number
}

/** WCAG contrast of each text tone on the base surface of each theme. */
export function textContrast(): ToneContrast[] {
  return TONES.map((tone) => {
    const token = `text-${tone}`
    const on = (theme: 'dark' | 'light'): number => {
      const base = resolveColor(theme, 'surface-base')
      return contrast(resolveColor(theme, token, base), base)
    }
    return { tone, token: `--st-color-${token}`, dark: on('dark'), light: on('light') }
  })
}

export interface ScaleRow {
  name: string
  css: string
  px: number | null
}

/** The generated scale tokens whose names match, in definition order. */
export function scaleRows(pattern: RegExp): ScaleRow[] {
  return tokens
    .filter((t: StencilToken) => pattern.test(t.name))
    .map((t) => ({ name: t.name, css: t.css, px: t.px }))
}

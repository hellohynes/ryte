import { describe, expect, it } from 'vitest'

import { ICON_NAMES } from '../icons/icons.generated'
import { semanticNames } from '../tokens/colors'
import { tokens } from '../tokens/scales'
import {
  ICON_GROUPS,
  SEMANTIC_GROUPS,
  paletteSwatches,
  scaleRows,
  semanticSwatch,
  textContrast
} from './gallery-model'

describe('gallery model', () => {
  it('lists every semantic color token in exactly one group, so the gallery cannot drift', () => {
    const listed = SEMANTIC_GROUPS.flatMap((group) => group.names).map((n) => `--st-color-${n}`)
    expect([...listed].sort()).toEqual([...semanticNames()].sort())
  })

  it('lists every icon in exactly one group', () => {
    const listed = ICON_GROUPS.flatMap((group) => group.names)
    expect([...listed].sort()).toEqual([...ICON_NAMES].sort())
  })

  it('describes a palette stop with its token, hex, and base marker', () => {
    const blue = paletteSwatches('blue')
    expect(blue.map((s) => s.stop)).toEqual([
      '50',
      '100',
      '200',
      '300',
      '400',
      '500',
      '600',
      '700',
      '800',
      '900'
    ])
    const accent = blue.find((s) => s.stop === '400')!
    expect(accent).toMatchObject({ token: '--st-blue-400', hex: '#0496ff', base: false })
    expect(blue.find((s) => s.stop === '600')).toMatchObject({ hex: '#0072c6', base: true })
  })

  it('names the stops each theme uses for a semantic token', () => {
    expect(semanticSwatch('text-primary')).toMatchObject({
      token: '--st-color-text-primary',
      dark: 'black-200',
      light: 'black-900'
    })
    expect(semanticSwatch('surface-sunken').dark).toBe('neutral-white 5%')
  })

  it('computes text contrast for both themes from the tokens', () => {
    const primary = textContrast().find((row) => row.tone === 'primary')!
    expect(primary.dark).toBeGreaterThan(12)
    expect(primary.light).toBeGreaterThan(14)
    expect(textContrast().every((row) => row.dark >= 4.5 && row.light >= 4.5)).toBe(true)
  })

  it('builds scale rows straight from the generated tokens', () => {
    const rows = scaleRows(/^--st-space-\d+$/)
    expect(rows.length).toBe(tokens.filter((t) => /^--st-space-\d+$/.test(t.name)).length)
    expect(rows.find((r) => r.name === '--st-space-100')).toMatchObject({ px: 8 })
  })
})

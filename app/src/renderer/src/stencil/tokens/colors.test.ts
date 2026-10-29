import { describe, expect, it } from 'vitest'

import { contrast, toHex, type Rgb } from './color-math'
import {
  PALETTES,
  SEMANTIC,
  paletteStops,
  renderColorsCss,
  resolveColor,
  semanticNames,
  type Theme
} from './colors'

const THEMES: Theme[] = ['dark', 'light']
const L = (family: keyof typeof PALETTES, stop: string): number =>
  PALETTES[family].stops.find(([name]) => name === stop)![1][0]

describe('palettes', () => {
  it('has the five families with the agreed stops', () => {
    expect(Object.keys(PALETTES)).toEqual(['black', 'blue', 'red', 'green', 'gold'])
    const base = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900']
    expect(paletteStops('blue')).toEqual(base)
    expect(paletteStops('red')).toEqual(base)
    expect(paletteStops('green')).toEqual(base)
    expect(paletteStops('gold')).toEqual(base)
    expect(paletteStops('black')).toEqual([
      '50',
      '100',
      '200',
      '300',
      '400',
      '450',
      '500',
      '600',
      '700',
      '800',
      '900',
      '950',
      '1000'
    ])
  })

  it('names the base stop: 600 for color, 900 for black', () => {
    expect(PALETTES.black.base).toBe('900')
    for (const family of ['blue', 'red', 'green', 'gold'] as const) {
      expect(PALETTES[family].base).toBe('600')
    }
  })

  it('gets darker at every stop', () => {
    for (const [family, palette] of Object.entries(PALETTES)) {
      const lightness = palette.stops.map(([, [l]]) => l)
      const sorted = [...lightness].sort((a, b) => b - a)
      expect(lightness, family).toEqual(sorted)
      expect(new Set(lightness).size, family).toBe(lightness.length)
    }
  })

  it('pins the Ryte blue: 400 is the accent #0496ff and 600 the accent fill #0072c6', () => {
    expect(toHex(resolveColor('dark', 'palette:blue-400'))).toBe('#0496ff')
    expect(toHex(resolveColor('dark', 'palette:blue-600'))).toBe('#0072c6')
  })

  it('tints the black palette toward hue 305 (Ryte cool)', () => {
    for (const [, [, c, h]] of PALETTES.black.stops) {
      if (c > 0) expect(h).toBe(305)
    }
  })
})

describe('semantic tokens', () => {
  it('defines the same names in both themes, all under --st-color-', () => {
    expect(Object.keys(SEMANTIC.dark).sort()).toEqual(Object.keys(SEMANTIC.light).sort())
    expect(semanticNames().every((n) => n.startsWith('--st-color-'))).toBe(true)
  })

  it('declares every semantic token once for dark and twice for light (system and forced)', () => {
    const css = renderColorsCss()
    const [dark, light] = css.split('@media (prefers-color-scheme: light)')
    const count = (css: string, name: string): number =>
      css.split('\n').filter((l) => l.trim().startsWith(`${name}:`)).length
    for (const name of semanticNames()) {
      expect(count(dark, name), name).toBe(1)
      expect(count(light, name), name).toBe(2)
    }
    expect(css).not.toMatch(/undefined|NaN/)
  })

  it('lets data-theme force a theme on any element', () => {
    const css = renderColorsCss()
    expect(css).toContain("[data-theme='dark']")
    expect(css).toContain("[data-theme='light']")
    expect(css).toContain(":root:not([data-theme='dark'])")
  })

  it('renders deterministically', () => {
    expect(renderColorsCss()).toBe(renderColorsCss())
  })
})

describe('contrast (WCAG)', () => {
  const surfaces = ['surface-base', 'surface-sunken', 'surface-raised', 'surface-floating']

  describe.each(THEMES)('%s theme', (theme) => {
    const base: Rgb = resolveColor(theme, 'surface-base')
    const on = (name: string, backdrop: Rgb): number =>
      contrast(resolveColor(theme, name, backdrop), backdrop)

    it.each(['text-strong', 'text-primary', 'text-secondary', 'text-tertiary', 'text-muted'])(
      '%s is at least 4.5:1 on every surface',
      (tone) => {
        for (const surface of surfaces) {
          const backdrop = resolveColor(theme, surface, base)
          expect(on(`${tone}`, backdrop), `${tone} on ${surface}`).toBeGreaterThanOrEqual(4.5)
        }
      }
    )

    it('keeps the tones in order: each is no stronger than the one before', () => {
      const ratios = [
        'text-strong',
        'text-primary',
        'text-secondary',
        'text-tertiary',
        'text-muted'
      ].map((tone) => on(tone, base))
      expect(ratios).toEqual([...ratios].sort((a, b) => b - a))
    })

    it('has contrast text that reads on the accent fill and the primary fill', () => {
      const accentFill = resolveColor(theme, 'accent-fill')
      const primaryFill = resolveColor(theme, 'fill-primary')
      expect(contrast(resolveColor(theme, 'text-contrast'), accentFill)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(resolveColor(theme, 'text-on-primary'), primaryFill)).toBeGreaterThanOrEqual(
        4.5
      )
    })

    it.each(['link', 'link-strong', 'danger', 'success', 'warning', 'info'])(
      '%s text is at least 4.5:1 on the base surface',
      (name) => {
        expect(on(name, base)).toBeGreaterThanOrEqual(4.5)
      }
    )

    it.each(['accent', 'focus'])('%s is at least 3:1 on the base surface (non-text)', (name) => {
      expect(on(name, base)).toBeGreaterThanOrEqual(3)
    })

    it('draws the shadow darker than the base surface', () => {
      const shadow = resolveColor(theme, 'shadow')
      expect(luminanceOf(shadow)).toBeLessThan(luminanceOf(base))
    })
  })

  it('makes strong text pure white in dark and pure black in light', () => {
    expect(toHex(resolveColor('dark', 'text-strong'))).toBe('#ffffff')
    expect(toHex(resolveColor('light', 'text-strong'))).toBe('#000000')
  })

  it('softens primary text off pure black in light (black 900)', () => {
    expect(toHex(resolveColor('light', 'text-primary'))).not.toBe('#000000')
    expect(L('black', '900')).toBeCloseTo(0.2572, 3)
  })
})

describe('surfaces', () => {
  it('makes the dark base black 950 and the floating surface black 900', () => {
    expect(SEMANTIC.dark['surface-base']).toEqual({ ref: 'black-950' })
    expect(SEMANTIC.dark['surface-floating']).toEqual({ ref: 'black-900' })
  })

  it('draws sunken and raised as translucent overlays so nesting shows through', () => {
    for (const theme of THEMES) {
      for (const name of ['surface-sunken', 'surface-raised']) {
        const value = SEMANTIC[theme][name]
        expect('alpha' in value && value.alpha! > 0 && value.alpha! < 0.2, `${theme} ${name}`).toBe(
          true
        )
      }
    }
  })

  it('keeps base, floating, and the scrim backdrop distinct from sunken', () => {
    for (const theme of THEMES) {
      const base = resolveColor(theme, 'surface-base')
      expect(toHex(resolveColor(theme, 'surface-sunken', base))).not.toBe(toHex(base))
    }
  })
})

function luminanceOf(rgb: Rgb): number {
  return contrast(rgb, [0, 0, 0])
}

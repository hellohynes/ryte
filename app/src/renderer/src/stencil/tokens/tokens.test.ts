import { describe, expect, it } from 'vitest'

import { renderTokensCss } from './render-css'
import { tokens, type StencilToken } from './scales'

const byName = new Map<string, StencilToken>(tokens.map((token) => [token.name, token]))
const px = (name: string): number | null => {
  const token = byName.get(name)
  if (!token) throw new Error(`Missing token ${name}`)
  return token.px
}

describe('spacing scale (base 8px = 100)', () => {
  const expected: Record<number, number> = {
    0: 0,
    1: 1,
    25: 2,
    50: 4,
    75: 6,
    100: 8,
    125: 10,
    150: 12,
    175: 14,
    200: 16,
    250: 20,
    300: 24,
    350: 28,
    400: 32,
    450: 36,
    500: 40,
    525: 42,
    550: 44,
    600: 48,
    650: 52,
    700: 56,
    750: 60,
    800: 64,
    850: 68,
    900: 72,
    950: 76,
    1000: 80,
    1050: 84,
    1100: 88,
    1150: 92,
    1200: 96,
    1250: 100
  }

  it('has exactly the agreed stops, with no gaps', () => {
    const stops = tokens
      .filter((t) => /^--st-space-\d+$/.test(t.name))
      .map((t) => Number(t.name.replace('--st-space-', '')))
      .sort((a, b) => a - b)
    expect(stops).toEqual(Object.keys(expected).map(Number))
  })

  it.each(Object.entries(expected))('space-%s resolves to %spx', (stop, value) => {
    expect(px(`--st-space-${stop}`)).toBe(value)
  })

  it('has a negative token for every stop, resolving to the negated value', () => {
    for (const [stop, value] of Object.entries(expected)) {
      expect(px(`--st-space-${stop}-negative`)).toBe(value === 0 ? 0 : -value)
    }
  })
})

describe('block scale (base 8px = 100, every stop from 0 to 600)', () => {
  const stops = [
    0, 1, 25, 50, 75, 100, 125, 150, 175, 200, 250, 300, 350, 400, 450, 500, 525, 550, 600
  ]

  it('has exactly the agreed stops', () => {
    const actual = tokens
      .filter((t) => /^--st-block-\d+$/.test(t.name))
      .map((t) => Number(t.name.replace('--st-block-', '')))
      .sort((a, b) => a - b)
    expect(actual).toEqual(stops)
  })

  it.each([
    [1, 1],
    [175, 14],
    [250, 20],
    [300, 24],
    [500, 40],
    [525, 42],
    [600, 48]
  ])('block-%s resolves to %spx', (stop, value) => {
    expect(px(`--st-block-${stop}`)).toBe(value)
  })

  it('has no negative tokens (not needed yet)', () => {
    expect(tokens.some((t) => /^--st-block-.*negative$/.test(t.name))).toBe(false)
  })
})

describe('layout scale (base 64px = 100)', () => {
  it('has quarter stops to 200, then every half stop to 3000', () => {
    const actual = tokens
      .filter((t) => /^--st-layout-\d+$/.test(t.name))
      .map((t) => Number(t.name.replace('--st-layout-', '')))
      .sort((a, b) => a - b)
    const halfStops = Array.from({ length: 56 }, (_, i) => 250 + i * 50)
    expect(actual).toEqual([0, 25, 50, 75, 100, 125, 150, 175, 200, ...halfStops])
    expect(actual.at(-1)).toBe(3000)
  })

  it.each([
    [25, 16],
    [100, 64],
    [200, 128],
    [250, 160],
    [1600, 1024],
    [3000, 1920]
  ])('layout-%s resolves to %spx', (stop, value) => {
    expect(px(`--st-layout-${stop}`)).toBe(value)
  })
})

describe('font sizes (root 10px, copied from Dialtone)', () => {
  const expected: Record<number, number> = {
    50: 10,
    75: 11,
    100: 12,
    125: 13,
    150: 14,
    200: 16,
    250: 18,
    300: 20,
    350: 22,
    400: 26,
    450: 29,
    500: 32,
    550: 36,
    600: 42,
    650: 46,
    700: 52,
    750: 58,
    800: 66
  }

  it.each(Object.entries(expected))('font-size-%s resolves to %spx', (stop, value) => {
    expect(px(`--st-font-size-${stop}`)).toBe(value)
  })

  it('has line heights 100-600 as 1, 1.2, 1.4, 1.6, 1.8, 2', () => {
    const heights = [100, 200, 300, 400, 500, 600].map(
      (stop) => byName.get(`--st-line-height-${stop}`)?.css
    )
    expect(heights).toEqual(['1', '1.2', '1.4', '1.6', '1.8', '2'])
  })

  it('has the four weights', () => {
    expect(
      ['normal', 'medium', 'semi-bold', 'bold'].map(
        (name) => byName.get(`--st-font-weight-${name}`)?.css
      )
    ).toEqual(['400', '500', '600', '700'])
  })
})

describe('type roles (role x size: size, leading, weight, family)', () => {
  // [role, px, line height, weight, family]
  const roles: Array<[string, number, string, string, string]> = [
    ['caption-sm', 10, '1.2', '400', 'ui'],
    ['caption-md', 11, '1.4', '400', 'ui'],
    ['body-sm', 12, '1.4', '400', 'ui'],
    ['body-compact', 13, '1.4', '400', 'ui'],
    ['body-md', 14, '1.4', '400', 'ui'],
    ['body-lg', 16, '1.6', '400', 'ui'],
    ['body-xl', 18, '1.6', '400', 'ui'],
    ['label-sm', 11, '1.2', '600', 'ui'],
    ['label-md', 12, '1.4', '600', 'ui'],
    ['label-lg', 14, '1.4', '600', 'ui'],
    ['headline-sm', 16, '1.4', '700', 'ui'],
    ['headline-md', 20, '1.4', '700', 'ui'],
    ['headline-lg', 26, '1.2', '700', 'ui'],
    ['headline-xl', 29, '1.2', '700', 'ui'],
    ['code-sm', 11, '1.4', '400', 'ui-mono'],
    ['code-md', 12, '1.4', '400', 'ui-mono'],
    ['code-lg', 13, '1.6', '400', 'ui-mono']
  ]
  const resolve = (value: string): string => {
    const ref = value.match(/^var\((--st-[a-z0-9-]+)\)$/)
    return ref ? resolve(byName.get(ref[1])!.css) : value
  }

  it.each(roles)(
    '%s is %spx, leading %s, weight %s, family %s',
    (role, size, leading, weight, family) => {
      const part = (name: string): string => resolve(byName.get(`--st-type-${role}-${name}`)!.css)
      expect(px(`--st-type-${role}-size`)).toBe(size)
      expect(part('leading')).toBe(leading)
      expect(part('weight')).toBe(weight)
      expect(byName.get(`--st-type-${role}-family`)?.css).toBe(`var(--st-font-${family})`)
    }
  )

  it('composes each role into one font shorthand', () => {
    expect(byName.get('--st-type-body-md')?.css).toBe(
      'var(--st-type-body-md-weight) var(--st-type-body-md-size)/var(--st-type-body-md-leading) var(--st-type-body-md-family)'
    )
  })

  it('defines no other roles than the agreed ones', () => {
    const defined = new Set(
      tokens.map((t) => t.name.match(/^--st-type-([a-z]+-[a-z]+)-size$/)?.[1]).filter(Boolean)
    )
    expect([...defined].sort()).toEqual(roles.map(([role]) => role).sort())
  })
})

describe('reading variables', () => {
  it('sizes reading text at font-size-200 (16px), leads it at line-height-400 (1.6), and leaves the measure uncapped', () => {
    expect(byName.get('--st-reading-size')?.css).toBe('var(--st-font-size-200)')
    expect(px('--st-reading-size')).toBe(16)
    expect(byName.get('--st-reading-leading')?.css).toBe('var(--st-line-height-400)')
    expect(byName.get('--st-reading-measure')?.css).toBe('100%')
  })
})

describe('borders and radii', () => {
  it.each([
    ['0', 0],
    ['50', 0.5],
    ['100', 1],
    ['150', 1.5],
    ['200', 2],
    ['300', 4],
    ['400', 8]
  ])('border-%s resolves to %spx', (stop, value) => {
    expect(px(`--st-border-${stop}`)).toBe(value)
  })

  it('has a pill and a circle radius', () => {
    expect(byName.get('--st-radius-pill')?.css).toBe('999px')
    expect(byName.get('--st-radius-circle')?.css).toBe('50%')
  })
})

describe('token set', () => {
  it('has unique names, all under the --st- prefix', () => {
    const names = tokens.map((t) => t.name)
    expect(new Set(names).size).toBe(names.length)
    expect(names.every((name) => name.startsWith('--st-'))).toBe(true)
  })

  it('declares every token exactly once in the generated CSS', () => {
    const css = renderTokensCss()
    for (const token of tokens) {
      const declarations = css
        .split('\n')
        .filter((line) => line.trim().startsWith(`${token.name}:`))
      expect(declarations, token.name).toHaveLength(1)
    }
    expect(css).not.toMatch(/undefined|NaN/)
  })

  // The committed stencil/tokens.css is checked against this output by `pnpm stencil:tokens -- --check`,
  // which `pnpm validate` runs. Vitest returns an empty string for CSS modules, so it can't read it here.
  it('renders deterministically', () => {
    expect(renderTokensCss()).toBe(renderTokensCss())
  })
})

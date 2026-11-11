import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { oklchToRgb, toHex } from './color-math'
import { semanticNames } from './colors'
import type { FigmaExport } from './figma-export'

const exported: FigmaExport = JSON.parse(
  execFileSync(
    process.execPath,
    ['--import', 'tsx', 'scripts/generate-stencil-figma-export.ts', '--stdout'],
    {
      cwd: resolve(__dirname, '../../../../..'),
      encoding: 'utf8'
    }
  )
)
const css = readFileSync(resolve(__dirname, '../colors.css'), 'utf8')
const color = exported.collections.find((collection) => collection.name === 'Color')!
const value = (name: string, mode: string): unknown =>
  color.variables.find((variable) => variable.name === name)!.values[mode]
/** A palette stop as colors.css defines it, as hex. */
function palette(name: string): string {
  const [, l, c, h] = css
    .match(new RegExp(`--st-${name}: oklch\\(([\\d.]+) ([\\d.]+) ([\\d.]+)\\)`))!
    .map(Number)
  return toHex(oklchToRgb(l, c, h))
}

describe('Figma export', () => {
  it('has every color token in both modes', () => {
    expect(color.modes).toEqual(['Light', 'Dark'])
    expect(color.variables.map((variable) => variable.codeSyntax).sort()).toEqual(
      semanticNames()
        .map((name) => `var(${name})`)
        .sort()
    )
    for (const variable of color.variables)
      expect(Object.keys(variable.values)).toEqual(['Light', 'Dark'])
  })

  it('resolves colors to what colors.css computes', () => {
    expect(value('color/text/primary', 'Dark')).toBe(palette('black-200'))
    expect(value('color/text/primary', 'Light')).toBe(palette('black-900'))
    expect(value('color/border/base', 'Dark')).toBe(`${palette('neutral-white')}24`)
  })
})

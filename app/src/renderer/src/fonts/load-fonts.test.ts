import { describe, expect, it } from 'vitest'

import { FONT_OPTIONS } from '../../../shared/fonts'
import { FONT_FACES } from './font-faces'
import { familiesIn } from './load-fonts'

describe('familiesIn', () => {
  it('reads the quoted family names from a stack, leaving the system fallbacks out', () => {
    expect(familiesIn("'Geist Variable', ui-sans-serif, system-ui, sans-serif")).toEqual([
      'Geist Variable'
    ])
    expect(familiesIn("system-ui, -apple-system, 'Segoe UI', sans-serif")).toEqual(['Segoe UI'])
    expect(familiesIn('ui-monospace, monospace')).toEqual([])
  })
})

describe('bundled fonts', () => {
  it('has files for every bundled family any font option names', () => {
    const named = new Set(
      FONT_OPTIONS.flatMap((font) => [...familiesIn(font.sans), ...familiesIn(font.mono)])
    )
    // These are the computer's own faces, named in the fallbacks, so they are never bundled.
    for (const system of ['Segoe UI', 'SF Mono']) named.delete(system)
    for (const family of named) {
      expect(FONT_FACES, `no bundled files for ${family}`).toHaveProperty([family])
      expect(FONT_FACES[family]!.length).toBeGreaterThan(0)
    }
  })

  it('bundles nothing that no font option uses', () => {
    const named = new Set(
      FONT_OPTIONS.flatMap((font) => [...familiesIn(font.sans), ...familiesIn(font.mono)])
    )
    for (const family of Object.keys(FONT_FACES)) expect(named.has(family), family).toBe(true)
  })
})

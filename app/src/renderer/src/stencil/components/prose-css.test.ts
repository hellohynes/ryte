import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { semanticNames } from '../tokens/colors'
import { tokens } from '../tokens/scales'

const css = readFileSync(resolve(__dirname, '../prose.css'), 'utf8')
const controls = readFileSync(resolve(__dirname, '../controls.css'), 'utf8')
const overlay = readFileSync(resolve(__dirname, '../overlay.css'), 'utf8')
// Shadows and rings are generated into colors.css alongside the semantic colors.
const colorsCss = readFileSync(resolve(__dirname, '../colors.css'), 'utf8')
const known = new Set([
  ...tokens.map((t) => t.name),
  ...semanticNames(),
  ...[...colorsCss.matchAll(/^\s*(--st-[a-z0-9-]+):/gm)].map((m) => m[1]!)
])

describe('prose css', () => {
  it('reads only Stencil tokens', () => {
    for (const [, name] of css.matchAll(/var\((--[a-z0-9-]+)/g)) {
      // --shiki-light is set per token by the code highlighter.
      const ok =
        known.has(name) || /^--st-(font-sans|font-mono)$/.test(name) || name === '--shiki-light'
      expect(ok, name).toBe(true)
    }
  })

  it('has no raw colors, and styles descendants of .st-prose only', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|oklch\(/)
    expect(css).not.toMatch(/:deep\(|\.prose\b(?!-)/)
    const selectors = [...css.matchAll(/^([^\s@/*}][^{]*)\{/gm)].map((m) => m[1]!)
    for (const selector of selectors) {
      for (const part of selector.split(',')) {
        expect(part.trim().startsWith('.st-prose'), part.trim()).toBe(true)
      }
    }
  })

  it('sets size, leading, and family from the reading variables', () => {
    expect(css).toMatch(/\.st-prose \{[^}]*font-size: var\(--st-reading-size\)/)
    expect(css).toMatch(/\.st-prose \{[^}]*line-height: var\(--st-reading-leading\)/)
  })
})

describe('controls css', () => {
  it('reads only Stencil tokens and has no raw colors', () => {
    for (const [, name] of controls.matchAll(/var\((--[a-z0-9-]+)/g)) {
      expect(known.has(name), name).toBe(true)
    }
    expect(controls).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|oklch\(/)
  })

  it('has rules for the select, checkbox, and segmented control', () => {
    for (const selector of ['.st-select', '.st-checkbox', '.st-segmented-option']) {
      expect(controls).toContain(selector)
    }
  })
})

describe('overlay css', () => {
  // A few properties are declared and read inside the file itself, such as the dialog padding.
  const local = new Set([...overlay.matchAll(/^\s*(--st-[a-z0-9-]+):/gm)].map((m) => m[1]))

  it('reads only Stencil tokens and has no raw colors', () => {
    for (const [, name] of overlay.matchAll(/var\((--[a-z0-9-]+)/g)) {
      expect(known.has(name!) || local.has(name!), name).toBe(true)
    }
    expect(overlay).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|oklch\(/)
  })

  it('has rules for each overlay component', () => {
    for (const selector of [
      '.st-dialog',
      '.st-popover',
      '.st-menu-item',
      '.st-tooltip',
      '.st-toast',
      '.st-disclosure'
    ]) {
      expect(overlay).toContain(selector)
    }
  })
})

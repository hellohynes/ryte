import { describe, expect, it } from 'vitest'

import { DEFAULT_FONT_ID, FONT_OPTIONS, fontStacks, isFontId } from './fonts'

describe('font registry', () => {
  it('offers the fifteen chosen fonts, Geist first as the default', () => {
    expect(FONT_OPTIONS.map((font) => font.label)).toEqual([
      'Geist (Default)',
      'System Default',
      'Cascadia',
      'DM',
      'Google Sans',
      'IBM Plex',
      'JetBrains',
      'Lora',
      'Merriweather',
      'Noto Sans',
      'Raleway',
      'Reddit',
      'Roboto',
      'Ubuntu',
      'Work Sans'
    ])
    expect(DEFAULT_FONT_ID).toBe('geist')
    expect(FONT_OPTIONS[0]?.id).toBe(DEFAULT_FONT_ID)
  })

  it('has unique ids, and a text and a code stack for every font', () => {
    const ids = FONT_OPTIONS.map((font) => font.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const font of FONT_OPTIONS) {
      expect(font.sans.length).toBeGreaterThan(0)
      expect(font.mono.length).toBeGreaterThan(0)
    }
  })

  it('pairs each font with its own mono, and Geist Mono where it has none', () => {
    expect(fontStacks('roboto').mono).toMatch(/^'Roboto Mono Variable'/)
    expect(fontStacks('ibm-plex').mono).toMatch(/^'IBM Plex Mono'/)
    expect(fontStacks('google-sans').mono).toMatch(/^'Google Sans Code Variable'/)
    for (const id of ['merriweather', 'raleway', 'lora', 'work-sans'] as const) {
      expect(fontStacks(id).mono).toMatch(/^'Geist Mono Variable'/)
    }
    // Mono-only families are their own companion.
    expect(fontStacks('jetbrains').sans).toMatch(/^'JetBrains Mono Variable'/)
    expect(fontStacks('jetbrains').mono).toMatch(/^'JetBrains Mono Variable'/)
  })

  it('ends every stack in a system fallback, and the system font uses only system faces', () => {
    for (const font of FONT_OPTIONS) {
      expect(font.sans).toMatch(/(sans-serif|serif|monospace)$/)
      expect(font.mono).toMatch(/monospace$/)
    }
    expect(fontStacks('system').sans).toMatch(/^system-ui/)
    expect(fontStacks('system').mono).toMatch(/^ui-monospace/)
  })

  it('recognises only its own ids', () => {
    expect(isFontId('geist')).toBe(true)
    expect(isFontId('comic-sans')).toBe(false)
    expect(isFontId('')).toBe(false)
    expect(isFontId(undefined)).toBe(false)
    expect(isFontId({ id: 'geist' })).toBe(false)
  })
})

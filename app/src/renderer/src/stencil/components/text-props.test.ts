import { describe, expect, it } from 'vitest'

import { semanticNames } from '../tokens/colors'
import { renderTextCss } from '../tokens/render-text-css'
import { tokens } from '../tokens/scales'
import {
  TEXT_LINES,
  TEXT_ROLES,
  TEXT_TONES,
  resolveTextType,
  textAttributes,
  toneToken
} from './text-props'

const tokenNames = new Set(tokens.map((t) => t.name))

describe('text props', () => {
  it('offers exactly the role and size pairs that exist as type tokens', () => {
    const offered = Object.entries(TEXT_ROLES).flatMap(([role, sizes]) =>
      sizes.map((size) => `${role}-${size}`)
    )
    const defined = tokens
      .map((t) => t.name.match(/^--st-type-([a-z]+-[a-z]+)$/)?.[1])
      .filter((name): name is string => Boolean(name))
    expect(offered.sort()).toEqual(defined.sort())
    for (const type of offered) expect(tokenNames.has(`--st-type-${type}`), type).toBe(true)
  })

  it('maps every tone to a semantic color token', () => {
    const colors = new Set(semanticNames())
    for (const tone of TEXT_TONES) expect(colors.has(toneToken(tone)), tone).toBe(true)
  })

  it('defaults to body medium and sets attributes only for what is given', () => {
    expect(textAttributes({})).toEqual({ 'data-st-type': 'body-md' })
    expect(
      textAttributes({
        kind: 'headline',
        size: 'lg',
        tone: 'secondary',
        weight: 'medium',
        truncate: true,
        align: 'center'
      })
    ).toEqual({
      'data-st-type': 'headline-lg',
      'data-st-tone': 'secondary',
      'data-st-weight': 'medium',
      'data-st-truncate': '',
      'data-st-align': 'center'
    })
    expect(textAttributes({ lines: 3 })['data-st-lines']).toBe('3')
  })

  it('falls back to the default size of the role when the size is not offered', () => {
    expect(resolveTextType('caption', 'xl')).toBe('caption-md')
    expect(resolveTextType('body', 'compact')).toBe('body-compact')
    expect(resolveTextType('code', undefined)).toBe('code-md')
  })
})

describe('text css', () => {
  const css = renderTextCss()

  it('has a rule for every role and size, a tone, a weight, and each line clamp', () => {
    for (const [role, sizes] of Object.entries(TEXT_ROLES)) {
      for (const size of sizes) {
        expect(css).toContain(
          `.st-text[data-st-type='${role}-${size}'] { font: var(--st-type-${role}-${size}); }`
        )
      }
    }
    expect(css).toContain(
      `.st-text[data-st-tone='secondary'] { color: var(--st-color-text-secondary); }`
    )
    expect(css).toContain(
      `.st-text[data-st-weight='medium'] { font-weight: var(--st-font-weight-medium); }`
    )
    for (const lines of TEXT_LINES) expect(css).toContain(`[data-st-lines='${lines}']`)
  })

  it('renders deterministically and without gaps', () => {
    expect(renderTextCss()).toBe(renderTextCss())
    expect(css).not.toMatch(/undefined|NaN/)
  })
})

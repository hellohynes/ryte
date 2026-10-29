import { describe, expect, it } from 'vitest'

import { ICON_NAMES } from '../icons/icons.generated'
import { renderButtonCss } from '../tokens/render-button-css'
import { tokens } from '../tokens/scales'
import {
  BUTTON_SIZES,
  BUTTON_VARIANTS,
  ICON_BUTTON_SIZES,
  buttonAttributes,
  iconButtonAttributes
} from './button-props'

const tokenNames = new Set(tokens.map((t) => t.name))

describe('button props', () => {
  it('defaults to a medium secondary button and sets attributes only for what is given', () => {
    expect(buttonAttributes({})).toEqual({ 'data-st-variant': 'secondary', 'data-st-size': 'md' })
    expect(buttonAttributes({ variant: 'primary', size: 'lg', loading: true })).toEqual({
      'data-st-variant': 'primary',
      'data-st-size': 'lg',
      'data-st-loading': '',
      'aria-busy': 'true',
      disabled: ''
    })
    expect(buttonAttributes({ disabled: true }).disabled).toBe('')
  })

  it('defaults an icon button to ghost and medium', () => {
    expect(iconButtonAttributes({})).toEqual({ 'data-st-variant': 'ghost', 'data-st-size': 'md' })
  })

  it('sizes buttons with label type roles that exist', () => {
    for (const size of BUTTON_SIZES) {
      expect(tokenNames.has(`--st-type-label-${size}`), size).toBe(true)
    }
  })

  it('has icon sizes that map to block tokens', () => {
    for (const [, spec] of Object.entries(ICON_BUTTON_SIZES)) {
      expect(tokenNames.has(`--st-block-${spec.block}`), String(spec.block)).toBe(true)
      expect(spec.icon).toBeGreaterThan(0)
    }
  })

  it('has an icon name type that matches the icon set', () => {
    expect(ICON_NAMES).toContain('close')
  })
})

describe('button css', () => {
  const css = renderButtonCss()

  it('has a rule for every variant and size, focus, and disabled', () => {
    for (const variant of BUTTON_VARIANTS)
      expect(css).toContain(`.st-button[data-st-variant='${variant}']`)
    for (const size of BUTTON_SIZES) expect(css).toContain(`.st-button[data-st-size='${size}']`)
    expect(css).toContain('.st-button:focus-visible')
    expect(css).toContain('.st-button:disabled')
  })

  it('references only tokens that exist, and renders deterministically', () => {
    for (const [, name] of css.matchAll(/var\((--st-[a-z0-9-]+)/g)) {
      const known = tokenNames.has(name) || /^--st-color-/.test(name) || /^--st-ring-/.test(name)
      expect(known, name).toBe(true)
    }
    expect(renderButtonCss()).toBe(css)
    expect(css).not.toMatch(/undefined|NaN/)
  })
})

import { describe, expect, it } from 'vitest'

import { renderInputCss } from '../tokens/render-input-css'
import { tokens } from '../tokens/scales'
import { INPUT_SIZES, INPUT_VARIANTS, inputAttributes } from './input-props'

const tokenNames = new Set(tokens.map((t) => t.name))

describe('input props', () => {
  it('defaults to a medium boxed input and sets attributes only for what is given', () => {
    expect(inputAttributes({})).toEqual({
      'data-st-variant': 'boxed',
      'data-st-size': 'md',
      type: 'text'
    })
    expect(
      inputAttributes({ variant: 'inline', size: 'lg', invalid: true, type: 'password' })
    ).toEqual({
      'data-st-variant': 'inline',
      'data-st-size': 'lg',
      'data-st-invalid': '',
      'aria-invalid': 'true',
      type: 'password'
    })
  })

  it('has the three agreed variants: boxed, inline, and bare', () => {
    expect([...INPUT_VARIANTS]).toEqual(['boxed', 'inline', 'bare'])
  })

  it('sizes inputs with body type roles that exist', () => {
    for (const size of INPUT_SIZES)
      expect(tokenNames.has(`--st-type-body-${size}`), size).toBe(true)
  })
})

describe('input css', () => {
  const css = renderInputCss()

  it('has a rule for every variant and size, focus, placeholder, disabled, and invalid', () => {
    for (const variant of INPUT_VARIANTS)
      expect(css).toContain(`.st-input[data-st-variant='${variant}']`)
    for (const size of INPUT_SIZES) expect(css).toContain(`.st-input[data-st-size='${size}']`)
    for (const part of [':focus-visible', '::placeholder', ':disabled', '[data-st-invalid]']) {
      expect(css).toContain(part)
    }
  })

  it('lets the inline variant inherit its surroundings font', () => {
    expect(css).toMatch(/\.st-input\[data-st-variant='inline'\] \{[^}]*font: inherit/)
  })

  it('references only tokens that exist and renders deterministically', () => {
    for (const [, name] of css.matchAll(/var\((--st-[a-z0-9-]+)/g)) {
      expect(tokenNames.has(name) || /^--st-color-/.test(name), name).toBe(true)
    }
    expect(renderInputCss()).toBe(css)
    expect(css).not.toMatch(/undefined|NaN/)
  })
})

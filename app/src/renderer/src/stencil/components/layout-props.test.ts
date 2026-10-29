import { describe, expect, it } from 'vitest'

import { renderLayoutCss } from '../tokens/render-layout-css'
import { SPACE_STOPS, tokens } from '../tokens/scales'
import {
  BOX_RADII,
  BOX_SPACE,
  STACK_GAPS,
  boxAttributes,
  stackAttributes,
  type SpaceStop
} from './layout-props'

const tokenNames = new Set(tokens.map((token) => token.name))

describe('layout props', () => {
  it('offers exactly the space stops the scale defines, for gap and padding', () => {
    expect([...STACK_GAPS]).toEqual([...SPACE_STOPS])
    expect([...BOX_SPACE]).toEqual([...SPACE_STOPS])
  })

  it('maps stack props to data attributes and leaves defaults off', () => {
    expect(stackAttributes({})).toEqual({})
    expect(
      stackAttributes({ direction: 'row', gap: 200 as SpaceStop, align: 'center', wrap: true })
    ).toEqual({
      'data-st-direction': 'row',
      'data-st-gap': '200',
      'data-st-align': 'center',
      'data-st-wrap': ''
    })
  })

  it('maps box props to data attributes', () => {
    expect(
      boxAttributes({
        surface: 'raised',
        border: 'subtle',
        radius: 150,
        shadow: 'md',
        padding: 200,
        paddingX: 300
      })
    ).toEqual({
      'data-st-surface': 'raised',
      'data-st-border': 'subtle',
      'data-st-radius': '150',
      'data-st-shadow': 'md',
      'data-st-p': '200',
      'data-st-px': '300'
    })
  })

  it('offers radii that exist as tokens', () => {
    for (const radius of BOX_RADII) {
      const token =
        radius === 'pill' || radius === 'circle' ? `--st-radius-${radius}` : `--st-space-${radius}`
      expect(tokenNames.has(token), String(radius)).toBe(true)
    }
  })
})

describe('layout css', () => {
  const css = renderLayoutCss()

  it('has a rule for every gap and padding stop', () => {
    for (const stop of SPACE_STOPS) {
      expect(css).toContain(`.st-stack[data-st-gap='${stop}'] { gap: var(--st-space-${stop}); }`)
      expect(css).toContain(`.st-box[data-st-p='${stop}'] { padding: var(--st-space-${stop}); }`)
    }
  })

  it('references only tokens that exist', () => {
    for (const [, name] of css.matchAll(/var\((--st-[a-z0-9-]+)/g)) {
      const known =
        name.startsWith('--st-box-') ||
        tokenNames.has(name) ||
        /^--st-color-(surface|border)-/.test(name) ||
        /^--st-(shadow|ring)-(sm|md|lg|xl|subtle|base|strong|contrast)$/.test(name)
      expect(known, name).toBe(true)
    }
    expect(css).not.toMatch(/undefined|NaN/)
  })

  it('renders deterministically', () => {
    expect(renderLayoutCss()).toBe(renderLayoutCss())
  })
})

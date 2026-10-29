import { describe, expect, it } from 'vitest'

import { semanticNames } from '../tokens/colors'
import { renderNoticeCss } from '../tokens/render-notice-css'
import { NOTICE_TONES, NOTICE_VARIANTS, noticeAttributes } from './notice-props'

describe('notice props', () => {
  it('defaults to a boxed info notice announced politely', () => {
    expect(noticeAttributes({})).toEqual({
      'data-st-tone': 'info',
      'data-st-variant': 'boxed',
      role: 'status'
    })
  })

  it('announces a danger notice as an alert, and lets the caller choose', () => {
    expect(noticeAttributes({ tone: 'danger' }).role).toBe('alert')
    expect(noticeAttributes({ tone: 'warning', urgent: true }).role).toBe('alert')
    expect(noticeAttributes({ tone: 'danger', urgent: false }).role).toBe('status')
  })

  it('has the four tones and two variants', () => {
    expect([...NOTICE_TONES]).toEqual(['info', 'success', 'warning', 'danger'])
    expect([...NOTICE_VARIANTS]).toEqual(['boxed', 'inline'])
  })

  it('reads each tone from a semantic color that exists', () => {
    const colors = new Set(semanticNames())
    for (const tone of NOTICE_TONES) expect(colors.has(`--st-color-${tone}`), tone).toBe(true)
  })
})

describe('notice css', () => {
  const css = renderNoticeCss()

  it('has a rule for every tone and variant', () => {
    for (const tone of NOTICE_TONES) expect(css).toContain(`.st-notice[data-st-tone='${tone}']`)
    for (const variant of NOTICE_VARIANTS) {
      expect(css).toContain(`.st-notice[data-st-variant='${variant}']`)
    }
  })

  it('renders deterministically without gaps', () => {
    expect(renderNoticeCss()).toBe(css)
    expect(css).not.toMatch(/undefined|NaN/)
  })
})

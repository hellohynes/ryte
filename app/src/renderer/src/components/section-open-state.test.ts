import { describe, expect, it } from 'vitest'

import { sectionOpen } from './section-open-state'

const base = { override: undefined, writing: true, hasBody: true }

describe('sectionOpen', () => {
  it('arrives collapsed while only its title exists', () => {
    expect(sectionOpen({ ...base, hasBody: false })).toBe(false)
  })

  it('opens once its text starts, while it is being written', () => {
    expect(sectionOpen(base)).toBe(true)
  })

  it('stays open next to other sections that are also being written', () => {
    // Nothing about another section matters: each decides for itself.
    expect(sectionOpen({ ...base })).toBe(true)
  })

  it('collapses when its own text is finished, so a finished summary rests collapsed', () => {
    expect(sectionOpen({ ...base, writing: false })).toBe(false)
  })

  it('lets the reader open a section at any time, and keeps it open', () => {
    expect(sectionOpen({ ...base, override: true, writing: false })).toBe(true)
  })

  it('lets the reader close a section that is being written', () => {
    expect(sectionOpen({ ...base, override: false })).toBe(false)
  })
})

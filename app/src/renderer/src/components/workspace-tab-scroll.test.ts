import { describe, expect, it } from 'vitest'

import { resolveOverflowEdges, resolveScrollDelta } from './workspace-tab-scroll'

describe('workspace tab scroll helpers', () => {
  describe('resolveScrollDelta', () => {
    it('does not scroll a fully visible item', () => {
      expect(
        resolveScrollDelta({
          viewportStart: 100,
          viewportEnd: 300,
          itemStart: 140,
          itemEnd: 220,
          margin: 8
        })
      ).toBe(0)
    })

    it('scrolls a clipped-left item into view with margin', () => {
      expect(
        resolveScrollDelta({
          viewportStart: 100,
          viewportEnd: 300,
          itemStart: 96,
          itemEnd: 176,
          margin: 8
        })
      ).toBe(-12)
    })

    it('scrolls a clipped-right item into view with margin', () => {
      expect(
        resolveScrollDelta({
          viewportStart: 100,
          viewportEnd: 300,
          itemStart: 228,
          itemEnd: 296,
          margin: 8
        })
      ).toBe(4)
    })

    it('keeps a requested margin around a nearly edge-aligned item', () => {
      expect(
        resolveScrollDelta({
          viewportStart: 100,
          viewportEnd: 300,
          itemStart: 104,
          itemEnd: 184,
          margin: 8
        })
      ).toBe(-4)
    })
  })

  describe('resolveOverflowEdges', () => {
    it('returns no fades when content does not overflow', () => {
      expect(resolveOverflowEdges({ scrollLeft: 0, scrollWidth: 200, clientWidth: 200 })).toEqual({
        canScrollLeft: false,
        canScrollRight: false
      })
    })

    it('returns only right fade at the start', () => {
      expect(resolveOverflowEdges({ scrollLeft: 0, scrollWidth: 400, clientWidth: 200 })).toEqual({
        canScrollLeft: false,
        canScrollRight: true
      })
    })

    it('returns both fades in the middle', () => {
      expect(resolveOverflowEdges({ scrollLeft: 80, scrollWidth: 400, clientWidth: 200 })).toEqual({
        canScrollLeft: true,
        canScrollRight: true
      })
    })

    it('returns only left fade at the end', () => {
      expect(resolveOverflowEdges({ scrollLeft: 200, scrollWidth: 400, clientWidth: 200 })).toEqual(
        {
          canScrollLeft: true,
          canScrollRight: false
        }
      )
    })
  })
})

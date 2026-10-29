import { describe, expect, it } from 'vitest'

import { DEFAULT_WINDOW_WIDTH } from '../shared/workspace'
import { safeWindowBounds } from './window-state'

const primary = { x: 0, y: 0, width: 1512, height: 982 }

describe('safeWindowBounds', () => {
  it('uses the centered default when no saved bounds exist', () => {
    const bounds = safeWindowBounds(null, [primary])
    expect(bounds.width).toBe(DEFAULT_WINDOW_WIDTH)
    expect(bounds.height).toBe(958)
    expect(bounds.x).toBe(26)
    expect(bounds.y).toBe(12)
  })

  it('restores saved bounds that are visible and fit', () => {
    expect(safeWindowBounds({ x: 40, y: 50, width: 1200, height: 780 }, [primary])).toEqual({
      x: 40,
      y: 50,
      width: 1200,
      height: 780
    })
  })

  it('clamps oversized saved bounds to the work area', () => {
    expect(safeWindowBounds({ x: -20, y: -20, width: 5000, height: 4000 }, [primary])).toEqual({
      x: 0,
      y: 0,
      width: 1488,
      height: 958
    })
  })

  it('recenters off-screen saved bounds on the primary work area', () => {
    const bounds = safeWindowBounds({ x: 9000, y: 9000, width: 1100, height: 700 }, [primary])
    expect(bounds.x).toBeGreaterThanOrEqual(0)
    expect(bounds.y).toBeGreaterThanOrEqual(0)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(primary.width)
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(primary.height)
  })

  it('uses the work area with the largest intersection', () => {
    const secondary = { x: 1512, y: 0, width: 1728, height: 1080 }
    expect(
      safeWindowBounds({ x: 1700, y: 100, width: 1000, height: 700 }, [primary, secondary])
    ).toEqual({
      x: 1700,
      y: 100,
      width: 1000,
      height: 700
    })
  })
})

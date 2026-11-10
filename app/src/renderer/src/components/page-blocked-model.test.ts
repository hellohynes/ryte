import { describe, expect, it } from 'vitest'

import {
  dismissBanner,
  emptyBannerState,
  receiveReport,
  visibleBanner,
  type BlockedBannerState
} from './page-blocked-model'

describe('the blocked banner', () => {
  const report = (count: number): { count: number; addresses: string[] } => ({
    count,
    addresses: Array.from({ length: count }, (_, index) => `https://example.com/${index + 1}`)
  })

  it('groups blocks into one count, dismissing clears it, and a new block shows it again', () => {
    let state: BlockedBannerState = emptyBannerState()
    expect(visibleBanner(state)).toBeNull()

    state = receiveReport(state, report(12))
    expect(visibleBanner(state)?.count).toBe(12)

    state = dismissBanner(state)
    expect(visibleBanner(state)).toBeNull()

    state = receiveReport(state, report(15))
    const shown = visibleBanner(state)
    expect(shown?.count).toBe(3)
    expect(shown?.addresses).toEqual([
      'https://example.com/13',
      'https://example.com/14',
      'https://example.com/15'
    ])
  })
})

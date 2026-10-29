import { describe, expect, it } from 'vitest'

import { advanceDisplayed, safeDisplayLength } from './answer-pacing'

describe('safeDisplayLength', () => {
  const text = 'Claim one [1] and two [12]. Done'

  it('never reveals half of a citation marker', () => {
    expect(safeDisplayLength(text, 'Claim one ['.length)).toBe('Claim one '.length)
    expect(safeDisplayLength(text, 'Claim one [1'.length)).toBe('Claim one '.length)
    expect(safeDisplayLength(text, 'Claim one [1]'.length)).toBe('Claim one [1]'.length)
  })

  it('holds back multi-digit markers until the closing bracket', () => {
    expect(safeDisplayLength(text, 'Claim one [1] and two [1'.length)).toBe(
      'Claim one [1] and two '.length
    )
  })

  it('does not hold back brackets that are not markers', () => {
    expect(safeDisplayLength('see [note', 'see [note'.length)).toBe(9)
    expect(safeDisplayLength('a [b] c', 4)).toBe(4)
  })

  it('clamps to the text length', () => {
    expect(safeDisplayLength('short', 99)).toBe(5)
  })
})

describe('advanceDisplayed', () => {
  it('advances steadily and never past the target', () => {
    expect(advanceDisplayed(0, 1000, 100, false)).toBeGreaterThan(0)
    expect(advanceDisplayed(0, 3, 5000, false)).toBe(3)
    expect(advanceDisplayed(10, 10, 100, false)).toBe(10)
  })

  it('does not move when no time has passed', () => {
    expect(advanceDisplayed(5, 100, 0, false)).toBe(5)
  })

  it('never types faster than a readable ceiling, however large the backlog', () => {
    expect(advanceDisplayed(0, 100_000, 1000, false)).toBeLessThanOrEqual(140)
  })

  it('never crawls: even a tiny backlog is typed at a floor speed', () => {
    expect(advanceDisplayed(0, 100, 1000, false)).toBeGreaterThanOrEqual(55)
  })

  it('speeds up a little once the run has finished, so the wait stays bounded', () => {
    const running = advanceDisplayed(0, 2000, 1000, false)
    const finishing = advanceDisplayed(0, 2000, 1000, true)
    expect(finishing).toBeGreaterThan(running)
    expect(finishing).toBeLessThanOrEqual(220)
  })

  it('types a typical summary over several seconds, not in a burst', () => {
    // A 700-character summary that has already fully arrived.
    let shown = 0
    let frames = 0
    while (shown < 700 && frames < 5_000) {
      shown = advanceDisplayed(shown, 700, 16, false)
      frames += 1
    }
    const seconds = (frames * 16) / 1000
    expect(seconds).toBeGreaterThan(5)
    expect(seconds).toBeLessThan(12)
  })
})

import { describe, expect, it } from 'vitest'

import {
  advanceTyping,
  initialTyping,
  typedMarkdown,
  typingComplete,
  writingFlags,
  type TypingPieces,
  type TypingState
} from './section-typing'

const LEAD = 'Overview sentence that has to type out first. '.repeat(3).trim()
const BODY = 'Plain words about this area and where it stands now. '.repeat(6).trim()

function pieces(sectionCount: number, overrides: Partial<TypingPieces> = {}): TypingPieces {
  return {
    structured: true,
    lead: LEAD,
    sections: Array.from({ length: sectionCount }, (_, index) => ({
      title: `Area ${index + 1}`,
      body: BODY
    })),
    ...overrides
  }
}

/** Steps the plan forward in frames, reporting each state with the time it was reached. */
function run(
  input: TypingPieces,
  options: { until: (state: TypingState, now: number) => boolean; finished?: boolean }
): { state: TypingState; now: number; trace: Array<{ now: number; state: TypingState }> } {
  let state = initialTyping()
  let now = 0
  const trace: Array<{ now: number; state: TypingState }> = []
  while (now < 120_000) {
    now += 16
    state = advanceTyping(state, input, now, 16, options.finished ?? true)
    trace.push({ now, state })
    if (options.until(state, now)) break
  }
  return { state, now, trace }
}

describe('section typing', () => {
  it('types the overview first and shows no section title until it is done', () => {
    const { trace } = run(pieces(3), { until: (state) => state.leadDoneAt !== null })
    for (const { state } of trace.slice(0, -1)) {
      expect(state.sections.every((section) => section.titleAt === null)).toBe(true)
    }
  })

  it('brings the titles in one after another once the overview finishes', () => {
    const { state } = run(pieces(4), { until: (s) => s.sections.every((x) => x.titleAt !== null) })
    const times = state.sections.map((section) => section.titleAt as number)
    for (let index = 1; index < times.length; index += 1) {
      expect(times[index] - times[index - 1]).toBeGreaterThanOrEqual(1_350)
      expect(times[index] - times[index - 1]).toBeLessThan(1_500)
    }
    expect(times[0]).toBe(state.leadDoneAt)
  })

  it('lets a title sit before its text starts', () => {
    const { trace } = run(pieces(2), { until: (s) => s.sections[0].shown > 0 })
    const first = trace.at(-1)!
    const titleAt = first.state.sections[0].titleAt as number
    expect(first.now - titleAt).toBeGreaterThanOrEqual(700)
  })

  it('writes several sections at once instead of waiting for the previous one', () => {
    const input = pieces(4)
    const { state } = run(input, { until: (s) => s.sections[2].shown > 0 })
    // Section 3 has started typing while sections 1 and 2 are still being written.
    expect(state.sections[0].shown).toBeGreaterThan(0)
    expect(state.sections[0].shown).toBeLessThan(input.sections[0].body.length)
    expect(state.sections[1].shown).toBeGreaterThan(0)
    expect(state.sections[1].shown).toBeLessThan(input.sections[1].body.length)
  })

  it('finishes a many-section summary far sooner than writing the sections one by one', () => {
    const input = pieces(5)
    const { now } = run(input, { until: (state) => typingComplete(input, state, true) })
    const sequential = input.lead.length / 45 + 5 * (0.7 + input.sections[0].body.length / 45)
    expect(now / 1000).toBeLessThan(sequential * 0.75)
  })

  it('types each section at a readable pace of its own', () => {
    const input = pieces(1)
    const { trace } = run(input, { until: (state) => state.sections[0].shown >= 120 })
    const start = trace.find(({ state }) => state.sections[0].shown > 0)!
    const end = trace.at(-1)!
    const perSecond =
      ((end.state.sections[0].shown - start.state.sections[0].shown) / (end.now - start.now)) * 1000
    // The run has finished here, so the pace sits in the finishing range (80 to 220).
    expect(perSecond).toBeGreaterThanOrEqual(78)
    expect(perSecond).toBeLessThanOrEqual(222)
  })

  it('only shows a section once its title has arrived from the provider', () => {
    const input = pieces(1)
    const { state } = run(input, { until: (_state, now) => now > 30_000, finished: false })
    expect(state.sections).toHaveLength(1)
    // A second section is not known yet, so no second title can appear.
    expect(typedMarkdown(input, state)).not.toContain('Area 2')
  })

  it('is not complete until the provider has finished, even when everything so far is typed', () => {
    const input = pieces(2)
    const unfinished = run(input, { until: (_state, now) => now > 60_000, finished: false })
    expect(typingComplete(input, unfinished.state, false)).toBe(false)
    expect(typingComplete(input, unfinished.state, true)).toBe(true)
  })

  it('types an answer without sections as one block', () => {
    const input: TypingPieces = { structured: false, lead: 'Just a plain answer.', sections: [] }
    const { state } = run(input, { until: (_state, now) => now > 10_000 })
    expect(typedMarkdown(input, state)).toBe('Just a plain answer.')
    expect(typingComplete(input, state, true)).toBe(true)
  })

  it('never shows half of a citation marker in any piece', () => {
    const input = pieces(1, { lead: 'Claim one [1] and two [12].' })
    const { trace } = run(input, { until: (state) => state.leadDoneAt !== null })
    for (const { state } of trace) {
      expect(typedMarkdown(input, state)).not.toMatch(/\[\d*$/)
    }
  })
})

describe('typedMarkdown', () => {
  it('rebuilds the structured shape from what has been shown so far', () => {
    const input = pieces(2, { lead: 'Lead.' })
    const state: TypingState = {
      lead: 5,
      leadDoneAt: 0,
      sections: [
        { shown: 12, titleAt: 100 },
        { shown: 0, titleAt: 200 }
      ]
    }
    expect(typedMarkdown(input, state)).toBe(
      `## TL;DR\nLead.\n\n## Area 1\n${BODY.slice(0, 12)}\n\n## Area 2\n`
    )
  })

  it('leaves out sections whose title has not come in yet', () => {
    const input = pieces(2, { lead: 'Lead.' })
    const state: TypingState = { lead: 5, leadDoneAt: 0, sections: [{ shown: 0, titleAt: 100 }] }
    expect(typedMarkdown(input, state)).not.toContain('Area 2')
  })
})

describe('writingFlags', () => {
  it('marks only the pieces still being written', () => {
    const input = pieces(2, { lead: 'Lead.' })
    const state: TypingState = {
      lead: 5,
      leadDoneAt: 0,
      sections: [
        { shown: BODY.length, titleAt: 100 },
        { shown: 10, titleAt: 200 }
      ]
    }
    expect(writingFlags(input, state, true)).toEqual({ lead: false, sections: [false, true] })
  })

  it('treats the last section as still being written until the provider finishes', () => {
    const input = pieces(1, { lead: 'Lead.' })
    const state: TypingState = {
      lead: 5,
      leadDoneAt: 0,
      sections: [{ shown: BODY.length, titleAt: 100 }]
    }
    expect(writingFlags(input, state, false).sections).toEqual([true])
    expect(writingFlags(input, state, true).sections).toEqual([false])
  })
})

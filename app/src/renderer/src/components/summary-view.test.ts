import { describe, expect, it } from 'vitest'

import { summaryView } from './summary-view'
import type { PreviousSummary } from '../stores/search'

const previous: PreviousSummary = {
  answer: '## TL;DR\nOld summary [4].',
  sources: [],
  citations: [{ index: 4, sourcePath: 'plans/old.md', headingPath: [] }]
}

const live = {
  answer: '',
  citations: [],
  numbers: new Map<number, number>(),
  sources: [],
  typing: true,
  writing: { lead: true, sections: [] as boolean[] }
}

describe('summaryView', () => {
  it('shows the live run when nothing is being replaced', () => {
    const view = summaryView(null, { ...live, answer: 'New words' })
    expect(view.holding).toBe(false)
    expect(view.answer).toBe('New words')
    expect(view.typing).toBe(true)
  })

  it('keeps the old summary, finished and numbered as it was, until the new one has text', () => {
    const view = summaryView(previous, live)
    expect(view.holding).toBe(true)
    expect(view.answer).toBe(previous.answer)
    expect(view.citations).toBe(previous.citations)
    expect([...view.numbers.entries()]).toEqual([[4, 1]])
    expect(view.sources.map((source) => source.sourcePath)).toEqual(['plans/old.md'])
    expect(view.typing).toBe(false)
    expect(view.writing).toEqual({ lead: false, sections: [] })
  })

  it('swaps to the new summary as soon as its first words are on screen', () => {
    const view = summaryView(previous, { ...live, answer: 'N' })
    expect(view.holding).toBe(false)
    expect(view.answer).toBe('N')
    expect(view.typing).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'

import { buildCitedSources, citationNumbers, renumberMarkdown } from './cited-sources'
import type { SearchCitation } from '../../../preload/index'

const citations: SearchCitation[] = [
  { index: 3, sourcePath: 'sessions/2026-10-19/beacon.md', headingPath: ['Plan'] },
  { index: 1, sourcePath: 'sessions/2026-10-05/design-tri.md', headingPath: [] },
  { index: 9, sourcePath: 'sessions/2026-10-05/design-tri.md', headingPath: ['Risks'] },
  { index: 4, sourcePath: 'sessions/2026-10-05/review.md', headingPath: [] }
]

describe('citation numbering', () => {
  it('numbers sources by first appearance in the text, not by internal index', () => {
    const numbers = citationNumbers('First [3]. Then [1] and [4].', citations)
    expect([...numbers.entries()]).toEqual([
      [3, 1],
      [1, 2],
      [4, 3]
    ])
  })

  it('gives every passage of one document the same number', () => {
    const numbers = citationNumbers('A [1]. B [9]. C [3].', citations)
    expect(numbers.get(1)).toBe(1)
    expect(numbers.get(9)).toBe(1)
    expect(numbers.get(3)).toBe(2)
  })

  it('ignores markers that match no citation', () => {
    expect([...citationNumbers('Claim [7] then [3].', citations).entries()]).toEqual([[3, 1]])
  })

  it('keeps earlier numbers stable as more text streams in', () => {
    const early = citationNumbers('A [3]. B [1].', citations)
    const later = citationNumbers('A [3]. B [1]. C [4].', citations)
    expect(later.get(3)).toBe(early.get(3))
    expect(later.get(1)).toBe(early.get(1))
  })
})

describe('buildCitedSources', () => {
  it('lists one row per document in number order with every cited section', () => {
    expect(buildCitedSources('A [1]. B [3]. C [9].', citations)).toEqual([
      {
        number: 1,
        sourcePath: 'sessions/2026-10-05/design-tri.md',
        headingPaths: [[], ['Risks']]
      },
      { number: 2, sourcePath: 'sessions/2026-10-19/beacon.md', headingPaths: [['Plan']] }
    ])
  })

  it('keeps the numbers of the full text but lists only sources whose marker is on screen', () => {
    // Section two has typed its marker, section one has not: the number stays 2, never becomes 1.
    const full = 'First area cites [3]. Second area cites [1].'
    const onScreen = 'Second area cites [1].'
    expect(buildCitedSources(full, citations, onScreen)).toEqual([
      {
        number: 2,
        sourcePath: 'sessions/2026-10-05/design-tri.md',
        headingPaths: [[]]
      }
    ])
  })

  it('lists only sources whose marker has appeared', () => {
    expect(buildCitedSources('Only one so far [4].', citations).map((s) => s.number)).toEqual([1])
    expect(buildCitedSources('No markers yet.', citations)).toEqual([])
  })
})

describe('renumberMarkdown', () => {
  it('rewrites markers to the displayed numbers, merging passages of one document', () => {
    expect(renumberMarkdown('A [3][1]. B [9]. C [4].', citations)).toBe('A [1][2]. B [2]. C [3].')
  })

  it('leaves unknown markers alone', () => {
    expect(renumberMarkdown('See [7] and [3].', citations)).toBe('See [7] and [1].')
  })
})

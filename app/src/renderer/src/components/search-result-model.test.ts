import { describe, expect, it } from 'vitest'

import {
  buildSearchResults,
  documentTitle,
  sourceFileName,
  sourceFolder
} from './search-result-model'
import type { SearchCitation, SearchSource } from '../../../preload/index'

function source(overrides: Partial<SearchSource> = {}): SearchSource {
  return {
    index: 1,
    sourcePath: 'plans/release-plan.md',
    headingPath: ['Rollout'],
    preview: 'A query-centred preview.',
    matchCount: 1,
    retrievalMode: 'hybrid',
    ...overrides
  }
}

function citation(overrides: Partial<SearchCitation> = {}): SearchCitation {
  return {
    index: 1,
    sourcePath: 'plans/release-plan.md',
    headingPath: ['Rollout'],
    ...overrides
  }
}

describe('search result model', () => {
  it('uses the document filename as the visible title', () => {
    expect(documentTitle('sessions/2026-08-24/release-plan.md')).toBe('release-plan')
  })

  it('groups chunks by document and totals matches', () => {
    expect(
      buildSearchResults(
        [
          source({ matchCount: 2 }),
          source({ index: 2, headingPath: ['Risks'], matchCount: 3, preview: 'Risk context.' })
        ],
        []
      )
    ).toEqual([
      {
        sourcePath: 'plans/release-plan.md',
        title: 'release-plan',
        headingPath: ['Risks'],
        preview: 'Risk context.',
        matchCount: 5
      }
    ])
  })

  it('omits documents already linked as answer citations', () => {
    expect(
      buildSearchResults(
        [source(), source({ index: 2, sourcePath: 'plans/follow-up.md' })],
        [citation()]
      )
    ).toEqual([
      {
        sourcePath: 'plans/follow-up.md',
        title: 'follow-up',
        headingPath: ['Rollout'],
        preview: 'A query-centred preview.',
        matchCount: 1
      }
    ])
  })

  it('splits a path into the file name and its folder for the sources column', () => {
    expect(sourceFileName('sessions/2026-06-12/shaping/plan.md')).toBe('plan.md')
    expect(sourceFolder('sessions/2026-06-12/shaping/plan.md')).toBe('sessions/2026-06-12/shaping/')
    expect(sourceFolder('plan.md')).toBe('')
  })
})

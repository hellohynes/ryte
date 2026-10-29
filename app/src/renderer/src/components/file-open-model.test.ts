import { describe, expect, it } from 'vitest'

import type { FileCatalogEntry } from '../../../shared/files'
import { buildFileOpenResults } from './file-open-model'

function catalogEntry(overrides: Partial<FileCatalogEntry>): FileCatalogEntry {
  return {
    sourcePath: 'docs/a.md',
    title: 'A',
    directory: 'docs',
    searchableText: 'a docs/a.md',
    pathDate: null,
    modifiedAt: '2026-06-22T12:00:00.000Z',
    modifiedAtMs: 1,
    createdAt: null,
    createdAtMs: null,
    sizeBytes: 1,
    ...overrides
  }
}

describe('buildFileOpenResults', () => {
  it('filters by title and source path tokens', () => {
    const results = buildFileOpenResults(
      [
        catalogEntry({
          sourcePath: 'sessions/2026-06-22/shaping/mock-engine-plan.md',
          title: 'Mock Engine Plan',
          searchableText: 'mock engine plan sessions/2026-06-22/shaping/mock-engine-plan.md'
        }),
        catalogEntry({
          sourcePath: 'docs/overview.md',
          title: 'Overview',
          searchableText: 'overview docs/overview.md'
        })
      ],
      'mock plan'
    )

    expect(results.map((result) => result.sourcePath)).toEqual([
      'sessions/2026-06-22/shaping/mock-engine-plan.md'
    ])
  })

  it('sorts empty queries by most recently modified files', () => {
    const results = buildFileOpenResults(
      [
        catalogEntry({ sourcePath: 'docs/old.md', title: 'Old', modifiedAtMs: 1 }),
        catalogEntry({ sourcePath: 'docs/new.md', title: 'New', modifiedAtMs: 3 }),
        catalogEntry({ sourcePath: 'docs/middle.md', title: 'Middle', modifiedAtMs: 2 })
      ],
      ''
    )

    expect(results.map((result) => result.sourcePath)).toEqual([
      'docs/new.md',
      'docs/middle.md',
      'docs/old.md'
    ])
  })

  it('prioritizes title matches before path-only matches', () => {
    const results = buildFileOpenResults(
      [
        catalogEntry({
          sourcePath: 'docs/mock.md',
          title: 'Reference',
          searchableText: 'reference docs/mock.md',
          modifiedAtMs: 10
        }),
        catalogEntry({
          sourcePath: 'docs/plan.md',
          title: 'Mock Plan',
          searchableText: 'mock plan docs/plan.md',
          modifiedAtMs: 1
        })
      ],
      'mock'
    )

    expect(results[0]?.sourcePath).toBe('docs/plan.md')
  })
})

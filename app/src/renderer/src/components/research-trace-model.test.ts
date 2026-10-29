import { describe, expect, it } from 'vitest'

import {
  formatGeneratedAt,
  formatThoughtFor,
  freshnessNoticeCopy,
  liveTraceLines,
  newestSourcePaths,
  savedSummaryLines,
  summaryBuildLines
} from './research-trace-model'
import type { StructuredAnswer } from '../../../shared/answer-sections'
import type { SearchCitation, SearchSource, SearchStage } from '../../../preload/index'

function source(sourcePath: string, index: number): SearchSource {
  return {
    index,
    sourcePath,
    headingPath: [],
    preview: '',
    matchCount: 1,
    retrievalMode: 'keyword'
  }
}

const citations: SearchCitation[] = [
  { index: 1, sourcePath: 'a.md', headingPath: [] },
  { index: 2, sourcePath: 'b.md', headingPath: [] }
]

describe('live trace lines', () => {
  const texts = (
    stage: SearchStage | null,
    fileCount = 8,
    newestTitles: string[] = ['Design Tri', 'Beacon Plan']
  ): string[] =>
    liveTraceLines({ stage, query: 'jira plans', fileCount, newestTitles }).map((line) => line.text)

  it('starts with one line and adds a plain-language line for each thing that has happened', () => {
    expect(texts(null, 0, [])).toEqual(['Looking through your notes for “jira plans”'])
    expect(texts('gathering-evidence')).toEqual([
      'Looking through your notes for “jira plans”',
      'Found related notes in 8 files',
      'Starting with the newest notes, “Design Tri” and “Beacon Plan”',
      'Picking out the most useful parts of each note'
    ])
    expect(texts('writing-summary').at(-1)).toBe('Writing a short summary of what your notes say')
  })

  it('does not claim files or newest notes before the local search reports them', () => {
    expect(texts('searching-local', 0, [])).toHaveLength(1)
  })

  it('phrases one, two and three newest notes naturally', () => {
    expect(texts('searching-local', 3, ['A'])[2]).toBe('Starting with the newest note, “A”')
    expect(texts('searching-local', 3, ['A', 'B', 'C'])[2]).toBe(
      'Starting with the newest notes, “A”, “B” and “C”'
    )
  })

  it('keeps stable ids so a line is revealed once', () => {
    const ids = liveTraceLines({
      stage: 'writing-summary',
      query: 'q',
      fileCount: 2,
      newestTitles: ['A']
    }).map((line) => line.id)
    expect(ids).toEqual(['search', 'found', 'newest', 'gather', 'write'])
  })

  it('never mentions technical or model details', () => {
    expect(texts('writing-summary').join(' ')).not.toMatch(
      /gpt|claude|model|chunk|embedding|index|token/i
    )
  })
})

describe('summary build lines', () => {
  const structured = (tldr: string, titles: string[] = []): StructuredAnswer => ({
    tldr,
    sections: titles.map((title) => ({ title, body: '' }))
  })
  const texts = (lines: Array<{ text: string }>): string[] => lines.map((line) => line.text)

  it('has nothing to say before any text is written', () => {
    expect(
      summaryBuildLines({ structured: null, hasText: false, currentSourceTitle: null })
    ).toEqual([])
  })

  it('adds a line for the overview and one for each area as it begins', () => {
    expect(
      texts(
        summaryBuildLines({
          structured: structured('Overview text', ['Sharing flags', 'Review and PR prep']),
          hasText: true,
          currentSourceTitle: null
        })
      )
    ).toEqual([
      'Writing the short overview',
      'Writing about “Sharing flags”',
      'Writing about “Review and PR prep”'
    ])
  })

  it('names the note the current passage draws on, on the last line only', () => {
    const lines = summaryBuildLines({
      structured: structured('Overview', ['Sharing flags']),
      hasText: true,
      currentSourceTitle: 'Beacon flag sharing'
    })
    expect(texts(lines)).toEqual([
      'Writing the short overview',
      'Writing about “Sharing flags”, drawing on “Beacon flag sharing”'
    ])
  })

  it('falls back to one line for an answer without the usual shape', () => {
    expect(
      texts(summaryBuildLines({ structured: null, hasText: true, currentSourceTitle: null }))
    ).toEqual(['Writing the summary'])
  })

  it('keeps stable ids so a line is added once and then updated in place', () => {
    const early = summaryBuildLines({
      structured: structured('Overview'),
      hasText: true,
      currentSourceTitle: null
    })
    const later = summaryBuildLines({
      structured: structured('Overview', ['One']),
      hasText: true,
      currentSourceTitle: null
    })
    expect(early[0].id).toBe(later[0].id)
  })
})

describe('newestSourcePaths', () => {
  it('returns the newest dated notes first, one per file', () => {
    const sources = [
      source('sessions/2026-06-12/a.md', 1),
      source('sessions/2026-10-19/b.md', 2),
      source('sessions/2026-10-19/b.md', 3),
      source('undated.md', 4),
      source('sessions/2026-10-05/c.md', 5),
      source('sessions/2026-01-01/d.md', 6)
    ]
    expect(newestSourcePaths(sources, 3)).toEqual([
      'sessions/2026-10-19/b.md',
      'sessions/2026-10-05/c.md',
      'sessions/2026-06-12/a.md'
    ])
  })

  it('returns nothing when no note is dated', () => {
    expect(newestSourcePaths([source('a.md', 1)])).toEqual([])
  })
})

describe('saved summary lines', () => {
  it('describes what a restored summary was built from, with no invented timing', () => {
    const lines = savedSummaryLines({
      query: 'jira plans',
      sources: [source('a.md', 1), source('a.md', 2), source('b.md', 3)],
      citations
    })
    expect(lines.map((line) => line.text)).toEqual([
      'Looked through your notes for “jira plans”',
      'Found related notes in 2 files',
      'Wrote a short summary using 2 notes'
    ])
    expect(lines.every((line) => line.state === 'done')).toBe(true)
  })

  it('counts a note once however many passages are cited', () => {
    const lines = savedSummaryLines({
      query: 'q',
      sources: [source('a.md', 1)],
      citations: [
        { index: 1, sourcePath: 'a.md', headingPath: [] },
        { index: 2, sourcePath: 'a.md', headingPath: [] }
      ]
    })
    expect(lines.map((line) => line.text)).toContain('Wrote a short summary using 1 note')
  })
})

describe('thought duration', () => {
  it('is never shorter than a second and switches to minutes', () => {
    expect(formatThoughtFor(200)).toBe('Thought for 1s')
    expect(formatThoughtFor(6_400)).toBe('Thought for 6s')
    expect(formatThoughtFor(68_000)).toBe('Thought for 1m 8s')
  })
})

describe('freshness notice copy', () => {
  it('states when the summary was generated and how many relevant newer files exist', () => {
    const copy = freshnessNoticeCopy(Date.UTC(2026, 9, 23, 21, 19), 3, 'en-US', 'America/New_York')
    expect(copy.generated).toMatch(/^October 23, 2026,? (at )?5:19 PM EDT$/)
    expect(copy.question).toBe('3 relevant files may affect it. Update the summary?')
  })

  it('omits the count when it is unknown or one file', () => {
    expect(freshnessNoticeCopy(0, 0, 'en-US', 'UTC').question).toBe('Update the summary?')
    expect(freshnessNoticeCopy(0, 1, 'en-US', 'UTC').question).toBe(
      '1 relevant file may affect it. Update the summary?'
    )
  })

  it('formats the generated time in the given zone', () => {
    expect(formatGeneratedAt(Date.UTC(2026, 9, 23, 21, 19), 'en-US', 'UTC')).toContain('9:19 PM')
  })
})

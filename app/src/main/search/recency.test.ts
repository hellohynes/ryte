import { describe, expect, it } from 'vitest'

import { rankByRecency, recencyWeight } from './recency'
import type { StoredChunkRow } from '../indexing/vector-store'

const NOW = Date.UTC(2026, 9, 24)

function row(sourcePath: string, date: string | null, text = sourcePath): StoredChunkRow {
  return { sourcePath, headingPath: [], date, text }
}

describe('recencyWeight', () => {
  it('halves roughly every quarter and never drops below the floor', () => {
    expect(recencyWeight('2026-10-24', NOW)).toBeCloseTo(1, 2)
    expect(recencyWeight('2026-07-26', NOW)).toBeCloseTo(0.5, 1)
    expect(recencyWeight('2020-01-01', NOW)).toBe(0.3)
  })

  it('treats undated or unparseable notes as neither new nor old', () => {
    expect(recencyWeight(null, NOW)).toBe(0.6)
    expect(recencyWeight('not-a-date', NOW)).toBe(0.6)
  })

  it('does not reward dates in the future', () => {
    expect(recencyWeight('2027-01-01', NOW)).toBe(1)
  })
})

describe('rankByRecency', () => {
  it('lets a newer note outrank an older note of similar relevance', () => {
    const ranked = rankByRecency([row('old.md', '2025-01-10'), row('new.md', '2026-10-20')], NOW)
    expect(ranked.map((item) => item.sourcePath)).toEqual(['new.md', 'old.md'])
  })

  it('keeps a far more relevant old note ahead of a barely relevant new one', () => {
    const rows = [
      row('best-old.md', '2026-04-24'),
      ...Array.from({ length: 30 }, (_, i) => row(`filler-${i}.md`, '2026-04-24')),
      row('weak-new.md', '2026-10-23')
    ]
    const ranked = rankByRecency(rows, NOW)
    expect(ranked.findIndex((item) => item.sourcePath === 'best-old.md')).toBeLessThan(
      ranked.findIndex((item) => item.sourcePath === 'weak-new.md')
    )
  })

  it('keeps all chunks of a document together in their original order', () => {
    const ranked = rankByRecency(
      [
        row('a.md', '2025-01-01', 'a1'),
        row('b.md', '2026-10-20', 'b1'),
        row('a.md', '2025-01-01', 'a2')
      ],
      NOW
    )
    expect(ranked.map((item) => item.text)).toEqual(['b1', 'a1', 'a2'])
  })

  it('leaves relevance order untouched when nothing has a date', () => {
    const rows = [row('x.md', null), row('y.md', null), row('z.md', null)]
    expect(rankByRecency(rows, NOW).map((item) => item.sourcePath)).toEqual([
      'x.md',
      'y.md',
      'z.md'
    ])
  })
})

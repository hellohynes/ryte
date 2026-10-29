import { describe, expect, it } from 'vitest'

import { buildEvidenceBundle } from './evidence-bundle'
import type { StoredChunkRow } from '../indexing/vector-store'

function row(sourcePath: string, text: string): StoredChunkRow {
  return { sourcePath, text, headingPath: [], date: null }
}

describe('buildEvidenceBundle', () => {
  it('selects one chunk from each high-ranked document before repeating a document', () => {
    const bundle = buildEvidenceBundle(
      [
        row('a.md', 'a1'),
        row('a.md', 'a2'),
        row('a.md', 'a3'),
        row('b.md', 'b1'),
        row('c.md', 'c1')
      ],
      3,
      5
    )

    expect(bundle.map((item) => item.text)).toEqual(['a1', 'b1', 'c1', 'a2', 'a3'])
  })

  it('bounds both the number of documents and chunks', () => {
    const bundle = buildEvidenceBundle(
      [row('a.md', 'a1'), row('b.md', 'b1'), row('c.md', 'c1')],
      2,
      2
    )

    expect(bundle.map((item) => item.sourcePath)).toEqual(['a.md', 'b.md'])
  })
})

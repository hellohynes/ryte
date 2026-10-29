import { describe, expect, it } from 'vitest'

import { buildFtsMatchQuery } from './fts-query'

describe('buildFtsMatchQuery', () => {
  it('turns natural-language search text into a safe FTS5 OR query', () => {
    expect(buildFtsMatchQuery('give me current Dialtone Next / Dialtone 10 statuses')).toBe(
      '"current" OR "dialtone" OR "next" OR "10" OR "statuses" OR "status"'
    )
  })

  it('removes punctuation and bare FTS operators', () => {
    expect(buildFtsMatchQuery('alpha NEAR beta -gamma / delta')).toBe(
      '"alpha" OR "near" OR "beta" OR "gamma" OR "delta"'
    )
  })

  it('returns null when no searchable terms remain', () => {
    expect(buildFtsMatchQuery('give me the')).toBeNull()
  })
})

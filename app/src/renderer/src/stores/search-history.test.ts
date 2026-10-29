import { describe, expect, it } from 'vitest'

import {
  clearSavedSearchHistory,
  loadSearchHistory,
  normalizeSearchHistory,
  normalizeSearchQuery,
  recentSearches,
  saveSearchHistory,
  SEARCH_HISTORY_LIMIT,
  SEARCH_HISTORY_STORAGE_KEY,
  SEARCH_RECENT_LIMIT,
  upsertSearchHistory,
  type HistoryEntry
} from './search-history'

class MemoryStorage {
  private readonly items = new Map<string, string>()

  getItem(key: string): string | null {
    return this.items.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.items.set(key, value)
  }

  removeItem(key: string): void {
    this.items.delete(key)
  }
}

function entry(index: number): HistoryEntry {
  return {
    id: `snapshot-${index}`,
    query: `query ${index}`,
    answer: `answer ${index}`,
    sources: [
      {
        index: 1,
        sourcePath: `source-${index}.md`,
        headingPath: ['Heading'],
        preview: `preview ${index}`,
        matchCount: 1,
        retrievalMode: 'keyword'
      }
    ],
    citations: [{ index: 1, sourcePath: `source-${index}.md`, headingPath: ['Heading'] }],
    timestamp: index,
    answerModel: 'gpt-6-luna',
    retrievalMode: 'auto'
  }
}

function entryWithoutSourcePreviews(index: number): HistoryEntry {
  return {
    ...entry(index),
    sources: entry(index).sources.map((source) => ({ ...source, preview: '' }))
  }
}

describe('search history persistence', () => {
  it('saves and loads valid history entries', () => {
    const storage = new MemoryStorage()
    const options = { retention: 'forever' as const, includeAnswers: false }
    saveSearchHistory([entry(1)], storage, options)
    expect(loadSearchHistory(storage, options)).toEqual([
      { ...entry(1), answer: '', sources: [], citations: [] }
    ])
  })

  it('can opt into saving answers and citations locally', () => {
    const storage = new MemoryStorage()
    const options = { retention: '30-days' as const, includeAnswers: true, now: 100 }
    saveSearchHistory([entry(1)], storage, options)
    expect(loadSearchHistory(storage, options)).toEqual([entryWithoutSourcePreviews(1)])
  })

  it('migrates legacy snapshots to a stable local ID and default retrieval mode', () => {
    const legacy = entry(1) as Partial<HistoryEntry>
    delete legacy.id
    delete legacy.answerModel
    delete legacy.retrievalMode

    expect(
      normalizeSearchHistory([legacy], { retention: 'forever', includeAnswers: true })
    ).toEqual([
      {
        ...entryWithoutSourcePreviews(1),
        id: 'legacy-1-query 1',
        answerModel: null,
        retrievalMode: 'auto'
      }
    ])
  })

  it('caps persisted history to the retention limit', () => {
    const storage = new MemoryStorage()
    const options = { retention: 'forever' as const, includeAnswers: false }
    saveSearchHistory(
      Array.from({ length: SEARCH_HISTORY_LIMIT + 5 }, (_, index) => entry(index)),
      storage,
      options
    )
    expect(loadSearchHistory(storage, options)).toHaveLength(SEARCH_HISTORY_LIMIT)
  })

  it('drops malformed entries when normalizing history', () => {
    expect(
      normalizeSearchHistory([entry(1), { query: 'missing fields' }, null], {
        retention: 'forever',
        includeAnswers: false
      })
    ).toEqual([{ ...entry(1), answer: '', sources: [], citations: [] }])
  })

  it('returns empty history for invalid JSON', () => {
    const storage = new MemoryStorage()
    storage.setItem(SEARCH_HISTORY_STORAGE_KEY, '{bad json')
    expect(loadSearchHistory(storage)).toEqual([])
  })

  it('clears saved history', () => {
    const storage = new MemoryStorage()
    saveSearchHistory([entry(1)], storage)
    clearSavedSearchHistory(storage)
    expect(loadSearchHistory(storage)).toEqual([])
  })

  it('drops persisted history when retention is off or session-only', () => {
    const storage = new MemoryStorage()
    saveSearchHistory([entry(1)], storage, { retention: 'off', includeAnswers: false })
    expect(storage.getItem(SEARCH_HISTORY_STORAGE_KEY)).toBeNull()

    storage.setItem(SEARCH_HISTORY_STORAGE_KEY, JSON.stringify([entry(1)]))
    expect(loadSearchHistory(storage, { retention: 'session', includeAnswers: false })).toEqual([])
    expect(storage.getItem(SEARCH_HISTORY_STORAGE_KEY)).toBeNull()
  })

  it('keeps one row per normalized query, newest first', () => {
    const older = { ...entry(1), query: 'Jira   plans', timestamp: 1 }
    const newer = { ...entry(2), query: ' jira plans ', timestamp: 2 }
    expect(
      normalizeSearchHistory([newer, entry(3), older], {
        retention: 'forever',
        includeAnswers: true
      }).map((item) => item.id)
    ).toEqual(['snapshot-2', 'snapshot-3'])
  })

  it('prunes entries outside the retention window', () => {
    const day = 24 * 60 * 60 * 1000
    expect(
      normalizeSearchHistory([entry(10 * day), entry(1)], {
        retention: '7-days',
        includeAnswers: true,
        now: 10 * day
      })
    ).toEqual([entryWithoutSourcePreviews(10 * day)])
  })
})

describe('search history rows', () => {
  it('normalizes case, edge and repeated whitespace', () => {
    expect(normalizeSearchQuery('  Jira \n  PLANS ')).toBe('jira plans')
  })

  it('moves a repeated query to the top instead of duplicating it', () => {
    const history = [entry(3), { ...entry(2), query: 'Jira plans' }, entry(1)]
    const next = upsertSearchHistory(history, { ...entry(9), query: 'jira  plans' })
    expect(next.map((item) => item.id)).toEqual(['snapshot-9', 'snapshot-3', 'snapshot-1'])
  })

  it('keeps a saved answer when the new run produced no answer', () => {
    const saved = { ...entry(2), query: 'jira plans' }
    const localOnly = { ...entry(9), query: 'jira plans', answer: '', sources: [], citations: [] }
    const next = upsertSearchHistory([entry(3), saved], localOnly)
    expect(next.map((item) => item.id)).toEqual(['snapshot-2', 'snapshot-3'])
  })

  it('replaces the saved snapshot when the new run produced an answer', () => {
    const saved = { ...entry(2), query: 'jira plans' }
    const next = upsertSearchHistory([saved], { ...entry(9), query: 'jira plans' })
    expect(next).toHaveLength(1)
    expect(next[0].answer).toBe('answer 9')
  })

  it('caps stored rows at the history limit', () => {
    const history = Array.from({ length: SEARCH_HISTORY_LIMIT }, (_, index) => entry(index))
    expect(upsertSearchHistory(history, entry(999))).toHaveLength(SEARCH_HISTORY_LIMIT)
  })

  it('shows ten recent searches while Recent files is not shipped', () => {
    const history = Array.from({ length: SEARCH_HISTORY_LIMIT }, (_, index) => entry(index))
    expect(recentSearches(history)).toHaveLength(SEARCH_RECENT_LIMIT)
    expect(SEARCH_RECENT_LIMIT).toBe(10)
  })
})

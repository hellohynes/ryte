import type { SearchCitation, SearchRetrievalMode, SearchSource } from '../../../preload/index'
import type { SearchHistoryRetention } from '../../../main/settings/settings-store'

export const SEARCH_HISTORY_LIMIT = 25
export const SEARCH_RECENT_LIMIT = 10
export const SEARCH_HISTORY_STORAGE_KEY = 'ryte.search.history.v1'

export interface HistoryEntry {
  id: string
  query: string
  answer: string
  sources: SearchSource[]
  citations: SearchCitation[]
  timestamp: number
  answerModel: string | null
  retrievalMode: SearchRetrievalMode
}

interface SearchHistoryStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface SearchHistoryOptions {
  retention: SearchHistoryRetention
  includeAnswers: boolean
  now?: number
}

const DEFAULT_HISTORY_OPTIONS: SearchHistoryOptions = {
  retention: '30-days',
  includeAnswers: false
}

function retentionCutoff(options: SearchHistoryOptions): number | null {
  const now = options.now ?? Date.now()
  if (options.retention === '7-days') return now - 7 * 24 * 60 * 60 * 1000
  if (options.retention === '30-days') return now - 30 * 24 * 60 * 60 * 1000
  return null
}

function sanitizeHistoryEntry(entry: HistoryEntry, options: SearchHistoryOptions): HistoryEntry {
  const sources = entry.sources.map((source) => ({
    ...source,
    preview: '',
    matchCount: source.matchCount ?? 0,
    retrievalMode: source.retrievalMode ?? 'keyword',
    index: source.index ?? 0
  }))

  const normalized = {
    ...entry,
    id: entry.id || `legacy-${entry.timestamp}-${entry.query}`,
    answerModel: entry.answerModel ?? null,
    retrievalMode: entry.retrievalMode ?? 'auto',
    sources
  }

  if (options.includeAnswers) return normalized
  return {
    ...normalized,
    answer: '',
    sources: [],
    citations: []
  }
}

export function hasSavedSearchSnapshot(entry: HistoryEntry): boolean {
  return entry.answer.length > 0 && entry.sources.length > 0
}

/** Identity of a history row: casing and whitespace never create a second row. */
export function normalizeSearchQuery(query: string): string {
  return query.trim().replace(/\s+/g, ' ').toLowerCase()
}

function dedupeByQuery(history: HistoryEntry[]): HistoryEntry[] {
  const seen = new Set<string>()
  return history.filter((entry) => {
    const key = normalizeSearchQuery(entry.query)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Moves the completed run's query to the top and replaces its row. A run without an answer
 * (local-only, no provider) never overwrites an answer snapshot that is already saved.
 */
export function upsertSearchHistory(history: HistoryEntry[], entry: HistoryEntry): HistoryEntry[] {
  const key = normalizeSearchQuery(entry.query)
  const existing = history.find((item) => normalizeSearchQuery(item.query) === key)
  const keepExisting =
    existing && hasSavedSearchSnapshot(existing) && !hasSavedSearchSnapshot(entry)
  const next = keepExisting ? existing : entry
  const others = history.filter((item) => normalizeSearchQuery(item.query) !== key)
  return [next, ...others].slice(0, SEARCH_HISTORY_LIMIT)
}

/** Idle rows shown until a Recent files section exists. */
export function recentSearches(history: HistoryEntry[]): HistoryEntry[] {
  return history.slice(0, SEARCH_RECENT_LIMIT)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isSource(value: unknown): value is SearchSource {
  if (!value || typeof value !== 'object') return false
  const source = value as Partial<SearchSource>
  return (
    typeof source.sourcePath === 'string' &&
    isStringArray(source.headingPath) &&
    (source.index === undefined || typeof source.index === 'number') &&
    (source.preview === undefined || typeof source.preview === 'string') &&
    (source.matchCount === undefined ||
      (typeof source.matchCount === 'number' &&
        Number.isInteger(source.matchCount) &&
        source.matchCount >= 0)) &&
    (source.retrievalMode === undefined ||
      source.retrievalMode === 'keyword' ||
      source.retrievalMode === 'hybrid')
  )
}

function isCitation(value: unknown): value is SearchCitation {
  if (!value || typeof value !== 'object') return false
  const citation = value as Partial<SearchCitation>
  return (
    typeof citation.index === 'number' &&
    Number.isInteger(citation.index) &&
    citation.index > 0 &&
    typeof citation.sourcePath === 'string' &&
    isStringArray(citation.headingPath)
  )
}

function isHistoryEntry(value: unknown): value is HistoryEntry {
  if (!value || typeof value !== 'object') return false
  const entry = value as Partial<HistoryEntry>
  return (
    typeof entry.query === 'string' &&
    typeof entry.answer === 'string' &&
    Array.isArray(entry.sources) &&
    entry.sources.every(isSource) &&
    Array.isArray(entry.citations) &&
    entry.citations.every(isCitation) &&
    typeof entry.timestamp === 'number' &&
    Number.isFinite(entry.timestamp) &&
    (entry.id === undefined || typeof entry.id === 'string') &&
    (entry.answerModel === undefined ||
      entry.answerModel === null ||
      typeof entry.answerModel === 'string') &&
    (entry.retrievalMode === undefined ||
      entry.retrievalMode === 'auto' ||
      entry.retrievalMode === 'keyword' ||
      entry.retrievalMode === 'hybrid')
  )
}

export function normalizeSearchHistory(
  value: unknown,
  options: SearchHistoryOptions = DEFAULT_HISTORY_OPTIONS
): HistoryEntry[] {
  if (!Array.isArray(value)) return []
  if (options.retention === 'off' || options.retention === 'session') return []
  const cutoff = retentionCutoff(options)
  return dedupeByQuery(
    value
      .filter(isHistoryEntry)
      .filter((entry) => cutoff === null || entry.timestamp >= cutoff)
      .map((entry) => sanitizeHistoryEntry(entry, options))
  ).slice(0, SEARCH_HISTORY_LIMIT)
}

function browserStorage(): SearchHistoryStorage | null {
  return typeof window === 'undefined' ? null : window.localStorage
}

export function loadSearchHistory(
  storage: SearchHistoryStorage | null = browserStorage(),
  options: SearchHistoryOptions = DEFAULT_HISTORY_OPTIONS
): HistoryEntry[] {
  if (!storage) return []
  if (options.retention === 'off' || options.retention === 'session') {
    clearSavedSearchHistory(storage)
    return []
  }
  try {
    return normalizeSearchHistory(
      JSON.parse(storage.getItem(SEARCH_HISTORY_STORAGE_KEY) ?? '[]'),
      options
    )
  } catch {
    return []
  }
}

export function saveSearchHistory(
  history: HistoryEntry[],
  storage: SearchHistoryStorage | null = browserStorage(),
  options: SearchHistoryOptions = DEFAULT_HISTORY_OPTIONS
): void {
  if (!storage) return
  if (options.retention === 'off' || options.retention === 'session') {
    clearSavedSearchHistory(storage)
    return
  }
  try {
    storage.setItem(
      SEARCH_HISTORY_STORAGE_KEY,
      JSON.stringify(normalizeSearchHistory(history, options))
    )
  } catch {
    // Search history is convenience state. Storage failures should not break search.
  }
}

export function clearSavedSearchHistory(
  storage: SearchHistoryStorage | null = browserStorage()
): void {
  if (!storage) return
  try {
    storage.removeItem(SEARCH_HISTORY_STORAGE_KEY)
  } catch {
    // Search history is convenience state. Storage failures should not break search.
  }
}

import type { SearchOptions, SearchSnapshotFreshnessInput } from './search/search-service'
import { MAX_PATH_LENGTH } from '../shared/source-path'

const MAX_QUERY_LENGTH = 2000
const REQUEST_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function assertValidRequestId(value: unknown): string {
  if (typeof value !== 'string' || !REQUEST_ID_RE.test(value)) {
    throw new Error('Invalid request id')
  }
  return value
}

export function assertValidSearchQuery(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Invalid search query')
  const query = value.trim()
  if (query.length === 0 || query.length > MAX_QUERY_LENGTH) {
    throw new Error('Invalid search query')
  }
  return query
}

function isSearchRetrievalMode(
  value: unknown
): value is NonNullable<SearchOptions['retrievalMode']> {
  return value === 'auto' || value === 'keyword' || value === 'hybrid'
}

function isSearchAnswerMode(value: unknown): value is NonNullable<SearchOptions['answerMode']> {
  return value === 'settings' || value === 'local-only'
}

export function assertValidSearchOptions(value: unknown): SearchOptions {
  if (value === undefined || value === null) return {}
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid search options')
  }
  const input = value as Record<string, unknown>
  for (const key of Object.keys(input)) {
    if (key !== 'retrievalMode' && key !== 'answerMode') {
      throw new Error(`Invalid search option: ${key}`)
    }
  }
  const options: SearchOptions = {}
  if ('retrievalMode' in input) {
    if (!isSearchRetrievalMode(input.retrievalMode)) throw new Error('Invalid retrieval mode')
    options.retrievalMode = input.retrievalMode
  }
  if ('answerMode' in input) {
    if (!isSearchAnswerMode(input.answerMode)) throw new Error('Invalid answer mode')
    options.answerMode = input.answerMode
  }
  return options
}

export function assertValidSearchSnapshotFreshnessInput(
  value: unknown
): SearchSnapshotFreshnessInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid search snapshot freshness input')
  }
  const input = value as Record<string, unknown>
  for (const key of Object.keys(input)) {
    if (
      key !== 'query' &&
      key !== 'retrievalMode' &&
      key !== 'generatedAt' &&
      key !== 'sourcePaths'
    ) {
      throw new Error(`Invalid search snapshot freshness key: ${key}`)
    }
  }
  if (!isSearchRetrievalMode(input.retrievalMode)) throw new Error('Invalid retrieval mode')
  const generatedAt = assertFiniteNumber(input.generatedAt, 'snapshot generated time')
  if (generatedAt < 0) throw new Error('Invalid snapshot generated time')
  if (!Array.isArray(input.sourcePaths) || input.sourcePaths.length > 100) {
    throw new Error('Invalid snapshot source paths')
  }
  if (
    !input.sourcePaths.every(
      (path) => typeof path === 'string' && path.length > 0 && path.length <= MAX_PATH_LENGTH
    )
  ) {
    throw new Error('Invalid snapshot source paths')
  }
  return {
    query: assertValidSearchQuery(input.query),
    retrievalMode: input.retrievalMode,
    generatedAt,
    sourcePaths: [...new Set(input.sourcePaths)]
  }
}

function assertFiniteNumber(value: unknown, key: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Invalid ${key}`)
  }
  return value
}

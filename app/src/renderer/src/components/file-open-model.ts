import type { FileCatalogEntry } from '../../../shared/files'

export interface FileOpenResult {
  sourcePath: string
  title: string
  modifiedAtMs: number
}

const DEFAULT_OPEN_RESULT_LIMIT = 40
const QUERY_TOKEN_RE = /[a-z0-9]+/g

function normalizeTokens(value: string): string[] {
  return value.toLowerCase().match(QUERY_TOKEN_RE) ?? []
}

function fileTitle(file: FileCatalogEntry): string {
  return file.title.trim() || file.sourcePath
}

function scoreFile(file: FileCatalogEntry, queryTokens: string[]): number {
  if (queryTokens.length === 0) return 0

  const title = fileTitle(file).toLowerCase()
  const sourcePath = file.sourcePath.toLowerCase()
  let score = 0

  for (const token of queryTokens) {
    if (title === token) score += 100
    else if (title.startsWith(token)) score += 60
    else if (title.includes(token)) score += 30

    if (sourcePath === token) score += 80
    else if (sourcePath.startsWith(token)) score += 45
    else if (sourcePath.includes(token)) score += 20
  }

  return score
}

function matchesQuery(file: FileCatalogEntry, queryTokens: string[]): boolean {
  if (queryTokens.length === 0) return true

  const searchableText = file.searchableText.toLowerCase()
  const sourcePath = file.sourcePath.toLowerCase()
  const title = fileTitle(file).toLowerCase()

  return queryTokens.every(
    (token) => searchableText.includes(token) || sourcePath.includes(token) || title.includes(token)
  )
}

export function buildFileOpenResults(
  files: FileCatalogEntry[],
  query: string,
  limit = DEFAULT_OPEN_RESULT_LIMIT
): FileOpenResult[] {
  const queryTokens = normalizeTokens(query)

  return files
    .filter((file) => matchesQuery(file, queryTokens))
    .map((file) => ({
      sourcePath: file.sourcePath,
      title: fileTitle(file),
      modifiedAtMs: file.modifiedAtMs,
      score: scoreFile(file, queryTokens)
    }))
    .sort((left, right) => {
      if (left.score !== right.score) return right.score - left.score
      if (left.modifiedAtMs !== right.modifiedAtMs) return right.modifiedAtMs - left.modifiedAtMs
      return left.sourcePath.localeCompare(right.sourcePath)
    })
    .slice(0, limit)
    .map((result) => ({
      sourcePath: result.sourcePath,
      title: result.title,
      modifiedAtMs: result.modifiedAtMs
    }))
}

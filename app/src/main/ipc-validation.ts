import { extname, isAbsolute } from 'node:path'

import type { SearchOptions, SearchSnapshotFreshnessInput } from './search/search-service'
import type { FileRenameInput } from '../shared/files'
import {
  MAX_PATH_LENGTH,
  normalizeWorkspaceExternalPath,
  normalizeWorkspaceSourcePath
} from '../shared/source-path'
import type {
  WorkspaceFileRef,
  WorkspaceOpenFileInput,
  WorkspaceOpenRecentFileInput,
  WorkspaceRecordRecentInput,
  WorkspaceTabFileInput
} from '../shared/workspace'

const MAX_FILE_NAME_LENGTH = 255
const MAX_QUERY_LENGTH = 2000
const MAX_TAB_ID_LENGTH = 200
const REQUEST_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const WORKSPACE_TAB_ID_RE = /^[A-Za-z0-9][A-Za-z0-9:_.-]{0,199}$/

export function assertValidRequestId(value: unknown): string {
  if (typeof value !== 'string' || !REQUEST_ID_RE.test(value)) {
    throw new Error('Invalid request id')
  }
  return value
}

export function assertValidAbsolutePath(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_PATH_LENGTH ||
    !isAbsolute(value)
  ) {
    throw new Error('Invalid file path')
  }
  return value
}

function assertObjectWithKeys(
  value: unknown,
  allowedKeys: readonly string[],
  label: string
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid ${label}`)
  }
  const input = value as Record<string, unknown>
  for (const key of Object.keys(input)) {
    if (!allowedKeys.includes(key)) throw new Error(`Invalid ${label} key: ${key}`)
  }
  return input
}

function assertValidWorkspaceSourcePath(value: unknown): string {
  return normalizeWorkspaceSourcePath(value)
}

function assertValidFileName(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_FILE_NAME_LENGTH ||
    value === '.' ||
    value === '..' ||
    value.includes('/') ||
    value.includes('\\') ||
    value.includes('\0') ||
    extname(value).toLowerCase() !== '.md'
  ) {
    throw new Error('Invalid file name')
  }
  return value
}

function assertValidWorkspaceExternalPath(value: unknown): string {
  return normalizeWorkspaceExternalPath(value)
}

function assertValidWorkspaceTabId(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_TAB_ID_LENGTH ||
    value.includes('\0') ||
    !WORKSPACE_TAB_ID_RE.test(value)
  ) {
    throw new Error('Invalid workspace tab id')
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

export function assertValidWorkspaceOpenFileInput(value: unknown): WorkspaceOpenFileInput {
  const input = assertObjectWithKeys(value, ['sourcePath'], 'workspace open file input')
  return {
    sourcePath: assertValidWorkspaceSourcePath(input.sourcePath)
  }
}

export function assertValidWorkspaceFileRefInput(value: unknown): WorkspaceFileRef {
  const input = assertObjectWithKeys(
    value,
    ['sourcePath', 'externalPath'],
    'workspace file reference'
  )
  const hasSourcePath = input.sourcePath !== undefined
  const hasExternalPath = input.externalPath !== undefined

  if (hasSourcePath === hasExternalPath) {
    throw new Error('Invalid workspace file reference')
  }

  return hasSourcePath
    ? { sourcePath: assertValidWorkspaceSourcePath(input.sourcePath) }
    : { externalPath: assertValidWorkspaceExternalPath(input.externalPath) }
}

export function assertValidFileRenameInput(value: unknown): FileRenameInput {
  const input = assertObjectWithKeys(
    value,
    ['sourcePath', 'externalPath', 'name'],
    'file rename input'
  )
  const file = assertValidWorkspaceFileRefInput({
    ...(input.sourcePath !== undefined ? { sourcePath: input.sourcePath } : {}),
    ...(input.externalPath !== undefined ? { externalPath: input.externalPath } : {})
  })
  return {
    ...file,
    name: assertValidFileName(input.name)
  }
}

export function assertValidWorkspaceOpenRecentFileInput(
  value: unknown
): WorkspaceOpenRecentFileInput {
  return assertValidWorkspaceFileRefInput(value)
}

export function assertValidWorkspaceTabFileInput(value: unknown): WorkspaceTabFileInput {
  const input = assertObjectWithKeys(value, ['tabId'], 'workspace tab file input')
  return {
    tabId: assertValidWorkspaceTabId(input.tabId)
  }
}

export function assertValidSourceFileInput(value: unknown): WorkspaceOpenFileInput {
  const input = assertObjectWithKeys(value, ['sourcePath'], 'source file input')
  return {
    sourcePath: assertValidWorkspaceSourcePath(input.sourcePath)
  }
}

export function assertValidWorkspaceRecordRecentInput(value: unknown): WorkspaceRecordRecentInput {
  const input = assertObjectWithKeys(value, ['sourcePath'], 'workspace recent input')
  return {
    sourcePath: assertValidWorkspaceSourcePath(input.sourcePath)
  }
}

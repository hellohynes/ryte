import { extname, isAbsolute, sep } from 'node:path'

import type { SearchOptions, SearchSnapshotFreshnessInput } from './search/search-service'
import type { FileRenameInput } from '../shared/files'
import {
  MAX_PATH_LENGTH,
  normalizeWorkspaceExternalPath,
  normalizeWorkspaceSourcePath
} from '../shared/source-path'
import type {
  WorkspaceCloseTabInput,
  WorkspaceFileRef,
  WorkspaceFolderSortMode,
  WorkspaceFocusTabInput,
  WorkspaceLibraryUpdate,
  WorkspaceOpenFileInput,
  WorkspaceOpenRecentFileInput,
  WorkspaceRecordRecentInput,
  WorkspaceSetOutlineCollapsedInput,
  WorkspaceSetOutlineWidthInput,
  WorkspaceShellUpdate,
  WorkspaceTabFileInput,
  WorkspaceUpdateTabViewModeInput,
  WorkspaceViewMode,
  WorkspaceWindowUpdate
} from '../shared/workspace'

const MAX_FILE_NAME_LENGTH = 255
const MAX_QUERY_LENGTH = 2000
const MAX_WINDOW_DIMENSION = 10000
const MAX_SIDEBAR_WIDTH = 4000
const MAX_DOCUMENT_OUTLINE_WIDTH = 1000
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

function assertValidWorkspaceTopLevelFolderPath(value: unknown): string {
  const sourcePath = assertValidWorkspaceSourcePath(value)
  if (sourcePath.includes(sep) || sourcePath.includes('/')) {
    throw new Error('Invalid workspace top-level folder path')
  }
  return sourcePath
}

function assertValidWorkspaceFolderSortMode(value: unknown): WorkspaceFolderSortMode {
  if (value !== 'az' && value !== 'za' && value !== 'recency') {
    throw new Error('Invalid workspace folder sort mode')
  }
  return value
}

function assertValidWorkspaceFolderSortModes(
  value: unknown
): Record<string, WorkspaceFolderSortMode> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid workspace folder sort modes')
  }

  const modes: Record<string, WorkspaceFolderSortMode> = {}
  for (const [folder, mode] of Object.entries(value)) {
    modes[assertValidWorkspaceTopLevelFolderPath(folder)] = assertValidWorkspaceFolderSortMode(mode)
  }
  return modes
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

function assertValidWorkspaceViewMode(value: unknown): WorkspaceViewMode {
  if (value !== 'preview' && value !== 'source') {
    throw new Error('Invalid workspace tab view mode')
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

function assertOptionalBoolean(value: unknown, key: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`Invalid ${key}`)
  return value
}

function assertFiniteNumber(value: unknown, key: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Invalid ${key}`)
  }
  return value
}

function assertValidWindowBounds(value: unknown): NonNullable<WorkspaceWindowUpdate['bounds']> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid window bounds')
  }
  const input = value as Record<string, unknown>
  const x = assertFiniteNumber(input.x, 'window x')
  const y = assertFiniteNumber(input.y, 'window y')
  const width = assertFiniteNumber(input.width, 'window width')
  const height = assertFiniteNumber(input.height, 'window height')
  if (width <= 0 || width > MAX_WINDOW_DIMENSION || height <= 0 || height > MAX_WINDOW_DIMENSION) {
    throw new Error('Invalid window bounds')
  }
  return { x, y, width, height }
}

export function assertValidWorkspaceShellPatch(value: unknown): WorkspaceShellUpdate {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid workspace shell patch')
  }
  const input = value as Record<string, unknown>
  for (const key of Object.keys(input)) {
    if (key !== 'sidebarCollapsed' && key !== 'sidebarWidth' && key !== 'activeSidebar') {
      throw new Error(`Invalid workspace shell key: ${key}`)
    }
  }
  const patch: WorkspaceShellUpdate = {}
  if ('sidebarCollapsed' in input) {
    patch.sidebarCollapsed = assertOptionalBoolean(input.sidebarCollapsed, 'sidebarCollapsed')
  }
  if ('sidebarWidth' in input) {
    const width = assertFiniteNumber(input.sidebarWidth, 'sidebarWidth')
    if (width <= 0 || width > MAX_SIDEBAR_WIDTH) throw new Error('Invalid sidebarWidth')
    patch.sidebarWidth = width
  }
  if ('activeSidebar' in input) {
    if (input.activeSidebar !== 'files') {
      throw new Error('Invalid activeSidebar')
    }
    patch.activeSidebar = input.activeSidebar
  }
  return patch
}

export function assertValidWorkspaceWindowPatch(value: unknown): WorkspaceWindowUpdate {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid workspace window patch')
  }
  const input = value as Record<string, unknown>
  for (const key of Object.keys(input)) {
    if (key !== 'bounds' && key !== 'maximized' && key !== 'fullscreen') {
      throw new Error(`Invalid workspace window key: ${key}`)
    }
  }
  const patch: WorkspaceWindowUpdate = {}
  if ('bounds' in input) {
    patch.bounds = input.bounds === null ? null : assertValidWindowBounds(input.bounds)
  }
  if ('maximized' in input) {
    patch.maximized = assertOptionalBoolean(input.maximized, 'maximized')
  }
  if ('fullscreen' in input) {
    patch.fullscreen = assertOptionalBoolean(input.fullscreen, 'fullscreen')
  }
  return patch
}

export function assertValidWorkspaceLibraryPatch(value: unknown): WorkspaceLibraryUpdate {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid workspace library patch')
  }
  const input = value as Record<string, unknown>
  for (const key of Object.keys(input)) {
    if (key !== 'expandedFolders' && key !== 'scrollTop' && key !== 'folderSortModes') {
      throw new Error(`Invalid workspace library key: ${key}`)
    }
  }
  const patch: WorkspaceLibraryUpdate = {}
  if ('expandedFolders' in input) {
    if (!Array.isArray(input.expandedFolders)) throw new Error('Invalid expandedFolders')
    patch.expandedFolders = input.expandedFolders.map((folder) =>
      assertValidWorkspaceSourcePath(folder)
    )
  }
  if ('scrollTop' in input) {
    const scrollTop = assertFiniteNumber(input.scrollTop, 'scrollTop')
    if (scrollTop < 0) throw new Error('Invalid scrollTop')
    patch.scrollTop = scrollTop
  }
  if ('folderSortModes' in input) {
    patch.folderSortModes = assertValidWorkspaceFolderSortModes(input.folderSortModes)
  }
  return patch
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

export function assertValidWorkspaceFocusTabInput(value: unknown): WorkspaceFocusTabInput {
  const input = assertObjectWithKeys(value, ['tabId'], 'workspace focus tab input')
  return {
    tabId: assertValidWorkspaceTabId(input.tabId)
  }
}

export function assertValidWorkspaceCloseTabInput(value: unknown): WorkspaceCloseTabInput {
  const input = assertObjectWithKeys(value, ['tabId'], 'workspace close tab input')
  return {
    tabId: assertValidWorkspaceTabId(input.tabId)
  }
}

export function assertValidWorkspaceUpdateTabViewModeInput(
  value: unknown
): WorkspaceUpdateTabViewModeInput {
  const input = assertObjectWithKeys(value, ['tabId', 'viewMode'], 'workspace tab view input')
  return {
    tabId: assertValidWorkspaceTabId(input.tabId),
    viewMode: assertValidWorkspaceViewMode(input.viewMode)
  }
}

export function assertValidWorkspaceRecordRecentInput(value: unknown): WorkspaceRecordRecentInput {
  const input = assertObjectWithKeys(value, ['sourcePath'], 'workspace recent input')
  return {
    sourcePath: assertValidWorkspaceSourcePath(input.sourcePath)
  }
}

export function assertValidWorkspaceSetOutlineCollapsedInput(
  value: unknown
): WorkspaceSetOutlineCollapsedInput {
  const input = assertObjectWithKeys(value, ['sourcePath', 'collapsed'], 'workspace outline input')
  if (typeof input.collapsed !== 'boolean') throw new Error('Invalid workspace outline state')
  return {
    sourcePath: assertValidWorkspaceSourcePath(input.sourcePath),
    collapsed: input.collapsed
  }
}

export function assertValidWorkspaceSetOutlineWidthInput(
  value: unknown
): WorkspaceSetOutlineWidthInput {
  const input = assertObjectWithKeys(value, ['width'], 'workspace outline width input')
  if (
    typeof input.width !== 'number' ||
    !Number.isFinite(input.width) ||
    input.width <= 0 ||
    input.width > MAX_DOCUMENT_OUTLINE_WIDTH
  ) {
    throw new Error('Invalid workspace outline width')
  }
  return {
    width: input.width
  }
}

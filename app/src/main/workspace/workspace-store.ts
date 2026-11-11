import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { mkdir, realpath, rename, rm, writeFile } from 'node:fs/promises'
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  normalize,
  relative,
  resolve,
  sep,
  win32
} from 'node:path'
import { randomUUID } from 'node:crypto'

import type { FileRenameInput, FileRenameResult } from '../../shared/files'
import { describeOrigin, parseLocalAddress } from '../../shared/local-address'
import { walkLibrary } from '../indexing/walker'
import { approvals } from '../localhost/approvals-store'
import { workspaceFilePath } from '../paths'
import { settingsStore } from '../settings/settings-store'
import { renameWorkspaceFile, resolveWorkspaceFilePath } from './workspace-file-actions'
import {
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MIN_WIDTH,
  WORKSPACE_RECENTS_LIMIT,
  WORKSPACE_SCHEMA_VERSION,
  DOCUMENT_OUTLINE_DEFAULT_WIDTH,
  clampDocumentOutlineWidth,
  isWorkspaceAddressTab,
  isWorkspaceExternalFileRef,
  isWorkspaceSourceFileRef,
  workspaceFileKey,
  workspaceFileTitle,
  type WindowBounds,
  type WorkspaceCloseTabInput,
  type WorkspaceFileRef,
  type WorkspaceFileTab,
  type WorkspaceFolderSortMode,
  type WorkspaceFocusTabInput,
  type WorkspaceLibraryState,
  type WorkspaceLibraryUpdate,
  type WorkspaceOpenFileInput,
  type WorkspaceOpenRecentFileInput,
  type WorkspaceRecentFile,
  type WorkspaceRecordRecentInput,
  type WorkspaceSidebarMode,
  type WorkspaceTab,
  type WorkspaceSetOutlineCollapsedInput,
  type WorkspaceSetOutlineWidthInput,
  type WorkspaceShellState,
  type WorkspaceShellUpdate,
  type WorkspaceState,
  type WorkspaceUpdateTabViewModeInput,
  type WorkspaceViewMode,
  type WorkspaceWindowState,
  type WorkspaceWindowUpdate
} from '../../shared/workspace'

type LegacyWorkspaceFile = Partial<WorkspaceState> & {
  schemaVersion?: number
}

interface PendingWorkspaceWrite {
  state: WorkspaceState
  version: number
}

const WORKSPACE_WRITE_DEBOUNCE_MS = 75
const WORKSPACE_TAB_ID_RE = /^[A-Za-z0-9][A-Za-z0-9:_.-]{0,199}$/

function defaultShellState(): WorkspaceShellState {
  return {
    sidebarCollapsed: false,
    sidebarWidth: SIDEBAR_DEFAULT_WIDTH,
    activeSidebar: 'files'
  }
}

function defaultLibraryState(): WorkspaceLibraryState {
  return {
    expandedFolders: null,
    scrollTop: 0,
    folderSortModes: {}
  }
}

function defaultWindowState(): WorkspaceWindowState {
  return {
    bounds: null,
    maximized: false,
    fullscreen: false
  }
}

export function defaultWorkspaceState(): WorkspaceState {
  return {
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
    shell: defaultShellState(),
    library: defaultLibraryState(),
    window: defaultWindowState(),
    tabs: [],
    activeTabId: null,
    recents: [],
    outlineWidth: DOCUMENT_OUTLINE_DEFAULT_WIDTH,
    outlineCollapsedByPath: {}
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function normalizeBounds(value: unknown): WindowBounds | null {
  if (value === null || value === undefined) return null
  if (!isObject(value)) return null
  const { x, y, width, height } = value
  if (!finiteNumber(x) || !finiteNumber(y) || !finiteNumber(width) || !finiteNumber(height)) {
    return null
  }
  if (width <= 0 || height <= 0) return null
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height)
  }
}

function normalizeSidebarWidth(value: unknown): number {
  if (!finiteNumber(value)) return SIDEBAR_DEFAULT_WIDTH
  if (value < SIDEBAR_MIN_WIDTH) return SIDEBAR_MIN_WIDTH
  return Math.round(value)
}

function normalizeDocumentOutlineWidth(value: unknown): number {
  return finiteNumber(value) ? clampDocumentOutlineWidth(value) : DOCUMENT_OUTLINE_DEFAULT_WIDTH
}

function normalizeScrollTop(value: unknown): number {
  if (!finiteNumber(value) || value < 0) return 0
  return Math.round(value)
}

function hasParentTraversal(value: string): boolean {
  return value.split(/[\\/]+/).some((segment) => segment === '..')
}

function normalizeSourcePath(value: unknown): string | null {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.includes('\0') ||
    isAbsolute(value) ||
    win32.isAbsolute(value) ||
    hasParentTraversal(value)
  ) {
    return null
  }

  const normalized = normalize(value)
  if (
    normalized === '.' ||
    normalized === '..' ||
    normalized.includes('\0') ||
    isAbsolute(normalized) ||
    win32.isAbsolute(normalized) ||
    normalized.startsWith(`..${sep}`)
  ) {
    return null
  }

  return normalized
}

function normalizeExternalPath(value: unknown): string | null {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.includes('\0') ||
    (!isAbsolute(value) && !win32.isAbsolute(value))
  ) {
    return null
  }

  const externalPath = normalize(value)
  if (extname(externalPath).toLowerCase() !== '.md') return null
  return externalPath
}

function normalizeFileRef(value: unknown): WorkspaceFileRef | null {
  if (!isObject(value)) return null
  const sourcePath = normalizeSourcePath(value.sourcePath)
  const externalPath = normalizeExternalPath(value.externalPath)
  if (sourcePath && !externalPath) return { sourcePath }
  if (externalPath && !sourcePath) return { externalPath }
  return null
}

function requireSourcePath(value: string): string {
  const sourcePath = normalizeSourcePath(value)
  if (!sourcePath) throw new Error('Invalid workspace source path')
  return sourcePath
}

function requireFileRef(input: WorkspaceOpenRecentFileInput): WorkspaceFileRef {
  const fileRef = normalizeFileRef(input)
  if (!fileRef) throw new Error('Invalid workspace file reference')
  return fileRef
}

function tabWithFileRef(tab: WorkspaceFileTab, file: WorkspaceFileRef): WorkspaceFileTab {
  return {
    id: tab.id,
    title: workspaceFileTitle(file),
    viewMode: tab.viewMode,
    ...file
  }
}

function recentWithFileRef(
  recent: WorkspaceRecentFile,
  file: WorkspaceFileRef
): WorkspaceRecentFile {
  return {
    title: workspaceFileTitle(file),
    openedAt: recent.openedAt,
    ...file
  }
}

function normalizeTabId(value: unknown): string | null {
  if (typeof value !== 'string' || !WORKSPACE_TAB_ID_RE.test(value) || value.includes('\0')) {
    return null
  }
  return value
}

function requireTabId(value: string): string {
  const tabId = normalizeTabId(value)
  if (!tabId) throw new Error('Invalid workspace tab id')
  return tabId
}

function isWorkspaceViewMode(value: unknown): value is WorkspaceViewMode {
  return value === 'preview' || value === 'source'
}

function isWorkspaceSidebarMode(value: unknown): value is WorkspaceSidebarMode {
  return value === 'files'
}

/** A saved address tab comes back only when it is still a local address and its origin is always allowed. */
function normalizeAddressTab(
  item: Record<string, unknown>,
  id: string,
  isApproved: (origin: string) => boolean
): WorkspaceTab | null {
  if (typeof item.url !== 'string') return null
  const address = parseLocalAddress(item.url)
  if (!address || !isApproved(address.origin)) return null
  return {
    id,
    title: describeOrigin(address.origin),
    viewMode: 'preview',
    url: address.url
  }
}

function normalizeTabs(value: unknown, isApproved: (origin: string) => boolean): WorkspaceTab[] {
  if (!Array.isArray(value)) return []
  const tabs: WorkspaceTab[] = []
  const seenIds = new Set<string>()

  for (const item of value) {
    if (!isObject(item)) continue
    const id = normalizeTabId(item.id)
    if (!id || !isWorkspaceViewMode(item.viewMode) || seenIds.has(id)) continue
    const fileRef = normalizeFileRef(item)
    if (!fileRef) {
      const addressTab = normalizeAddressTab(item, id, isApproved)
      if (addressTab) {
        seenIds.add(id)
        tabs.push(addressTab)
      }
      continue
    }
    seenIds.add(id)
    tabs.push({
      id,
      ...fileRef,
      title: workspaceFileTitle(fileRef),
      viewMode: item.viewMode
    })
  }

  return tabs
}

function normalizeOpenedAt(value: unknown): string | null {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) return null
  return value
}

function normalizeRecents(value: unknown): WorkspaceRecentFile[] {
  if (!Array.isArray(value)) return []
  const recents: WorkspaceRecentFile[] = []
  const seenFiles = new Set<string>()

  for (const item of value) {
    if (!isObject(item)) continue
    const fileRef = normalizeFileRef(item)
    const openedAt = normalizeOpenedAt(item.openedAt)
    if (!fileRef || !openedAt || seenFiles.has(workspaceFileKey(fileRef))) continue
    seenFiles.add(workspaceFileKey(fileRef))
    recents.push({
      ...fileRef,
      title: workspaceFileTitle(fileRef),
      openedAt
    })
    if (recents.length >= WORKSPACE_RECENTS_LIMIT) break
  }

  return recents
}

function normalizeOutlineCollapsedByPath(value: unknown): Record<string, boolean> {
  if (!isObject(value)) return {}
  const collapsedByPath: Record<string, boolean> = {}

  for (const [rawPath, collapsed] of Object.entries(value)) {
    const sourcePath = normalizeSourcePath(rawPath)
    if (!sourcePath || typeof collapsed !== 'boolean') continue
    collapsedByPath[sourcePath] = collapsed
  }

  return collapsedByPath
}

function normalizeExpandedFolders(value: unknown): string[] | null {
  if (value === null || value === undefined) return null
  if (!Array.isArray(value)) return null

  const expandedFolders: string[] = []
  const seenFolders = new Set<string>()

  for (const rawPath of value) {
    const sourcePath = normalizeSourcePath(rawPath)
    if (!sourcePath || seenFolders.has(sourcePath)) continue
    seenFolders.add(sourcePath)
    expandedFolders.push(sourcePath)
  }

  return expandedFolders
}

function normalizeFolderSortMode(value: unknown): WorkspaceFolderSortMode | null {
  return value === 'az' || value === 'za' || value === 'recency' ? value : null
}

function normalizeTopLevelFolderPath(value: string): string | null {
  const sourcePath = normalizeSourcePath(value)
  if (!sourcePath || sourcePath.includes(sep) || sourcePath.includes('/')) return null
  return sourcePath
}

function normalizeFolderSortModes(value: unknown): Record<string, WorkspaceFolderSortMode> {
  if (!isObject(value)) return {}
  const modes: Record<string, WorkspaceFolderSortMode> = {}

  for (const [rawFolder, rawMode] of Object.entries(value)) {
    const folder = normalizeTopLevelFolderPath(rawFolder)
    const mode = normalizeFolderSortMode(rawMode)
    if (!folder || !mode || mode === 'az') continue
    modes[folder] = mode
  }

  return modes
}

/** The tabs that are files; the file actions (rename, trash, outline) never apply to an address tab. */
function fileTabs(tabs: WorkspaceTab[]): WorkspaceFileTab[] {
  return tabs.filter((tab): tab is WorkspaceFileTab => !isWorkspaceAddressTab(tab))
}

function repairActiveTabId(value: unknown, tabs: WorkspaceTab[]): string | null {
  if (typeof value === 'string' && tabs.some((tab) => tab.id === value)) return value
  return tabs[0]?.id ?? null
}

function recordRecentInState(
  state: WorkspaceState,
  fileRef: WorkspaceFileRef
): WorkspaceRecentFile[] {
  const key = workspaceFileKey(fileRef)
  return [
    {
      ...fileRef,
      title: workspaceFileTitle(fileRef),
      openedAt: new Date().toISOString()
    },
    ...state.recents.filter((recent) => workspaceFileKey(recent) !== key)
  ].slice(0, WORKSPACE_RECENTS_LIMIT)
}

function normalizeWorkspace(
  parsed: LegacyWorkspaceFile,
  isApproved: (origin: string) => boolean
): WorkspaceState {
  const defaults = defaultWorkspaceState()
  const shell: Partial<WorkspaceShellState> = isObject(parsed.shell) ? parsed.shell : {}
  const library: Partial<WorkspaceLibraryState> = isObject(parsed.library) ? parsed.library : {}
  const window: Partial<WorkspaceWindowState> = isObject(parsed.window) ? parsed.window : {}
  const tabs = normalizeTabs(parsed.tabs, isApproved)

  return {
    ...defaults,
    shell: {
      sidebarCollapsed:
        typeof shell.sidebarCollapsed === 'boolean'
          ? shell.sidebarCollapsed
          : defaults.shell.sidebarCollapsed,
      sidebarWidth: normalizeSidebarWidth(shell.sidebarWidth),
      activeSidebar: isWorkspaceSidebarMode(shell.activeSidebar)
        ? shell.activeSidebar
        : defaults.shell.activeSidebar
    },
    library: {
      expandedFolders: normalizeExpandedFolders(library.expandedFolders),
      scrollTop: normalizeScrollTop(library.scrollTop),
      folderSortModes: normalizeFolderSortModes(library.folderSortModes)
    },
    window: {
      bounds: normalizeBounds(window.bounds),
      maximized:
        typeof window.maximized === 'boolean' ? window.maximized : defaults.window.maximized,
      fullscreen:
        typeof window.fullscreen === 'boolean' ? window.fullscreen : defaults.window.fullscreen
    },
    tabs,
    activeTabId: repairActiveTabId(parsed.activeTabId, tabs),
    recents: normalizeRecents(parsed.recents),
    outlineWidth: normalizeDocumentOutlineWidth(parsed.outlineWidth),
    outlineCollapsedByPath: normalizeOutlineCollapsedByPath(parsed.outlineCollapsedByPath)
  }
}

function readWorkspaceFile(path: string): LegacyWorkspaceFile | null {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as unknown
    return isObject(parsed) ? (parsed as LegacyWorkspaceFile) : null
  } catch {
    return null
  }
}

export class WorkspaceStore {
  private cache: WorkspaceState | null = null
  private pendingWrite: PendingWorkspaceWrite | null = null
  private writeTimer: ReturnType<typeof setTimeout> | null = null
  private writeInFlight: Promise<void> | null = null
  private writeVersion = 0

  constructor(
    private readonly path?: string,
    private readonly notesRootProvider: () => string = () => settingsStore.load().notesRoot,
    private readonly isApprovedOrigin: (origin: string) => boolean = (origin) =>
      approvals.has(origin)
  ) {}

  private filePath(): string {
    return this.path ?? workspaceFilePath()
  }

  load(): WorkspaceState {
    if (this.cache) return this.cache
    const path = this.filePath()
    if (!existsSync(path)) {
      this.cache = defaultWorkspaceState()
      return this.cache
    }
    const parsed = readWorkspaceFile(path)
    if (!parsed) {
      this.cache = defaultWorkspaceState()
      this.persistSync(this.cache)
      return this.cache
    }
    const normalized = normalizeWorkspace(parsed, this.isApprovedOrigin)
    this.cache = normalized
    if (
      parsed.schemaVersion !== WORKSPACE_SCHEMA_VERSION ||
      JSON.stringify(parsed) !== JSON.stringify(normalized)
    ) {
      this.persistSync(this.cache)
    }
    return this.cache
  }

  publicState(): WorkspaceState {
    return this.load()
  }

  updateShell(patch: WorkspaceShellUpdate): WorkspaceState {
    const current = this.load()
    const next: WorkspaceState = {
      ...current,
      shell: {
        ...current.shell,
        ...(patch.sidebarCollapsed !== undefined
          ? { sidebarCollapsed: patch.sidebarCollapsed }
          : {}),
        ...(patch.sidebarWidth !== undefined
          ? { sidebarWidth: normalizeSidebarWidth(patch.sidebarWidth) }
          : {}),
        ...(patch.activeSidebar !== undefined ? { activeSidebar: patch.activeSidebar } : {})
      }
    }
    this.persist(next)
    return this.publicState()
  }

  updateLibrary(patch: WorkspaceLibraryUpdate): WorkspaceState {
    const current = this.load()
    const next: WorkspaceState = {
      ...current,
      library: {
        ...current.library,
        ...(patch.expandedFolders !== undefined
          ? { expandedFolders: normalizeExpandedFolders(patch.expandedFolders) ?? [] }
          : {}),
        ...(patch.scrollTop !== undefined
          ? { scrollTop: normalizeScrollTop(patch.scrollTop) }
          : {}),
        ...(patch.folderSortModes !== undefined
          ? { folderSortModes: normalizeFolderSortModes(patch.folderSortModes) }
          : {})
      }
    }
    this.persist(next)
    return this.publicState()
  }

  updateWindow(patch: WorkspaceWindowUpdate): WorkspaceState {
    const current = this.load()
    const next: WorkspaceState = {
      ...current,
      window: {
        ...current.window,
        ...(patch.bounds !== undefined ? { bounds: normalizeBounds(patch.bounds) } : {}),
        ...(patch.maximized !== undefined ? { maximized: patch.maximized } : {}),
        ...(patch.fullscreen !== undefined ? { fullscreen: patch.fullscreen } : {})
      }
    }
    this.persist(next)
    return this.publicState()
  }

  async openFile(input: WorkspaceOpenFileInput): Promise<WorkspaceState> {
    const sourcePath = requireSourcePath(input.sourcePath)
    return this.openFileRef({ sourcePath }, { focusExisting: false, requireRecent: false })
  }

  async openRecentFile(input: WorkspaceOpenRecentFileInput): Promise<WorkspaceState> {
    const fileRef = requireFileRef(input)
    return this.openFileRef(fileRef, { focusExisting: true, requireRecent: true })
  }

  async openPickedFile(input: WorkspaceFileRef): Promise<WorkspaceState> {
    const fileRef = requireFileRef(input)
    return this.openFileRef(fileRef, { focusExisting: true, requireRecent: false })
  }

  private async openFileRef(
    fileRef: WorkspaceFileRef,
    options: { focusExisting: boolean; requireRecent: boolean }
  ): Promise<WorkspaceState> {
    await this.assertExistingFileRef(fileRef)
    const current = this.load()
    if (
      options.requireRecent &&
      !current.recents.some((recent) => workspaceFileKey(recent) === workspaceFileKey(fileRef))
    ) {
      throw new Error('Workspace recent file not found')
    }

    const existingTab = options.focusExisting
      ? fileTabs(current.tabs).find((tab) => workspaceFileKey(tab) === workspaceFileKey(fileRef))
      : null
    if (existingTab) {
      const next: WorkspaceState = {
        ...current,
        activeTabId: existingTab.id,
        recents: recordRecentInState(current, fileRef)
      }
      this.persist(next)
      return this.publicState()
    }

    const tab: WorkspaceFileTab = {
      id: randomUUID(),
      ...fileRef,
      title: workspaceFileTitle(fileRef),
      viewMode: 'preview'
    }
    const next: WorkspaceState = {
      ...current,
      tabs: [...current.tabs, tab],
      activeTabId: tab.id,
      recents: recordRecentInState(current, fileRef)
    }
    this.persist(next)
    return this.publicState()
  }

  /** Opens a local address in a tab, focusing the tab that already has it. Refuses anything that is not local. */
  openAddress(url: string): WorkspaceState {
    const address = parseLocalAddress(url)
    if (!address) throw new Error('Invalid local address')
    const current = this.load()
    const existing = current.tabs.find(
      (tab) => isWorkspaceAddressTab(tab) && tab.url === address.url
    )
    if (existing) {
      this.persist({ ...current, activeTabId: existing.id })
      return this.publicState()
    }
    const tab: WorkspaceTab = {
      id: randomUUID(),
      title: describeOrigin(address.origin),
      viewMode: 'preview',
      url: address.url
    }
    this.persist({ ...current, tabs: [...current.tabs, tab], activeTabId: tab.id })
    return this.publicState()
  }

  fileRefForTab(tabIdInput: string): WorkspaceFileRef | null {
    const tabId = requireTabId(tabIdInput)
    const tab = this.load().tabs.find((candidate) => candidate.id === tabId)
    if (!tab || isWorkspaceAddressTab(tab)) return null
    return isWorkspaceSourceFileRef(tab)
      ? { sourcePath: tab.sourcePath }
      : { externalPath: tab.externalPath }
  }

  async resolveFilePath(input: WorkspaceFileRef): Promise<string> {
    const file = requireFileRef(input)
    this.assertKnownExternalFile(file)
    return resolveWorkspaceFilePath(file, this.notesRootProvider())
  }

  async renameFile(input: FileRenameInput): Promise<FileRenameResult> {
    const previousFile = requireFileRef(input)
    this.assertKnownExternalFile(previousFile)
    const file = await renameWorkspaceFile(input, this.notesRootProvider())
    const workspace = this.replaceFileRef(previousFile, file)
    return { file, workspace }
  }

  removeFileRef(input: WorkspaceFileRef): WorkspaceState {
    const file = requireFileRef(input)
    const key = workspaceFileKey(file)
    const current = this.load()
    const activeIndex = current.tabs.findIndex((tab) => tab.id === current.activeTabId)
    const isRemoved = (tab: WorkspaceTab): boolean =>
      !isWorkspaceAddressTab(tab) && workspaceFileKey(tab) === key
    const activeFileRemoved = activeIndex !== -1 && isRemoved(current.tabs[activeIndex]!)
    const remainingBeforeActive = current.tabs
      .slice(0, Math.max(0, activeIndex))
      .filter((tab) => !isRemoved(tab)).length
    const tabs = current.tabs.filter((tab) => !isRemoved(tab))
    const activeTabId = activeFileRemoved
      ? (tabs[remainingBeforeActive]?.id ?? tabs[remainingBeforeActive - 1]?.id ?? null)
      : repairActiveTabId(current.activeTabId, tabs)
    const outlineCollapsedByPath = { ...current.outlineCollapsedByPath }
    if (isWorkspaceSourceFileRef(file)) delete outlineCollapsedByPath[file.sourcePath]

    const next: WorkspaceState = {
      ...current,
      tabs,
      activeTabId,
      recents: current.recents.filter((recent) => workspaceFileKey(recent) !== key),
      outlineCollapsedByPath
    }
    this.persist(next)
    return this.publicState()
  }

  focusTab(input: WorkspaceFocusTabInput): WorkspaceState {
    const tabId = requireTabId(input.tabId)
    const current = this.load()
    if (!current.tabs.some((tab) => tab.id === tabId)) throw new Error('Workspace tab not found')

    const next: WorkspaceState = {
      ...current,
      activeTabId: tabId
    }
    this.persist(next)
    return this.publicState()
  }

  closeTab(input: WorkspaceCloseTabInput): WorkspaceState {
    const tabId = requireTabId(input.tabId)
    const current = this.load()
    const closedIndex = current.tabs.findIndex((tab) => tab.id === tabId)
    if (closedIndex === -1) throw new Error('Workspace tab not found')

    const tabs = current.tabs.filter((tab) => tab.id !== tabId)
    const activeTabId =
      current.activeTabId === tabId
        ? (tabs[closedIndex]?.id ?? tabs[closedIndex - 1]?.id ?? null)
        : repairActiveTabId(current.activeTabId, tabs)

    const next: WorkspaceState = {
      ...current,
      tabs,
      activeTabId
    }
    this.persist(next)
    return this.publicState()
  }

  updateTabViewMode(input: WorkspaceUpdateTabViewModeInput): WorkspaceState {
    const tabId = requireTabId(input.tabId)
    if (!isWorkspaceViewMode(input.viewMode)) throw new Error('Invalid workspace tab view mode')
    const current = this.load()
    if (!current.tabs.some((tab) => tab.id === tabId)) throw new Error('Workspace tab not found')

    const next: WorkspaceState = {
      ...current,
      tabs: current.tabs.map((tab) =>
        tab.id === tabId ? { ...tab, viewMode: input.viewMode } : tab
      )
    }
    this.persist(next)
    return this.publicState()
  }

  async recordRecent(input: WorkspaceRecordRecentInput): Promise<WorkspaceState> {
    const sourcePath = requireSourcePath(input.sourcePath)
    await this.assertExistingSourceFile(sourcePath)

    const current = this.load()
    const next: WorkspaceState = {
      ...current,
      recents: recordRecentInState(current, { sourcePath })
    }
    this.persist(next)
    return this.publicState()
  }

  setOutlineCollapsed(input: WorkspaceSetOutlineCollapsedInput): WorkspaceState {
    const sourcePath = requireSourcePath(input.sourcePath)
    if (typeof input.collapsed !== 'boolean') throw new Error('Invalid workspace outline state')

    const current = this.load()
    const next: WorkspaceState = {
      ...current,
      outlineCollapsedByPath: {
        ...current.outlineCollapsedByPath,
        [sourcePath]: input.collapsed
      }
    }
    this.persist(next)
    return this.publicState()
  }

  setOutlineWidth(input: WorkspaceSetOutlineWidthInput): WorkspaceState {
    const current = this.load()
    const next: WorkspaceState = {
      ...current,
      outlineWidth: clampDocumentOutlineWidth(input.width)
    }
    this.persist(next)
    return this.publicState()
  }

  async pruneMissingFileRefs(): Promise<WorkspaceState> {
    const current = this.load()
    const existingPaths = await this.currentSourcePathSet()
    const tabs: WorkspaceTab[] = []
    const recents: WorkspaceRecentFile[] = []

    for (const tab of current.tabs) {
      // An address tab has no file to go missing.
      if (isWorkspaceAddressTab(tab) || (await this.fileRefExists(tab, existingPaths)))
        tabs.push(tab)
    }

    for (const recent of current.recents) {
      if (await this.fileRefExists(recent, existingPaths)) recents.push(recent)
    }

    const outlineCollapsedByPath: Record<string, boolean> = {}

    for (const [sourcePath, collapsed] of Object.entries(current.outlineCollapsedByPath)) {
      if (existingPaths.has(sourcePath)) outlineCollapsedByPath[sourcePath] = collapsed
    }

    const next: WorkspaceState = {
      ...current,
      tabs,
      activeTabId: repairActiveTabId(current.activeTabId, tabs),
      recents,
      outlineCollapsedByPath
    }
    this.persist(next)
    return this.publicState()
  }

  private replaceFileRef(previousFile: WorkspaceFileRef, file: WorkspaceFileRef): WorkspaceState {
    const previousKey = workspaceFileKey(previousFile)
    const current = this.load()
    const tabs = current.tabs.map((tab) =>
      !isWorkspaceAddressTab(tab) && workspaceFileKey(tab) === previousKey
        ? tabWithFileRef(tab, file)
        : tab
    )
    const seenRecentKeys = new Set<string>()
    const recents = current.recents
      .map((recent) =>
        workspaceFileKey(recent) === previousKey ? recentWithFileRef(recent, file) : recent
      )
      .filter((recent) => {
        const key = workspaceFileKey(recent)
        if (seenRecentKeys.has(key)) return false
        seenRecentKeys.add(key)
        return true
      })
    const outlineCollapsedByPath = { ...current.outlineCollapsedByPath }
    if (isWorkspaceSourceFileRef(previousFile)) {
      const collapsed = outlineCollapsedByPath[previousFile.sourcePath]
      delete outlineCollapsedByPath[previousFile.sourcePath]
      if (collapsed !== undefined && isWorkspaceSourceFileRef(file)) {
        outlineCollapsedByPath[file.sourcePath] = collapsed
      }
    }

    const next: WorkspaceState = {
      ...current,
      tabs,
      recents,
      outlineCollapsedByPath
    }
    this.persist(next)
    return this.publicState()
  }

  private persist(next: WorkspaceState): void {
    this.cache = next
    this.pendingWrite = {
      state: next,
      version: ++this.writeVersion
    }
    if (this.writeTimer) clearTimeout(this.writeTimer)
    this.writeTimer = setTimeout(() => {
      void this.flush().catch((error: unknown) => {
        console.error('Failed to persist workspace state', error)
      })
    }, WORKSPACE_WRITE_DEBOUNCE_MS)
  }

  async flush(): Promise<void> {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer)
      this.writeTimer = null
    }

    if (this.writeInFlight) {
      await this.writeInFlight
      if (!this.pendingWrite) return
    }

    const next = this.pendingWrite
    if (!next) return

    this.pendingWrite = null
    const write = this.writeAtomic(next.state, next.version)
    this.writeInFlight = write
    try {
      await write
    } finally {
      if (this.writeInFlight === write) {
        this.writeInFlight = null
      }
    }

    if (this.pendingWrite) {
      await this.flush()
    }
  }

  flushSync(): void {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer)
      this.writeTimer = null
    }
    if (!this.pendingWrite) return
    const next = this.pendingWrite
    if (!this.writeInFlight) {
      this.pendingWrite = null
    }
    this.persistSync(next.state)
  }

  private async writeAtomic(next: WorkspaceState, version: number): Promise<void> {
    const path = this.filePath()
    await mkdir(dirname(path), { recursive: true })
    const tempPath = this.tempFilePath(path)
    await writeFile(tempPath, JSON.stringify(next, null, 2), 'utf-8')
    if (version !== this.writeVersion) {
      await rm(tempPath, { force: true })
      return
    }
    await rename(tempPath, path)
  }

  private persistSync(next: WorkspaceState): void {
    const path = this.filePath()
    mkdirSync(dirname(path), { recursive: true })
    const tempPath = this.tempFilePath(path)
    writeFileSync(tempPath, JSON.stringify(next, null, 2), 'utf-8')
    renameSync(tempPath, path)
    rmSync(tempPath, { force: true })
    this.cache = next
  }

  private tempFilePath(path: string): string {
    return join(
      dirname(path),
      `.${basename(path)}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`
    )
  }

  /**
   * Files in the notes root are always the app's to act on. A file outside it is only one the user
   * handed over by picking it, so it must be in the open tabs or the recents; any other absolute
   * path a renderer names is refused before it can be copied, revealed, renamed or trashed.
   */
  private assertKnownExternalFile(fileRef: WorkspaceFileRef): void {
    if (isWorkspaceSourceFileRef(fileRef)) return
    const key = workspaceFileKey(fileRef)
    const current = this.load()
    const known = [...fileTabs(current.tabs), ...current.recents].some(
      (file) => workspaceFileKey(file) === key
    )
    if (!known) throw new Error(`Workspace file not found: ${fileRef.externalPath}`)
  }

  private async assertExistingSourceFile(sourcePath: string): Promise<void> {
    await resolveWorkspaceFilePath({ sourcePath }, this.notesRootProvider())
  }

  private async assertExistingExternalFile(externalPath: string): Promise<void> {
    await resolveWorkspaceFilePath({ externalPath }, this.notesRootProvider())
  }

  private async assertExistingFileRef(fileRef: WorkspaceFileRef): Promise<void> {
    if (isWorkspaceSourceFileRef(fileRef)) {
      await this.assertExistingSourceFile(fileRef.sourcePath)
      return
    }

    if (isWorkspaceExternalFileRef(fileRef)) {
      await this.assertExistingExternalFile(fileRef.externalPath)
      return
    }

    throw new Error('Invalid workspace file reference')
  }

  private async fileRefExists(
    fileRef: WorkspaceFileRef,
    existingSourcePaths: Set<string>
  ): Promise<boolean> {
    if (isWorkspaceSourceFileRef(fileRef)) return existingSourcePaths.has(fileRef.sourcePath)

    try {
      await this.assertExistingExternalFile(fileRef.externalPath)
      return true
    } catch {
      return false
    }
  }

  private async currentSourcePathSet(): Promise<Set<string>> {
    const root = await realpath(resolve(this.notesRootProvider()))
    const absolutePaths = await walkLibrary(root)
    const sourcePaths = absolutePaths
      .map((path) => normalizeSourcePath(relative(root, path)))
      .filter((path): path is string => !!path)
    return new Set(sourcePaths)
  }
}

export const workspaceStore = new WorkspaceStore()

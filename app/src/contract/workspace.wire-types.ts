// FROZEN SNAPSHOT of the hand-written declarations of the `workspace` operations, copied from
// `src/shared/workspace.ts` and `LegacyRyteApi.workspace` in `src/preload/index.ts` at ea721df, before the contract
// replaced them. The open-file, open-recent-file, open-native-file, record-recent and prune-missing-file-refs
// members were copied the same way at cdd80d2, before they moved. It is the oracle for the type-equality check in
// `workspace.wire-types.check.ts`: the types inferred from the contract must equal it. Do not edit.
// Edited once, on purpose, for the local-address tab: `WorkspaceAddressTab`, `WorkspaceTab` and schema version 7.

type WorkspaceViewMode = 'preview' | 'source'
type WorkspaceSidebarMode = 'files'
type WorkspaceFolderSortMode = 'az' | 'za' | 'recency'

interface WorkspaceSourceFileRef {
  sourcePath: string
  externalPath?: never
}

interface WorkspaceExternalFileRef {
  externalPath: string
  sourcePath?: never
}

type WorkspaceFileRef = WorkspaceSourceFileRef | WorkspaceExternalFileRef

interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
}

interface WorkspaceShellState {
  sidebarCollapsed: boolean
  sidebarWidth: number
  activeSidebar: WorkspaceSidebarMode
}

interface WorkspaceLibraryState {
  expandedFolders: string[] | null
  scrollTop: number
  folderSortModes: Record<string, WorkspaceFolderSortMode>
}

interface WorkspaceWindowState {
  bounds: WindowBounds | null
  maximized: boolean
  fullscreen: boolean
}

type WorkspaceFileTab = WorkspaceFileRef & {
  id: string
  title: string
  viewMode: WorkspaceViewMode
}

interface WorkspaceAddressTab {
  id: string
  title: string
  viewMode: WorkspaceViewMode
  url: string
  sourcePath?: never
  externalPath?: never
}

type WorkspaceTab = WorkspaceFileTab | WorkspaceAddressTab

type WorkspaceRecentFile = WorkspaceFileRef & {
  title: string
  openedAt: string
}

export interface WorkspaceState {
  schemaVersion: 7
  shell: WorkspaceShellState
  library: WorkspaceLibraryState
  window: WorkspaceWindowState
  tabs: WorkspaceTab[]
  activeTabId: string | null
  recents: WorkspaceRecentFile[]
  outlineWidth: number
  outlineCollapsedByPath: Record<string, boolean>
}

export interface WorkspaceShellUpdate {
  sidebarCollapsed?: boolean
  sidebarWidth?: number
  activeSidebar?: WorkspaceSidebarMode
}

export interface WorkspaceLibraryUpdate {
  expandedFolders?: string[]
  scrollTop?: number
  folderSortModes?: Record<string, WorkspaceFolderSortMode>
}

export type WorkspaceOpenFileInput = WorkspaceSourceFileRef

export type WorkspaceOpenRecentFileInput = WorkspaceFileRef

export interface WorkspaceRecordRecentInput {
  sourcePath: string
}

export interface WorkspaceFocusTabInput {
  tabId: string
}

export interface WorkspaceCloseTabInput {
  tabId: string
}

export interface WorkspaceUpdateTabViewModeInput {
  tabId: string
  viewMode: WorkspaceViewMode
}

export interface WorkspaceSetOutlineCollapsedInput {
  sourcePath: string
  collapsed: boolean
}

export interface WorkspaceSetOutlineWidthInput {
  width: number
}

/** Every member of `window.ryte.workspace`. `updateWindow` is not here: nothing called it, and it was deleted. */
export interface WorkspaceApi {
  getState(): Promise<WorkspaceState>
  updateShell(patch: WorkspaceShellUpdate): Promise<WorkspaceState>
  updateLibrary(patch: WorkspaceLibraryUpdate): Promise<WorkspaceState>
  focusTab(input: WorkspaceFocusTabInput): Promise<WorkspaceState>
  closeTab(input: WorkspaceCloseTabInput): Promise<WorkspaceState>
  updateTabViewMode(input: WorkspaceUpdateTabViewModeInput): Promise<WorkspaceState>
  setOutlineCollapsed(input: WorkspaceSetOutlineCollapsedInput): Promise<WorkspaceState>
  setOutlineWidth(input: WorkspaceSetOutlineWidthInput): Promise<WorkspaceState>
  openFile(input: WorkspaceOpenFileInput): Promise<WorkspaceState>
  openRecentFile(input: WorkspaceOpenRecentFileInput): Promise<WorkspaceState>
  openNativeFile(): Promise<WorkspaceState>
  recordRecent(input: WorkspaceRecordRecentInput): Promise<WorkspaceState>
  pruneMissingFileRefs(): Promise<WorkspaceState>
}

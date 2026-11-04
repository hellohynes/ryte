// FROZEN SNAPSHOT of the hand-written declarations of the state-only `workspace` operations, copied from
// `src/shared/workspace.ts` and `LegacyRyteApi.workspace` in `src/preload/index.ts` at ea721df, before the contract
// replaced them. It is the oracle for the type-equality check in `workspace.wire-types.check.ts`: the types inferred
// from the contract must equal it. Do not edit.

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

type WorkspaceRecentFile = WorkspaceFileRef & {
  title: string
  openedAt: string
}

export interface WorkspaceState {
  schemaVersion: 6
  shell: WorkspaceShellState
  library: WorkspaceLibraryState
  window: WorkspaceWindowState
  tabs: WorkspaceFileTab[]
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

/** The eight members of `window.ryte.workspace` that moved onto the contract; the other five stay hand-written. */
export interface WorkspaceApi {
  getState(): Promise<WorkspaceState>
  updateShell(patch: WorkspaceShellUpdate): Promise<WorkspaceState>
  updateLibrary(patch: WorkspaceLibraryUpdate): Promise<WorkspaceState>
  focusTab(input: WorkspaceFocusTabInput): Promise<WorkspaceState>
  closeTab(input: WorkspaceCloseTabInput): Promise<WorkspaceState>
  updateTabViewMode(input: WorkspaceUpdateTabViewModeInput): Promise<WorkspaceState>
  setOutlineCollapsed(input: WorkspaceSetOutlineCollapsedInput): Promise<WorkspaceState>
  setOutlineWidth(input: WorkspaceSetOutlineWidthInput): Promise<WorkspaceState>
}

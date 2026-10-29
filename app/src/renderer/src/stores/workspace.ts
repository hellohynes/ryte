import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import type { FileRenameInput } from '../../../shared/files'
import {
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MIN_WIDTH,
  WORKSPACE_RECENTS_LIMIT,
  WORKSPACE_SCHEMA_VERSION,
  DOCUMENT_OUTLINE_DEFAULT_WIDTH,
  clampDocumentOutlineWidth,
  clampSidebarWidth,
  isWorkspaceSourceFileRef,
  shouldAutoCollapseSidebar,
  workspaceFileKey,
  workspaceFileTitle,
  type WorkspaceCloseTabInput,
  type WorkspaceFileRef,
  type WorkspaceFileTab,
  type WorkspaceFocusTabInput,
  type WorkspaceLibraryState,
  type WorkspaceLibraryUpdate,
  type WorkspaceOpenFileInput,
  type WorkspaceOpenRecentFileInput,
  type WorkspaceRecordRecentInput,
  type WorkspaceSidebarMode,
  type WorkspaceShellState,
  type WorkspaceSetOutlineCollapsedInput,
  type WorkspaceSetOutlineWidthInput,
  type WorkspaceShellUpdate,
  type WorkspaceState,
  type WorkspaceUpdateTabViewModeInput
} from '../../../shared/workspace'

const OPTIMISTIC_WORKSPACE_TAB_ID_PREFIX = 'optimistic-workspace-tab-'

let optimisticTabId = 0

export function isOptimisticWorkspaceTabId(tabId: string): boolean {
  return tabId.startsWith(OPTIMISTIC_WORKSPACE_TAB_ID_PREFIX)
}

function defaultRendererWorkspaceState(): WorkspaceState {
  return {
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
    shell: {
      sidebarCollapsed: false,
      sidebarWidth: SIDEBAR_DEFAULT_WIDTH,
      activeSidebar: 'files'
    },
    library: {
      expandedFolders: null,
      scrollTop: 0,
      folderSortModes: {}
    },
    window: {
      bounds: null,
      maximized: false,
      fullscreen: false
    },
    tabs: [],
    activeTabId: null,
    recents: [],
    outlineWidth: DOCUMENT_OUTLINE_DEFAULT_WIDTH,
    outlineCollapsedByPath: {}
  }
}

function normalizeOptimisticSidebarWidth(width: number): number {
  if (!Number.isFinite(width)) return SIDEBAR_DEFAULT_WIDTH
  return Math.max(SIDEBAR_MIN_WIDTH, Math.round(width))
}

function applyOptimisticShellPatch(
  current: WorkspaceState | null,
  patch: WorkspaceShellUpdate
): WorkspaceState {
  const base = current ?? defaultRendererWorkspaceState()
  return {
    ...base,
    shell: {
      ...base.shell,
      ...(patch.sidebarCollapsed !== undefined ? { sidebarCollapsed: patch.sidebarCollapsed } : {}),
      ...(patch.sidebarWidth !== undefined
        ? { sidebarWidth: normalizeOptimisticSidebarWidth(patch.sidebarWidth) }
        : {}),
      ...(patch.activeSidebar !== undefined ? { activeSidebar: patch.activeSidebar } : {})
    }
  }
}

function applyOptimisticLibraryPatch(
  current: WorkspaceState | null,
  patch: WorkspaceLibraryUpdate
): WorkspaceState {
  const base = current ?? defaultRendererWorkspaceState()
  return {
    ...base,
    library: {
      ...base.library,
      ...(patch.expandedFolders !== undefined ? { expandedFolders: patch.expandedFolders } : {}),
      ...(patch.scrollTop !== undefined
        ? { scrollTop: Math.max(0, Math.round(patch.scrollTop)) }
        : {}),
      ...(patch.folderSortModes !== undefined ? { folderSortModes: patch.folderSortModes } : {})
    }
  }
}

function recordRecentInState(state: WorkspaceState, fileRef: WorkspaceFileRef): WorkspaceState {
  const key = workspaceFileKey(fileRef)
  return {
    ...state,
    recents: [
      {
        ...fileRef,
        title: workspaceFileTitle(fileRef),
        openedAt: new Date().toISOString()
      },
      ...state.recents.filter((recent) => workspaceFileKey(recent) !== key)
    ].slice(0, WORKSPACE_RECENTS_LIMIT)
  }
}

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function normalizeNativeOpenErrorMessage(error: unknown): string {
  const message = messageFromError(error)
  const unwrapped = message.replace(
    /^Error invoking remote method 'workspace:open-native-file': Error:\s*/,
    ''
  )
  return unwrapped
}

function closeTabInState(state: WorkspaceState, tabId: string): WorkspaceState {
  const closedIndex = state.tabs.findIndex((tab) => tab.id === tabId)
  if (closedIndex === -1) return state

  const tabs = state.tabs.filter((tab) => tab.id !== tabId)
  const activeTabId =
    state.activeTabId === tabId
      ? (tabs[closedIndex]?.id ?? tabs[closedIndex - 1]?.id ?? null)
      : state.activeTabId

  return {
    ...state,
    tabs,
    activeTabId
  }
}

export const useWorkspaceStore = defineStore('workspace', () => {
  const state = ref<WorkspaceState | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  const shell = computed<WorkspaceShellState>(
    () =>
      state.value?.shell ?? {
        sidebarCollapsed: false,
        sidebarWidth: SIDEBAR_DEFAULT_WIDTH,
        activeSidebar: 'files'
      }
  )
  const library = computed<WorkspaceLibraryState>(
    () =>
      state.value?.library ?? {
        expandedFolders: null,
        scrollTop: 0,
        folderSortModes: {}
      }
  )
  const tabs = computed(() => state.value?.tabs ?? [])
  const activeTabId = computed(() => state.value?.activeTabId ?? null)
  const activeTab = computed(() => tabs.value.find((tab) => tab.id === activeTabId.value) ?? null)
  const recents = computed(() => state.value?.recents ?? [])
  const outlineWidth = computed(() => state.value?.outlineWidth ?? DOCUMENT_OUTLINE_DEFAULT_WIDTH)
  const outlineCollapsedByPath = computed(() => state.value?.outlineCollapsedByPath ?? {})

  async function hydrate(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      state.value = await window.ryte.workspace.getState()
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
    }
  }

  async function updateShell(patch: WorkspaceShellUpdate): Promise<void> {
    const previousState = state.value
    state.value = applyOptimisticShellPatch(state.value, patch)
    loading.value = true
    error.value = null
    try {
      state.value = await window.ryte.workspace.updateShell(patch)
    } catch (e) {
      state.value = previousState
      error.value = e instanceof Error ? e.message : String(e)
      throw e
    } finally {
      loading.value = false
    }
  }

  async function updateLibrary(patch: WorkspaceLibraryUpdate): Promise<void> {
    const previousState = state.value
    state.value = applyOptimisticLibraryPatch(state.value, patch)
    loading.value = true
    error.value = null
    try {
      state.value = await window.ryte.workspace.updateLibrary(patch)
    } catch (e) {
      state.value = previousState
      error.value = e instanceof Error ? e.message : String(e)
      throw e
    } finally {
      loading.value = false
    }
  }

  async function runOptimisticWorkspaceOperation(
    applyLocal: (base: WorkspaceState) => WorkspaceState,
    runRemote: () => Promise<WorkspaceState>
  ): Promise<void> {
    const previousState = state.value
    state.value = applyLocal(state.value ?? defaultRendererWorkspaceState())
    loading.value = true
    error.value = null
    try {
      state.value = await runRemote()
    } catch (e) {
      state.value = previousState
      error.value = e instanceof Error ? e.message : String(e)
      throw e
    } finally {
      loading.value = false
    }
  }

  async function openFile(input: WorkspaceOpenFileInput): Promise<void> {
    const temporaryTabId = `${OPTIMISTIC_WORKSPACE_TAB_ID_PREFIX}${++optimisticTabId}`
    await runOptimisticWorkspaceOperation(
      (base) => {
        const tab: WorkspaceFileTab = {
          id: temporaryTabId,
          sourcePath: input.sourcePath,
          title: workspaceFileTitle(input),
          viewMode: 'preview'
        }
        return recordRecentInState(
          {
            ...base,
            tabs: [...base.tabs, tab],
            activeTabId: tab.id
          },
          input
        )
      },
      () => window.ryte.workspace.openFile(input)
    )
  }

  async function openOrFocusFile(input: WorkspaceOpenFileInput): Promise<void> {
    const existingTab = tabs.value.findLast(
      (tab) => isWorkspaceSourceFileRef(tab) && tab.sourcePath === input.sourcePath
    )
    if (existingTab) {
      await focusTab({ tabId: existingTab.id })
      return
    }
    await openFile(input)
  }

  async function openExplicitFile(input: WorkspaceOpenFileInput): Promise<void> {
    const existingTab = tabs.value.findLast(
      (tab) => isWorkspaceSourceFileRef(tab) && tab.sourcePath === input.sourcePath
    )
    if (existingTab) {
      await focusTab({ tabId: existingTab.id })
      await recordRecent({ sourcePath: input.sourcePath })
      return
    }

    await openFile(input)
  }

  async function openNativeFile(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      state.value = await window.ryte.workspace.openNativeFile()
    } catch (e) {
      error.value = normalizeNativeOpenErrorMessage(e)
      throw e
    } finally {
      loading.value = false
    }
  }

  async function openRecentFile(input: WorkspaceOpenRecentFileInput): Promise<void> {
    const previousState = state.value
    loading.value = true
    error.value = null
    try {
      state.value = await window.ryte.workspace.openRecentFile(input)
    } catch (e) {
      state.value = previousState
      error.value = e instanceof Error ? e.message : String(e)
      throw e
    } finally {
      loading.value = false
    }
  }

  async function focusTab(input: WorkspaceFocusTabInput): Promise<void> {
    await runOptimisticWorkspaceOperation(
      (base) => ({
        ...base,
        activeTabId: base.tabs.some((tab) => tab.id === input.tabId)
          ? input.tabId
          : base.activeTabId
      }),
      () => window.ryte.workspace.focusTab(input)
    )
  }

  async function closeTab(input: WorkspaceCloseTabInput): Promise<void> {
    await runOptimisticWorkspaceOperation(
      (base) => closeTabInState(base, input.tabId),
      () => window.ryte.workspace.closeTab(input)
    )
  }

  async function closeTabToRecent(input: WorkspaceCloseTabInput): Promise<void> {
    const closingTab = tabs.value.find((tab) => tab.id === input.tabId)
    if (closingTab && isWorkspaceSourceFileRef(closingTab)) {
      try {
        await recordRecent({ sourcePath: closingTab.sourcePath })
      } catch {
        // Closing should still work if the backing file is already missing.
      }
    }
    await closeTab({ tabId: input.tabId })
  }

  async function updateTabViewMode(input: WorkspaceUpdateTabViewModeInput): Promise<void> {
    await runOptimisticWorkspaceOperation(
      (base) => ({
        ...base,
        tabs: base.tabs.map((tab) =>
          tab.id === input.tabId ? { ...tab, viewMode: input.viewMode } : tab
        )
      }),
      () => window.ryte.workspace.updateTabViewMode(input)
    )
  }

  async function recordRecent(input: WorkspaceRecordRecentInput): Promise<void> {
    await runOptimisticWorkspaceOperation(
      (base) => recordRecentInState(base, input),
      () => window.ryte.workspace.recordRecent(input)
    )
  }

  async function setOutlineCollapsed(input: WorkspaceSetOutlineCollapsedInput): Promise<void> {
    await runOptimisticWorkspaceOperation(
      (base) => ({
        ...base,
        outlineCollapsedByPath: {
          ...base.outlineCollapsedByPath,
          [input.sourcePath]: input.collapsed
        }
      }),
      () => window.ryte.workspace.setOutlineCollapsed(input)
    )
  }

  async function setOutlineWidth(input: WorkspaceSetOutlineWidthInput): Promise<void> {
    await runOptimisticWorkspaceOperation(
      (base) => ({
        ...base,
        outlineWidth: clampDocumentOutlineWidth(input.width)
      }),
      () => window.ryte.workspace.setOutlineWidth(input)
    )
  }

  async function pruneMissingFileRefs(): Promise<void> {
    const previousState = state.value
    loading.value = true
    error.value = null
    try {
      state.value = await window.ryte.workspace.pruneMissingFileRefs()
    } catch (e) {
      state.value = previousState
      error.value = e instanceof Error ? e.message : String(e)
      throw e
    } finally {
      loading.value = false
    }
  }

  async function runFileAction<Result>(action: () => Promise<Result>): Promise<Result> {
    error.value = null
    try {
      return await action()
    } catch (e) {
      error.value = messageFromError(e)
      throw e
    }
  }

  async function copyFile(file: WorkspaceFileRef): Promise<void> {
    await runFileAction(() => window.ryte.files.copyContent(file))
  }

  async function copyFilePath(file: WorkspaceFileRef): Promise<void> {
    await runFileAction(() => window.ryte.files.copyPath(file))
  }

  async function showFileInFinder(file: WorkspaceFileRef): Promise<void> {
    await runFileAction(() => window.ryte.files.showInFinder(file))
  }

  async function renameFile(input: FileRenameInput): Promise<WorkspaceFileRef> {
    const result = await runFileAction(() => window.ryte.files.rename(input))
    state.value = result.workspace
    return result.file
  }

  async function moveFileToTrash(file: WorkspaceFileRef): Promise<boolean> {
    const result = await runFileAction(() => window.ryte.files.moveToTrash(file))
    state.value = result.workspace
    return result.trashed
  }

  async function setSidebarCollapsed(collapsed: boolean): Promise<void> {
    await updateShell({ sidebarCollapsed: collapsed })
  }

  async function setSidebarWidth(width: number, viewportWidth: number): Promise<void> {
    await updateShell({ sidebarWidth: clampSidebarWidth(width, viewportWidth) })
  }

  async function setActiveSidebar(activeSidebar: WorkspaceSidebarMode): Promise<void> {
    await updateShell({ activeSidebar })
  }

  function sidebarAutoCollapsed(viewportWidth: number): boolean {
    return shouldAutoCollapseSidebar(viewportWidth)
  }

  function sidebarWidthForViewport(viewportWidth: number): number {
    return clampSidebarWidth(shell.value.sidebarWidth, viewportWidth)
  }

  return {
    state,
    shell,
    library,
    tabs,
    activeTabId,
    activeTab,
    recents,
    outlineWidth,
    outlineCollapsedByPath,
    loading,
    error,
    hydrate,
    updateShell,
    updateLibrary,
    openFile,
    focusTab,
    closeTab,
    closeTabToRecent,
    openOrFocusFile,
    openExplicitFile,
    openNativeFile,
    openRecentFile,
    updateTabViewMode,
    recordRecent,
    setOutlineCollapsed,
    setOutlineWidth,
    pruneMissingFileRefs,
    copyFile,
    copyFilePath,
    showFileInFinder,
    renameFile,
    moveFileToTrash,
    setSidebarCollapsed,
    setSidebarWidth,
    setActiveSidebar,
    sidebarAutoCollapsed,
    sidebarWidthForViewport,
    SIDEBAR_MIN_WIDTH
  }
})

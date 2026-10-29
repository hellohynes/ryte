import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { WORKSPACE_SCHEMA_VERSION, type WorkspaceState } from '../../../shared/workspace'
import { useWorkspaceStore } from './workspace'

function workspaceState(overrides: Partial<WorkspaceState> = {}): WorkspaceState {
  return {
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
    shell: {
      sidebarCollapsed: false,
      sidebarWidth: 360,
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
    outlineWidth: 216,
    outlineCollapsedByPath: {},
    ...overrides
  }
}

function installWorkspaceApi(
  workspace: Partial<Window['ryte']['workspace']>,
  files: Partial<Window['ryte']['files']> = {}
): void {
  vi.stubGlobal('window', {
    ryte: {
      workspace,
      files
    }
  })
}

describe('useWorkspaceStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('applies shell patches optimistically before IPC resolves', async () => {
    const initial = workspaceState()
    const persisted = workspaceState({
      shell: {
        sidebarCollapsed: true,
        sidebarWidth: 420,
        activeSidebar: 'files'
      }
    })
    let resolveUpdate: (state: WorkspaceState) => void = () => {}

    installWorkspaceApi({
      getState: vi.fn().mockResolvedValue(initial),
      updateShell: vi.fn(
        () =>
          new Promise<WorkspaceState>((resolve) => {
            resolveUpdate = resolve
          })
      )
    })

    const store = useWorkspaceStore()
    await store.hydrate()

    const update = store.updateShell({
      sidebarCollapsed: true,
      sidebarWidth: 420,
      activeSidebar: 'files'
    })
    expect(store.shell).toEqual({
      sidebarCollapsed: true,
      sidebarWidth: 420,
      activeSidebar: 'files'
    })

    resolveUpdate(persisted)
    await update

    expect(store.state).toEqual(persisted)
    expect(store.error).toBeNull()
  })

  it('rolls back optimistic shell patches when IPC rejects', async () => {
    const initial = workspaceState()
    installWorkspaceApi({
      getState: vi.fn().mockResolvedValue(initial),
      updateShell: vi.fn().mockRejectedValue(new Error('Invalid workspace shell patch'))
    })

    const store = useWorkspaceStore()
    await store.hydrate()

    const update = store.updateShell({ sidebarCollapsed: true })
    expect(store.shell.sidebarCollapsed).toBe(true)

    await expect(update).rejects.toThrow('Invalid workspace shell patch')
    expect(store.state).toEqual(initial)
    expect(store.error).toBe('Invalid workspace shell patch')
  })

  it('applies library patches optimistically before IPC resolves', async () => {
    const initial = workspaceState()
    const persisted = workspaceState({
      library: {
        expandedFolders: ['docs', 'sessions/2026-07-02'],
        scrollTop: 340,
        folderSortModes: {
          sessions: 'za'
        }
      }
    })
    let resolveUpdate: (state: WorkspaceState) => void = () => {}

    installWorkspaceApi({
      getState: vi.fn().mockResolvedValue(initial),
      updateLibrary: vi.fn(
        () =>
          new Promise<WorkspaceState>((resolve) => {
            resolveUpdate = resolve
          })
      )
    })

    const store = useWorkspaceStore()
    await store.hydrate()

    const update = store.updateLibrary({
      expandedFolders: ['docs', 'sessions/2026-07-02'],
      scrollTop: 340.4,
      folderSortModes: {
        sessions: 'za'
      }
    })
    expect(store.library).toEqual({
      expandedFolders: ['docs', 'sessions/2026-07-02'],
      scrollTop: 340,
      folderSortModes: {
        sessions: 'za'
      }
    })

    resolveUpdate(persisted)
    await update

    expect(store.state).toEqual(persisted)
    expect(store.error).toBeNull()
  })

  it('creates a temporary optimistic tab for openFile and reconciles returned state', async () => {
    const initial = workspaceState()
    const returned = workspaceState({
      tabs: [
        {
          id: 'real-tab-id',
          sourcePath: 'folder/a.md',
          title: 'a.md',
          viewMode: 'preview'
        }
      ],
      activeTabId: 'real-tab-id',
      recents: [
        {
          sourcePath: 'folder/a.md',
          title: 'a.md',
          openedAt: '2026-05-21T12:00:00.000Z'
        }
      ]
    })
    let resolveOpen: (state: WorkspaceState) => void = () => {}
    installWorkspaceApi({
      getState: vi.fn().mockResolvedValue(initial),
      openFile: vi.fn(
        () =>
          new Promise<WorkspaceState>((resolve) => {
            resolveOpen = resolve
          })
      )
    })

    const store = useWorkspaceStore()
    await store.hydrate()

    const open = store.openFile({ sourcePath: 'folder/a.md' })
    expect(store.tabs).toHaveLength(1)
    expect(store.tabs[0]).toMatchObject({
      sourcePath: 'folder/a.md',
      title: 'a.md',
      viewMode: 'preview'
    })
    expect(store.tabs[0]?.id).toMatch(/^optimistic-workspace-tab-/)
    expect(store.activeTabId).toBe(store.tabs[0]?.id)
    expect(store.recents[0]?.sourcePath).toBe('folder/a.md')

    resolveOpen(returned)
    await open

    expect(store.state).toEqual(returned)
    expect(store.tabs[0]?.id).toBe('real-tab-id')
    expect(store.error).toBeNull()
  })

  it('focuses the latest matching tab for openOrFocusFile without opening a duplicate', async () => {
    const tabA = { id: 'tab-a', sourcePath: 'a.md', title: 'a.md', viewMode: 'preview' as const }
    const tabB = { id: 'tab-b', sourcePath: 'b.md', title: 'b.md', viewMode: 'preview' as const }
    const tabA2 = {
      id: 'tab-a-2',
      sourcePath: 'a.md',
      title: 'a.md',
      viewMode: 'source' as const
    }
    const initial = workspaceState({ tabs: [tabA, tabB, tabA2], activeTabId: tabB.id })
    const focused = workspaceState({ tabs: [tabA, tabB, tabA2], activeTabId: tabA2.id })
    const openFile = vi.fn()
    const focusTab = vi.fn().mockResolvedValue(focused)
    installWorkspaceApi({
      getState: vi.fn().mockResolvedValue(initial),
      focusTab,
      openFile
    })

    const store = useWorkspaceStore()
    await store.hydrate()

    await store.openOrFocusFile({ sourcePath: 'a.md' })

    expect(focusTab).toHaveBeenCalledWith({ tabId: tabA2.id })
    expect(openFile).not.toHaveBeenCalled()
    expect(store.activeTabId).toBe(tabA2.id)
  })

  it('focuses the latest matching tab and records recency for openExplicitFile', async () => {
    const tabA = { id: 'tab-a', sourcePath: 'a.md', title: 'a.md', viewMode: 'preview' as const }
    const tabB = { id: 'tab-b', sourcePath: 'b.md', title: 'b.md', viewMode: 'preview' as const }
    const tabA2 = {
      id: 'tab-a-2',
      sourcePath: 'a.md',
      title: 'a.md',
      viewMode: 'source' as const
    }
    const initial = workspaceState({ tabs: [tabA, tabB, tabA2], activeTabId: tabB.id })
    const focused = workspaceState({ tabs: [tabA, tabB, tabA2], activeTabId: tabA2.id })
    const recented = workspaceState({
      tabs: [tabA, tabB, tabA2],
      activeTabId: tabA2.id,
      recents: [{ sourcePath: 'a.md', title: 'a.md', openedAt: '2026-05-21T12:00:00.000Z' }]
    })
    const openFile = vi.fn()
    const focusTab = vi.fn().mockResolvedValue(focused)
    const recordRecent = vi.fn().mockResolvedValue(recented)
    installWorkspaceApi({
      getState: vi.fn().mockResolvedValue(initial),
      focusTab,
      recordRecent,
      openFile
    })

    const store = useWorkspaceStore()
    await store.hydrate()

    await store.openExplicitFile({ sourcePath: 'a.md' })

    expect(focusTab).toHaveBeenCalledWith({ tabId: tabA2.id })
    expect(recordRecent).toHaveBeenCalledWith({ sourcePath: 'a.md' })
    expect(openFile).not.toHaveBeenCalled()
    expect(store.activeTabId).toBe(tabA2.id)
    expect(store.recents[0]?.sourcePath).toBe('a.md')
  })

  it('opens missing files without double-recording recency for openExplicitFile', async () => {
    const initial = workspaceState()
    const returned = workspaceState({
      tabs: [
        {
          id: 'real-tab-id',
          sourcePath: 'folder/new.md',
          title: 'new.md',
          viewMode: 'preview'
        }
      ],
      activeTabId: 'real-tab-id',
      recents: [
        {
          sourcePath: 'folder/new.md',
          title: 'new.md',
          openedAt: '2026-05-21T12:00:00.000Z'
        }
      ]
    })
    const openFile = vi.fn().mockResolvedValue(returned)
    const recordRecent = vi.fn()
    installWorkspaceApi({
      getState: vi.fn().mockResolvedValue(initial),
      openFile,
      recordRecent
    })

    const store = useWorkspaceStore()
    await store.hydrate()

    await store.openExplicitFile({ sourcePath: 'folder/new.md' })

    expect(openFile).toHaveBeenCalledWith({ sourcePath: 'folder/new.md' })
    expect(recordRecent).not.toHaveBeenCalled()
    expect(store.state).toEqual(returned)
  })

  it('opens a native file through the workspace-owned picker path', async () => {
    const initial = workspaceState()
    const returned = workspaceState({
      tabs: [
        {
          id: 'native-tab-id',
          sourcePath: 'folder/native.md',
          title: 'native.md',
          viewMode: 'preview'
        }
      ],
      activeTabId: 'native-tab-id'
    })
    const openNativeFile = vi.fn().mockResolvedValue(returned)
    installWorkspaceApi({
      getState: vi.fn().mockResolvedValue(initial),
      openNativeFile
    })

    const store = useWorkspaceStore()
    await store.hydrate()

    await store.openNativeFile()

    expect(openNativeFile).toHaveBeenCalledOnce()
    expect(store.state).toEqual(returned)
    expect(store.error).toBeNull()
  })

  it('opens recent file refs through the workspace API', async () => {
    const tab = {
      id: 'tab-native',
      externalPath: '/Users/hynes/Desktop/native.md',
      title: 'native.md',
      viewMode: 'preview' as const
    }
    const initial = workspaceState()
    const focused = workspaceState({ tabs: [tab], activeTabId: tab.id })
    const openRecentFile = vi.fn().mockResolvedValue(focused)
    installWorkspaceApi({
      getState: vi.fn().mockResolvedValue(initial),
      openRecentFile
    })

    const store = useWorkspaceStore()
    await store.hydrate()

    await store.openRecentFile({ externalPath: '/Users/hynes/Desktop/native.md' })

    expect(openRecentFile).toHaveBeenCalledWith({ externalPath: '/Users/hynes/Desktop/native.md' })
    expect(store.state).toEqual(focused)
  })

  it('keeps returned workspace state when the native file picker is canceled', async () => {
    const initial = workspaceState()
    const openNativeFile = vi.fn().mockResolvedValue(initial)
    installWorkspaceApi({ getState: vi.fn().mockResolvedValue(initial), openNativeFile })

    const store = useWorkspaceStore()
    await store.hydrate()

    await store.openNativeFile()

    expect(openNativeFile).toHaveBeenCalledOnce()
    expect(store.state).toEqual(initial)
    expect(store.error).toBeNull()
  })

  it('normalizes native file picker errors for display', async () => {
    const initial = workspaceState()
    const openNativeFile = vi
      .fn()
      .mockRejectedValue(new Error('Selected file must be a Markdown file'))
    installWorkspaceApi({ getState: vi.fn().mockResolvedValue(initial), openNativeFile })

    const store = useWorkspaceStore()
    await store.hydrate()

    await expect(store.openNativeFile()).rejects.toThrow('Selected file must be a Markdown file')

    expect(store.state).toEqual(initial)
    expect(store.error).toBe('Selected file must be a Markdown file')
  })

  it('normalizes Electron-wrapped native file picker errors for display', async () => {
    const initial = workspaceState()
    const openNativeFile = vi
      .fn()
      .mockRejectedValue(
        new Error(
          "Error invoking remote method 'workspace:open-native-file': Error: Selected file must be a Markdown file"
        )
      )
    installWorkspaceApi({ getState: vi.fn().mockResolvedValue(initial), openNativeFile })

    const store = useWorkspaceStore()
    await store.hydrate()

    await expect(store.openNativeFile()).rejects.toThrow('Error invoking remote method')

    expect(store.state).toEqual(initial)
    expect(store.error).toBe('Selected file must be a Markdown file')
  })

  it('delegates file actions and applies rename and trash workspace results', async () => {
    const tab = {
      id: 'tab-a',
      sourcePath: 'folder/a.md',
      title: 'a.md',
      viewMode: 'preview' as const
    }
    const initial = workspaceState({ tabs: [tab], activeTabId: tab.id })
    const renamedFile = { sourcePath: 'folder/renamed.md' }
    const renamed = workspaceState({
      tabs: [{ ...tab, ...renamedFile, title: 'renamed.md' }],
      activeTabId: tab.id
    })
    const trashed = workspaceState({ tabs: [], activeTabId: null })
    const copyContent = vi.fn().mockResolvedValue(undefined)
    const copyPath = vi.fn().mockResolvedValue(undefined)
    const showInFinder = vi.fn().mockResolvedValue(undefined)
    const rename = vi.fn().mockResolvedValue({ file: renamedFile, workspace: renamed })
    const moveToTrash = vi.fn().mockResolvedValue({ trashed: true, workspace: trashed })
    installWorkspaceApi(
      { getState: vi.fn().mockResolvedValue(initial) },
      { copyContent, copyPath, showInFinder, rename, moveToTrash }
    )

    const store = useWorkspaceStore()
    await store.hydrate()
    await store.copyFile({ sourcePath: 'folder/a.md' })
    await store.copyFilePath({ sourcePath: 'folder/a.md' })
    await store.showFileInFinder({ sourcePath: 'folder/a.md' })
    await expect(
      store.renameFile({ sourcePath: 'folder/a.md', name: 'renamed.md' })
    ).resolves.toEqual(renamedFile)

    expect(store.tabs[0]).toMatchObject({ sourcePath: 'folder/renamed.md', title: 'renamed.md' })
    await expect(store.moveFileToTrash(renamedFile)).resolves.toBe(true)
    expect(store.tabs).toEqual([])
    expect(copyContent).toHaveBeenCalledWith({ sourcePath: 'folder/a.md' })
    expect(copyPath).toHaveBeenCalledWith({ sourcePath: 'folder/a.md' })
    expect(showInFinder).toHaveBeenCalledWith({ sourcePath: 'folder/a.md' })
  })

  it('records recency before closing a tab for closeTabToRecent', async () => {
    const tabA = { id: 'tab-a', sourcePath: 'a.md', title: 'a.md', viewMode: 'preview' as const }
    const tabB = { id: 'tab-b', sourcePath: 'b.md', title: 'b.md', viewMode: 'preview' as const }
    const initial = workspaceState({ tabs: [tabA, tabB], activeTabId: tabB.id })
    const recented = workspaceState({
      tabs: [tabA, tabB],
      activeTabId: tabB.id,
      recents: [{ sourcePath: 'b.md', title: 'b.md', openedAt: '2026-05-21T12:00:00.000Z' }]
    })
    const closed = workspaceState({
      tabs: [tabA],
      activeTabId: tabA.id,
      recents: [{ sourcePath: 'b.md', title: 'b.md', openedAt: '2026-05-21T12:00:00.000Z' }]
    })
    const recordRecent = vi.fn().mockResolvedValue(recented)
    const closeTab = vi.fn().mockResolvedValue(closed)
    installWorkspaceApi({
      getState: vi.fn().mockResolvedValue(initial),
      recordRecent,
      closeTab
    })

    const store = useWorkspaceStore()
    await store.hydrate()

    await store.closeTabToRecent({ tabId: tabB.id })

    expect(recordRecent).toHaveBeenCalledWith({ sourcePath: 'b.md' })
    expect(closeTab).toHaveBeenCalledWith({ tabId: tabB.id })
    expect(recordRecent.mock.invocationCallOrder[0]).toBeLessThan(
      closeTab.mock.invocationCallOrder[0]
    )
    expect(store.tabs.map((tab) => tab.id)).toEqual([tabA.id])
    expect(store.recents[0]?.sourcePath).toBe('b.md')
  })

  it('still closes a tab when closeTabToRecent cannot record recency', async () => {
    const tab = {
      id: 'tab-a',
      sourcePath: 'missing.md',
      title: 'missing.md',
      viewMode: 'preview' as const
    }
    const initial = workspaceState({ tabs: [tab], activeTabId: tab.id })
    const closed = workspaceState({ tabs: [], activeTabId: null })
    const recordRecent = vi.fn().mockRejectedValue(new Error('Invalid workspace source path'))
    const closeTab = vi.fn().mockResolvedValue(closed)
    installWorkspaceApi({
      getState: vi.fn().mockResolvedValue(initial),
      recordRecent,
      closeTab
    })

    const store = useWorkspaceStore()
    await store.hydrate()

    await store.closeTabToRecent({ tabId: tab.id })

    expect(recordRecent).toHaveBeenCalledWith({ sourcePath: tab.sourcePath })
    expect(closeTab).toHaveBeenCalledWith({ tabId: tab.id })
    expect(store.tabs).toEqual([])
  })

  it('applies optimistic focus, close, view mode, recent, and outline updates', async () => {
    const tabA = { id: 'tab-a', sourcePath: 'a.md', title: 'a.md', viewMode: 'preview' as const }
    const tabB = { id: 'tab-b', sourcePath: 'b.md', title: 'b.md', viewMode: 'preview' as const }
    const initial = workspaceState({ tabs: [tabA, tabB], activeTabId: tabA.id })
    const focused = workspaceState({ tabs: [tabA, tabB], activeTabId: tabB.id })
    const updatedViewMode = workspaceState({
      tabs: [{ ...tabA, viewMode: 'source' }, tabB],
      activeTabId: tabB.id
    })
    const closed = workspaceState({
      tabs: [{ ...tabA, viewMode: 'source' }],
      activeTabId: tabA.id
    })
    const recent = workspaceState({
      tabs: [{ ...tabA, viewMode: 'source' }],
      activeTabId: tabA.id,
      recents: [{ sourcePath: 'c.md', title: 'c.md', openedAt: '2026-05-21T12:00:00.000Z' }]
    })
    const outlined = workspaceState({
      ...recent,
      outlineWidth: 260,
      outlineCollapsedByPath: { 'c.md': true }
    })
    installWorkspaceApi({
      getState: vi.fn().mockResolvedValue(initial),
      focusTab: vi.fn().mockResolvedValue(focused),
      updateTabViewMode: vi.fn().mockResolvedValue(updatedViewMode),
      closeTab: vi.fn().mockResolvedValue(closed),
      recordRecent: vi.fn().mockResolvedValue(recent),
      setOutlineCollapsed: vi.fn().mockResolvedValue({
        ...recent,
        outlineCollapsedByPath: { 'c.md': true }
      }),
      setOutlineWidth: vi.fn().mockResolvedValue(outlined)
    })

    const store = useWorkspaceStore()
    await store.hydrate()

    const focus = store.focusTab({ tabId: tabB.id })
    expect(store.activeTabId).toBe(tabB.id)
    await focus

    const updateViewMode = store.updateTabViewMode({ tabId: tabA.id, viewMode: 'source' })
    expect(store.tabs[0]?.viewMode).toBe('source')
    await updateViewMode

    const close = store.closeTab({ tabId: tabB.id })
    expect(store.tabs.map((tab) => tab.id)).toEqual([tabA.id])
    expect(store.activeTabId).toBe(tabA.id)
    await close

    const record = store.recordRecent({ sourcePath: 'c.md' })
    expect(store.recents[0]).toMatchObject({ sourcePath: 'c.md', title: 'c.md' })
    await record

    const outline = store.setOutlineCollapsed({ sourcePath: 'c.md', collapsed: true })
    expect(store.outlineCollapsedByPath).toEqual({ 'c.md': true })
    await outline

    const outlineWidth = store.setOutlineWidth({ width: 260 })
    expect(store.outlineWidth).toBe(260)
    await outlineWidth

    expect(store.state).toEqual(outlined)
  })

  it('rolls back optimistic workspace operations when IPC rejects', async () => {
    const initial = workspaceState()
    installWorkspaceApi({
      getState: vi.fn().mockResolvedValue(initial),
      openFile: vi.fn().mockRejectedValue(new Error('Invalid workspace source path'))
    })

    const store = useWorkspaceStore()
    await store.hydrate()

    const open = store.openFile({ sourcePath: '../a.md' })
    expect(store.tabs).toHaveLength(1)

    await expect(open).rejects.toThrow('Invalid workspace source path')
    expect(store.state).toEqual(initial)
    expect(store.error).toBe('Invalid workspace source path')
  })
})

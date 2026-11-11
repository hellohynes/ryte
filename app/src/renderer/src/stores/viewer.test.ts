import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  WORKSPACE_SCHEMA_VERSION,
  type WorkspaceFileTab,
  type WorkspaceState
} from '../../../shared/workspace'
import type { FileCatalogChangeEvent } from '../../../shared/files'
import type { TaskToggleResponse } from '../../../shared/tasks'
import { useViewerStore } from './viewer'
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

function tab(overrides: Partial<WorkspaceFileTab>): WorkspaceFileTab {
  if ('externalPath' in overrides && overrides.externalPath) {
    return {
      id: overrides.id ?? 'tab-a',
      externalPath: overrides.externalPath,
      title: overrides.title ?? 'external.md',
      viewMode: overrides.viewMode ?? 'preview'
    }
  }

  const sourceOverrides = overrides as Partial<Extract<WorkspaceFileTab, { sourcePath: string }>>
  return {
    id: sourceOverrides.id ?? 'tab-a',
    sourcePath: sourceOverrides.sourcePath ?? 'a.md',
    title: sourceOverrides.title ?? 'a.md',
    viewMode: sourceOverrides.viewMode ?? 'preview'
  }
}

async function flushAsync(): Promise<void> {
  await nextTick()
  await Promise.resolve()
  await Promise.resolve()
  await nextTick()
}

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
} {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, resolve, reject }
}

describe('useViewerStore', () => {
  let sourceChangeHandler: ((sourcePath: string) => void) | null = null
  let workspaceTabChangeHandler: ((tabId: string) => void) | null = null
  let treeChangeHandler: (() => void) | null = null
  let catalogChangeHandler: ((event?: FileCatalogChangeEvent) => void) | null = null

  beforeEach(() => {
    setActivePinia(createPinia())
    sourceChangeHandler = null
    workspaceTabChangeHandler = null
    treeChangeHandler = null
    catalogChangeHandler = null
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function installRyteApi({
    files,
    code,
    tasks,
    workspace
  }: {
    files?: Partial<Window['ryte']['files']>
    code?: Partial<Window['ryte']['code']>
    tasks?: Partial<Window['ryte']['tasks']>
    workspace?: Partial<Window['ryte']['workspace']>
  }): void {
    vi.stubGlobal('window', {
      ryte: {
        files: {
          listTree: vi.fn().mockResolvedValue({ notesRoot: '/notes', paths: ['a.md', 'b.md'] }),
          readWorkspaceTab: vi.fn().mockResolvedValue('# A\n'),
          watchWorkspaceTab: vi.fn().mockResolvedValue(undefined),
          unwatch: vi.fn().mockResolvedValue(undefined),
          onSourceChange: vi.fn((cb: (sourcePath: string) => void) => {
            sourceChangeHandler = cb
            return vi.fn()
          }),
          onWorkspaceTabChange: vi.fn((cb: (tabId: string) => void) => {
            workspaceTabChangeHandler = cb
            return vi.fn()
          }),
          onTreeChanged: vi.fn((cb: () => void) => {
            treeChangeHandler = cb
            return vi.fn()
          }),
          onCatalogChanged: vi.fn((cb: (event?: FileCatalogChangeEvent) => void) => {
            catalogChangeHandler = cb
            return vi.fn()
          }),
          ...files
        },
        code: {
          read: vi.fn().mockResolvedValue({ status: 'ok', text: 'const a = 1\n', bytes: 12 }),
          ...code
        },
        tasks: {
          list: vi.fn(),
          refresh: vi.fn(),
          toggle: vi.fn(),
          onChanged: vi.fn(() => vi.fn()),
          ...tasks
        },
        workspace: {
          getState: vi.fn().mockResolvedValue(workspaceState()),
          updateTabViewMode: vi.fn().mockImplementation(({ tabId, viewMode }) =>
            Promise.resolve(
              workspaceState({
                tabs: [tab({ id: tabId, viewMode })],
                activeTabId: tabId
              })
            )
          ),
          pruneMissingFileRefs: vi.fn().mockResolvedValue(workspaceState()),
          ...workspace
        }
      }
    })
  }

  it('hydrates the active workspace tab through relative file APIs', async () => {
    const active = tab({ id: 'tab-a', sourcePath: 'a.md', title: 'a.md' })
    const readWorkspaceTab = vi.fn().mockResolvedValue('# A\n')
    const watchWorkspaceTab = vi.fn().mockResolvedValue(undefined)

    installRyteApi({
      files: { readWorkspaceTab, watchWorkspaceTab },
      workspace: {
        getState: vi.fn().mockResolvedValue(
          workspaceState({
            tabs: [active],
            activeTabId: active.id
          })
        )
      }
    })

    const workspace = useWorkspaceStore()
    await workspace.hydrate()
    const viewer = useViewerStore()
    await viewer.hydrate()

    expect(readWorkspaceTab).toHaveBeenCalledWith({ tabId: 'tab-a' })
    expect(watchWorkspaceTab).toHaveBeenCalledWith({ tabId: 'tab-a' })
    expect(viewer.sourcePath).toBe('a.md')
    expect(viewer.displayPath).toBe('a.md')
    expect(viewer.content).toBe('# A\n')
  })

  it('shows a picture tab without reading it as text or watching it', async () => {
    const active = tab({ id: 'tab-pic', sourcePath: 'img/Shot.PNG', title: 'Shot.PNG' })
    const readWorkspaceTab = vi.fn().mockResolvedValue('not text')
    const watchWorkspaceTab = vi.fn().mockResolvedValue(undefined)

    installRyteApi({
      files: {
        listTree: vi.fn().mockResolvedValue({ notesRoot: '/notes', paths: ['img/Shot.PNG'] }),
        readWorkspaceTab,
        watchWorkspaceTab
      },
      workspace: {
        getState: vi
          .fn()
          .mockResolvedValue(workspaceState({ tabs: [active], activeTabId: active.id }))
      }
    })

    const workspace = useWorkspaceStore()
    await workspace.hydrate()
    const viewer = useViewerStore()
    await viewer.hydrate()

    expect(viewer.picturePath).toBe('img/Shot.PNG')
    expect(viewer.loading).toBe(false)
    expect(readWorkspaceTab).not.toHaveBeenCalled()
    expect(watchWorkspaceTab).not.toHaveBeenCalled()
  })

  it('shows a video tab without reading it as text or watching it', async () => {
    const active = tab({ id: 'tab-vid', sourcePath: 'clips/Demo.MP4', title: 'Demo.MP4' })
    const readWorkspaceTab = vi.fn().mockResolvedValue('not text')
    const watchWorkspaceTab = vi.fn().mockResolvedValue(undefined)

    installRyteApi({
      files: {
        listTree: vi.fn().mockResolvedValue({ notesRoot: '/notes', paths: ['clips/Demo.MP4'] }),
        readWorkspaceTab,
        watchWorkspaceTab
      },
      workspace: {
        getState: vi
          .fn()
          .mockResolvedValue(workspaceState({ tabs: [active], activeTabId: active.id }))
      }
    })

    const workspace = useWorkspaceStore()
    await workspace.hydrate()
    const viewer = useViewerStore()
    await viewer.hydrate()

    expect(viewer.videoPath).toBe('clips/Demo.MP4')
    expect(viewer.loading).toBe(false)
    expect(readWorkspaceTab).not.toHaveBeenCalled()
    expect(watchWorkspaceTab).not.toHaveBeenCalled()
  })

  it('shows an HTML tab without reading it as a note or watching it', async () => {
    const active = tab({ id: 'tab-page', sourcePath: 'review/Index.HTML', title: 'Index.HTML' })
    const readWorkspaceTab = vi.fn().mockResolvedValue('<h1>not a note</h1>')
    const watchWorkspaceTab = vi.fn().mockResolvedValue(undefined)

    installRyteApi({
      files: {
        listTree: vi.fn().mockResolvedValue({ notesRoot: '/notes', paths: ['review/Index.HTML'] }),
        readWorkspaceTab,
        watchWorkspaceTab
      },
      workspace: {
        getState: vi
          .fn()
          .mockResolvedValue(workspaceState({ tabs: [active], activeTabId: active.id }))
      }
    })

    const workspace = useWorkspaceStore()
    await workspace.hydrate()
    const viewer = useViewerStore()
    await viewer.hydrate()

    expect(viewer.pagePath).toBe('review/Index.HTML')
    expect(viewer.loading).toBe(false)
    expect(readWorkspaceTab).not.toHaveBeenCalled()
    expect(watchWorkspaceTab).not.toHaveBeenCalled()
  })

  it('shows a local address tab without reading it as a note or watching it', async () => {
    const readWorkspaceTab = vi.fn().mockResolvedValue('not a note')
    const watchWorkspaceTab = vi.fn().mockResolvedValue(undefined)

    installRyteApi({
      files: {
        listTree: vi.fn().mockResolvedValue({ notesRoot: '/notes', paths: [] }),
        readWorkspaceTab,
        watchWorkspaceTab
      },
      workspace: {
        getState: vi.fn().mockResolvedValue(
          workspaceState({
            tabs: [
              {
                id: 'tab-local',
                url: 'http://localhost:5173/',
                title: 'localhost:5173',
                viewMode: 'preview'
              }
            ],
            activeTabId: 'tab-local'
          })
        )
      }
    })

    const workspace = useWorkspaceStore()
    await workspace.hydrate()
    const viewer = useViewerStore()
    await viewer.hydrate()

    expect(viewer.addressUrl).toBe('http://localhost:5173/')
    expect(viewer.pagePath).toBeNull()
    expect(viewer.loading).toBe(false)
    expect(readWorkspaceTab).not.toHaveBeenCalled()
    expect(watchWorkspaceTab).not.toHaveBeenCalled()
  })

  it('shows a code tab through code:read, without reading it as a note or watching it', async () => {
    const active = tab({ id: 'tab-code', sourcePath: 'src/Build.TS', title: 'Build.TS' })
    const readWorkspaceTab = vi.fn().mockResolvedValue('not a note')
    const watchWorkspaceTab = vi.fn().mockResolvedValue(undefined)
    const read = vi.fn().mockResolvedValue({ status: 'ok', text: 'const a = 1\n', bytes: 12 })

    installRyteApi({
      files: {
        listTree: vi.fn().mockResolvedValue({ notesRoot: '/notes', paths: ['src/Build.TS'] }),
        readWorkspaceTab,
        watchWorkspaceTab
      },
      code: { read },
      workspace: {
        getState: vi
          .fn()
          .mockResolvedValue(workspaceState({ tabs: [active], activeTabId: active.id }))
      }
    })

    const workspace = useWorkspaceStore()
    await workspace.hydrate()
    const viewer = useViewerStore()
    await viewer.hydrate()

    expect(viewer.codePath).toBe('src/Build.TS')
    expect(read).toHaveBeenCalledWith({ path: 'src/Build.TS' })
    expect(viewer.codeFile).toEqual({ status: 'ok', text: 'const a = 1\n', bytes: 12 })
    expect(viewer.loading).toBe(false)
    expect(readWorkspaceTab).not.toHaveBeenCalled()
    expect(watchWorkspaceTab).not.toHaveBeenCalled()
  })

  it('reads an open code file again when the catalog reports a change to it, and only then', async () => {
    const active = tab({ id: 'tab-code', sourcePath: 'src/build.ts', title: 'build.ts' })
    const read = vi
      .fn()
      .mockResolvedValueOnce({ status: 'ok', text: 'one\n', bytes: 4 })
      .mockResolvedValue({ status: 'ok', text: 'two\n', bytes: 4 })

    installRyteApi({
      files: {
        listTree: vi.fn().mockResolvedValue({ notesRoot: '/notes', paths: ['src/build.ts'] })
      },
      code: { read },
      workspace: {
        getState: vi
          .fn()
          .mockResolvedValue(workspaceState({ tabs: [active], activeTabId: active.id }))
      }
    })

    const workspace = useWorkspaceStore()
    await workspace.hydrate()
    const viewer = useViewerStore()
    await viewer.hydrate()
    expect(read).toHaveBeenCalledTimes(1)

    catalogChangeHandler?.({ type: 'remove', sourcePath: 'src/other.ts' })
    await nextTick()
    expect(read).toHaveBeenCalledTimes(1)

    catalogChangeHandler?.({ type: 'remove', sourcePath: 'src/build.ts' })
    await vi.waitFor(() =>
      expect(viewer.codeFile).toEqual({ status: 'ok', text: 'two\n', bytes: 4 })
    )
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('hydrates an external workspace tab through tab-scoped file APIs', async () => {
    const active = tab({
      id: 'tab-external',
      externalPath: '/Users/hynes/Desktop/outside.md',
      title: 'outside.md'
    })
    const readWorkspaceTab = vi.fn().mockResolvedValue('# External\n')

    installRyteApi({
      files: { readWorkspaceTab },
      workspace: {
        getState: vi.fn().mockResolvedValue(
          workspaceState({
            tabs: [active],
            activeTabId: active.id
          })
        )
      }
    })

    const workspace = useWorkspaceStore()
    await workspace.hydrate()
    const viewer = useViewerStore()
    await viewer.hydrate()

    expect(readWorkspaceTab).toHaveBeenCalledWith({ tabId: 'tab-external' })
    expect(viewer.sourcePath).toBeNull()
    expect(viewer.displayPath).toBe('/Users/hynes/Desktop/outside.md')
    expect(viewer.content).toBe('# External\n')
  })

  it('updates active tab view mode through the workspace operation', async () => {
    const active = tab({ id: 'tab-a', sourcePath: 'a.md', title: 'a.md' })
    const updateTabViewMode = vi.fn().mockResolvedValue(
      workspaceState({
        tabs: [{ ...active, viewMode: 'source' }],
        activeTabId: active.id
      })
    )

    installRyteApi({
      workspace: {
        getState: vi.fn().mockResolvedValue(
          workspaceState({
            tabs: [active],
            activeTabId: active.id
          })
        ),
        updateTabViewMode
      }
    })

    const workspace = useWorkspaceStore()
    await workspace.hydrate()
    const viewer = useViewerStore()
    await viewer.hydrate()
    await viewer.toggleSourceMode()

    expect(updateTabViewMode).toHaveBeenCalledWith({ tabId: active.id, viewMode: 'source' })
    expect(viewer.sourceMode).toBe(true)
  })

  it('ignores stale reads after the active tab changes', async () => {
    const tabA = tab({ id: 'tab-a', sourcePath: 'a.md', title: 'a.md' })
    const tabB = tab({ id: 'tab-b', sourcePath: 'b.md', title: 'b.md' })
    let resolveA!: (content: string) => void
    const readWorkspaceTab = vi.fn(({ tabId }: { tabId: string }) => {
      if (tabId === 'tab-a') {
        return new Promise<string>((resolve) => {
          resolveA = resolve
        })
      }
      return Promise.resolve('# B\n')
    })

    installRyteApi({
      files: { readWorkspaceTab },
      workspace: {
        getState: vi.fn().mockResolvedValue(workspaceState())
      }
    })

    const workspace = useWorkspaceStore()
    await workspace.hydrate()
    const viewer = useViewerStore()
    await viewer.hydrate()

    workspace.state = workspaceState({ tabs: [tabA], activeTabId: tabA.id })
    await nextTick()
    workspace.state = workspaceState({ tabs: [tabA, tabB], activeTabId: tabB.id })
    await flushAsync()

    expect(viewer.sourcePath).toBe('b.md')
    expect(viewer.content).toBe('# B\n')

    resolveA('# A\n')
    await flushAsync()

    expect(viewer.sourcePath).toBe('b.md')
    expect(viewer.content).toBe('# B\n')
  })

  it('waits for the persisted tab id before reading an optimistic opened tab', async () => {
    const returnedTab = tab({ id: 'real-tab-id', sourcePath: 'folder/a.md', title: 'a.md' })
    const returnedState = workspaceState({
      tabs: [returnedTab],
      activeTabId: returnedTab.id
    })
    let resolveOpen!: (state: WorkspaceState) => void
    const openFile = vi.fn(
      () =>
        new Promise<WorkspaceState>((resolve) => {
          resolveOpen = resolve
        })
    )
    const readWorkspaceTab = vi.fn().mockResolvedValue('# A\n')
    const watchWorkspaceTab = vi.fn().mockResolvedValue(undefined)

    installRyteApi({
      files: { readWorkspaceTab, watchWorkspaceTab },
      workspace: {
        getState: vi.fn().mockResolvedValue(workspaceState()),
        openFile
      }
    })

    const workspace = useWorkspaceStore()
    await workspace.hydrate()
    const viewer = useViewerStore()
    await viewer.hydrate()

    const open = workspace.openFile({ sourcePath: 'folder/a.md' })
    await flushAsync()

    expect(readWorkspaceTab).not.toHaveBeenCalled()
    expect(watchWorkspaceTab).not.toHaveBeenCalled()
    expect(viewer.loading).toBe(true)

    resolveOpen(returnedState)
    await open
    await flushAsync()

    expect(readWorkspaceTab).toHaveBeenCalledOnce()
    expect(readWorkspaceTab).toHaveBeenCalledWith({ tabId: 'real-tab-id' })
    expect(watchWorkspaceTab).toHaveBeenCalledWith({ tabId: 'real-tab-id' })
    expect(viewer.content).toBe('# A\n')
    expect(viewer.error).toBeNull()
  })

  it('reloads the active tab when a matching relative source change event arrives', async () => {
    const active = tab({ id: 'tab-a', sourcePath: 'a.md', title: 'a.md' })
    const readWorkspaceTab = vi
      .fn()
      .mockResolvedValueOnce('# A\n')
      .mockResolvedValueOnce('# A updated\n')

    installRyteApi({
      files: { readWorkspaceTab },
      workspace: {
        getState: vi.fn().mockResolvedValue(
          workspaceState({
            tabs: [active],
            activeTabId: active.id
          })
        )
      }
    })

    const workspace = useWorkspaceStore()
    await workspace.hydrate()
    const viewer = useViewerStore()
    await viewer.hydrate()

    sourceChangeHandler?.('b.md')
    await flushAsync()
    expect(viewer.content).toBe('# A\n')

    sourceChangeHandler?.('a.md')
    await flushAsync()
    expect(viewer.content).toBe('# A updated\n')
  })

  it('keeps current content visible while refreshing a matching source change', async () => {
    const active = tab({ id: 'tab-a', sourcePath: 'a.md', title: 'a.md' })
    const sourceRefresh = deferred<string>()
    const readWorkspaceTab = vi
      .fn()
      .mockResolvedValueOnce('# A\n')
      .mockReturnValueOnce(sourceRefresh.promise)

    installRyteApi({
      files: { readWorkspaceTab },
      workspace: {
        getState: vi.fn().mockResolvedValue(
          workspaceState({
            tabs: [active],
            activeTabId: active.id
          })
        )
      }
    })

    const workspace = useWorkspaceStore()
    await workspace.hydrate()
    const viewer = useViewerStore()
    await viewer.hydrate()

    sourceChangeHandler?.('a.md')
    await flushAsync()

    expect(readWorkspaceTab).toHaveBeenCalledTimes(2)
    expect(viewer.loading).toBe(false)
    expect(viewer.content).toBe('# A\n')

    sourceRefresh.resolve('# A updated\n')
    await flushAsync()

    expect(viewer.content).toBe('# A updated\n')
  })

  it('reloads the active tab when a matching workspace tab change event arrives', async () => {
    const active = tab({
      id: 'tab-external',
      externalPath: '/Users/hynes/Desktop/outside.md',
      title: 'outside.md'
    })
    const readWorkspaceTab = vi
      .fn()
      .mockResolvedValueOnce('# External\n')
      .mockResolvedValueOnce('# External updated\n')

    installRyteApi({
      files: { readWorkspaceTab },
      workspace: {
        getState: vi.fn().mockResolvedValue(
          workspaceState({
            tabs: [active],
            activeTabId: active.id
          })
        )
      }
    })

    const workspace = useWorkspaceStore()
    await workspace.hydrate()
    const viewer = useViewerStore()
    await viewer.hydrate()

    workspaceTabChangeHandler?.('other-tab')
    await flushAsync()
    expect(viewer.content).toBe('# External\n')

    workspaceTabChangeHandler?.('tab-external')
    await flushAsync()
    expect(viewer.content).toBe('# External updated\n')
  })

  it('prunes missing workspace refs before hydrating from the repaired active tab', async () => {
    const missing = tab({ id: 'tab-missing', sourcePath: 'missing.md', title: 'missing.md' })
    const repaired = tab({ id: 'tab-b', sourcePath: 'b.md', title: 'b.md' })
    const pruneMissingFileRefs = vi.fn().mockResolvedValue(
      workspaceState({
        tabs: [repaired],
        activeTabId: repaired.id
      })
    )
    const readWorkspaceTab = vi.fn().mockResolvedValue('# B\n')

    installRyteApi({
      files: {
        listTree: vi.fn().mockResolvedValue({ notesRoot: '/notes', paths: ['b.md'] }),
        readWorkspaceTab
      },
      workspace: {
        getState: vi.fn().mockResolvedValue(
          workspaceState({
            tabs: [missing, repaired],
            activeTabId: missing.id
          })
        ),
        pruneMissingFileRefs
      }
    })

    const workspace = useWorkspaceStore()
    await workspace.hydrate()
    const viewer = useViewerStore()
    await viewer.hydrate()

    expect(pruneMissingFileRefs).toHaveBeenCalledTimes(1)
    expect(readWorkspaceTab).toHaveBeenCalledWith({ tabId: 'tab-b' })
    expect(viewer.sourcePath).toBe('b.md')
    expect(viewer.content).toBe('# B\n')
  })

  it('refreshes and prunes when the tree watcher reports a change', async () => {
    const active = tab({ id: 'tab-a', sourcePath: 'a.md', title: 'a.md' })
    const repaired = tab({ id: 'tab-b', sourcePath: 'b.md', title: 'b.md' })
    const listTree = vi
      .fn()
      .mockResolvedValueOnce({ notesRoot: '/notes', paths: ['a.md', 'b.md'] })
      .mockResolvedValueOnce({ notesRoot: '/notes', paths: ['b.md'] })
    const pruneMissingFileRefs = vi.fn().mockResolvedValue(
      workspaceState({
        tabs: [repaired],
        activeTabId: repaired.id
      })
    )

    installRyteApi({
      files: { listTree },
      workspace: {
        getState: vi.fn().mockResolvedValue(
          workspaceState({
            tabs: [active, repaired],
            activeTabId: active.id
          })
        ),
        pruneMissingFileRefs
      }
    })

    const workspace = useWorkspaceStore()
    await workspace.hydrate()
    const viewer = useViewerStore()
    await viewer.hydrate()

    treeChangeHandler?.()
    await flushAsync()

    expect(pruneMissingFileRefs).toHaveBeenCalledTimes(1)
    expect(viewer.sourcePath).toBe('b.md')
  })

  it('toggles a rendered task through the typed task API', async () => {
    const active = tab({ id: 'tab-a', sourcePath: 'tasks.md', title: 'tasks.md' })
    const toggle = vi.fn().mockResolvedValue({
      ok: true,
      markdown: '# Tasks\n\n- [x] Follow up\n',
      task: {
        id: 'task-1',
        sourcePath: 'tasks.md',
        line: 3,
        checkboxColumn: 2,
        checked: true,
        rawLine: '- [x] Follow up',
        normalizedText: 'Follow up',
        headingPath: ['Tasks'],
        occurrenceIndex: 0,
        fingerprint: 'abc',
        sourceMtimeMs: 1,
        extractedAt: '2026-06-30T12:00:00.000Z'
      }
    })

    installRyteApi({
      files: {
        listTree: vi.fn().mockResolvedValue({ notesRoot: '/notes', paths: ['tasks.md'] }),
        readWorkspaceTab: vi.fn().mockResolvedValue('# Tasks\n\n- [ ] Follow up\n')
      },
      tasks: { toggle },
      workspace: {
        getState: vi.fn().mockResolvedValue(
          workspaceState({
            tabs: [active],
            activeTabId: active.id
          })
        )
      }
    })

    const workspace = useWorkspaceStore()
    await workspace.hydrate()
    const viewer = useViewerStore()
    await viewer.hydrate()
    await viewer.toggleRenderedTask({ line: 3, checkboxColumn: 2, checked: true })

    expect(toggle).toHaveBeenCalledWith({
      sourcePath: 'tasks.md',
      line: 3,
      checkboxColumn: 2,
      checked: true,
      expectedLine: '- [ ] Follow up'
    })
    expect(viewer.content).toBe('# Tasks\n\n- [x] Follow up\n')
    expect(viewer.error).toBeNull()
  })

  it('optimistically toggles a rendered task before persistence completes', async () => {
    const active = tab({ id: 'tab-a', sourcePath: 'tasks.md', title: 'tasks.md' })
    const toggleResponse = deferred<TaskToggleResponse>()
    const readWorkspaceTab = vi.fn().mockResolvedValue('# Tasks\n\n- [ ] Follow up\n')
    const toggle = vi.fn().mockReturnValue(toggleResponse.promise)

    installRyteApi({
      files: {
        listTree: vi.fn().mockResolvedValue({ notesRoot: '/notes', paths: ['tasks.md'] }),
        readWorkspaceTab
      },
      tasks: { toggle },
      workspace: {
        getState: vi.fn().mockResolvedValue(
          workspaceState({
            tabs: [active],
            activeTabId: active.id
          })
        )
      }
    })

    const workspace = useWorkspaceStore()
    await workspace.hydrate()
    const viewer = useViewerStore()
    await viewer.hydrate()

    const toggleTask = viewer.toggleRenderedTask({ line: 3, checkboxColumn: 2, checked: true })

    expect(viewer.content).toBe('# Tasks\n\n- [x] Follow up\n')
    expect(readWorkspaceTab).toHaveBeenCalledTimes(1)
    expect(toggle).toHaveBeenCalledWith({
      sourcePath: 'tasks.md',
      line: 3,
      checkboxColumn: 2,
      checked: true,
      expectedLine: '- [ ] Follow up'
    })

    toggleResponse.resolve({
      ok: true,
      markdown: '# Tasks\n\n- [x] Follow up\n',
      task: {
        id: 'task-1',
        sourcePath: 'tasks.md',
        line: 3,
        checkboxColumn: 2,
        checked: true,
        rawLine: '- [x] Follow up',
        normalizedText: 'Follow up',
        headingPath: ['Tasks'],
        occurrenceIndex: 0,
        fingerprint: 'abc',
        sourceMtimeMs: 1,
        extractedAt: '2026-06-30T12:00:00.000Z'
      }
    })
    await toggleTask

    expect(viewer.content).toBe('# Tasks\n\n- [x] Follow up\n')
    expect(viewer.error).toBeNull()
  })

  it('reloads the active tab when a rendered task toggle is stale', async () => {
    const active = tab({ id: 'tab-a', sourcePath: 'tasks.md', title: 'tasks.md' })
    const readWorkspaceTab = vi
      .fn()
      .mockResolvedValueOnce('# Tasks\n\n- [ ] Follow up\n')
      .mockResolvedValueOnce('# Tasks\n\n- [ ] Updated task\n')
    const toggle = vi.fn().mockResolvedValue({ ok: false, reason: 'source-line-changed' })

    installRyteApi({
      files: {
        listTree: vi.fn().mockResolvedValue({ notesRoot: '/notes', paths: ['tasks.md'] }),
        readWorkspaceTab
      },
      tasks: { toggle },
      workspace: {
        getState: vi.fn().mockResolvedValue(
          workspaceState({
            tabs: [active],
            activeTabId: active.id
          })
        )
      }
    })

    const workspace = useWorkspaceStore()
    await workspace.hydrate()
    const viewer = useViewerStore()
    await viewer.hydrate()
    await viewer.toggleRenderedTask({ line: 3, checkboxColumn: 2, checked: true })

    expect(readWorkspaceTab).toHaveBeenCalledTimes(2)
    expect(viewer.content).toBe('# Tasks\n\n- [ ] Updated task\n')
  })
})

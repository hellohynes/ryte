import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { FileCatalogEntry } from '../../../shared/files'
import { WORKSPACE_SCHEMA_VERSION, type WorkspaceState } from '../../../shared/workspace'
import { useFileCatalogStore } from '../stores/file-catalog'
import { useViewerStore } from '../stores/viewer'
import { useWorkspaceStore } from '../stores/workspace'
import { useSidebarTree } from './sidebar-tree'

const PATHS = ['a/one.md', 'a/two.md', 'b/three.md', 'root.md']

function entry(sourcePath: string, modifiedAtMs: number): FileCatalogEntry {
  return {
    sourcePath,
    title: sourcePath,
    directory: sourcePath.includes('/') ? sourcePath.slice(0, sourcePath.lastIndexOf('/')) : '',
    searchableText: sourcePath,
    pathDate: null,
    modifiedAt: new Date(modifiedAtMs).toISOString(),
    modifiedAtMs,
    createdAt: null,
    createdAtMs: null,
    sizeBytes: 1
  }
}

const initialState = (): WorkspaceState => ({
  schemaVersion: WORKSPACE_SCHEMA_VERSION,
  shell: { sidebarCollapsed: false, sidebarWidth: 360, activeSidebar: 'files' },
  library: { expandedFolders: ['a'], scrollTop: 0, folderSortModes: { a: 'za' } },
  window: { bounds: null, maximized: false, fullscreen: false },
  tabs: [
    { id: 't1', sourcePath: 'a/one.md', title: 'one', viewMode: 'preview' },
    { id: 't2', sourcePath: 'b/three.md', title: 'three', viewMode: 'preview' }
  ],
  activeTabId: 't1',
  recents: [],
  outlineWidth: 216,
  outlineCollapsedByPath: {}
})

describe('useSidebarTree', () => {
  // Main's copy of the workspace. Every reply crosses IPC, so the renderer always receives a new object.
  let persisted: WorkspaceState

  beforeEach(() => {
    setActivePinia(createPinia())
    persisted = initialState()
    const reply = (change: (state: WorkspaceState) => WorkspaceState) => async () => {
      persisted = change(persisted)
      return structuredClone(persisted)
    }
    vi.stubGlobal('window', {
      ryte: {
        workspace: {
          getState: async () => structuredClone(persisted),
          focusTab: vi.fn(async (input: { tabId: string }) =>
            reply((state) => ({ ...state, activeTabId: input.tabId }))()
          ),
          recordRecent: vi.fn(async (input: { sourcePath: string }) =>
            reply((state) => ({
              ...state,
              recents: [
                {
                  sourcePath: input.sourcePath,
                  title: input.sourcePath,
                  openedAt: '2026-11-12T10:00:00.000Z'
                }
              ]
            }))()
          ),
          updateLibrary: vi.fn(async (patch: Partial<WorkspaceState['library']>) =>
            reply((state) => ({ ...state, library: { ...state.library, ...patch } }))()
          )
        },
        files: {}
      }
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('does not rebuild the tree when opening or switching a file writes the workspace', async () => {
    const workspace = useWorkspaceStore()
    const viewer = useViewerStore()
    const catalog = useFileCatalogStore()
    await workspace.hydrate()
    viewer.notesRoot = '/notes'
    viewer.tree = PATHS
    catalog.files = PATHS.map((path, index) => entry(path, 1000 + index))

    const tree = useSidebarTree()
    const built = tree.value
    expect(built.map((node) => node.name)).toEqual(['a', 'b', 'root.md'])

    // The writes a tab switch, an open and the saved scroll position make, each answered with a fresh copy.
    await workspace.focusTab({ tabId: 't2' })
    await workspace.recordRecent({ sourcePath: 'b/three.md' })
    await workspace.updateLibrary({ scrollTop: 240 })
    await workspace.updateLibrary({ expandedFolders: ['a', 'b'] })
    expect(tree.value).toBe(built)

    // A folder's sort order is part of the tree, so changing it does rebuild.
    await workspace.updateLibrary({ folderSortModes: { a: 'az' } })
    expect(tree.value).not.toBe(built)
    expect(tree.value[0].children.map((node) => node.name)).toEqual(['one.md', 'two.md'])
  })
})

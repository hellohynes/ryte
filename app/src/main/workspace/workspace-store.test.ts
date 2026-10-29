import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  DOCUMENT_OUTLINE_DEFAULT_WIDTH,
  DOCUMENT_OUTLINE_MAX_WIDTH,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MIN_WIDTH,
  WORKSPACE_SCHEMA_VERSION
} from '../../shared/workspace'
import { WorkspaceStore, defaultWorkspaceState } from './workspace-store'

let tempDir: string
let notesRoot: string

describe('WorkspaceStore', () => {
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ryte-workspace-'))
    notesRoot = join(tempDir, 'notes')
    mkdirSync(notesRoot, { recursive: true })
  })

  afterEach(() => {
    vi.useRealTimers()
    rmSync(tempDir, { recursive: true, force: true })
  })

  function store(): WorkspaceStore {
    return new WorkspaceStore(join(tempDir, 'workspace.json'), () => notesRoot)
  }

  function writeNote(sourcePath: string): void {
    const path = join(notesRoot, sourcePath)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, '# Synthetic fixture\n', 'utf-8')
  }

  function writeExternalNote(sourcePath = 'outside/external.md'): string {
    const path = join(tempDir, sourcePath)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, '# External synthetic fixture\n', 'utf-8')
    return path
  }

  it('returns defaults when no file exists', () => {
    expect(store().publicState()).toEqual(defaultWorkspaceState())
  })

  it('persists shell state updates', () => {
    const workspace = store()
    workspace.updateShell({ sidebarCollapsed: true, sidebarWidth: 420, activeSidebar: 'files' })
    workspace.flushSync()

    const state = store().publicState()
    expect(state.shell.sidebarCollapsed).toBe(true)
    expect(state.shell.sidebarWidth).toBe(420)
    expect(state.shell.activeSidebar).toBe('files')
  })

  it('persists library tree state updates', () => {
    const workspace = store()
    workspace.updateLibrary({
      expandedFolders: ['docs', './sessions/2026-07-02/plans', 'docs'],
      scrollTop: 482.6,
      folderSortModes: {
        docs: 'za',
        sessions: 'recency',
        'sessions/2026-07-02': 'za',
        research: 'az'
      }
    })
    workspace.flushSync()

    const state = store().publicState()
    expect(state.library).toEqual({
      expandedFolders: ['docs', 'sessions/2026-07-02/plans'],
      scrollTop: 483,
      folderSortModes: {
        docs: 'za',
        sessions: 'recency'
      }
    })
  })

  it('updates the in-memory shell state before debounced persistence flushes', () => {
    const workspace = store()
    const state = workspace.updateShell({
      sidebarCollapsed: true,
      sidebarWidth: 420,
      activeSidebar: 'files'
    })

    expect(state.shell.sidebarCollapsed).toBe(true)
    expect(state.shell.sidebarWidth).toBe(420)
    expect(state.shell.activeSidebar).toBe('files')
    expect(workspace.publicState().shell.sidebarCollapsed).toBe(true)
    expect(readdirSync(tempDir).filter((name) => name !== 'notes')).toEqual([])

    workspace.flushSync()
    expect(JSON.parse(readFileSync(join(tempDir, 'workspace.json'), 'utf-8'))).toMatchObject({
      shell: {
        sidebarCollapsed: true,
        sidebarWidth: 420,
        activeSidebar: 'files'
      }
    })
  })

  it('clamps invalid sidebar widths to the minimum', () => {
    const workspace = store()
    const state = workspace.updateShell({ sidebarWidth: 12 })
    workspace.flushSync()
    expect(state.shell.sidebarWidth).toBe(SIDEBAR_MIN_WIDTH)
  })

  it('persists window state updates', () => {
    const workspace = store()
    workspace.updateWindow({
      bounds: { x: 100, y: 120, width: 1460, height: 980 },
      maximized: true,
      fullscreen: false
    })
    workspace.flushSync()

    const state = store().publicState()
    expect(state.window).toEqual({
      bounds: { x: 100, y: 120, width: 1460, height: 980 },
      maximized: true,
      fullscreen: false
    })
  })

  it('opens files as new active tabs and records one bumped recent per source path', async () => {
    writeNote('folder/a.md')
    const workspace = store()

    const first = await workspace.openFile({ sourcePath: 'folder/a.md' })
    const firstTabId = first.tabs[0]?.id
    expect(first.tabs).toHaveLength(1)
    expect(first.tabs[0]).toMatchObject({
      sourcePath: 'folder/a.md',
      title: 'a.md',
      viewMode: 'preview'
    })
    expect(first.activeTabId).toBe(firstTabId)
    expect(first.recents).toHaveLength(1)
    expect(first.recents[0]).toMatchObject({
      sourcePath: 'folder/a.md',
      title: 'a.md'
    })

    const second = await workspace.openFile({ sourcePath: 'folder/a.md' })
    expect(second.tabs).toHaveLength(2)
    expect(second.tabs[1]?.id).not.toBe(firstTabId)
    expect(second.activeTabId).toBe(second.tabs[1]?.id)
    expect(second.recents).toHaveLength(1)
    expect(second.recents[0]?.sourcePath).toBe('folder/a.md')
  })

  it('opens explicitly picked external markdown files without requiring notes-root membership', async () => {
    const externalPath = writeExternalNote()
    const workspace = store()

    const first = await workspace.openPickedFile({ externalPath })
    const firstTabId = first.tabs[0]?.id
    expect(first.tabs).toHaveLength(1)
    expect(first.tabs[0]).toMatchObject({
      externalPath,
      title: 'external.md',
      viewMode: 'preview'
    })
    expect(first.activeTabId).toBe(firstTabId)
    expect(first.recents).toHaveLength(1)
    expect(first.recents[0]).toMatchObject({
      externalPath,
      title: 'external.md'
    })

    const focused = await workspace.openPickedFile({ externalPath })
    expect(focused.tabs).toHaveLength(1)
    expect(focused.activeTabId).toBe(firstTabId)

    workspace.closeTab({ tabId: firstTabId! })
    const reopened = await workspace.openRecentFile({ externalPath })
    expect(reopened.tabs).toHaveLength(1)
    expect(reopened.tabs[0]).toMatchObject({ externalPath })
  })

  it('focuses tabs and closes active tabs with next, previous, then null fallback', async () => {
    writeNote('a.md')
    writeNote('b.md')
    writeNote('c.md')
    const workspace = store()
    const a = (await workspace.openFile({ sourcePath: 'a.md' })).tabs[0]!
    const b = (await workspace.openFile({ sourcePath: 'b.md' })).tabs[1]!
    const c = (await workspace.openFile({ sourcePath: 'c.md' })).tabs[2]!

    expect(workspace.focusTab({ tabId: b.id }).activeTabId).toBe(b.id)
    expect(workspace.closeTab({ tabId: b.id }).activeTabId).toBe(c.id)
    expect(workspace.closeTab({ tabId: c.id }).activeTabId).toBe(a.id)
    expect(workspace.closeTab({ tabId: a.id }).activeTabId).toBeNull()

    const reopenedA = (await workspace.openFile({ sourcePath: 'a.md' })).tabs[0]!
    const reopenedB = (await workspace.openFile({ sourcePath: 'b.md' })).tabs[1]!
    workspace.focusTab({ tabId: reopenedA.id })
    expect(workspace.closeTab({ tabId: reopenedB.id }).activeTabId).toBe(reopenedA.id)
  })

  it('updates tab view mode without changing the active tab', async () => {
    writeNote('a.md')
    const workspace = store()
    const opened = await workspace.openFile({ sourcePath: 'a.md' })
    const tabId = opened.tabs[0]!.id

    const state = workspace.updateTabViewMode({ tabId, viewMode: 'source' })

    expect(state.activeTabId).toBe(tabId)
    expect(state.tabs[0]).toMatchObject({
      id: tabId,
      viewMode: 'source'
    })
  })

  it('renames a source file and updates tabs, recents, and outline state', async () => {
    writeNote('folder/original.md')
    const workspace = store()
    const first = await workspace.openFile({ sourcePath: 'folder/original.md' })
    await workspace.openFile({ sourcePath: 'folder/original.md' })
    const tabIdsBefore = workspace.publicState().tabs.map((tab) => tab.id)
    workspace.setOutlineCollapsed({ sourcePath: 'folder/original.md', collapsed: true })

    const result = await workspace.renameFile({
      sourcePath: 'folder/original.md',
      name: 'renamed.md'
    })

    expect(result.file).toEqual({ sourcePath: 'folder/renamed.md' })
    expect(result.workspace.tabs).toHaveLength(2)
    expect(result.workspace.tabs.map((tab) => tab.id)).toEqual(tabIdsBefore)
    expect(result.workspace.tabs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: first.tabs[0]!.id,
          sourcePath: 'folder/renamed.md',
          title: 'renamed.md',
          viewMode: 'preview'
        })
      ])
    )
    expect(result.workspace.recents).toEqual([
      expect.objectContaining({ sourcePath: 'folder/renamed.md', title: 'renamed.md' })
    ])
    expect(result.workspace.outlineCollapsedByPath).toEqual({ 'folder/renamed.md': true })
    expect(existsSync(join(notesRoot, 'folder/original.md'))).toBe(false)
    expect(readFileSync(join(notesRoot, 'folder/renamed.md'), 'utf-8')).toBe(
      '# Synthetic fixture\n'
    )
  })

  it('renames an external markdown file without moving it into the notes root', async () => {
    const externalPath = writeExternalNote()
    const workspace = store()
    await workspace.openPickedFile({ externalPath })

    const result = await workspace.renameFile({ externalPath, name: 'renamed-external.md' })

    const renamedPath = join(dirname(externalPath), 'renamed-external.md')
    expect(result.file).toEqual({ externalPath: renamedPath })
    expect(result.workspace.tabs[0]).toMatchObject({
      externalPath: renamedPath,
      title: 'renamed-external.md'
    })
    expect(existsSync(externalPath)).toBe(false)
    expect(existsSync(renamedPath)).toBe(true)
  })

  it('only acts on an external file the app was given, not on any path the renderer names', async () => {
    const externalPath = writeExternalNote()
    const workspace = store()

    await expect(workspace.resolveFilePath({ externalPath })).rejects.toThrow(
      'Workspace file not found'
    )
    await expect(workspace.renameFile({ externalPath, name: 'taken.md' })).rejects.toThrow(
      'Workspace file not found'
    )
    expect(existsSync(externalPath)).toBe(true)
    expect(existsSync(join(dirname(externalPath), 'taken.md'))).toBe(false)

    const opened = await workspace.openPickedFile({ externalPath })
    await expect(workspace.resolveFilePath({ externalPath })).resolves.toBe(externalPath)

    // Closing the tab leaves the file in recents, which still counts as one the user opened.
    workspace.closeTab({ tabId: opened.tabs[0]!.id })
    await expect(workspace.resolveFilePath({ externalPath })).resolves.toBe(externalPath)
  })

  it('refuses to overwrite an existing file during rename', async () => {
    writeNote('original.md')
    writeNote('existing.md')
    const workspace = store()

    await expect(
      workspace.renameFile({ sourcePath: 'original.md', name: 'existing.md' })
    ).rejects.toThrow('A file with that name already exists')

    expect(existsSync(join(notesRoot, 'original.md'))).toBe(true)
    expect(existsSync(join(notesRoot, 'existing.md'))).toBe(true)
  })

  it('removes every matching file reference and repairs active tab state', async () => {
    writeNote('remove.md')
    writeNote('keep.md')
    const workspace = store()
    await workspace.openFile({ sourcePath: 'remove.md' })
    const keep = (await workspace.openFile({ sourcePath: 'keep.md' })).tabs[1]!
    const activeRemoved = (await workspace.openFile({ sourcePath: 'remove.md' })).tabs[2]!
    workspace.setOutlineCollapsed({ sourcePath: 'remove.md', collapsed: true })

    const state = workspace.removeFileRef({ sourcePath: 'remove.md' })

    expect(state.tabs).toEqual([expect.objectContaining({ id: keep.id, sourcePath: 'keep.md' })])
    expect(state.activeTabId).toBe(keep.id)
    expect(state.tabs.some((tab) => tab.id === activeRemoved.id)).toBe(false)
    expect(state.recents.map((recent) => recent.sourcePath)).toEqual(['keep.md'])
    expect(state.outlineCollapsedByPath).toEqual({})
  })

  it('records recents with dedupe, bump, timestamp, and cap', async () => {
    vi.useFakeTimers()
    const workspace = store()

    for (let index = 0; index < 26; index += 1) {
      const sourcePath = `note-${index}.md`
      writeNote(sourcePath)
      vi.setSystemTime(new Date(`2026-05-21T12:${String(index).padStart(2, '0')}:00.000Z`))
      await workspace.recordRecent({ sourcePath })
    }

    expect(workspace.publicState().recents).toHaveLength(25)
    expect(workspace.publicState().recents[0]?.sourcePath).toBe('note-25.md')
    expect(
      workspace.publicState().recents.some((recent) => recent.sourcePath === 'note-0.md')
    ).toBe(false)

    vi.setSystemTime(new Date('2026-05-21T13:00:00.000Z'))
    const bumped = await workspace.recordRecent({ sourcePath: 'note-1.md' })

    expect(bumped.recents).toHaveLength(25)
    expect(bumped.recents[0]).toEqual({
      sourcePath: 'note-1.md',
      title: 'note-1.md',
      openedAt: '2026-05-21T13:00:00.000Z'
    })
    expect(bumped.recents.filter((recent) => recent.sourcePath === 'note-1.md')).toHaveLength(1)
  })

  it('does not record startup-restored tabs as recents', () => {
    writeFileSync(
      join(tempDir, 'workspace.json'),
      JSON.stringify({
        schemaVersion: 1,
        tabs: [{ id: 'tab-a', sourcePath: 'a.md', title: 'stale title', viewMode: 'preview' }],
        activeTabId: 'tab-a',
        recents: [{ sourcePath: 'b.md', title: 'b.md', openedAt: '2026-05-21T12:00:00.000Z' }]
      }),
      'utf-8'
    )

    const state = store().publicState()

    expect(state.tabs).toHaveLength(1)
    expect(state.recents).toEqual([
      { sourcePath: 'b.md', title: 'b.md', openedAt: '2026-05-21T12:00:00.000Z' }
    ])
  })

  it('persists outline collapsed state by source path', () => {
    const workspace = store()
    const state = workspace.setOutlineCollapsed({
      sourcePath: 'folder/a.md',
      collapsed: true
    })

    expect(state.outlineCollapsedByPath).toEqual({ 'folder/a.md': true })
    workspace.flushSync()
    expect(JSON.parse(readFileSync(join(tempDir, 'workspace.json'), 'utf-8'))).toMatchObject({
      outlineCollapsedByPath: { 'folder/a.md': true }
    })
  })

  it('persists clamped outline width', () => {
    const workspace = store()
    const state = workspace.setOutlineWidth({ width: DOCUMENT_OUTLINE_MAX_WIDTH + 100 })

    expect(state.outlineWidth).toBe(DOCUMENT_OUTLINE_MAX_WIDTH)
    workspace.flushSync()
    expect(JSON.parse(readFileSync(join(tempDir, 'workspace.json'), 'utf-8'))).toMatchObject({
      outlineWidth: DOCUMENT_OUTLINE_MAX_WIDTH
    })
  })

  it('prunes missing tabs, recents, outline flags, and repairs the active tab', async () => {
    writeNote('keep.md')
    const externalPath = writeExternalNote()
    writeFileSync(
      join(tempDir, 'workspace.json'),
      JSON.stringify({
        schemaVersion: 1,
        tabs: [
          { id: 'missing-tab', sourcePath: 'missing.md', title: 'missing.md', viewMode: 'preview' },
          { id: 'keep-tab', sourcePath: 'keep.md', title: 'keep.md', viewMode: 'source' },
          {
            id: 'external-tab',
            externalPath,
            title: 'external.md',
            viewMode: 'preview'
          }
        ],
        activeTabId: 'missing-tab',
        recents: [
          { sourcePath: 'missing.md', title: 'missing.md', openedAt: '2026-05-21T12:00:00.000Z' },
          { sourcePath: 'keep.md', title: 'keep.md', openedAt: '2026-05-21T12:01:00.000Z' },
          {
            externalPath,
            title: 'external.md',
            openedAt: '2026-05-21T12:02:00.000Z'
          }
        ],
        outlineCollapsedByPath: {
          'missing.md': true,
          'keep.md': false
        }
      }),
      'utf-8'
    )

    const state = await store().pruneMissingFileRefs()

    expect(state.tabs.map((tab) => tab.id)).toEqual(['keep-tab', 'external-tab'])
    expect(state.activeTabId).toBe('keep-tab')
    expect(state.recents).toEqual([
      { sourcePath: 'keep.md', title: 'keep.md', openedAt: '2026-05-21T12:01:00.000Z' },
      { externalPath, title: 'external.md', openedAt: '2026-05-21T12:02:00.000Z' }
    ])
    expect(state.outlineCollapsedByPath).toEqual({ 'keep.md': false })
  })

  it('migrates retired and malformed sidebar modes back to the Library', () => {
    writeFileSync(
      join(tempDir, 'workspace.json'),
      JSON.stringify({
        schemaVersion: 0,
        shell: {
          sidebarCollapsed: 'yes',
          sidebarWidth: 1,
          activeSidebar: 'home'
        },
        window: {
          bounds: { x: 'bad', y: 0, width: 100, height: 100 },
          maximized: 'no'
        }
      }),
      'utf-8'
    )

    const state = store().publicState()
    expect(state.shell).toEqual({
      sidebarCollapsed: false,
      sidebarWidth: SIDEBAR_MIN_WIDTH,
      activeSidebar: 'files'
    })
    expect(state.window.bounds).toBeNull()
    expect(state.window.maximized).toBe(false)
    expect(state.library).toEqual({
      expandedFolders: null,
      scrollTop: 0,
      folderSortModes: {}
    })

    const saved = JSON.parse(readFileSync(join(tempDir, 'workspace.json'), 'utf-8')) as {
      schemaVersion: number
      shell: { sidebarWidth: number; activeSidebar: string }
    }
    expect(saved.schemaVersion).toBe(WORKSPACE_SCHEMA_VERSION)
    expect(saved.shell.sidebarWidth).toBe(SIDEBAR_MIN_WIDTH)
    expect(saved.shell.activeSidebar).toBe('files')
  })

  it('migrates valid tabs, recents, outline flags, and library state while dropping malformed entries', () => {
    writeFileSync(
      join(tempDir, 'workspace.json'),
      JSON.stringify({
        schemaVersion: 1,
        library: {
          expandedFolders: ['docs', '../escape', 'sessions/2026-07-02'],
          scrollTop: 55.4,
          folderSortModes: {
            docs: 'za',
            sessions: 'recency',
            'sessions/2026-07-02': 'za',
            research: 'newest'
          }
        },
        tabs: [
          { id: 'valid-tab', sourcePath: 'valid.md', title: 'Old', viewMode: 'source' },
          { id: 'bad-source', sourcePath: '../escape.md', title: 'Bad', viewMode: 'preview' },
          { id: 'bad-mode', sourcePath: 'bad.md', title: 'Bad', viewMode: 'diff' },
          { id: 'valid-tab', sourcePath: 'duplicate.md', title: 'Duplicate', viewMode: 'preview' }
        ],
        activeTabId: 'missing-tab',
        recents: [
          { sourcePath: 'valid.md', title: 'Old', openedAt: '2026-05-21T12:00:00.000Z' },
          { sourcePath: '/absolute.md', title: 'Bad', openedAt: '2026-05-21T12:01:00.000Z' },
          { sourcePath: 'stale.md', title: 'Bad', openedAt: 'not a date' }
        ],
        outlineCollapsedByPath: {
          'valid.md': true,
          '../escape.md': true,
          'bad.md': 'yes'
        },
        outlineWidth: 999
      }),
      'utf-8'
    )

    const state = store().publicState()

    expect(state.tabs).toEqual([
      { id: 'valid-tab', sourcePath: 'valid.md', title: 'valid.md', viewMode: 'source' }
    ])
    expect(state.activeTabId).toBe('valid-tab')
    expect(state.recents).toEqual([
      { sourcePath: 'valid.md', title: 'valid.md', openedAt: '2026-05-21T12:00:00.000Z' }
    ])
    expect(state.outlineCollapsedByPath).toEqual({ 'valid.md': true })
    expect(state.outlineWidth).toBe(DOCUMENT_OUTLINE_MAX_WIDTH)
    expect(state.library).toEqual({
      expandedFolders: ['docs', 'sessions/2026-07-02'],
      scrollTop: 55,
      folderSortModes: {
        docs: 'za',
        sessions: 'recency'
      }
    })
  })

  it('recovers invalid workspace JSON to defaults', () => {
    writeFileSync(join(tempDir, 'workspace.json'), '{', 'utf-8')

    expect(store().publicState()).toEqual(defaultWorkspaceState())
    expect(JSON.parse(readFileSync(join(tempDir, 'workspace.json'), 'utf-8'))).toEqual(
      defaultWorkspaceState()
    )
  })

  it('keeps a sensible default sidebar width for fresh state', () => {
    expect(store().publicState().shell.sidebarWidth).toBe(SIDEBAR_DEFAULT_WIDTH)
    expect(store().publicState().outlineWidth).toBe(DOCUMENT_OUTLINE_DEFAULT_WIDTH)
  })

  it('flushes debounced writes asynchronously', async () => {
    const workspace = store()
    workspace.updateShell({ sidebarCollapsed: true })

    await workspace.flush()

    expect(JSON.parse(readFileSync(join(tempDir, 'workspace.json'), 'utf-8'))).toMatchObject({
      shell: {
        sidebarCollapsed: true
      }
    })
    expect(readdirSync(tempDir).filter((name) => name !== 'notes')).toEqual(['workspace.json'])
  })
})

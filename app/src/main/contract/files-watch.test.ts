import { describe, expect, it, vi, type Mock } from 'vitest'

import { contract } from '../../contract'
import type { FileCatalogEntry } from '../../contract/files'
import type { WorkspaceFileRef } from '../../shared/workspace'
import type { CatalogChangeEvent } from '../indexing/watcher'
import { fileRefForWorkspaceTab } from '../workspace-tab-file'
import {
  createViewerWatch,
  forwardFileChanges,
  type FileChangeForwardingDependencies,
  type ViewerWatchDependencies
} from './files-watch'
import { createEmitter } from './register'

const ctx = { sender: {} as never }
const NOTES_ROOT = '/notes'
const TAB = 'tab-1'
const SOURCE_CHANNEL = contract.files.events.sourceChange.channel
const TAB_CHANNEL = contract.files.events.workspaceTabChange.channel

interface FakeWindow {
  name: string
  webContents: {
    isDestroyed: () => boolean
    send: ReturnType<typeof vi.fn>
  }
}

/** Every send, from every window, goes to one log, so a test sees the order across windows and events. */
function makeWindows(log: string[], count = 2): FakeWindow[] {
  return Array.from({ length: count }, (_, index) => {
    const name = `window${index + 1}`
    return {
      name,
      webContents: {
        isDestroyed: () => false,
        send: vi.fn((channel: string, ...args: unknown[]) => {
          log.push([name, channel, ...args.map((arg) => JSON.stringify(arg))].join(' '))
        })
      }
    }
  })
}

interface ViewerHarness {
  handlers: ReturnType<typeof createViewerWatch>
  windows: FakeWindow[]
  log: string[]
  viewerWatcher: {
    watch: Mock<(path: string) => Promise<void>>
    stop: Mock<() => Promise<void>>
    onChange: Mock<(callback: (path: string) => void) => () => void>
  }
  resolveSourcePathUnderRoot: Mock<ViewerWatchDependencies['resolveSourcePathUnderRoot']>
  sourcePathForViewerChange: Mock<ViewerWatchDependencies['sourcePathForViewerChange']>
  change: (path: string) => void
}

interface ForwardingHarness {
  log: string[]
  windows: FakeWindow[]
  fileCatalogEntryFor: Mock<FileChangeForwardingDependencies['fileCatalogEntryFor']>
  markTasksStale: Mock<() => void>
  stop: () => void
  stopTree: Mock<() => void>
  stopCatalog: Mock<() => void>
  tree: () => void
  catalog: (event: CatalogChangeEvent) => void
}

const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve))

describe('the viewer watch', () => {
  function setup(
    options: {
      tabs?: Record<string, WorkspaceFileRef>
      resolveSource?: ViewerWatchDependencies['resolveSourcePathUnderRoot']
      derive?: ViewerWatchDependencies['sourcePathForViewerChange']
      watch?: () => Promise<void>
    } = {}
  ): ViewerHarness {
    const log: string[] = []
    const windows = makeWindows(log)
    let onChange: ((path: string) => void) | undefined
    const viewerWatcher = {
      watch: vi.fn(async (path: string) => {
        log.push(`watch:${path}`)
        await options.watch?.()
      }),
      stop: vi.fn(async () => void log.push('stop')),
      onChange: vi.fn((callback: (path: string) => void) => {
        onChange = callback
        return () => undefined
      })
    }
    const tabs = options.tabs ?? {
      [TAB]: { sourcePath: 'docs/a.md' },
      'tab-2': { sourcePath: 'docs/b.md' },
      outside: { externalPath: '/outside/c.md' }
    }
    const store = { fileRefForTab: (tabId: string) => tabs[tabId] ?? null }
    const resolveSourcePathUnderRoot = vi.fn<ViewerWatchDependencies['resolveSourcePathUnderRoot']>(
      options.resolveSource ?? (async (sourcePath, notesRoot) => `/real${notesRoot}/${sourcePath}`)
    )
    // The real rule is tested in source-change-path.test.ts; here it echoes a watched path and otherwise
    // derives one from the changed path, which is enough to see what it was given.
    const sourcePathForViewerChange = vi.fn<ViewerWatchDependencies['sourcePathForViewerChange']>(
      options.derive ?? ((changedPath, _root, watched) => watched ?? `derived:${changedPath}`)
    )
    const handlers = createViewerWatch({
      viewerWatcher,
      getNotesRoot: () => NOTES_ROOT,
      fileRefForWorkspaceTab: (tabId) =>
        fileRefForWorkspaceTab(tabId, {
          store,
          resolveExternalMarkdownFile: async (path) => `/real${path}`
        }),
      resolveSourcePathUnderRoot,
      sourcePathForViewerChange,
      emit: createEmitter(() => windows)
    })
    return {
      handlers,
      windows,
      log,
      viewerWatcher,
      resolveSourcePathUnderRoot,
      sourcePathForViewerChange,
      change: (path: string): void => onChange!(path)
    }
  }

  const sends = (log: string[]): string[] => log.filter((entry) => entry.startsWith('window'))

  it('subscribes to the watcher once, when it is created', () => {
    const { viewerWatcher } = setup()
    expect(viewerWatcher.onChange).toHaveBeenCalledTimes(1)
  })

  it('watches a note through the notes-root check and remembers both its path and its tab', async () => {
    const {
      handlers,
      viewerWatcher,
      resolveSourcePathUnderRoot,
      sourcePathForViewerChange,
      change
    } = setup()

    await handlers.watchWorkspaceTab({ tabId: TAB }, ctx)

    expect(resolveSourcePathUnderRoot).toHaveBeenCalledWith('docs/a.md', NOTES_ROOT)
    expect(viewerWatcher.watch.mock.calls).toEqual([['/real/notes/docs/a.md']])
    change('/real/notes/docs/a.md')
    expect(sourcePathForViewerChange).toHaveBeenCalledWith(
      '/real/notes/docs/a.md',
      NOTES_ROOT,
      'docs/a.md'
    )
  })

  it('watches a file from outside the notes folder as it is, with a tab but no source path', async () => {
    const {
      handlers,
      viewerWatcher,
      resolveSourcePathUnderRoot,
      sourcePathForViewerChange,
      change,
      log
    } = setup()

    await handlers.watchWorkspaceTab({ tabId: 'outside' }, ctx)

    expect(resolveSourcePathUnderRoot).not.toHaveBeenCalled()
    expect(viewerWatcher.watch.mock.calls).toEqual([['/real/outside/c.md']])
    change('/real/outside/c.md')
    expect(sourcePathForViewerChange).toHaveBeenCalledWith('/real/outside/c.md', NOTES_ROOT, null)
    expect(sends(log).filter((entry) => entry.includes(TAB_CHANNEL))).toEqual([
      `window1 ${TAB_CHANNEL} "outside"`,
      `window2 ${TAB_CHANNEL} "outside"`
    ])
  })

  it('fails for an unknown tab, and leaves the previous watch as it was', async () => {
    const { handlers, viewerWatcher, sourcePathForViewerChange, change, log } = setup()
    await handlers.watchWorkspaceTab({ tabId: TAB }, ctx)

    await expect(handlers.watchWorkspaceTab({ tabId: 'nope' }, ctx)).rejects.toThrow(
      'Workspace tab not found'
    )

    expect(viewerWatcher.watch).toHaveBeenCalledTimes(1)
    expect(viewerWatcher.stop).not.toHaveBeenCalled()
    change('/real/notes/docs/a.md')
    expect(sourcePathForViewerChange).toHaveBeenLastCalledWith(
      '/real/notes/docs/a.md',
      NOTES_ROOT,
      'docs/a.md'
    )
    expect(sends(log)).toContain(`window1 ${TAB_CHANNEL} "${TAB}"`)
  })

  it('fails when a note resolves outside the notes folder, and leaves the previous watch as it was', async () => {
    let refuse = false
    const { handlers, viewerWatcher, change, log } = setup({
      resolveSource: async (sourcePath) => {
        if (refuse) throw new Error('Path resolves outside the notes folder')
        return `/real/${sourcePath}`
      }
    })
    await handlers.watchWorkspaceTab({ tabId: TAB }, ctx)
    refuse = true

    await expect(handlers.watchWorkspaceTab({ tabId: 'tab-2' }, ctx)).rejects.toThrow(
      'Path resolves outside the notes folder'
    )

    expect(viewerWatcher.watch).toHaveBeenCalledTimes(1)
    change('/real/docs/a.md')
    expect(sends(log)).toContain(`window1 ${TAB_CHANNEL} "${TAB}"`)
    expect(sends(log).some((entry) => entry.includes('tab-2'))).toBe(false)
  })

  it('remembers nothing when the watcher fails to start, since the old watch is gone by then', async () => {
    let fail = false
    const { handlers, change, log, sourcePathForViewerChange } = setup({
      watch: async () => {
        if (fail) throw new Error('watch failed')
      }
    })
    await handlers.watchWorkspaceTab({ tabId: TAB }, ctx)
    fail = true

    await expect(handlers.watchWorkspaceTab({ tabId: 'tab-2' }, ctx)).rejects.toThrow(
      'watch failed'
    )

    log.length = 0
    change('/real/notes/docs/a.md')
    expect(sourcePathForViewerChange).toHaveBeenLastCalledWith(
      '/real/notes/docs/a.md',
      NOTES_ROOT,
      null
    )
    expect(sends(log).some((entry) => entry.includes(TAB_CHANNEL))).toBe(false)
  })

  it('lets the last watch win: the first tab and its source path are forgotten', async () => {
    const { handlers, sourcePathForViewerChange, change, log } = setup()
    await handlers.watchWorkspaceTab({ tabId: TAB }, ctx)

    await handlers.watchWorkspaceTab({ tabId: 'outside' }, ctx)

    log.length = 0
    change('/real/outside/c.md')
    // A leaked source path of the first note would be reported as the change.
    expect(sourcePathForViewerChange).toHaveBeenLastCalledWith(
      '/real/outside/c.md',
      NOTES_ROOT,
      null
    )
    expect(sends(log).some((entry) => entry.includes(`"${TAB}"`))).toBe(false)
    expect(sends(log).some((entry) => entry.includes('docs/a.md'))).toBe(false)
  })

  it('forgets the old watch before the new one starts', async () => {
    let seenDuringWatch: string | undefined
    const harness = setup({
      watch: async () => {
        if (harness.viewerWatcher.watch.mock.calls.length === 2) {
          harness.sourcePathForViewerChange.mockClear()
          harness.change('/changed/while/starting')
          seenDuringWatch = String(harness.sourcePathForViewerChange.mock.calls[0]?.[2])
        }
      }
    })
    await harness.handlers.watchWorkspaceTab({ tabId: TAB }, ctx)

    await harness.handlers.watchWorkspaceTab({ tabId: 'tab-2' }, ctx)

    expect(seenDuringWatch).toBe('null')
  })

  it('stops watching and forgets the file on unwatch', async () => {
    const { handlers, viewerWatcher, sourcePathForViewerChange, change, log } = setup({
      derive: (_path, _root, watched) => watched
    })
    await handlers.watchWorkspaceTab({ tabId: TAB }, ctx)

    await handlers.unwatch(undefined, ctx)

    expect(viewerWatcher.stop).toHaveBeenCalledTimes(1)
    log.length = 0
    change('/real/notes/docs/a.md')
    expect(sourcePathForViewerChange).toHaveBeenLastCalledWith(
      '/real/notes/docs/a.md',
      NOTES_ROOT,
      null
    )
    expect(sends(log)).toEqual([])
  })

  it('forgets the file even when stopping the watcher fails', async () => {
    const { handlers, viewerWatcher, change, log } = setup({ derive: () => null })
    await handlers.watchWorkspaceTab({ tabId: TAB }, ctx)
    viewerWatcher.stop.mockRejectedValueOnce(new Error('stop failed'))

    await expect(handlers.unwatch(undefined, ctx)).rejects.toThrow('stop failed')

    log.length = 0
    change('/real/notes/docs/a.md')
    expect(sends(log)).toEqual([])
  })

  it('sends the source change, then the tab change, to every window', async () => {
    const { handlers, change, log } = setup()
    await handlers.watchWorkspaceTab({ tabId: TAB }, ctx)

    change('/real/notes/docs/a.md')

    expect(sends(log)).toEqual([
      `window1 ${SOURCE_CHANNEL} "docs/a.md"`,
      `window2 ${SOURCE_CHANNEL} "docs/a.md"`,
      `window1 ${TAB_CHANNEL} "${TAB}"`,
      `window2 ${TAB_CHANNEL} "${TAB}"`
    ])
  })

  it('sends no source change when no path can be told, but still the tab change', async () => {
    const { handlers, change, log } = setup({ derive: () => null })
    await handlers.watchWorkspaceTab({ tabId: TAB }, ctx)

    change('/real/notes/docs/a.md')

    expect(sends(log)).toEqual([
      `window1 ${TAB_CHANNEL} "${TAB}"`,
      `window2 ${TAB_CHANNEL} "${TAB}"`
    ])
  })

  it('derives the source path from the changed file when no note is watched, and sends no tab change', () => {
    const { change, log, sourcePathForViewerChange } = setup()

    change('/notes/docs/z.md')

    expect(sourcePathForViewerChange).toHaveBeenCalledWith('/notes/docs/z.md', NOTES_ROOT, null)
    expect(sends(log)).toEqual([
      `window1 ${SOURCE_CHANNEL} "derived:/notes/docs/z.md"`,
      `window2 ${SOURCE_CHANNEL} "derived:/notes/docs/z.md"`
    ])
  })

  it('sends nothing at all before anything is watched when no path can be told', () => {
    const { change, log } = setup({ derive: () => null })
    change('/notes/docs/z.md')
    expect(sends(log)).toEqual([])
  })

  it('skips a destroyed window and keeps going when one cannot receive', async () => {
    const { handlers, change, windows, log } = setup()
    await handlers.watchWorkspaceTab({ tabId: TAB }, ctx)
    windows[0]!.webContents.isDestroyed = () => true
    windows[1]!.webContents.send.mockImplementationOnce(() => {
      throw new Error('disposed frame')
    })
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    change('/real/notes/docs/a.md')

    // The failed source send is logged; the tab send to the same window still goes out.
    expect(error).toHaveBeenCalledTimes(1)
    expect(sends(log)).toEqual([`window2 ${TAB_CHANNEL} "${TAB}"`])
    error.mockRestore()
  })
})

describe('forwarding the file changes', () => {
  const entry: FileCatalogEntry = {
    sourcePath: 'plans/a.md',
    title: 'A',
    directory: 'plans',
    searchableText: 'a plans plans/a.md',
    pathDate: null,
    modifiedAt: '2026-01-02T00:00:00.000Z',
    modifiedAtMs: 1767312000000,
    createdAt: null,
    createdAtMs: null,
    sizeBytes: 5
  }

  function setup(
    options: {
      notesRoot?: () => string
      entryFor?: FileChangeForwardingDependencies['fileCatalogEntryFor']
    } = {}
  ): ForwardingHarness {
    const log: string[] = []
    const windows = makeWindows(log)
    let tree: (() => void) | undefined
    let catalog: ((event: CatalogChangeEvent) => void) | undefined
    const stopTree = vi.fn()
    const stopCatalog = vi.fn()
    const watcher = {
      onTreeChanged: vi.fn((callback: () => void) => {
        tree = callback
        return stopTree
      }),
      onCatalogChanged: vi.fn((callback: (event: CatalogChangeEvent) => void) => {
        catalog = callback
        return stopCatalog
      })
    }
    const fileCatalogEntryFor = vi.fn<FileChangeForwardingDependencies['fileCatalogEntryFor']>(
      options.entryFor ?? (async () => entry)
    )
    const markTasksStale = vi.fn(() => void log.push('markStale'))
    const stop = forwardFileChanges({
      watcher,
      getNotesRoot: options.notesRoot ?? (() => NOTES_ROOT),
      fileCatalogEntryFor,
      markTasksStale,
      emit: createEmitter(() => windows)
    })
    return {
      log,
      windows,
      fileCatalogEntryFor,
      markTasksStale,
      stop,
      stopTree,
      stopCatalog,
      tree: (): void => tree!(),
      catalog: (event: CatalogChangeEvent): void => catalog!(event)
    }
  }

  const TREE = contract.files.events.treeChanged.channel
  const CATALOG = contract.files.events.catalogChanged.channel
  const TASKS = contract.tasks.events.changed.channel

  it('sends a tree change to every window, with no payload', () => {
    const { tree, windows, log } = setup()

    tree()

    expect(log).toEqual([`window1 ${TREE}`, `window2 ${TREE}`])
    for (const win of windows) expect(win.webContents.send.mock.calls).toEqual([[TREE]])
  })

  it('drops an event from a watcher of a previous notes folder: nothing is marked stale or sent', async () => {
    const { catalog, log, markTasksStale, fileCatalogEntryFor } = setup({
      notesRoot: () => '/new-notes'
    })

    catalog({ type: 'remove', path: '/notes/plans/a.md', notesRoot: NOTES_ROOT })
    catalog({ type: 'upsert', path: '/notes/plans/a.md', notesRoot: NOTES_ROOT })
    await flush()

    expect(markTasksStale).not.toHaveBeenCalled()
    expect(fileCatalogEntryFor).not.toHaveBeenCalled()
    expect(log).toEqual([])
  })

  it('sends the new catalog entry of an upserted file to every window', async () => {
    const { catalog, log, fileCatalogEntryFor } = setup()

    catalog({ type: 'upsert', path: '/notes/plans/a.md', notesRoot: NOTES_ROOT })
    await flush()

    expect(fileCatalogEntryFor).toHaveBeenCalledWith(NOTES_ROOT, '/notes/plans/a.md')
    const payload = JSON.stringify({ type: 'upsert', file: entry })
    expect(log.filter((line) => line.includes(CATALOG))).toEqual([
      `window1 ${CATALOG} ${payload}`,
      `window2 ${CATALOG} ${payload}`
    ])
  })

  it('sends the notes-relative path of a removed file, without reading it', async () => {
    const { catalog, log, fileCatalogEntryFor } = setup()

    catalog({ type: 'remove', path: '/notes/plans/deep/a.md', notesRoot: NOTES_ROOT })
    await flush()

    expect(fileCatalogEntryFor).not.toHaveBeenCalled()
    const payload = JSON.stringify({ type: 'remove', sourcePath: 'plans/deep/a.md' })
    expect(log.filter((line) => line.includes(CATALOG))).toEqual([
      `window1 ${CATALOG} ${payload}`,
      `window2 ${CATALOG} ${payload}`
    ])
  })

  it('sends an undefined change to every window when the file cannot be read, which means refresh everything', async () => {
    const { catalog, windows } = setup({
      entryFor: async () => {
        throw new Error('ENOENT')
      }
    })

    catalog({ type: 'upsert', path: '/notes/plans/a.md', notesRoot: NOTES_ROOT })
    await flush()

    // The channel and an explicit `undefined`, as the renderer's `(event?) =>` has always received it.
    for (const win of windows) {
      expect(win.webContents.send.mock.calls.filter(([channel]) => channel === CATALOG)).toEqual([
        [CATALOG, undefined]
      ])
      const call = win.webContents.send.mock.calls.find(([channel]) => channel === CATALOG)!
      expect(call).toHaveLength(2)
    }
  })

  it('marks the tasks stale and tells the windows once per accepted event, before the catalog change', async () => {
    const { catalog, log } = setup()

    catalog({ type: 'upsert', path: '/notes/plans/a.md', notesRoot: NOTES_ROOT })
    await flush()

    expect(log.map((line) => line.split(' ').slice(0, 2).join(' '))).toEqual([
      'markStale',
      `window1 ${TASKS}`,
      `window2 ${TASKS}`,
      `window1 ${CATALOG}`,
      `window2 ${CATALOG}`
    ])
  })

  it('sends the catalog change for a picture but leaves the tasks alone', async () => {
    const { catalog, log, markTasksStale, fileCatalogEntryFor } = setup()

    catalog({ type: 'upsert', path: '/notes/img/a.png', notesRoot: NOTES_ROOT })
    await flush()

    expect(markTasksStale).not.toHaveBeenCalled()
    expect(log.some((line) => line.includes(TASKS))).toBe(false)
    expect(fileCatalogEntryFor).toHaveBeenCalledWith(NOTES_ROOT, '/notes/img/a.png')
    expect(log.some((line) => line.includes(CATALOG))).toBe(true)
  })

  it('does the same for a removed file and for an unreadable one', async () => {
    const readable = setup()
    readable.catalog({ type: 'remove', path: '/notes/a.md', notesRoot: NOTES_ROOT })
    await flush()
    expect(readable.markTasksStale).toHaveBeenCalledTimes(1)
    expect(readable.log.filter((line) => line.includes(TASKS))).toHaveLength(2)

    const unreadable = setup({
      entryFor: async () => {
        throw new Error('ENOENT')
      }
    })
    unreadable.catalog({ type: 'upsert', path: '/notes/a.md', notesRoot: NOTES_ROOT })
    await flush()
    expect(unreadable.markTasksStale).toHaveBeenCalledTimes(1)
    expect(unreadable.log.filter((line) => line.includes(TASKS))).toHaveLength(2)
  })

  it('reads the notes folder at the time of each event', async () => {
    let root = NOTES_ROOT
    const { catalog, log } = setup({ notesRoot: () => root })

    root = '/switched'
    catalog({ type: 'remove', path: '/notes/a.md', notesRoot: NOTES_ROOT })
    await flush()
    expect(log).toEqual([])

    root = NOTES_ROOT
    catalog({ type: 'remove', path: '/notes/a.md', notesRoot: NOTES_ROOT })
    await flush()
    expect(log.some((line) => line.includes(CATALOG))).toBe(true)
  })

  it('skips a destroyed window', () => {
    const { tree, windows, log } = setup()
    windows[0]!.webContents.isDestroyed = () => true

    tree()

    expect(log).toEqual([`window2 ${TREE}`])
  })

  it('stops listening to both when asked', () => {
    const { stop, stopTree, stopCatalog } = setup()

    stop()

    expect(stopTree).toHaveBeenCalledTimes(1)
    expect(stopCatalog).toHaveBeenCalledTimes(1)
  })
})

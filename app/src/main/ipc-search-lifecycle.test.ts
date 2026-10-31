import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { contract } from '../contract'

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  windows: [] as Array<{ webContents: { send: ReturnType<typeof vi.fn> } }>,
  search: vi.fn(),
  checkSnapshotFreshness: vi.fn(),
  cancel: vi.fn(),
  close: vi.fn(),
  clearAndRebuild: vi.fn(),
  getIndexerStatus: vi.fn(),
  triggerReindex: vi.fn(),
  indexerSubscriber: undefined as ((status: unknown) => void) | undefined,
  applyColorMode: vi.fn(),
  listModels: vi.fn(),
  getSecret: vi.fn(),
  recordModels: vi.fn(),
  init: vi.fn(),
  watcherStop: vi.fn(),
  watcherStart: vi.fn(),
  catalogChanged: undefined as
    | ((event: { type: 'upsert' | 'remove'; path: string; notesRoot: string }) => void)
    | undefined,
  catalogEntry: vi.fn(),
  settings: {
    notesRoot: '/notes',
    semanticIndexEnabled: false,
    embeddingProvider: 'openai',
    embeddingModel: 'text-embedding-3-small'
  }
}))

vi.mock('electron', () => ({
  app: { getVersion: vi.fn() },
  BrowserWindow: { getAllWindows: () => mocks.windows, fromWebContents: vi.fn() },
  clipboard: { writeText: vi.fn() },
  dialog: { showOpenDialog: vi.fn() },
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      mocks.handlers.set(channel, handler)
    }
  },
  shell: { openExternal: vi.fn(), showItemInFolder: vi.fn() }
}))

vi.mock('./app-menu', () => ({ refreshAppMenu: vi.fn() }))
vi.mock('./appearance', () => ({ applyColorMode: mocks.applyColorMode }))
vi.mock('./facts/task-facts-service', () => ({ taskFactsService: { markStale: vi.fn() } }))
vi.mock('./indexing/indexer-service', () => ({
  indexerService: {
    close: mocks.close,
    clearAndRebuild: mocks.clearAndRebuild,
    getStatus: mocks.getIndexerStatus,
    getVectorStore: () => ({}),
    init: mocks.init,
    subscribe: vi.fn((callback: (status: unknown) => void) => {
      mocks.indexerSubscriber = callback
      return vi.fn()
    }),
    triggerReindex: mocks.triggerReindex
  }
}))
vi.mock('./indexing/walker', () => ({ walkNotes: vi.fn() }))
vi.mock('./indexing/watcher', () => ({
  watcher: {
    onCatalogChanged: vi.fn((callback) => {
      mocks.catalogChanged = callback
    }),
    onTreeChanged: vi.fn(),
    start: mocks.watcherStart,
    stop: mocks.watcherStop
  }
}))
vi.mock('./search/search-service', () => ({
  SearchService: vi.fn().mockImplementation(() => ({
    cancel: mocks.cancel,
    checkSnapshotFreshness: mocks.checkSnapshotFreshness,
    search: mocks.search
  }))
}))
vi.mock('./settings/settings-store', () => ({
  settingsStore: {
    getSecret: mocks.getSecret,
    recordDiscoveredOpenAIModels: mocks.recordModels,
    load: () => ({ ...mocks.settings }),
    publicState: vi.fn(),
    update: (patch: { semanticIndexEnabled?: boolean }) => {
      if (patch.semanticIndexEnabled !== undefined) {
        mocks.settings.semanticIndexEnabled = patch.semanticIndexEnabled
      }
      return mocks.settings
    }
  }
}))
vi.mock('./settings/key-validation', () => ({
  validateProviderKey: vi.fn(),
  listAuthorizedOpenAIModels: mocks.listModels
}))
vi.mock('./viewer/file-reader', () => ({
  readFileSafe: vi.fn(),
  readSourceFileSafe: vi.fn(),
  readSourceTitleSafe: vi.fn(),
  resolveSourcePathUnderRoot: vi.fn()
}))
vi.mock('./viewer/file-catalog', () => ({
  listFileCatalog: vi.fn(),
  fileCatalogEntryFor: mocks.catalogEntry
}))
vi.mock('./viewer/source-change-path', () => ({ sourcePathForViewerChange: vi.fn() }))
vi.mock('./viewer/viewer-watcher', () => ({ viewerWatcher: { onChange: vi.fn(), stop: vi.fn() } }))
vi.mock('./workspace/workspace-store', () => ({ workspaceStore: {} }))

interface TestWebContents {
  destroyed: () => void
  isDestroyed: () => boolean
  removeListener: ReturnType<typeof vi.fn>
  send: ReturnType<typeof vi.fn>
  once: ReturnType<typeof vi.fn>
}

function makeWebContents(): TestWebContents {
  let onDestroyed: (() => void) | undefined
  let isDestroyed = false
  return {
    destroyed: () => {
      isDestroyed = true
      onDestroyed?.()
    },
    isDestroyed: () => isDestroyed,
    removeListener: vi.fn((_event: string, listener: () => void) => {
      if (onDestroyed === listener) onDestroyed = undefined
    }),
    send: vi.fn(),
    once: vi.fn((event: string, listener: () => void) => {
      if (event === 'destroyed') onDestroyed = listener
    })
  }
}

function handler(channel: string): (...args: unknown[]) => unknown {
  const registered = mocks.handlers.get(channel)
  if (!registered) throw new Error(`IPC handler was not registered: ${channel}`)
  return registered
}

describe('search IPC request lifecycle', () => {
  beforeEach(async () => {
    vi.useFakeTimers()
    vi.resetModules()
    mocks.handlers.clear()
    mocks.windows = []
    mocks.search.mockReset().mockImplementation(() => new Promise<void>(() => undefined))
    mocks.checkSnapshotFreshness.mockReset()
    mocks.cancel.mockReset()
    mocks.close.mockReset()
    mocks.applyColorMode.mockReset()
    mocks.listModels.mockReset()
    mocks.getSecret.mockReset().mockReturnValue('sk-test')
    mocks.recordModels.mockReset()
    mocks.clearAndRebuild.mockReset().mockResolvedValue(undefined)
    mocks.getIndexerStatus.mockReset()
    mocks.triggerReindex.mockReset().mockResolvedValue(undefined)
    mocks.indexerSubscriber = undefined
    mocks.init.mockReset().mockReturnValue(true)
    mocks.watcherStop.mockReset().mockResolvedValue(undefined)
    mocks.watcherStart.mockReset()
    mocks.catalogChanged = undefined
    mocks.catalogEntry.mockReset()
    mocks.settings = {
      notesRoot: '/notes',
      semanticIndexEnabled: false,
      embeddingProvider: 'openai',
      embeddingModel: 'text-embedding-3-small'
    }

    const { registerIpc } = await import('./ipc')
    registerIpc()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('remembers the models a refresh found, so the picker lists them after a restart', async () => {
    mocks.listModels.mockResolvedValue(['gpt-6-luna', 'gpt-5.2'])

    const models = await handler('settings:list-models')({}, 'openai')

    expect(models).toEqual(['gpt-6-luna', 'gpt-5.2'])
    expect(mocks.recordModels).toHaveBeenCalledWith(['gpt-6-luna', 'gpt-5.2'])
  })

  it('rejects, and records nothing, when the key was replaced while the list was loading', async () => {
    mocks.getSecret.mockReturnValueOnce('sk-old').mockReturnValue('sk-new')
    mocks.listModels.mockResolvedValue(['gpt-6-luna'])

    await expect(handler('settings:list-models')({}, 'openai')).rejects.toThrow(
      'API key changed while the models were loading'
    )

    expect(mocks.recordModels).not.toHaveBeenCalled()
  })

  it('still returns the list when it cannot be written to disk', async () => {
    mocks.listModels.mockResolvedValue(['gpt-6-luna'])
    mocks.recordModels.mockImplementation(() => {
      throw new Error('ENOSPC')
    })

    await expect(handler('settings:list-models')({}, 'openai')).resolves.toEqual(['gpt-6-luna'])
  })

  it('remembers nothing when the refresh fails', async () => {
    mocks.listModels.mockRejectedValue(new Error('401'))

    await expect(handler('settings:list-models')({}, 'openai')).rejects.toThrow('401')

    expect(mocks.recordModels).not.toHaveBeenCalled()
  })

  it('sends stream callbacks only to the webContents that started the request', async () => {
    const requester = makeWebContents()
    const otherWindow = makeWebContents()
    mocks.windows = [{ webContents: requester }, { webContents: otherWindow }]

    const requestId = handler('search:query')({ sender: requester }, 'release plan', {}) as string
    await vi.runAllTimersAsync()
    const callbacks = mocks.search.mock.calls[0]?.[2] as {
      onStage(stage: string): void
      onToken(token: string): void
    }

    callbacks.onStage('searching-local')
    callbacks.onToken('A streamed token')

    expect(requester.send).toHaveBeenCalledWith('search:stage', {
      requestId,
      stage: 'searching-local'
    })
    expect(requester.send).toHaveBeenCalledWith('search:stream-token', {
      requestId,
      token: 'A streamed token'
    })
    expect(otherWindow.send).not.toHaveBeenCalled()
  })

  it('applies a saved color mode to the window, and only when it was part of the change', async () => {
    await handler('settings:save')({}, { colorMode: 'dark' })
    expect(mocks.applyColorMode).toHaveBeenCalledWith('dark')

    mocks.applyColorMode.mockClear()
    await handler('settings:save')({}, { scrollbarVisibility: 'always' })
    expect(mocks.applyColorMode).not.toHaveBeenCalled()
  })

  it('cancels running searches when the index is about to be cleared and rebuilt', async () => {
    const requester = makeWebContents()
    mocks.windows = [{ webContents: requester }]

    const requestId = handler('search:query')({ sender: requester }, 'release plan', {}) as string
    await vi.runAllTimersAsync()
    const callbacks = mocks.search.mock.calls[0]?.[2] as { onToken(token: string): void }

    // The service decides when the clear is certain and calls back; searches stop only then.
    mocks.clearAndRebuild.mockImplementation(async (beforeClear?: () => void) => {
      expect(mocks.cancel).not.toHaveBeenCalled()
      beforeClear?.()
    })
    await handler(contract.indexer.operations.clearAndRebuild.channel)({ sender: requester })

    expect(mocks.cancel).toHaveBeenCalledWith(requestId)
    callbacks.onToken('late token')
    expect(requester.send).not.toHaveBeenCalled()
  })

  it('cancels a request when its requesting webContents is destroyed', async () => {
    const requester = makeWebContents()
    mocks.windows = [{ webContents: requester }]

    const requestId = handler('search:query')({ sender: requester }, 'release plan', {}) as string
    await vi.runAllTimersAsync()
    const callbacks = mocks.search.mock.calls[0]?.[2] as { onToken(token: string): void }
    requester.destroyed()

    expect(mocks.cancel).toHaveBeenCalledWith(requestId)
    callbacks.onToken('late token')
    expect(requester.send).not.toHaveBeenCalled()
  })

  it('only accepts cancellation from the webContents that started the request', async () => {
    const requester = makeWebContents()
    const otherWindow = makeWebContents()
    mocks.windows = [{ webContents: requester }, { webContents: otherWindow }]

    const requestId = handler('search:query')({ sender: requester }, 'release plan', {}) as string
    await vi.runAllTimersAsync()
    handler('search:cancel')({ sender: otherWindow }, requestId)

    expect(mocks.cancel).not.toHaveBeenCalled()
  })

  it('checks snapshot freshness through the main-owned search service', async () => {
    mocks.checkSnapshotFreshness.mockResolvedValue({
      state: 'current',
      changedSourcePaths: [],
      relevantSourcePaths: []
    })
    const requester = makeWebContents()

    await expect(
      handler('search:check-snapshot-freshness')(
        { sender: requester },
        {
          query: 'jira plans',
          retrievalMode: 'keyword',
          generatedAt: 100,
          sourcePaths: ['plans/jira.md']
        }
      )
    ).resolves.toEqual({
      state: 'current',
      changedSourcePaths: [],
      relevantSourcePaths: []
    })
    expect(mocks.checkSnapshotFreshness).toHaveBeenCalledWith({
      query: 'jira plans',
      retrievalMode: 'keyword',
      generatedAt: 100,
      sourcePaths: ['plans/jira.md']
    })
  })

  it('leaves running searches alone when the index service refuses to rebuild', async () => {
    const requester = makeWebContents()
    mocks.windows = [{ webContents: requester }]

    handler('search:query')({ sender: requester }, 'release plan', {})
    await vi.runAllTimersAsync()
    mocks.clearAndRebuild.mockRejectedValue(new Error('rebuild refused'))

    await expect(
      handler(contract.indexer.operations.clearAndRebuild.channel)({ sender: requester })
    ).rejects.toThrow('rebuild refused')
    expect(mocks.cancel).not.toHaveBeenCalled()
  })

  it('answers getStatus and triggerReindex through the registered indexer channels', async () => {
    const requester = makeWebContents()
    const status = {
      phase: 'idle',
      filesTotal: 2,
      filesDone: 2,
      chunksTotal: 5,
      chunksDone: 5,
      lastIndexedAt: null
    }
    mocks.getIndexerStatus.mockReturnValue(status)

    await expect(
      handler(contract.indexer.operations.getStatus.channel)({ sender: requester })
    ).resolves.toEqual(status)
    await expect(
      handler(contract.indexer.operations.triggerReindex.channel)({ sender: requester })
    ).resolves.toBeUndefined()
    expect(mocks.triggerReindex).toHaveBeenCalledTimes(1)
  })

  it('sends each indexer status once to every live window and to no destroyed window', () => {
    const first = makeWebContents()
    const second = makeWebContents()
    const closed = makeWebContents()
    closed.destroyed()
    mocks.windows = [{ webContents: first }, { webContents: closed }, { webContents: second }]
    const status = {
      phase: 'indexing',
      filesTotal: 4,
      filesDone: 1,
      chunksTotal: 20,
      chunksDone: 3,
      lastIndexedAt: '2026-10-30T00:00:00.000Z',
      error: 'partial'
    }

    mocks.indexerSubscriber?.(status)

    for (const live of [first, second]) {
      expect(live.send).toHaveBeenCalledTimes(1)
      expect(live.send).toHaveBeenCalledWith(contract.indexer.events.status.channel, status)
    }
    expect(closed.send).not.toHaveBeenCalled()
  })

  it('cancels active requests before replacing the search service for indexer settings', async () => {
    const requester = makeWebContents()
    mocks.windows = [{ webContents: requester }]

    const requestId = handler('search:query')({ sender: requester }, 'release plan', {}) as string
    await vi.runAllTimersAsync()
    await handler('settings:save')({ sender: requester }, { semanticIndexEnabled: true })

    expect(mocks.cancel).toHaveBeenCalledWith(requestId)
  })

  it('test_catalog_change_sends_one_typed_file_patch_to_each_window', async () => {
    const requester = makeWebContents()
    mocks.windows = [{ webContents: requester }]
    mocks.catalogEntry.mockResolvedValue({ sourcePath: 'plans/a.md', title: 'A' })

    mocks.catalogChanged?.({ type: 'upsert', path: '/notes/plans/a.md', notesRoot: '/notes' })
    await Promise.resolve()
    await Promise.resolve()

    expect(requester.send).toHaveBeenCalledWith('files:catalog-changed', {
      type: 'upsert',
      file: { sourcePath: 'plans/a.md', title: 'A' }
    })
  })

  it('drops catalog events from a watcher that belongs to a previous notes root', async () => {
    const requester = makeWebContents()
    mocks.windows = [{ webContents: requester }]
    mocks.settings.notesRoot = '/new-notes'

    mocks.catalogChanged?.({
      type: 'remove',
      path: '/notes/plans/a.md',
      notesRoot: '/notes'
    })
    await Promise.resolve()

    expect(requester.send).not.toHaveBeenCalledWith('files:catalog-changed', expect.anything())
  })
})

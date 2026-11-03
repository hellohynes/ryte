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
  indexerSubscribers: [] as Array<(status: unknown) => void>,
  indexerSubscribe: vi.fn(),
  noticeListeners: [] as Array<(notice: unknown) => void>,
  pendingNotice: vi.fn(),
  embeddingListeners: [] as Array<(status: unknown) => void>,
  embeddingStatus: vi.fn(),
  dismissNotice: vi.fn(),
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
    subscribe: (callback: (status: unknown) => void) => {
      mocks.indexerSubscribe()
      mocks.indexerSubscribers.push(callback)
      return vi.fn()
    },
    triggerReindex: mocks.triggerReindex,
    pendingRebuildNotice: mocks.pendingNotice,
    dismissRebuildNotice: mocks.dismissNotice,
    subscribeRebuildNotice: (callback: (notice: unknown) => void) => {
      mocks.noticeListeners.push(callback)
      return vi.fn()
    },
    getEmbeddingStatus: mocks.embeddingStatus,
    subscribeEmbeddingStatus: (callback: (status: unknown) => void) => {
      mocks.embeddingListeners.push(callback)
      return vi.fn()
    }
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
    update: (patch: { semanticIndexEnabled?: boolean; notesRoot?: string }) => {
      if (patch.semanticIndexEnabled !== undefined) {
        mocks.settings.semanticIndexEnabled = patch.semanticIndexEnabled
      }
      if (patch.notesRoot !== undefined) mocks.settings.notesRoot = patch.notesRoot
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
    mocks.indexerSubscribers = []
    mocks.noticeListeners = []
    mocks.pendingNotice.mockReset().mockReturnValue(null)
    mocks.embeddingListeners = []
    mocks.embeddingStatus
      .mockReset()
      .mockReturnValue({ state: 'off', total: 0, done: 0, pending: 0 })
    mocks.dismissNotice.mockReset()
    mocks.indexerSubscribe.mockReset()
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

    const models = await handler('settings:list-models')({}, { provider: 'openai' })

    expect(models).toEqual(['gpt-6-luna', 'gpt-5.2'])
    expect(mocks.recordModels).toHaveBeenCalledWith(['gpt-6-luna', 'gpt-5.2'])
  })

  it('rejects, and records nothing, when the key was replaced while the list was loading', async () => {
    mocks.getSecret.mockReturnValueOnce('sk-old').mockReturnValue('sk-new')
    mocks.listModels.mockResolvedValue(['gpt-6-luna'])

    await expect(handler('settings:list-models')({}, { provider: 'openai' })).rejects.toThrow(
      'API key changed while the models were loading'
    )

    expect(mocks.recordModels).not.toHaveBeenCalled()
  })

  it('still returns the list when it cannot be written to disk', async () => {
    mocks.listModels.mockResolvedValue(['gpt-6-luna'])
    mocks.recordModels.mockImplementation(() => {
      throw new Error('ENOSPC')
    })

    await expect(handler('settings:list-models')({}, { provider: 'openai' })).resolves.toEqual([
      'gpt-6-luna'
    ])
  })

  it('remembers nothing when the refresh fails', async () => {
    mocks.listModels.mockRejectedValue(new Error('401'))

    await expect(handler('settings:list-models')({}, { provider: 'openai' })).rejects.toThrow('401')

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

  describe('the index pass after a settings save', () => {
    it('starts one, once, after the indexer and watcher are running again, when the notes folder changed', async () => {
      await handler('settings:save')({}, { notesRoot: '/elsewhere' })

      expect(mocks.triggerReindex).toHaveBeenCalledTimes(1)
      const after = (call: { mock: { invocationCallOrder: number[] } }): number =>
        call.mock.invocationCallOrder[0] ?? 0
      expect(after(mocks.triggerReindex)).toBeGreaterThan(after(mocks.init))
      expect(after(mocks.triggerReindex)).toBeGreaterThan(after(mocks.watcherStart))
    })

    it('starts none for a restart that is not a folder change', async () => {
      await handler('settings:save')({}, { semanticIndexEnabled: true })

      expect(mocks.watcherStart).toHaveBeenCalledTimes(1)
      expect(mocks.triggerReindex).not.toHaveBeenCalled()
    })

    it('starts none, and initialises once, when the indexer cannot initialise', async () => {
      mocks.init.mockReturnValue(false)

      await handler('settings:save')({}, { notesRoot: '/elsewhere' })

      expect(mocks.init).toHaveBeenCalledTimes(1)
      expect(mocks.triggerReindex).not.toHaveBeenCalled()
    })
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

    // The cached search service is discarded too: the next query builds a new one over the rebuilt index.
    const { SearchService } = await import('./search/search-service')
    const built = vi.mocked(SearchService).mock.calls.length
    handler('search:query')({ sender: requester }, 'after the rebuild', {})
    await vi.runAllTimersAsync()
    expect(vi.mocked(SearchService).mock.calls.length).toBe(built + 1)
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

    // Every subscriber is called, as the real service does, so a second forwarder or a stray send would show.
    expect(mocks.indexerSubscribe, 'one subscription forwards the status').toHaveBeenCalledTimes(1)
    for (const subscriber of mocks.indexerSubscribers) subscriber(status)

    for (const live of [first, second]) {
      expect(live.send).toHaveBeenCalledTimes(1)
      expect(live.send).toHaveBeenCalledWith(contract.indexer.events.status.channel, status)
    }
    expect(closed.send).not.toHaveBeenCalled()
  })

  describe('the rebuild notice', () => {
    const notice = {
      message: 'Ryte is rebuilding its search index',
      detail: 'Search may be incomplete.'
    }

    it('is answered through the registered channels, and asking does not dismiss it', async () => {
      mocks.pendingNotice.mockReturnValue(notice)
      const asking = handler(contract.indexer.operations.getRebuildNotice.channel)

      await expect(asking({ sender: makeWebContents() })).resolves.toEqual(notice)
      await expect(asking({ sender: makeWebContents() })).resolves.toEqual(notice)
      expect(mocks.dismissNotice).not.toHaveBeenCalled()

      await expect(
        handler(contract.indexer.operations.dismissRebuildNotice.channel)({
          sender: makeWebContents()
        })
      ).resolves.toBeUndefined()
      expect(mocks.dismissNotice).toHaveBeenCalledTimes(1)
    })

    it('is sent to every live window when it appears or is dismissed, once each', () => {
      const first = makeWebContents()
      const closed = makeWebContents()
      closed.destroyed()
      const second = makeWebContents()
      mocks.windows = [{ webContents: first }, { webContents: closed }, { webContents: second }]

      expect(mocks.noticeListeners, 'one forwarder').toHaveLength(1)
      for (const listener of mocks.noticeListeners) listener(notice)
      for (const listener of mocks.noticeListeners) listener(null)

      for (const live of [first, second]) {
        expect(live.send.mock.calls).toEqual([
          [contract.indexer.events.rebuildNotice.channel, notice],
          [contract.indexer.events.rebuildNotice.channel, null]
        ])
      }
      expect(closed.send).not.toHaveBeenCalled()
    })
  })

  describe('the embedding status', () => {
    const running = { state: 'running', total: 10, done: 3, pending: 7 }

    it('is answered through the registered channel with the service state each time', async () => {
      mocks.embeddingStatus.mockReturnValue(running)
      const asking = handler(contract.indexer.operations.getEmbeddingStatus.channel)

      await expect(asking({ sender: makeWebContents() })).resolves.toEqual(running)
      mocks.embeddingStatus.mockReturnValue({ ...running, done: 4, pending: 6 })
      await expect(asking({ sender: makeWebContents() })).resolves.toEqual({
        ...running,
        done: 4,
        pending: 6
      })
    })

    it('is sent to every live window, once each, and not to a closed one', () => {
      const first = makeWebContents()
      const closed = makeWebContents()
      closed.destroyed()
      const second = makeWebContents()
      mocks.windows = [{ webContents: first }, { webContents: closed }, { webContents: second }]

      expect(mocks.embeddingListeners, 'one forwarder').toHaveLength(1)
      for (const listener of mocks.embeddingListeners) listener(running)

      for (const live of [first, second]) {
        expect(live.send.mock.calls).toEqual([
          [contract.indexer.events.embeddingStatus.channel, running]
        ])
      }
      expect(closed.send).not.toHaveBeenCalled()
    })
  })

  it('cancels active requests before replacing the search service for indexer settings', async () => {
    const requester = makeWebContents()
    mocks.windows = [{ webContents: requester }]

    const requestId = handler('search:query')({ sender: requester }, 'release plan', {}) as string
    await vi.runAllTimersAsync()
    await handler('settings:save')({ sender: requester }, { semanticIndexEnabled: true })

    expect(mocks.cancel).toHaveBeenCalledWith(requestId)
  })

  describe('restarting the indexer after a settings change', () => {
    // Every step of the restart writes to one shared log, so the tests see the order and not only the calls.
    function logRestartSteps(options: { initReady?: boolean } = {}): string[] {
      const calls: string[] = []
      mocks.watcherStop.mockImplementation(async () => {
        calls.push('watcher.stop:begin')
        await Promise.resolve()
        await Promise.resolve()
        calls.push('watcher.stop:end')
      })
      mocks.cancel.mockImplementation(() => {
        calls.push('searches.cancel')
      })
      mocks.close.mockImplementation(() => {
        calls.push('indexer.close')
      })
      mocks.init.mockImplementation(() => {
        calls.push('indexer.init')
        return options.initReady ?? true
      })
      mocks.watcherStart.mockImplementation((root: string) => {
        calls.push(`watcher.start:${root}`)
      })
      return calls
    }

    async function startSearch(): Promise<ReturnType<typeof makeWebContents>> {
      const requester = makeWebContents()
      mocks.windows = [{ webContents: requester }]
      handler('search:query')({ sender: requester }, 'release plan', {})
      await vi.runAllTimersAsync()
      return requester
    }

    const RESTART_ORDER = [
      'watcher.stop:begin',
      'watcher.stop:end',
      'searches.cancel',
      'indexer.close',
      'indexer.init'
    ]

    it('stops the watcher, then cancels searches, closes and re-initialises the indexer, then restarts the watcher on the new notes root', async () => {
      const requester = await startSearch()
      const calls = logRestartSteps()

      await handler('settings:save')({ sender: requester }, { notesRoot: '/synthetic/new-root' })

      expect(calls).toEqual([...RESTART_ORDER, 'watcher.start:/synthetic/new-root'])
    })

    it('builds a new search service for the next query after a restart', async () => {
      const requester = await startSearch()
      logRestartSteps()
      const { SearchService } = await import('./search/search-service')
      const built = vi.mocked(SearchService).mock.calls.length

      await handler('settings:save')({ sender: requester }, { notesRoot: '/synthetic/new-root' })
      handler('search:query')({ sender: requester }, 'after the restart', {})
      await vi.runAllTimersAsync()

      expect(vi.mocked(SearchService).mock.calls.length).toBe(built + 1)
    })

    it('does not start the watcher when the indexer cannot initialise', async () => {
      const requester = await startSearch()
      const calls = logRestartSteps({ initReady: false })

      await handler('settings:save')({ sender: requester }, { notesRoot: '/synthetic/new-root' })

      expect(calls).toEqual(RESTART_ORDER)
    })

    it.each([
      ['a different notes root', { notesRoot: '/synthetic/new-root' }, true],
      ['the same notes root', { notesRoot: '/notes' }, false],
      ['the semantic index switched on', { semanticIndexEnabled: true }, true],
      ['the semantic index left off', { semanticIndexEnabled: false }, false],
      ['a new OpenAI key', { openaiKey: 'synthetic-key-value' }, true],
      ['a new Anthropic key', { anthropicKey: 'synthetic-key-value' }, false],
      ['a new Gemini key', { geminiKey: 'synthetic-key-value' }, false],
      ['deleting the OpenAI key', { deleteProviderKeys: ['openai'] }, true],
      [
        'deleting the OpenAI key with another',
        { deleteProviderKeys: ['anthropic', 'openai'] },
        true
      ],
      ['deleting another key', { deleteProviderKeys: ['anthropic'] }, false],
      ['a color mode', { colorMode: 'dark' }, false],
      ['a font', { fontFamily: 'geist' }, false],
      ['an empty patch', {}, false]
    ] as const)('restarts the indexer for %s: %s', async (_label, patch, restarts) => {
      const requester = await startSearch()
      const calls = logRestartSteps()

      await handler('settings:save')({ sender: requester }, patch)

      expect(calls.length > 0, `restart for ${JSON.stringify(patch)}`).toBe(restarts)
    })

    it('rejects with the settings already saved when stopping the watcher fails, and goes no further', async () => {
      const requester = await startSearch()
      const calls = logRestartSteps()
      mocks.watcherStop.mockRejectedValue(new Error('stop failed'))

      await expect(
        handler('settings:save')(
          { sender: requester },
          { notesRoot: '/synthetic/new-root', colorMode: 'dark' }
        )
      ).rejects.toThrow('stop failed')

      expect(mocks.settings.notesRoot).toBe('/synthetic/new-root')
      expect(mocks.applyColorMode).toHaveBeenCalledWith('dark')
      expect(calls).toEqual([])
    })

    it('rejects with the settings already saved when the indexer fails to initialise, and starts no watcher', async () => {
      const requester = await startSearch()
      const calls = logRestartSteps()
      mocks.init.mockImplementation(() => {
        calls.push('indexer.init')
        throw new Error('init failed')
      })

      await expect(
        handler('settings:save')({ sender: requester }, { notesRoot: '/synthetic/new-root' })
      ).rejects.toThrow('init failed')

      expect(mocks.settings.notesRoot).toBe('/synthetic/new-root')
      expect(calls).toEqual([...RESTART_ORDER])
    })
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

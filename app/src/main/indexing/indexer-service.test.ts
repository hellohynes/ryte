import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  userData: '',
  vectorStoreInit: vi.fn(),
  vectorStoreClose: vi.fn(),
  indexerIndexAll: vi.fn(),
  indexerIndexFile: vi.fn()
}))

vi.mock('./vector-store', () => ({
  VectorStore: vi.fn().mockImplementation(() => ({
    init: mocks.vectorStoreInit,
    close: mocks.vectorStoreClose,
    database: {}
  }))
}))

vi.mock('./index-state', () => ({
  IndexStateStore: vi.fn().mockImplementation(() => ({
    init: vi.fn(),
    totals: vi.fn().mockReturnValue({ files: 0, chunks: 0 })
  }))
}))

vi.mock('./indexer', () => ({
  Indexer: vi.fn().mockImplementation(() => ({
    indexAll: mocks.indexerIndexAll,
    indexFile: mocks.indexerIndexFile
  }))
}))

vi.mock('../settings/settings-store', () => ({
  settingsStore: {
    getSecret: vi.fn().mockReturnValue(null),
    load: vi.fn().mockReturnValue({
      schemaVersion: 3,
      notesRoot: '/tmp/notes',
      cloudAnswersEnabled: false,
      semanticIndexEnabled: false,
      cloudAnswersAcknowledgement: null,
      semanticIndexAcknowledgement: null,
      answerProvider: 'openai',
      answerModel: 'gpt-5.2',
      embeddingProvider: 'openai',
      embeddingModel: 'text-embedding-3-small',
      searchHistoryRetention: '30-days',
      searchHistoryIncludesAnswers: false,
      encryptedKeys: {},
      providerKeyMetadata: {},
      discoveredOpenAIModels: null
    })
  }
}))

vi.mock('../paths', () => ({
  userDataDir: () => mocks.userData
}))

// Every test gets its own data folder, so the index files the service creates and removes are real and isolated.
beforeEach(() => {
  mocks.userData = mkdtempSync(join(tmpdir(), 'ryte-indexer-service-'))
})

afterEach(() => {
  rmSync(mocks.userData, { recursive: true, force: true })
})

const mockEmbed = vi.fn().mockResolvedValue([Float32Array.from([1, 0, 0])])

vi.mock('./embedder', () => ({
  OpenAIEmbeddingProvider: vi.fn().mockImplementation(() => ({
    dim: 1536,
    embed: mockEmbed
  }))
}))

describe('IndexerService.embed()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.vectorStoreInit.mockReturnValue(undefined)
    mocks.indexerIndexAll.mockResolvedValue({ filesIndexed: 0, chunksIndexed: 0 })
    mocks.indexerIndexFile.mockResolvedValue({ chunkCount: 1, skipped: false })
    mockEmbed.mockResolvedValue([Float32Array.from([1, 0, 0])])
  })

  it('throws when no embedding provider is configured', async () => {
    const { IndexerService } = await import('./indexer-service')
    const svc = new IndexerService()
    await expect(svc.embed(['hello'])).rejects.toThrow('No embedding provider configured')
  })

  it('delegates to the embedder when initialized', async () => {
    const { settingsStore } = await import('../settings/settings-store')
    const { IndexerService } = await import('./indexer-service')
    vi.mocked(settingsStore.getSecret).mockReturnValue('sk-test')
    vi.mocked(settingsStore.load).mockReturnValue({
      schemaVersion: 4,
      notesRoot: '/tmp/notes',
      cloudAnswersEnabled: false,
      semanticIndexEnabled: true,
      cloudAnswersAcknowledgement: null,
      semanticIndexAcknowledgement: null,
      answerProvider: 'openai',
      answerModel: 'gpt-5.2',
      embeddingProvider: 'openai',
      embeddingModel: 'text-embedding-3-small',
      searchHistoryRetention: '30-days',
      searchHistoryIncludesAnswers: false,
      scrollbarVisibility: 'auto',
      fontFamily: 'geist',
      colorMode: 'system',
      ticketLinkBase: '',
      pullRequestLinkBase: '',
      encryptedKeys: {},
      providerKeyMetadata: {},
      discoveredOpenAIModels: null
    })
    const svc = new IndexerService()
    svc.init()
    const result = await svc.embed(['hello world'])
    expect(mockEmbed).toHaveBeenCalledWith(['hello world'])
    expect(result).toHaveLength(1)
    expect(result[0]).toBeInstanceOf(Float32Array)
  })

  it('rebuilds the index database when initialization sees a malformed database', async () => {
    const { IndexerService } = await import('./indexer-service')
    mocks.vectorStoreInit
      .mockImplementationOnce(() => {
        throw new Error('database disk image is malformed')
      })
      .mockImplementation(() => undefined)

    const svc = new IndexerService()
    svc.init()

    expect(mocks.vectorStoreClose).toHaveBeenCalled()
    expect(mocks.vectorStoreInit).toHaveBeenCalledTimes(2)
  })

  it('rebuilds and retries once when reindexing sees a malformed database', async () => {
    const { IndexerService } = await import('./indexer-service')
    mocks.indexerIndexAll
      .mockRejectedValueOnce(new Error('database disk image is malformed'))
      .mockResolvedValueOnce({ filesIndexed: 0, chunksIndexed: 0 })

    const svc = new IndexerService()
    svc.init()
    await svc.triggerReindex()

    expect(mocks.indexerIndexAll).toHaveBeenCalledTimes(2)
    expect(mocks.vectorStoreClose).toHaveBeenCalled()
    expect(mocks.vectorStoreInit).toHaveBeenCalledTimes(2)
    expect(svc.getStatus().phase).not.toBe('error')
  })

  it('clears the local index store and rebuilds on request', async () => {
    const { IndexerService } = await import('./indexer-service')

    const svc = new IndexerService()
    svc.init()
    await svc.clearAndRebuild()

    expect(mocks.vectorStoreClose).toHaveBeenCalled()
    expect(mocks.vectorStoreInit).toHaveBeenCalledTimes(2)
    expect(mocks.indexerIndexAll).toHaveBeenCalledOnce()
  })

  it('reports an incremental indexing failure through index status instead of rejecting detached work', async () => {
    const { IndexerService } = await import('./indexer-service')
    mocks.indexerIndexFile.mockRejectedValueOnce(new Error('synthetic incremental index failure'))

    const svc = new IndexerService()
    svc.init()

    await expect(svc.notifyFileChanged('/tmp/notes/changed.md')).resolves.toBeUndefined()
    expect(svc.getStatus()).toMatchObject({
      phase: 'error',
      error: 'synthetic incremental index failure'
    })
  })
})

describe('IndexerService.clearAndRebuild() with embeddings on', () => {
  async function semanticService(): Promise<
    InstanceType<typeof import('./indexer-service').IndexerService>
  > {
    const { settingsStore } = await import('../settings/settings-store')
    const { IndexerService } = await import('./indexer-service')
    vi.mocked(settingsStore.getSecret).mockReturnValue('sk-test')
    vi.mocked(settingsStore.load).mockReturnValue({
      ...vi.mocked(settingsStore.load)(),
      semanticIndexEnabled: true
    })
    const svc = new IndexerService()
    svc.init()
    return svc
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.vectorStoreInit.mockReturnValue(undefined)
    mocks.indexerIndexAll.mockResolvedValue({ filesIndexed: 0, chunksIndexed: 0 })
    mockEmbed.mockResolvedValue([Float32Array.from([1, 0, 0])])
  })

  it('leaves the working index alone when embeddings do not work', async () => {
    const svc = await semanticService()
    const seen: Array<{ phase: string }> = []
    svc.subscribe((status) => seen.push(status))
    seen.length = 0
    mockEmbed.mockRejectedValueOnce(new Error('Incorrect API key provided'))
    const beforeClear = vi.fn()

    await expect(svc.clearAndRebuild(beforeClear)).rejects.toThrow('Incorrect API key provided')

    expect(beforeClear).not.toHaveBeenCalled()
    expect(mocks.vectorStoreClose).not.toHaveBeenCalled()
    expect(mocks.indexerIndexAll).not.toHaveBeenCalled()
    expect(svc.getStatus()).toMatchObject({ phase: 'error' })
    // The intact index is never reported as empty on the way to the error.
    expect(seen.map((status) => status.phase)).not.toContain('walking')
  })

  it('gives up on an embedding service that does not answer, leaving the index alone', async () => {
    vi.useFakeTimers()
    try {
      const svc = await semanticService()
      mockEmbed.mockImplementationOnce(() => new Promise(() => undefined))

      const rebuild = svc.clearAndRebuild()
      const outcome = expect(rebuild).rejects.toThrow(/did not respond/i)
      await vi.advanceTimersByTimeAsync(20_000)
      await outcome

      expect(mocks.vectorStoreClose).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('tells the caller to stop searches only once the index is really about to be cleared', async () => {
    const svc = await semanticService()
    const order: string[] = []
    mocks.vectorStoreClose.mockImplementation(() => order.push('clear'))
    const beforeClear = vi.fn(() => order.push('beforeClear'))

    await svc.clearAndRebuild(beforeClear)

    expect(order.slice(0, 2)).toEqual(['beforeClear', 'clear'])
  })

  it('still ends with a working keyword index when embedding fails part way through', async () => {
    const { Indexer } = await import('./indexer')
    const svc = await semanticService()
    mocks.indexerIndexAll
      .mockRejectedValueOnce(new Error('Rate limit reached'))
      .mockResolvedValueOnce({ filesIndexed: 3, chunksIndexed: 9 })

    await expect(svc.clearAndRebuild()).resolves.toBeUndefined()

    // Notes are indexed for keyword search, then the configured embedder is put back.
    const rebuilds = vi.mocked(Indexer).mock.calls
    expect(rebuilds.at(-2)?.[0].embedder).toBeNull()
    expect(rebuilds.at(-1)?.[0].embedder).not.toBeNull()
    expect(mocks.indexerIndexAll).toHaveBeenCalledTimes(2)
    expect(svc.getStatus()).toMatchObject({ phase: 'error' })
    expect(svc.getStatus().error).toMatch(/keyword search only/i)
    expect(svc.getStatus().error).toMatch(/Rate limit reached/)
  })

  it("gives the keyword-only fallback store the embedder's dimensions", async () => {
    const { OpenAIEmbeddingProvider } = await import('./embedder')
    vi.mocked(OpenAIEmbeddingProvider).mockImplementation(
      () => ({ dim: 3072, embed: mockEmbed }) as never
    )
    try {
      const svc = await semanticService()
      mocks.indexerIndexAll
        .mockRejectedValueOnce(new Error('Rate limit reached'))
        .mockResolvedValueOnce({ filesIndexed: 0, chunksIndexed: 0 })
      mocks.vectorStoreInit.mockClear()

      await svc.clearAndRebuild()

      const dimensions = mocks.vectorStoreInit.mock.calls.map((call) => call[0])
      expect(dimensions.length).toBeGreaterThanOrEqual(3)
      expect(new Set(dimensions)).toEqual(new Set([3072]))
    } finally {
      vi.mocked(OpenAIEmbeddingProvider).mockImplementation(
        () => ({ dim: 1536, embed: mockEmbed }) as never
      )
    }
  })

  it('runs a reindex that was asked for while another run was going, once', async () => {
    const svc = await semanticService()
    let finishFirst!: () => void
    mocks.indexerIndexAll.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishFirst = () => resolve({ filesIndexed: 0, chunksIndexed: 0 })
        })
    )
    const first = svc.triggerReindex()
    await vi.waitFor(() => expect(mocks.indexerIndexAll).toHaveBeenCalledTimes(1))

    // Settings changed mid-run: several requests collapse into one follow-up run.
    await svc.triggerReindex()
    await svc.triggerReindex()
    expect(mocks.indexerIndexAll).toHaveBeenCalledTimes(1)

    finishFirst()
    await first
    await vi.waitFor(() => expect(mocks.indexerIndexAll).toHaveBeenCalledTimes(2))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(mocks.indexerIndexAll).toHaveBeenCalledTimes(2)
  })

  it('does not run a queued reindex ahead of a rebuild that is already waiting', async () => {
    const svc = await semanticService()
    let finishFirst!: () => void
    mocks.indexerIndexAll.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishFirst = () => resolve({ filesIndexed: 0, chunksIndexed: 0 })
        })
    )
    const first = svc.triggerReindex()
    await vi.waitFor(() => expect(mocks.indexerIndexAll).toHaveBeenCalledTimes(1))
    const rebuild = svc.clearAndRebuild()
    await svc.triggerReindex()

    finishFirst()
    await first
    await rebuild
    await new Promise((resolve) => setTimeout(resolve, 20))

    // The first run and the rebuild; the queued request is covered by the rebuild.
    expect(mocks.indexerIndexAll).toHaveBeenCalledTimes(2)
  })

  it('still runs a queued reindex when the rebuild that was waiting fails before indexing', async () => {
    const svc = await semanticService()
    let finishFirst!: () => void
    mocks.indexerIndexAll.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishFirst = () => resolve({ filesIndexed: 0, chunksIndexed: 0 })
        })
    )
    const first = svc.triggerReindex()
    await vi.waitFor(() => expect(mocks.indexerIndexAll).toHaveBeenCalledTimes(1))
    // The rebuild waits, and its key check will fail; the reindex asked for meanwhile must survive.
    mockEmbed.mockRejectedValueOnce(new Error('Incorrect API key provided'))
    const rebuild = expect(svc.clearAndRebuild()).rejects.toThrow('Incorrect API key provided')
    await svc.triggerReindex()

    finishFirst()
    await first
    await rebuild
    await vi.waitFor(() => expect(mocks.indexerIndexAll).toHaveBeenCalledTimes(2))
  })

  it('refuses to clear the index when the check returns no vector at all', async () => {
    const svc = await semanticService()
    mockEmbed.mockResolvedValueOnce(new Array(1))

    await expect(svc.clearAndRebuild()).rejects.toThrow(/did not return a vector/i)

    expect(mocks.vectorStoreClose).not.toHaveBeenCalled()
    expect(mocks.indexerIndexAll).not.toHaveBeenCalled()
  })

  it('does not run again when nothing was asked for during a run', async () => {
    const svc = await semanticService()

    await svc.triggerReindex()
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(mocks.indexerIndexAll).toHaveBeenCalledTimes(1)
  })

  it('invalidates the callers around each time the fallback replaces the store', async () => {
    const svc = await semanticService()
    mocks.indexerIndexAll
      .mockRejectedValueOnce(new Error('Rate limit reached'))
      .mockResolvedValueOnce({ filesIndexed: 0, chunksIndexed: 0 })
    const events: string[] = []
    mocks.vectorStoreClose.mockImplementation(() => events.push('close'))

    await svc.clearAndRebuild(() => events.push('beforeClear'))

    // Callers are told before every close, and once more after the last store is in place.
    expect(events).toEqual([
      'beforeClear',
      'close',
      'beforeClear',
      'close',
      'beforeClear',
      'close',
      'beforeClear'
    ])
  })

  it('does not leave a half-built store behind when the fallback itself cannot start', async () => {
    const svc = await semanticService()
    mocks.indexerIndexAll.mockRejectedValueOnce(new Error('Rate limit reached'))
    // The store set up for the rebuild works; the fallback's own store cannot be set up.
    mocks.vectorStoreInit
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => {
        throw new Error('disk full')
      })
    mocks.vectorStoreClose.mockClear()

    await expect(svc.clearAndRebuild()).rejects.toThrow('disk full')

    // Closed to clear the index, closed to start the fallback, and closed again when the fallback's
    // own store could not be set up.
    expect(mocks.vectorStoreClose).toHaveBeenCalledTimes(3)
  })

  it('waits for an index run already in progress instead of failing', async () => {
    const svc = await semanticService()
    let finishFirst!: () => void
    mocks.indexerIndexAll.mockImplementationOnce(
      () =>
        new Promise(
          (resolve) => (finishFirst = () => resolve({ filesIndexed: 0, chunksIndexed: 0 }))
        )
    )
    const first = svc.triggerReindex()
    await vi.waitFor(() => expect(mocks.indexerIndexAll).toHaveBeenCalledTimes(1))

    const rebuild = svc.clearAndRebuild()
    await Promise.resolve()
    expect(mocks.vectorStoreClose).not.toHaveBeenCalled()

    finishFirst()
    await first
    await rebuild
    expect(mocks.indexerIndexAll).toHaveBeenCalledTimes(2)
    expect(mocks.vectorStoreClose).toHaveBeenCalled()
  })
})

describe('IndexerService index location', () => {
  let notesA: string
  let notesB: string

  async function useNotesRoot(
    notesRoot: string,
    options: { semantic?: boolean } = {}
  ): Promise<void> {
    const { settingsStore } = await import('../settings/settings-store')
    vi.mocked(settingsStore.getSecret).mockReturnValue(options.semantic ? 'sk-test' : null)
    vi.mocked(settingsStore.load).mockReturnValue({
      ...vi.mocked(settingsStore.load)(),
      notesRoot,
      semanticIndexEnabled: options.semantic ?? false
    })
  }

  async function constructedPaths(): Promise<string[]> {
    const { VectorStore } = await import('./vector-store')
    return vi.mocked(VectorStore).mock.calls.map((call) => String(call[0]))
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.vectorStoreInit.mockReturnValue(undefined)
    mocks.indexerIndexAll.mockResolvedValue({ filesIndexed: 0, chunksIndexed: 0 })
    mockEmbed.mockResolvedValue([Float32Array.from([1, 0, 0])])
    notesA = join(mocks.userData, 'notes-a')
    notesB = join(mocks.userData, 'notes-b')
    mkdirSync(notesA)
    mkdirSync(notesB)
  })

  it("opens a different index file for a different notes folder, under the app's data folder", async () => {
    const { IndexerService } = await import('./indexer-service')
    const svc = new IndexerService()

    await useNotesRoot(notesA)
    svc.init()
    svc.close()
    await useNotesRoot(notesB)
    svc.init()

    const [first, second] = await constructedPaths()
    expect(first).not.toBe(second)
    expect(first?.startsWith(join(mocks.userData, 'index'))).toBe(true)
    expect(second?.startsWith(join(mocks.userData, 'index'))).toBe(true)
    // Nothing is created inside either notes folder.
    expect(existsSync(join(notesA, 'index'))).toBe(false)
  })

  it('reopens the same file for the same folder', async () => {
    const { IndexerService } = await import('./indexer-service')
    const svc = new IndexerService()

    await useNotesRoot(notesA)
    svc.init()
    svc.close()
    svc.init()

    const [first, second] = await constructedPaths()
    expect(first).toBe(second)
  })

  it("removes the previous folder's index file when another folder is opened", async () => {
    const { IndexerService } = await import('./indexer-service')
    const svc = new IndexerService()
    await useNotesRoot(notesA)
    svc.init()
    const [pathA] = await constructedPaths()
    writeFileSync(pathA as string, 'index of folder A')
    writeFileSync(`${pathA}-wal`, 'x')
    svc.close()

    await useNotesRoot(notesB)
    svc.init()

    expect(existsSync(pathA as string)).toBe(false)
    expect(existsSync(`${pathA}-wal`)).toBe(false)
  })

  it("keeps the current folder's own index file when it is opened again", async () => {
    const { IndexerService } = await import('./indexer-service')
    const svc = new IndexerService()
    await useNotesRoot(notesA)
    svc.init()
    const [pathA] = await constructedPaths()
    writeFileSync(pathA as string, 'index of folder A')
    svc.close()

    svc.init()

    expect(existsSync(pathA as string)).toBe(true)
  })

  it('deletes the old single index database on the first start, and nothing else', async () => {
    const { IndexerService } = await import('./indexer-service')
    for (const name of ['index.db', 'index.db-wal', 'index.db-shm', 'settings.json']) {
      writeFileSync(join(mocks.userData, name), 'x')
    }
    mkdirSync(join(mocks.userData, 'index'))
    writeFileSync(join(mocks.userData, 'index', 'notes.txt'), 'x')
    await useNotesRoot(notesA)

    expect(new IndexerService().init()).toBe(true)

    for (const name of ['index.db', 'index.db-wal', 'index.db-shm']) {
      expect(existsSync(join(mocks.userData, name))).toBe(false)
    }
    expect(existsSync(join(mocks.userData, 'settings.json'))).toBe(true)
    expect(existsSync(join(mocks.userData, 'index', 'notes.txt'))).toBe(true)
  })

  it('deletes nothing when the notes folder cannot be read', async () => {
    const { IndexerService } = await import('./indexer-service')
    writeFileSync(join(mocks.userData, 'index.db'), 'x')
    await useNotesRoot(join(mocks.userData, 'unmounted-volume'))

    expect(new IndexerService().init()).toBe(true)

    expect(existsSync(join(mocks.userData, 'index.db'))).toBe(true)
  })

  it('reports an indexing error and does not start when the index folder cannot be made', async () => {
    const { IndexerService } = await import('./indexer-service')
    // A file where the index folder should be.
    writeFileSync(join(mocks.userData, 'index'), 'not a folder')
    await useNotesRoot(notesA)
    const svc = new IndexerService()

    expect(svc.init()).toBe(false)
    expect(svc.getStatus().phase).toBe('error')
  })

  it("clears and rebuilds the current folder's file, not another's", async () => {
    const { IndexerService } = await import('./indexer-service')
    const svc = new IndexerService()
    await useNotesRoot(notesA)
    svc.init()
    const [pathA] = await constructedPaths()
    writeFileSync(pathA as string, 'old index of folder A')

    await svc.clearAndRebuild()

    // Cleared, then reopened for the same folder.
    const paths = await constructedPaths()
    expect(paths).toHaveLength(2)
    expect(paths[1]).toBe(pathA)
    expect(existsSync(pathA as string)).toBe(false)
  })

  it("recovers a corrupt index by clearing and reopening the same folder's file", async () => {
    const { IndexerService } = await import('./indexer-service')
    mocks.vectorStoreInit
      .mockImplementationOnce(() => {
        throw new Error('database disk image is malformed')
      })
      .mockImplementation(() => undefined)
    await useNotesRoot(notesA)

    new IndexerService().init()

    const [first, second] = await constructedPaths()
    expect(first).toBe(second)
  })

  it("recovers a corrupt index found while reindexing in the same folder's file", async () => {
    const { IndexerService } = await import('./indexer-service')
    await useNotesRoot(notesA)
    const svc = new IndexerService()
    svc.init()
    const [pathA] = await constructedPaths()
    writeFileSync(pathA as string, 'corrupt')
    mocks.indexerIndexAll
      .mockRejectedValueOnce(new Error('database disk image is malformed'))
      .mockResolvedValueOnce({ filesIndexed: 0, chunksIndexed: 0 })

    await svc.triggerReindex()

    const paths = await constructedPaths()
    expect(new Set(paths)).toEqual(new Set([pathA]))
    expect(existsSync(pathA as string)).toBe(false)
  })

  it('keeps the keyword fallback on the folder the rebuild started with when the folder changes during the pass', async () => {
    const { IndexerService } = await import('./indexer-service')
    const { Indexer } = await import('./indexer')
    const { settingsStore } = await import('../settings/settings-store')
    await useNotesRoot(notesA, { semantic: true })
    const svc = new IndexerService()
    svc.init()
    const [pathA] = await constructedPaths()
    const settingsOfA = vi.mocked(settingsStore.load)()
    mocks.indexerIndexAll
      .mockImplementationOnce(async () => {
        // The folder is changed while the full pass is running, and then the pass fails.
        vi.mocked(settingsStore.load).mockReturnValue({ ...settingsOfA, notesRoot: notesB })
        throw new Error('Rate limit reached')
      })
      .mockResolvedValueOnce({ filesIndexed: 0, chunksIndexed: 0 })

    await svc.clearAndRebuild()

    const { VectorStore } = await import('./vector-store')
    const opened = vi.mocked(VectorStore).mock.calls.map((call) => String(call[0]))
    const roots = vi.mocked(Indexer).mock.calls.map((call) => call[0].notesRoot)
    // Every store and indexer made for this rebuild belongs to the folder it started with.
    expect(new Set(opened.slice(1))).toEqual(new Set([pathA]))
    expect(new Set(roots.slice(1))).toEqual(new Set([notesA]))
  })

  it('runs exactly one more pass, on the new folder, when the folder changes while a pass is running', async () => {
    const { IndexerService } = await import('./indexer-service')
    const { Indexer } = await import('./indexer')
    await useNotesRoot(notesA)
    const svc = new IndexerService()
    svc.init()
    let failOldPass!: (error: Error) => void
    mocks.indexerIndexAll.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          failOldPass = reject
        })
    )
    const oldPass = svc.triggerReindex()
    await vi.waitFor(() => expect(mocks.indexerIndexAll).toHaveBeenCalledTimes(1))

    // What the restart does after the folder changed, then the reindex it asks for.
    svc.close()
    await useNotesRoot(notesB)
    svc.init()
    await svc.triggerReindex()
    expect(mocks.indexerIndexAll).toHaveBeenCalledTimes(1)

    // The old pass fails on its closed store; the queued request then runs once, on the new indexer.
    failOldPass(new Error('The database connection is not open'))
    await oldPass
    await vi.waitFor(() => expect(mocks.indexerIndexAll).toHaveBeenCalledTimes(2))
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(mocks.indexerIndexAll).toHaveBeenCalledTimes(2)
    const roots = vi.mocked(Indexer).mock.calls.map((call) => call[0].notesRoot)
    expect(roots.at(-1)).toBe(notesB)
  })

  describe('the notice that the search index is being rebuilt', () => {
    it('is pending after the old single database was removed, and stays pending until it is dismissed', async () => {
      const { IndexerService } = await import('./indexer-service')
      writeFileSync(join(mocks.userData, 'index.db'), 'x')
      await useNotesRoot(notesA)
      const svc = new IndexerService()
      svc.init()

      const notice = svc.pendingRebuildNotice()
      expect(notice?.message).toMatch(/rebuilding its search index/i)
      // Asking does not use it up: a window that opens or reloads later still sees it.
      expect(svc.pendingRebuildNotice()).toEqual(notice)

      svc.dismissRebuildNotice()
      expect(svc.pendingRebuildNotice()).toBeNull()
    })

    it('is still pending after a later restart that finds nothing more to remove', async () => {
      const { IndexerService } = await import('./indexer-service')
      writeFileSync(join(mocks.userData, 'index.db'), 'x')
      await useNotesRoot(notesA)
      const svc = new IndexerService()
      svc.init()
      svc.close()
      svc.init()

      expect(svc.pendingRebuildNotice()).not.toBeNull()
    })

    it('is not pending on a fresh install', async () => {
      const { IndexerService } = await import('./indexer-service')
      await useNotesRoot(notesA)
      const svc = new IndexerService()
      svc.init()

      expect(svc.pendingRebuildNotice()).toBeNull()
    })

    it('is not pending when the old database was kept because the folder could not be read', async () => {
      const { IndexerService } = await import('./indexer-service')
      writeFileSync(join(mocks.userData, 'index.db'), 'x')
      await useNotesRoot(join(mocks.userData, 'unmounted-volume'))
      const svc = new IndexerService()
      svc.init()

      expect(svc.pendingRebuildNotice()).toBeNull()
    })

    it('is not pending when the old database could not be deleted', async () => {
      const { IndexerService } = await import('./indexer-service')
      const { chmodSync } = await import('node:fs')
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
      writeFileSync(join(mocks.userData, 'index.db'), 'x')
      mkdirSync(join(mocks.userData, 'index'))
      await useNotesRoot(notesA)
      chmodSync(mocks.userData, 0o500)
      try {
        const svc = new IndexerService()
        svc.init()

        expect(svc.pendingRebuildNotice()).toBeNull()
      } finally {
        chmodSync(mocks.userData, 0o700)
        errors.mockRestore()
      }
    })

    it('is not pending when the index could not be opened, so it never says "rebuilding" after a failure', async () => {
      const { IndexerService } = await import('./indexer-service')
      writeFileSync(join(mocks.userData, 'index.db'), 'x')
      // A file where the index folder should be: the old database is removed, then the new one cannot be made.
      writeFileSync(join(mocks.userData, 'index'), 'not a folder')
      await useNotesRoot(notesA)
      const svc = new IndexerService()

      expect(svc.init()).toBe(false)
      expect(svc.pendingRebuildNotice()).toBeNull()
    })

    it('says that notes will be sent again only when embeddings are on', async () => {
      const { IndexerService } = await import('./indexer-service')
      writeFileSync(join(mocks.userData, 'index.db'), 'x')
      await useNotesRoot(notesA)
      const local = new IndexerService()
      local.init()
      expect(local.pendingRebuildNotice()?.detail).not.toMatch(/openai/i)

      writeFileSync(join(mocks.userData, 'index.db'), 'x')
      await useNotesRoot(notesA, { semantic: true })
      const cloud = new IndexerService()
      cloud.init()
      expect(cloud.pendingRebuildNotice()?.detail).toMatch(/sent to OpenAI again/)
    })

    it('tells listeners when it is set and when it is dismissed, and not again for a dismiss with nothing pending', async () => {
      const { IndexerService } = await import('./indexer-service')
      writeFileSync(join(mocks.userData, 'index.db'), 'x')
      await useNotesRoot(notesA)
      const svc = new IndexerService()
      const seen: Array<unknown> = []
      const off = svc.subscribeRebuildNotice((notice) => seen.push(notice?.message ?? null))

      svc.init()
      svc.dismissRebuildNotice()
      svc.dismissRebuildNotice()
      off()
      // Once the listener is gone it hears nothing more.
      svc.close()
      writeFileSync(join(mocks.userData, 'index.db'), 'x')
      svc.init()

      expect(seen).toEqual(['Ryte is rebuilding its search index', null])
      expect(svc.pendingRebuildNotice()).not.toBeNull()
    })
  })

  it('does not let a failed cleanup stop the start', async () => {
    const { IndexerService } = await import('./indexer-service')
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      // A legacy database the process may not delete: its folder is read-only.
      writeFileSync(join(mocks.userData, 'index.db'), 'x')
      mkdirSync(join(mocks.userData, 'index'))
      await useNotesRoot(notesA)
      const { chmodSync } = await import('node:fs')
      chmodSync(mocks.userData, 0o500)
      try {
        expect(new IndexerService().init()).toBe(true)
        expect(existsSync(join(mocks.userData, 'index.db'))).toBe(true)
        expect(errors).toHaveBeenCalledWith(expect.any(String), 'EACCES')
      } finally {
        chmodSync(mocks.userData, 0o700)
      }
    } finally {
      errors.mockRestore()
    }
  })
})

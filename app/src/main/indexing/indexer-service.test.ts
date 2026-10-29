import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
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
  indexDbPath: vi.fn().mockReturnValue('/tmp/test-indexer-service.db')
}))

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

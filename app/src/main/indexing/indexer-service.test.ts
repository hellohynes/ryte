import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  userData: '',
  vectorStoreInit: vi.fn(),
  vectorStoreClose: vi.fn(),
  indexerIndexAll: vi.fn(),
  indexerIndexFile: vi.fn(),
  backfillKick: vi.fn(),
  backfillStop: vi.fn(),
  backfillState: { value: 'idle' as 'idle' | 'running' | 'paused' },
  backfillReason: { value: null as string | null },
  backfillRetryAt: { value: null as number | null },
  backfillOnChange: { value: undefined as (() => void) | undefined },
  embeddableCount: vi.fn(),
  unembeddedCount: vi.fn()
}))

vi.mock('./embedding-backfill', () => ({
  EmbeddingBackfill: vi.fn().mockImplementation((deps: { onChange?: () => void }) => {
    mocks.backfillOnChange.value = deps.onChange
    return {
      kick: mocks.backfillKick,
      stop: mocks.backfillStop,
      get state() {
        return mocks.backfillState.value
      },
      get reason() {
        return mocks.backfillReason.value
      },
      get retryAt() {
        return mocks.backfillRetryAt.value
      }
    }
  }),
  fileMtimeReader: vi.fn().mockReturnValue(vi.fn())
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
    totals: vi.fn().mockReturnValue({ files: 0, chunks: 0 }),
    embeddableCount: mocks.embeddableCount,
    unembeddedCount: mocks.unembeddedCount
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

// What the Preferences screen saves when the person agrees to send notes to OpenAI for smart search.
const AGREED = {
  acknowledgedAt: '2026-11-02T00:00:00.000Z',
  provider: 'openai',
  model: 'text-embedding-3-small'
} as const

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
      semanticIndexAcknowledgement: AGREED,
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
      semanticIndexEnabled: true,
      semanticIndexAcknowledgement: AGREED
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

  it('tells the caller to stop searches only once the index is really about to be cleared', async () => {
    const svc = await semanticService()
    const order: string[] = []
    mocks.vectorStoreClose.mockImplementation(() => order.push('clear'))
    const beforeClear = vi.fn(() => order.push('beforeClear'))

    await svc.clearAndRebuild(beforeClear)

    expect(order.slice(0, 2)).toEqual(['beforeClear', 'clear'])
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
    // The rebuild waits, and the store cannot be reopened for it; the reindex asked for meanwhile must survive.
    mocks.vectorStoreInit.mockImplementationOnce(() => {
      throw new Error('disk full')
    })
    const rebuild = expect(svc.clearAndRebuild()).rejects.toThrow('disk full')
    await svc.triggerReindex()

    finishFirst()
    await first
    await rebuild
    await vi.waitFor(() => expect(mocks.indexerIndexAll).toHaveBeenCalledTimes(2))
  })

  it('does not run again when nothing was asked for during a run', async () => {
    const svc = await semanticService()

    await svc.triggerReindex()
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(mocks.indexerIndexAll).toHaveBeenCalledTimes(1)
  })

  it('tells the callers once, before the one close, and makes no request to the embedding service', async () => {
    const svc = await semanticService()
    const events: string[] = []
    mocks.vectorStoreClose.mockImplementation(() => events.push('close'))

    await svc.clearAndRebuild(() => events.push('beforeClear'))

    expect(events).toEqual(['beforeClear', 'close'])
    // No preflight: nothing local depends on the network, so nothing is sent before the index is cleared.
    expect(mockEmbed).not.toHaveBeenCalled()
  })

  it('ends with a local index and a working status, whatever the embedding service does', async () => {
    const svc = await semanticService()
    mockEmbed.mockRejectedValue(new Error('Incorrect API key provided'))

    await expect(svc.clearAndRebuild()).resolves.toBeUndefined()

    expect(svc.getStatus().phase).not.toBe('error')
    expect(mocks.indexerIndexAll).toHaveBeenCalledOnce()
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

describe('IndexerService embedding step', () => {
  async function configure(
    overrides: Record<string, unknown>,
    secret: string | null = 'sk-test'
  ): Promise<InstanceType<typeof import('./indexer-service').IndexerService>> {
    const { settingsStore } = await import('../settings/settings-store')
    const { IndexerService } = await import('./indexer-service')
    vi.mocked(settingsStore.getSecret).mockReturnValue(secret)
    vi.mocked(settingsStore.load).mockReturnValue({
      ...vi.mocked(settingsStore.load)(),
      semanticIndexEnabled: true,
      semanticIndexAcknowledgement: AGREED,
      ...overrides
    })
    return new IndexerService()
  }

  async function providerCount(): Promise<number> {
    const { OpenAIEmbeddingProvider } = await import('./embedder')
    return vi.mocked(OpenAIEmbeddingProvider).mock.calls.length
  }

  async function stepCount(): Promise<number> {
    const { EmbeddingBackfill } = await import('./embedding-backfill')
    return vi.mocked(EmbeddingBackfill).mock.calls.length
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    mocks.backfillState.value = 'idle'
    mocks.backfillReason.value = null
    mocks.backfillRetryAt.value = null
    mocks.backfillOnChange.value = undefined
    mocks.embeddableCount.mockReturnValue(0)
    mocks.unembeddedCount.mockReturnValue(0)
    mocks.vectorStoreInit.mockReturnValue(undefined)
    mocks.indexerIndexAll.mockReset()
    mocks.indexerIndexAll.mockResolvedValue({ filesIndexed: 0, chunksIndexed: 0 })
    mocks.indexerIndexFile.mockReset()
    mocks.indexerIndexFile.mockResolvedValue({ chunkCount: 1, skipped: false })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('the agreement gate', () => {
    it('starts the step when smart search is on, there is a key, and the agreement covers this provider and model', async () => {
      const svc = await configure({})

      svc.init()

      expect(await providerCount()).toBe(1)
      expect(await stepCount()).toBe(1)
    })

    it.each([
      ['there is no saved agreement', { semanticIndexAcknowledgement: null }, 'sk-test'],
      [
        'the agreement is for another model',
        { semanticIndexAcknowledgement: { ...AGREED, model: 'text-embedding-3-large' } },
        'sk-test'
      ],
      [
        'the agreement is for another provider',
        { semanticIndexAcknowledgement: { ...AGREED, provider: 'anthropic' } },
        'sk-test'
      ],
      ['smart search is off', { semanticIndexEnabled: false }, 'sk-test'],
      ['there is no key', {}, null]
    ])('does not embed when %s', async (_label, overrides, secret) => {
      const svc = await configure(overrides, secret)

      svc.init()
      await svc.triggerReindex()
      await svc.clearAndRebuild()

      expect(await providerCount()).toBe(0)
      expect(await stepCount()).toBe(0)
      expect(mocks.backfillKick).not.toHaveBeenCalled()
      await expect(svc.embed(['query'])).rejects.toThrow('No embedding provider configured')
    })

    it('does not embed after the agreement is taken back and the indexer restarts', async () => {
      const { settingsStore } = await import('../settings/settings-store')
      const svc = await configure({})
      svc.init()
      expect(await stepCount()).toBe(1)

      svc.close()
      vi.mocked(settingsStore.load).mockReturnValue({
        ...vi.mocked(settingsStore.load)(),
        semanticIndexAcknowledgement: null
      })
      svc.init()

      expect(mocks.backfillStop).toHaveBeenCalledTimes(1)
      expect(await stepCount()).toBe(1)
      await svc.triggerReindex()
      expect(mocks.backfillKick).not.toHaveBeenCalled()
    })
  })

  describe('when it looks for notes without vectors', () => {
    it('after every index pass, once the pass has finished', async () => {
      const svc = await configure({})
      svc.init()
      const order: string[] = []
      mocks.indexerIndexAll.mockImplementation(async () => {
        order.push('pass')
        return { filesIndexed: 0, chunksIndexed: 0 }
      })
      mocks.backfillKick.mockImplementation(() => order.push('kick'))

      await svc.triggerReindex()

      expect(order).toEqual(['pass', 'kick'])
    })

    it('after a rebuild, once the keyword pass has finished', async () => {
      const svc = await configure({})
      svc.init()
      const order: string[] = []
      mocks.indexerIndexAll.mockImplementation(async () => {
        order.push('pass')
        return { filesIndexed: 0, chunksIndexed: 0 }
      })
      mocks.backfillKick.mockImplementation(() => order.push('kick'))

      await svc.clearAndRebuild()

      expect(order).toEqual(['pass', 'kick'])
      // The rebuild made a new step on the new index; the old one was stopped first.
      expect(mocks.backfillStop).toHaveBeenCalledTimes(1)
      expect(await stepCount()).toBe(2)
    })

    it('not when the pass failed', async () => {
      const svc = await configure({})
      svc.init()
      mocks.indexerIndexAll.mockRejectedValueOnce(new Error('disk full'))

      await svc.triggerReindex()

      expect(mocks.backfillKick).not.toHaveBeenCalled()
      expect(svc.getStatus().phase).toBe('error')
    })

    it('shortly after a note is written, once for a burst of edits', async () => {
      vi.useFakeTimers()
      const svc = await configure({})
      svc.init()
      // The kick that init schedules is for the start; this test is about edits.
      await vi.advanceTimersByTimeAsync(5_000)
      mocks.backfillKick.mockClear()

      await svc.notifyFileChanged('/tmp/notes/a.md')
      await svc.notifyFileChanged('/tmp/notes/b.md')
      await svc.notifyFileChanged('/tmp/notes/c.md')
      expect(mocks.backfillKick).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(1_999)
      expect(mocks.backfillKick).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(1)

      expect(mocks.backfillKick).toHaveBeenCalledTimes(1)
    })

    it('not for a note that was already indexed or was removed', async () => {
      vi.useFakeTimers()
      const svc = await configure({})
      svc.init()
      await vi.advanceTimersByTimeAsync(5_000)
      mocks.backfillKick.mockClear()
      mocks.indexerIndexFile.mockResolvedValueOnce({ chunkCount: 0, skipped: true })

      await svc.notifyFileChanged('/tmp/notes/a.md')
      await vi.advanceTimersByTimeAsync(10_000)

      expect(mocks.backfillKick).not.toHaveBeenCalled()
    })

    it('shortly after the indexer starts, for notes a restart or an earlier session left without vectors', async () => {
      vi.useFakeTimers()
      const svc = await configure({})

      svc.init()
      expect(mocks.backfillKick).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(2_000)

      expect(mocks.backfillKick).toHaveBeenCalledTimes(1)
    })

    it('not at startup when the step is already paused: a failure keeps its own wait', async () => {
      vi.useFakeTimers()
      const svc = await configure({})
      svc.init()
      mocks.backfillState.value = 'paused'

      await vi.advanceTimersByTimeAsync(5_000)

      expect(mocks.backfillKick).not.toHaveBeenCalled()
    })

    it('after an edit even when the step is paused, which brings its next try forward', async () => {
      vi.useFakeTimers()
      const svc = await configure({})
      svc.init()
      await vi.advanceTimersByTimeAsync(5_000)
      mocks.backfillKick.mockClear()
      mocks.backfillState.value = 'paused'

      await svc.notifyFileChanged('/tmp/notes/a.md')
      await vi.advanceTimersByTimeAsync(2_000)

      expect(mocks.backfillKick).toHaveBeenCalledTimes(1)
    })

    it('not while an index pass runs: the pass looks when it ends', async () => {
      vi.useFakeTimers()
      const svc = await configure({})
      svc.init()
      let finish!: () => void
      mocks.indexerIndexAll.mockImplementationOnce(
        () =>
          new Promise((resolve) => (finish = () => resolve({ filesIndexed: 0, chunksIndexed: 0 })))
      )
      const pass = svc.triggerReindex()
      await vi.advanceTimersByTimeAsync(5_000)
      expect(mocks.backfillKick).not.toHaveBeenCalled()

      finish()
      await pass

      expect(mocks.backfillKick).toHaveBeenCalledTimes(1)
    })

    it('never, when no step runs', async () => {
      vi.useFakeTimers()
      const svc = await configure({ semanticIndexEnabled: false })
      svc.init()

      await svc.triggerReindex()
      await svc.notifyFileChanged('/tmp/notes/a.md')
      await vi.advanceTimersByTimeAsync(10_000)

      expect(mocks.backfillKick).not.toHaveBeenCalled()
    })
  })

  describe('what smart search is doing', () => {
    it('is off, with no reason, when smart search is off', async () => {
      const svc = await configure({ semanticIndexEnabled: false })
      svc.init()

      expect(svc.getEmbeddingStatus()).toStrictEqual({
        state: 'off',
        total: 0,
        done: 0,
        pending: 0
      })
    })

    it.each([
      ['no key is saved', {}, null, 'no-key'],
      [
        'the agreement is missing',
        { semanticIndexAcknowledgement: null },
        'sk-test',
        'no-agreement'
      ],
      [
        'the agreement is for another model',
        { semanticIndexAcknowledgement: { ...AGREED, model: 'text-embedding-3-large' } },
        'sk-test',
        'no-agreement'
      ],
      [
        'both the key and the agreement are missing: the key comes first',
        { semanticIndexAcknowledgement: null },
        null,
        'no-key'
      ]
    ])('is off because %s', async (_name, overrides, secret, reason) => {
      const svc = await configure(overrides, secret)
      svc.init()

      expect(svc.getEmbeddingStatus()).toStrictEqual({
        state: 'off',
        total: 0,
        done: 0,
        pending: 0,
        reason
      })
    })

    it('reports a step that works with the counts of the index, and no reason or time', async () => {
      mocks.embeddableCount.mockReturnValue(3200)
      mocks.unembeddedCount.mockReturnValue(3080)
      mocks.backfillState.value = 'running'
      const svc = await configure({})
      svc.init()

      expect(svc.getEmbeddingStatus()).toStrictEqual({
        state: 'running',
        total: 3200,
        done: 120,
        pending: 3080
      })
    })

    it('reports why a paused step is paused and when it tries again, as an ISO time', async () => {
      mocks.embeddableCount.mockReturnValue(10)
      mocks.unembeddedCount.mockReturnValue(4)
      mocks.backfillState.value = 'paused'
      mocks.backfillReason.value = 'rate-limit'
      mocks.backfillRetryAt.value = Date.UTC(2026, 10, 3, 15, 42)
      const svc = await configure({})
      svc.init()

      expect(svc.getEmbeddingStatus()).toStrictEqual({
        state: 'paused',
        total: 10,
        done: 6,
        pending: 4,
        reason: 'rate-limit',
        retryAt: '2026-11-03T15:42:00.000Z'
      })
    })

    it('has no time to try again for a refused key', async () => {
      mocks.backfillState.value = 'paused'
      mocks.backfillReason.value = 'auth'
      const svc = await configure({})
      svc.init()

      const status = svc.getEmbeddingStatus()
      expect(status.reason).toBe('auth')
      expect('retryAt' in status).toBe(false)
    })

    it('never reports more notes waiting than there are notes', async () => {
      mocks.embeddableCount.mockReturnValue(2)
      mocks.unembeddedCount.mockReturnValue(5)
      const svc = await configure({})
      svc.init()

      expect(svc.getEmbeddingStatus()).toMatchObject({ total: 2, pending: 2, done: 0 })
    })

    it('forgets why it was off once the indexer is closed', async () => {
      const svc = await configure({}, null)
      svc.init()
      expect(svc.getEmbeddingStatus().reason).toBe('no-key')

      svc.close()

      expect('reason' in svc.getEmbeddingStatus()).toBe(false)
    })

    it('is off before the indexer has started', async () => {
      const { IndexerService } = await import('./indexer-service')

      expect(new IndexerService().getEmbeddingStatus()).toStrictEqual({
        state: 'off',
        total: 0,
        done: 0,
        pending: 0
      })
    })
  })

  describe('telling the windows', () => {
    async function started(): Promise<{
      svc: InstanceType<typeof import('./indexer-service').IndexerService>
      heard: Array<Record<string, unknown>>
    }> {
      vi.useFakeTimers()
      const svc = await configure({})
      const heard: Array<Record<string, unknown>> = []
      svc.subscribeEmbeddingStatus((status) => heard.push({ ...status }))
      svc.init()
      return { svc, heard }
    }

    it('says what smart search is doing when the indexer starts', async () => {
      mocks.embeddableCount.mockReturnValue(7)
      mocks.unembeddedCount.mockReturnValue(7)
      const { heard } = await started()

      expect(heard).toEqual([{ state: 'idle', total: 7, done: 0, pending: 7 }])
    })

    it('says smart search is off, with the reason, when the indexer starts without a key', async () => {
      vi.useFakeTimers()
      const svc = await configure({}, null)
      const heard: Array<Record<string, unknown>> = []
      svc.subscribeEmbeddingStatus((status) => heard.push({ ...status }))

      svc.init()

      expect(heard).toEqual([{ state: 'off', total: 0, done: 0, pending: 0, reason: 'no-key' }])
    })

    it('sends a change of state at once, even right after another message', async () => {
      const { heard } = await started()
      heard.length = 0

      mocks.backfillState.value = 'running'
      mocks.backfillOnChange.value?.()
      mocks.backfillState.value = 'paused'
      mocks.backfillReason.value = 'offline'
      mocks.backfillRetryAt.value = Date.now() + 60_000
      mocks.backfillOnChange.value?.()
      mocks.backfillState.value = 'running'
      mocks.backfillReason.value = null
      mocks.backfillRetryAt.value = null
      mocks.backfillOnChange.value?.()

      expect(heard.map((status) => status.state)).toEqual(['running', 'paused', 'running'])
    })

    it('sends progress at most every half second: the first at once, then the latest after the wait', async () => {
      mocks.embeddableCount.mockReturnValue(100)
      mocks.unembeddedCount.mockReturnValue(100)
      mocks.backfillState.value = 'running'
      const { heard } = await started()
      heard.length = 0

      for (let pending = 99; pending >= 90; pending -= 1) {
        mocks.unembeddedCount.mockReturnValue(pending)
        mocks.backfillOnChange.value?.()
        await vi.advanceTimersByTimeAsync(20)
      }
      // Ten notes in 200 ms: none of them is a change of state, so none goes out yet.
      expect(heard).toEqual([])

      await vi.advanceTimersByTimeAsync(500)

      expect(heard).toEqual([{ state: 'running', total: 100, done: 10, pending: 90 }])
    })

    it('keeps to 3 messages a second over a long run of one-note steps', async () => {
      mocks.embeddableCount.mockReturnValue(3200)
      mocks.unembeddedCount.mockReturnValue(3200)
      mocks.backfillState.value = 'running'
      const { heard } = await started()
      await vi.advanceTimersByTimeAsync(1_000)
      heard.length = 0

      for (let note = 0; note < 3000; note += 1) {
        mocks.unembeddedCount.mockReturnValue(3200 - note - 1)
        mocks.backfillOnChange.value?.()
        await vi.advanceTimersByTimeAsync(2)
      }
      await vi.advanceTimersByTimeAsync(1_000)

      // 3,000 notes took 6 seconds of fake time.
      expect(heard.length).toBeLessThanOrEqual(6 * 3)
      expect(heard.at(-1)).toMatchObject({ pending: 200, done: 3000 })
    })

    it('does not count the notes while progress waits out the half second', async () => {
      mocks.embeddableCount.mockReturnValue(100)
      mocks.unembeddedCount.mockReturnValue(100)
      mocks.backfillState.value = 'running'
      await started()
      await vi.advanceTimersByTimeAsync(1_000)
      mocks.embeddableCount.mockClear()
      mocks.unembeddedCount.mockClear()

      for (let pending = 99; pending >= 80; pending -= 1) {
        mocks.unembeddedCount.mockReturnValue(pending)
        mocks.backfillOnChange.value?.()
      }
      // The first is sent at once, and counted; the other nineteen wait out the half second without a query.
      expect(mocks.embeddableCount).toHaveBeenCalledTimes(1)
      expect(mocks.unembeddedCount).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(500)
      expect(mocks.embeddableCount).toHaveBeenCalledTimes(2)
    })

    it('says smart search is off when the indexer fails to come back after a corrupt index', async () => {
      vi.useFakeTimers()
      const svc = await configure({})
      const heard: Array<Record<string, unknown>> = []
      svc.subscribeEmbeddingStatus((status) => heard.push({ ...status }))
      mocks.vectorStoreInit.mockImplementation(() => {
        throw new Error('database disk image is malformed')
      })

      expect(svc.init()).toBe(false)

      expect(heard.at(-1)).toMatchObject({ state: 'off' })
    })

    it('sends nothing when nothing changed', async () => {
      const { heard } = await started()
      heard.length = 0

      mocks.backfillOnChange.value?.()
      mocks.backfillOnChange.value?.()
      await vi.advanceTimersByTimeAsync(2_000)

      expect(heard).toEqual([])
    })

    it('says so after an index pass and after a note is written, when the counts moved', async () => {
      mocks.embeddableCount.mockReturnValue(5)
      mocks.unembeddedCount.mockReturnValue(0)
      const { svc, heard } = await started()
      heard.length = 0
      await vi.advanceTimersByTimeAsync(1_000)

      mocks.embeddableCount.mockReturnValue(6)
      mocks.unembeddedCount.mockReturnValue(1)
      await svc.triggerReindex()
      expect(heard.at(-1)).toMatchObject({ total: 6, pending: 1 })

      await vi.advanceTimersByTimeAsync(1_000)
      mocks.embeddableCount.mockReturnValue(7)
      mocks.unembeddedCount.mockReturnValue(2)
      await svc.notifyFileChanged('/tmp/notes/a.md')
      expect(heard.at(-1)).toMatchObject({ total: 7, pending: 2 })
    })

    it('does not let a wait that began before a close speak for the next index', async () => {
      mocks.embeddableCount.mockReturnValue(100)
      mocks.unembeddedCount.mockReturnValue(100)
      mocks.backfillState.value = 'running'
      const { svc, heard } = await started()
      await vi.advanceTimersByTimeAsync(1_000)
      mocks.unembeddedCount.mockReturnValue(90)
      mocks.backfillOnChange.value?.()
      mocks.unembeddedCount.mockReturnValue(80)
      mocks.backfillOnChange.value?.()
      heard.length = 0

      svc.close()
      await vi.advanceTimersByTimeAsync(2_000)

      expect(heard).toEqual([])
    })

    it('says the same again for a new index even if nothing differs', async () => {
      const { svc, heard } = await started()
      heard.length = 0

      svc.close()
      svc.init()

      expect(heard).toHaveLength(1)
    })

    it('stops sending to a listener that unsubscribed', async () => {
      vi.useFakeTimers()
      const svc = await configure({})
      const heard: unknown[] = []
      const stop = svc.subscribeEmbeddingStatus((status) => heard.push(status))
      stop()

      svc.init()

      expect(heard).toEqual([])
    })
  })

  describe('closing', () => {
    it('stops the step before the store closes, and a kick waiting for edits to settle never fires', async () => {
      vi.useFakeTimers()
      const svc = await configure({})
      svc.init()
      await vi.advanceTimersByTimeAsync(5_000)
      mocks.backfillKick.mockClear()
      const order: string[] = []
      mocks.backfillStop.mockImplementation(() => order.push('stop'))
      mocks.vectorStoreClose.mockImplementation(() => order.push('close'))
      await svc.notifyFileChanged('/tmp/notes/a.md')

      svc.close()
      await vi.advanceTimersByTimeAsync(10_000)

      expect(order).toEqual(['stop', 'close'])
      expect(mocks.backfillKick).not.toHaveBeenCalled()
      expect(vi.getTimerCount()).toBe(0)
    })
  })
})

describe('IndexerService when the indexer is closed under a running pass', () => {
  interface HeldPass {
    opts: { onProgress?: (p: unknown) => void; shouldStop?: () => boolean }
    resolve: (summary: unknown) => void
    reject: (error: Error) => void
  }

  let held: HeldPass | null

  /** Makes the next pass wait until the test lets it end, and keeps what the service told it. */
  function holdNextPass(): void {
    held = null
    mocks.indexerIndexAll.mockImplementationOnce(
      (opts: HeldPass['opts']) =>
        new Promise((resolve, reject) => {
          held = { opts, resolve, reject }
        })
    )
  }

  async function started(): Promise<{
    svc: InstanceType<typeof import('./indexer-service').IndexerService>
    statuses: Array<{ phase: string; error?: string }>
  }> {
    const { IndexerService } = await import('./indexer-service')
    const svc = new IndexerService()
    const statuses: Array<{ phase: string; error?: string }> = []
    svc.subscribe((status) => statuses.push({ phase: status.phase, error: status.error }))
    svc.init()
    return { svc, statuses }
  }

  /** What the restarter does: close, then open again. */
  function restart(svc: { close(): void; init(): boolean }): void {
    svc.close()
    svc.init()
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.vectorStoreInit.mockReturnValue(undefined)
    mocks.indexerIndexAll.mockReset()
    mocks.indexerIndexAll.mockResolvedValue({ filesIndexed: 0, chunksIndexed: 0 })
    mocks.indexerIndexFile.mockReset()
    mocks.indexerIndexFile.mockResolvedValue({ chunkCount: 1, skipped: false })
    mocks.embeddableCount.mockReturnValue(0)
    mocks.unembeddedCount.mockReturnValue(0)
    held = null
  })

  it('drops the failure of a pass whose stores were closed under it: no error is reported', async () => {
    const { svc, statuses } = await started()
    holdNextPass()
    const pass = svc.triggerReindex()
    await vi.waitFor(() => expect(held).not.toBeNull())

    restart(svc)
    held!.reject(new Error('The database connection is not open'))
    await pass

    expect(statuses.map((status) => status.phase)).not.toContain('error')
    expect(svc.getStatus().error).toBeUndefined()
  })

  describe.each([false, true])('single-file indexing with restart=%s', (reopen) => {
    it.each(['failure', 'completion'])('ignores stale %s after close', async (outcome) => {
      const { svc, statuses } = await started()
      let shouldStop: (() => boolean) | undefined
      let stoppedBeforeClose: boolean | undefined
      mocks.indexerIndexFile.mockImplementationOnce(
        async (_path: string, opts: { shouldStop: () => boolean }) => {
          shouldStop = opts.shouldStop
          stoppedBeforeClose = shouldStop()
          svc.close()
          if (reopen) expect(svc.init()).toBe(true)
          if (outcome === 'failure') throw new Error('The database connection is not open')
          return { chunkCount: 1, skipped: false }
        }
      )

      const status = svc.getStatus()
      const heard = statuses.length
      await svc.notifyFileChanged('/tmp/notes/a.md')

      expect(stoppedBeforeClose).toBe(false)
      expect(shouldStop?.()).toBe(true)
      expect(statuses.slice(heard)).toEqual([])
      expect(svc.getStatus()).toEqual(status)
      svc.close()
    })
  })

  it.each(['disk full', 'database disk image is malformed'])(
    'reports a current single-file failure after dropping a stale one: %s',
    async (message) => {
      const { svc, statuses } = await started()
      mocks.indexerIndexFile
        .mockImplementationOnce(async () => {
          await Promise.resolve()
          restart(svc)
          // Queue an edit for the new indexer while the stale edit still owns the drain.
          void svc.notifyFileChanged('/tmp/notes/b.md')
          throw new Error('The database connection is not open')
        })
        .mockRejectedValueOnce(new Error(message))

      await svc.notifyFileChanged('/tmp/notes/a.md')

      expect(statuses.filter((status) => status.phase === 'error')).toEqual([
        { phase: 'error', error: message }
      ])
      expect(svc.getStatus()).toMatchObject({ phase: 'error', error: message })
      svc.close()
    }
  )

  it('tells the pass to stop once the indexer is closed, and passes on none of its progress', async () => {
    const { svc, statuses } = await started()
    holdNextPass()
    const pass = svc.triggerReindex()
    await vi.waitFor(() => expect(held).not.toBeNull())
    expect(held!.opts.shouldStop?.()).toBe(false)
    held!.opts.onProgress?.({
      phase: 'indexing',
      filesTotal: 100,
      filesDone: 1,
      chunksTotal: 1,
      chunksDone: 1
    })
    expect(statuses.at(-1)).toMatchObject({ phase: 'indexing' })

    restart(svc)
    const heard = statuses.length
    expect(held!.opts.shouldStop?.()).toBe(true)
    held!.opts.onProgress?.({
      phase: 'indexing',
      filesTotal: 100,
      filesDone: 2,
      chunksTotal: 2,
      chunksDone: 2
    })
    held!.opts.onProgress?.({
      phase: 'done',
      filesTotal: 100,
      filesDone: 100,
      chunksTotal: 100,
      chunksDone: 100
    })
    held!.resolve({ filesIndexed: 1, chunksIndexed: 1, stopped: true })
    await pass

    expect(
      statuses.slice(heard).some((status) => status.phase === 'done' && status.error === undefined)
    ).toBe(false)
  })

  it('never reaches recovery with a stale pass: the new index file is left alone', async () => {
    const { svc } = await started()
    const { existsSync, writeFileSync } = await import('node:fs')
    const { VectorStore } = await import('./vector-store')
    const dbPath = String(vi.mocked(VectorStore).mock.calls[0]?.[0])
    mkdirSync(join(dbPath, '..'), { recursive: true })
    writeFileSync(dbPath, 'the new folder index')
    holdNextPass()
    const pass = svc.triggerReindex()
    await vi.waitFor(() => expect(held).not.toBeNull())
    restart(svc)
    const opened = mocks.vectorStoreInit.mock.calls.length

    held!.reject(new Error('database disk image is malformed'))
    await pass

    expect(existsSync(dbPath)).toBe(true)
    expect(mocks.vectorStoreInit.mock.calls.length).toBe(opened)
  })

  it('still reports a failure of a pass that was not stale, and one earlier cut pass does not hide it', async () => {
    const { svc, statuses } = await started()
    holdNextPass()
    const first = svc.triggerReindex()
    await vi.waitFor(() => expect(held).not.toBeNull())
    restart(svc)
    mocks.indexerIndexAll.mockRejectedValueOnce(new Error('disk full'))
    held!.resolve({ filesIndexed: 0, chunksIndexed: 0, stopped: true })
    await first

    await vi.waitFor(() =>
      expect(statuses.at(-1)).toMatchObject({ phase: 'error', error: 'disk full' })
    )
  })

  it('does not stop a pass because of the close that its own corrupt-index recovery makes', async () => {
    const { svc } = await started()
    mocks.indexerIndexAll
      .mockRejectedValueOnce(new Error('database disk image is malformed'))
      .mockResolvedValueOnce({ filesIndexed: 0, chunksIndexed: 0 })

    await svc.triggerReindex()

    expect(mocks.indexerIndexAll).toHaveBeenCalledTimes(2)
    const retryOpts = mocks.indexerIndexAll.mock.calls[1]?.[0] as HeldPass['opts']
    expect(retryOpts.shouldStop?.()).toBe(false)
  })

  it('does not stop a rebuild because of the close that it makes itself', async () => {
    const { svc } = await started()

    await svc.clearAndRebuild()

    const opts = mocks.indexerIndexAll.mock.calls[0]?.[0] as HeldPass['opts']
    expect(opts.shouldStop?.()).toBe(false)
  })

  it('lets a rebuild that is cut by a folder change end without an error, and asks for a pass for the new folder', async () => {
    const { svc, statuses } = await started()
    holdNextPass()
    const rebuild = svc.clearAndRebuild()
    await vi.waitFor(() => expect(held).not.toBeNull())

    restart(svc)
    held!.reject(new Error('The database connection is not open'))
    await expect(rebuild).resolves.toBeUndefined()

    expect(statuses.map((status) => status.phase)).not.toContain('error')
    await vi.waitFor(() => expect(mocks.indexerIndexAll).toHaveBeenCalledTimes(2))
  })

  it('asks for one more pass when the indexer was restarted for the same folder', async () => {
    const { svc } = await started()
    holdNextPass()
    const pass = svc.triggerReindex()
    await vi.waitFor(() => expect(held).not.toBeNull())

    restart(svc)
    held!.resolve({ filesIndexed: 3, chunksIndexed: 3, stopped: true })
    await pass

    await vi.waitFor(() => expect(mocks.indexerIndexAll).toHaveBeenCalledTimes(2))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(mocks.indexerIndexAll).toHaveBeenCalledTimes(2)
  })

  it('asks for exactly one more pass after two restarts in a row', async () => {
    const { svc } = await started()
    holdNextPass()
    const pass = svc.triggerReindex()
    await vi.waitFor(() => expect(held).not.toBeNull())

    restart(svc)
    restart(svc)
    held!.resolve({ filesIndexed: 0, chunksIndexed: 0, stopped: true })
    await pass

    await vi.waitFor(() => expect(mocks.indexerIndexAll).toHaveBeenCalledTimes(2))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(mocks.indexerIndexAll).toHaveBeenCalledTimes(2)
  })

  it('asks for nothing, and opens nothing, when the app is quitting', async () => {
    const { svc, statuses } = await started()
    holdNextPass()
    const pass = svc.triggerReindex()
    await vi.waitFor(() => expect(held).not.toBeNull())
    const opened = mocks.vectorStoreInit.mock.calls.length

    svc.close()
    held!.reject(new Error('The database connection is not open'))
    await pass
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(mocks.indexerIndexAll).toHaveBeenCalledTimes(1)
    expect(mocks.vectorStoreInit.mock.calls.length).toBe(opened)
    expect(statuses.map((status) => status.phase)).not.toContain('error')
  })

  it('does not tell the embedding step to look for work after a pass that was cut short', async () => {
    const { settingsStore } = await import('../settings/settings-store')
    vi.mocked(settingsStore.getSecret).mockReturnValue('sk-test')
    vi.mocked(settingsStore.load).mockReturnValue({
      ...vi.mocked(settingsStore.load)(),
      semanticIndexEnabled: true,
      semanticIndexAcknowledgement: AGREED
    })
    const { svc } = await started()
    mocks.backfillKick.mockClear()
    holdNextPass()
    const pass = svc.triggerReindex()
    await vi.waitFor(() => expect(held).not.toBeNull())

    restart(svc)
    mocks.backfillKick.mockClear()
    held!.resolve({ filesIndexed: 0, chunksIndexed: 0, stopped: true })
    await pass
    expect(mocks.backfillKick).not.toHaveBeenCalled()

    // The pass asked for afterwards is a whole one, and it does.
    await vi.waitFor(() => expect(mocks.backfillKick).toHaveBeenCalledTimes(1))
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
      semanticIndexEnabled: options.semantic ?? false,
      semanticIndexAcknowledgement: options.semantic ? AGREED : null
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

  it('keeps a rebuild on the folder it started with when the folder changes during the pass', async () => {
    const { IndexerService } = await import('./indexer-service')
    const { Indexer } = await import('./indexer')
    const { settingsStore } = await import('../settings/settings-store')
    await useNotesRoot(notesA, { semantic: true })
    const svc = new IndexerService()
    svc.init()
    const [pathA] = await constructedPaths()
    const settingsOfA = vi.mocked(settingsStore.load)()
    mocks.indexerIndexAll.mockImplementationOnce(async () => {
      // The folder is changed while the full pass is running.
      vi.mocked(settingsStore.load).mockReturnValue({ ...settingsOfA, notesRoot: notesB })
      return { filesIndexed: 0, chunksIndexed: 0 }
    })

    await svc.clearAndRebuild()

    const opened = await constructedPaths()
    const roots = vi.mocked(Indexer).mock.calls.map((call) => call[0].notesRoot)
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

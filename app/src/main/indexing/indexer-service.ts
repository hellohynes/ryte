import { EventEmitter } from 'node:events'
import { rmSync } from 'node:fs'

import { Indexer, type IndexerProgress } from './indexer'
import { IndexStateStore } from './index-state'
import { OpenAIEmbeddingProvider } from './embedder'
import { VectorStore } from './vector-store'
import { settingsStore } from '../settings/settings-store'
import { indexDbPath } from '../paths'

const STATUS_EVENT = 'status'
const IDLE_EVENT = 'idle'
// How long the embedding service gets to answer the check made before an index is cleared.
const EMBEDDING_CHECK_TIMEOUT_MS = 15_000

async function withTimeout<T>(work: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms)
  })
  try {
    return await Promise.race([work, timeout])
  } finally {
    clearTimeout(timer)
  }
}

export function isRecoverableIndexStoreError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const message = error.message.toLowerCase()
  return (
    message.includes('database disk image is malformed') ||
    message.includes('file is not a database')
  )
}

function removeIndexDatabaseFiles(dbPath: string): void {
  for (const path of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    rmSync(path, { force: true })
  }
}

export class IndexerService extends EventEmitter {
  private vectorStore: VectorStore | null = null
  private indexState: IndexStateStore | null = null
  private indexer: Indexer | null = null
  private embedder: OpenAIEmbeddingProvider | null = null
  private lastStatus: IndexerProgress = {
    phase: 'idle',
    filesTotal: 0,
    filesDone: 0,
    chunksTotal: 0,
    chunksDone: 0,
    lastIndexedAt: null
  }
  private running = false
  // A reindex asked for during a run: the run may be working on settings that have just changed.
  private reindexQueued = false
  // Callers of clearAndRebuild waiting for a run to end; they will index everything themselves.
  private rebuildsWaiting = 0
  private readonly pendingIncrementalOperations = new Map<string, 'changed' | 'removed'>()
  private incrementalDrain: Promise<void> | null = null

  /**
   * Initialize the indexer using current settings. Keyword indexing is always
   * available; OpenAI embeddings are enabled only when a key is configured.
   */
  init(): boolean {
    if (this.indexer) return true

    const settings = settingsStore.load()
    const openaiKey = settings.semanticIndexEnabled ? settingsStore.getSecret('openai') : null
    const embedder = openaiKey
      ? new OpenAIEmbeddingProvider(openaiKey, { model: settings.embeddingModel })
      : null
    const dbPath = indexDbPath()

    try {
      this.initializeStores(dbPath, settings.notesRoot, embedder)
      return true
    } catch (error) {
      this.close()
      if (!isRecoverableIndexStoreError(error)) {
        this.broadcastIndexingError(error)
        return false
      }

      removeIndexDatabaseFiles(dbPath)
      try {
        this.initializeStores(dbPath, settings.notesRoot, embedder)
        return true
      } catch (rebuildError) {
        this.close()
        this.broadcastIndexingError(rebuildError)
        return false
      }
    }
  }

  private initializeStores(
    dbPath: string,
    notesRoot: string,
    embedder: OpenAIEmbeddingProvider | null,
    dimension = embedder?.dim ?? 1536
  ): void {
    this.embedder = embedder
    this.vectorStore = new VectorStore(dbPath)
    this.vectorStore.init(dimension)
    this.indexState = new IndexStateStore(this.vectorStore.database)
    this.indexState.init()
    this.indexer = new Indexer({
      notesRoot,
      embedder,
      vectorStore: this.vectorStore,
      indexState: this.indexState
    })

    // Hydrate lastStatus with current totals.
    const totals = this.indexState.totals()
    this.lastStatus = {
      phase: totals.files > 0 ? 'done' : 'idle',
      filesTotal: totals.files,
      filesDone: totals.files,
      chunksTotal: totals.chunks,
      chunksDone: totals.chunks,
      lastIndexedAt: null
    }
  }

  getStatus(): IndexerProgress {
    return this.lastStatus
  }

  async triggerReindex(): Promise<void> {
    if (this.running) {
      this.reindexQueued = true
      return
    }
    if (!this.indexer) {
      const ok = this.init()
      if (!ok) return
    }
    this.running = true
    try {
      await this.indexAll()
    } catch (err) {
      if (this.recoverIndexStore(err)) {
        try {
          await this.indexAll()
        } catch (retryErr) {
          this.broadcastIndexingError(retryErr)
        }
      } else {
        this.broadcastIndexingError(err)
      }
    } finally {
      this.finishRun()
    }
  }

  private finishRun(): void {
    this.running = false
    this.emit(IDLE_EVENT)
    // A rebuild already waiting will index everything, so the request stays queued for it: a
    // rebuild that succeeds clears it, one that fails first leaves it to run afterwards.
    if (this.reindexQueued && this.rebuildsWaiting === 0) {
      this.reindexQueued = false
      this.triggerReindex().catch((err) => this.broadcastIndexingError(err))
    }
  }

  /**
   * Empties the index and rebuilds it from the notes. A run already going is waited for, not
   * refused. With embeddings on, they are tried before anything is deleted, so a bad key or no
   * connection leaves the working index in place; `beforeClear` runs once the clear is certain.
   * If embedding then fails part way, the notes are indexed for keyword search so local search
   * keeps working.
   */
  async clearAndRebuild(beforeClear?: () => void): Promise<void> {
    this.rebuildsWaiting += 1
    try {
      while (this.running) {
        await new Promise<void>((resolve) => this.once(IDLE_EVENT, resolve))
      }
    } finally {
      this.rebuildsWaiting -= 1
    }
    this.running = true
    try {
      // Before anything changes, not even the status: a failure here leaves the index as it was.
      if (this.embedder) {
        const [vector] = await withTimeout(
          this.embedder.embed(['ryte']),
          EMBEDDING_CHECK_TIMEOUT_MS,
          'The embedding service did not respond. The index was left as it was.'
        )
        if (!vector) {
          throw new Error(
            'The embedding service did not return a vector. The index was left as it was.'
          )
        }
      }
      // From here the whole index is rebuilt, which covers any reindex asked for until now; one
      // asked for during the rebuild still runs after it.
      this.reindexQueued = false
      this.broadcast({
        phase: 'walking',
        filesTotal: 0,
        filesDone: 0,
        chunksTotal: 0,
        chunksDone: 0
      })
      beforeClear?.()
      const dbPath = indexDbPath()
      this.close()
      removeIndexDatabaseFiles(dbPath)
      if (!this.init()) {
        throw new Error(this.lastStatus.error ?? 'Failed to initialize the index store')
      }
      try {
        await this.indexAll()
      } catch (err) {
        if (!this.embedder) throw err
        await this.rebuildForKeywordSearch(dbPath, err, beforeClear)
      }
    } catch (err) {
      this.broadcastIndexingError(err)
      throw err
    } finally {
      this.finishRun()
    }
  }

  private async rebuildForKeywordSearch(
    dbPath: string,
    cause: unknown,
    beforeClear?: () => void
  ): Promise<void> {
    const embedder = this.embedder
    const notesRoot = settingsStore.load().notesRoot
    // The store is replaced twice more, so anything holding the current one must let go first.
    beforeClear?.()
    this.close()
    removeIndexDatabaseFiles(dbPath)
    try {
      // Same vector table shape as the embedder's, so it can take embeddings again later.
      this.initializeStores(dbPath, notesRoot, null, embedder?.dim)
      await this.indexAll()
      // Back to the configured embedder, on the same database: every note is recorded as lacking
      // embeddings, so the next indexing run picks them up.
      beforeClear?.()
      this.close()
      this.initializeStores(dbPath, notesRoot, embedder)
    } catch (err) {
      this.close()
      throw err
    }
    beforeClear?.()
    const reason = cause instanceof Error ? cause.message : String(cause)
    this.broadcastIndexingError(
      new Error(
        `Semantic indexing failed (${reason}); notes were indexed for keyword search only and will be embedded the next time indexing runs.`
      )
    )
  }

  async notifyFileChanged(absPath: string): Promise<void> {
    await this.enqueueIncrementalOperation(absPath, 'changed')
  }

  async notifyFileRemoved(absPath: string): Promise<void> {
    await this.enqueueIncrementalOperation(absPath, 'removed')
  }

  subscribe(cb: (status: IndexerProgress) => void): () => void {
    this.on(STATUS_EVENT, cb)
    cb(this.lastStatus)
    return () => this.off(STATUS_EVENT, cb)
  }

  async embed(texts: string[]): Promise<Float32Array[]> {
    if (!this.embedder) throw new Error('No embedding provider configured')
    return this.embedder.embed(texts)
  }

  getVectorStore(): VectorStore | null {
    return this.vectorStore
  }

  close(): void {
    this.vectorStore?.close()
    this.vectorStore = null
    this.indexState = null
    this.indexer = null
    this.embedder = null
    this.pendingIncrementalOperations.clear()
  }

  private broadcast(p: IndexerProgress): void {
    const lastIndexedAt =
      p.phase === 'done'
        ? new Date().toISOString()
        : (p.lastIndexedAt ?? this.lastStatus.lastIndexedAt ?? null)
    this.lastStatus = { ...p, lastIndexedAt }
    this.emit(STATUS_EVENT, this.lastStatus)
  }

  private async indexAll(): Promise<void> {
    await this.indexer!.indexAll({
      onProgress: (p) => this.broadcast(p)
    })
  }

  private async enqueueIncrementalOperation(
    absPath: string,
    operation: 'changed' | 'removed'
  ): Promise<void> {
    this.pendingIncrementalOperations.set(absPath, operation)
    if (!this.incrementalDrain) {
      this.incrementalDrain = this.drainIncrementalOperations().finally(() => {
        this.incrementalDrain = null
      })
    }
    await this.incrementalDrain
  }

  private async drainIncrementalOperations(): Promise<void> {
    while (this.pendingIncrementalOperations.size > 0) {
      const next = this.pendingIncrementalOperations.entries().next().value
      if (!next) return
      const [absPath, operation] = next
      this.pendingIncrementalOperations.delete(absPath)

      try {
        await this.applyIncrementalOperation(absPath, operation)
      } catch (error) {
        this.broadcastIndexingError(error)
      }
    }
  }

  private async applyIncrementalOperation(
    absPath: string,
    operation: 'changed' | 'removed'
  ): Promise<void> {
    if (!this.indexer || !this.indexState) return
    if (operation === 'changed') {
      const result = await this.indexer.indexFile(absPath)
      if (result.skipped) return
    } else {
      await this.indexer.removeFile(absPath)
    }

    const totals = this.indexState.totals()
    this.broadcast({
      phase: 'done',
      filesTotal: totals.files,
      filesDone: totals.files,
      chunksTotal: totals.chunks,
      chunksDone: totals.chunks
    })
  }

  private recoverIndexStore(error: unknown): boolean {
    if (!isRecoverableIndexStoreError(error)) return false
    const dbPath = indexDbPath()
    this.close()
    removeIndexDatabaseFiles(dbPath)
    return this.init()
  }

  private broadcastIndexingError(error: unknown): void {
    this.broadcast({
      ...this.lastStatus,
      phase: 'error',
      error: error instanceof Error ? error.message : String(error)
    })
  }
}

export const indexerService = new IndexerService()

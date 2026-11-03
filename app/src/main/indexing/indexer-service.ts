import { EventEmitter } from 'node:events'
import { mkdirSync, rmSync } from 'node:fs'

import { Indexer, type IndexerProgress } from './indexer'
import { IndexStateStore } from './index-state'
import { OpenAIEmbeddingProvider } from './embedder'
import { EmbeddingBackfill, fileMtimeReader } from './embedding-backfill'
import { VectorStore } from './vector-store'
import { settingsStore } from '../settings/settings-store'
import { userDataDir } from '../paths'
import { indexLocationFor, removeStaleIndexFiles } from './index-location'
import { rebuildNotice, type RebuildNotice } from './rebuild-notice'

const STATUS_EVENT = 'status'
const IDLE_EVENT = 'idle'
const REBUILD_NOTICE_EVENT = 'rebuild-notice'
// After a note is written by the watcher, how long to wait for more edits before looking for notes to embed.
const EMBED_AFTER_EDIT_DELAY_MS = 2_000

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
  private backfill: EmbeddingBackfill | null = null
  private backfillKickTimer: ReturnType<typeof setTimeout> | null = null
  private lastStatus: IndexerProgress = {
    phase: 'idle',
    filesTotal: 0,
    filesDone: 0,
    chunksTotal: 0,
    chunksDone: 0,
    lastIndexedAt: null
  }
  private running = false
  // Set when a start removed the old single index database and cleared when the person dismisses it; held here, not sent once,
  // so a window that opens or reloads later still shows it.
  private pendingNotice: RebuildNotice | null = null
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
    // Main decides, not the screen: nothing is embedded unless the person agreed to this provider and model.
    const acknowledgement = settings.semanticIndexAcknowledgement
    const acknowledged =
      acknowledgement !== null &&
      acknowledgement.provider === settings.embeddingProvider &&
      acknowledgement.model === settings.embeddingModel
    const openaiKey =
      settings.semanticIndexEnabled && acknowledged ? settingsStore.getSecret('openai') : null
    const embedder = openaiKey
      ? new OpenAIEmbeddingProvider(openaiKey, { model: settings.embeddingModel })
      : null
    // Each notes folder has its own index file, so a folder change never meets another folder's rows.
    const location = indexLocationFor(userDataDir(), settings.notesRoot)
    const dbPath = location.path

    let legacyRemoved = false
    try {
      legacyRemoved = removeStaleIndexFiles(userDataDir(), location).legacyRemoved
      mkdirSync(location.directory, { recursive: true })
      this.initializeStores(dbPath, settings.notesRoot, embedder)
      if (legacyRemoved) this.setNotice(rebuildNotice({ cloud: embedder !== null }))
      this.scheduleBackfillKick({ onlyIfIdle: true })
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
        if (legacyRemoved) this.setNotice(rebuildNotice({ cloud: embedder !== null }))
        this.scheduleBackfillKick({ onlyIfIdle: true })
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
    embedder: OpenAIEmbeddingProvider | null
  ): void {
    this.embedder = embedder
    this.vectorStore = new VectorStore(dbPath)
    this.vectorStore.init(embedder?.dim ?? 1536)
    this.indexState = new IndexStateStore(this.vectorStore.database)
    this.indexState.init()
    this.indexer = new Indexer({
      notesRoot,
      vectorStore: this.vectorStore,
      indexState: this.indexState
    })
    this.backfill = embedder
      ? new EmbeddingBackfill({
          provider: embedder,
          vectorStore: this.vectorStore,
          indexState: this.indexState,
          fileMtimeMs: fileMtimeReader(notesRoot),
          log: (message, detail) => console.warn(message, detail)
        })
      : null

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

  /** The notice that the search index is being rebuilt, from a start that removed the old index until it is dismissed. */
  pendingRebuildNotice(): RebuildNotice | null {
    return this.pendingNotice
  }

  dismissRebuildNotice(): void {
    this.setNotice(null)
  }

  /** Every change of the notice (set, and dismissed), for the windows. */
  subscribeRebuildNotice(callback: (notice: RebuildNotice | null) => void): () => void {
    this.on(REBUILD_NOTICE_EVENT, callback)
    return () => this.off(REBUILD_NOTICE_EVENT, callback)
  }

  private setNotice(notice: RebuildNotice | null): void {
    if (this.pendingNotice === null && notice === null) return
    this.pendingNotice = notice
    this.emit(REBUILD_NOTICE_EVENT, notice)
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
      this.backfill?.kick()
    } catch (err) {
      if (this.recoverIndexStore(err)) {
        try {
          await this.indexAll()
          this.backfill?.kick()
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
   * refused. The notes are indexed for keyword search first, which needs no network, so search
   * works as soon as that pass is done; with smart search on, vectors are added afterwards in the
   * background and a failure there never undoes the keyword index. `beforeClear` runs once the
   * clear is certain.
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
      this.broadcast({
        phase: 'walking',
        filesTotal: 0,
        filesDone: 0,
        chunksTotal: 0,
        chunksDone: 0
      })
      beforeClear?.()
      // The folder and its file are taken once, so a folder change during the rebuild cannot mix them.
      const notesRoot = settingsStore.load().notesRoot
      const dbPath = indexLocationFor(userDataDir(), notesRoot).path
      this.close()
      removeIndexDatabaseFiles(dbPath)
      if (!this.init()) {
        throw new Error(this.lastStatus.error ?? 'Failed to initialize the index store')
      }
      // The whole index is rebuilt from here, which covers any reindex asked for until now; one
      // asked for during the rebuild still runs after it. A rebuild that fails before this point
      // leaves the request to run afterwards.
      this.reindexQueued = false
      await this.indexAll()
      this.backfill?.kick()
    } catch (err) {
      this.broadcastIndexingError(err)
      throw err
    } finally {
      this.finishRun()
    }
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
    // Before the store closes: a request still out must find the step stopped when it answers.
    this.backfill?.stop()
    this.backfill = null
    this.clearBackfillKickTimer()
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
      this.scheduleBackfillKick()
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

  /**
   * Looks for notes without vectors once edits have stopped for a moment, so a burst of edits makes
   * one look. Skipped while an index pass runs: that pass looks when it ends. The look made after
   * the indexer starts leaves a paused step alone, so a failure at startup keeps its own wait
   * instead of being retried early; an edit does bring a paused step's next try forward.
   */
  private scheduleBackfillKick(options: { onlyIfIdle?: boolean } = {}): void {
    if (!this.backfill) return
    this.clearBackfillKickTimer()
    this.backfillKickTimer = setTimeout(() => {
      this.backfillKickTimer = null
      if (this.running || !this.backfill) return
      if (options.onlyIfIdle && this.backfill.state !== 'idle') return
      this.backfill.kick()
    }, EMBED_AFTER_EDIT_DELAY_MS)
  }

  private clearBackfillKickTimer(): void {
    if (this.backfillKickTimer) clearTimeout(this.backfillKickTimer)
    this.backfillKickTimer = null
  }

  private recoverIndexStore(error: unknown): boolean {
    if (!isRecoverableIndexStoreError(error)) return false
    const dbPath = indexLocationFor(userDataDir(), settingsStore.load().notesRoot).path
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

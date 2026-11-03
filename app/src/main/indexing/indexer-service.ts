import { EventEmitter } from 'node:events'
import { mkdirSync, rmSync } from 'node:fs'

import type { EmbeddingStatus } from '../../contract/indexer'
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
const EMBEDDING_STATUS_EVENT = 'embedding-status'
// Progress is sent at most this often; a change of state or reason is always sent at once.
const EMBEDDING_STATUS_INTERVAL_MS = 500
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
  // Why smart search is on but nothing is embedded: the key or the saved agreement is missing. Null when it is off or working.
  private embeddingProblem: 'no-key' | 'no-agreement' | null = null
  private lastPublishedStatus: EmbeddingStatus | null = null
  private lastPublishedAt = 0
  private embeddingStatusTimer: ReturnType<typeof setTimeout> | null = null
  private lastStatus: IndexerProgress = {
    phase: 'idle',
    filesTotal: 0,
    filesDone: 0,
    chunksTotal: 0,
    chunksDone: 0,
    lastIndexedAt: null
  }
  private running = false
  // Bumped whenever the indexer is closed. A pass remembers the number it started under; if it has moved, the pass was working on
  // stores that are gone (the folder changed, the indexer was restarted, the app is quitting) and stops quietly.
  private generation = 0
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
    const savedKey = settings.semanticIndexEnabled ? settingsStore.getSecret('openai') : null
    const openaiKey = acknowledged ? savedKey : null
    this.embeddingProblem = !settings.semanticIndexEnabled
      ? null
      : !savedKey
        ? 'no-key'
        : !acknowledged
          ? 'no-agreement'
          : null
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
      this.publishEmbeddingStatus()
      return true
    } catch (error) {
      this.close()
      if (!isRecoverableIndexStoreError(error)) {
        this.broadcastIndexingError(error)
        this.publishEmbeddingStatus()
        return false
      }

      removeIndexDatabaseFiles(dbPath)
      try {
        this.initializeStores(dbPath, settings.notesRoot, embedder)
        if (legacyRemoved) this.setNotice(rebuildNotice({ cloud: embedder !== null }))
        this.scheduleBackfillKick({ onlyIfIdle: true })
        this.publishEmbeddingStatus()
        return true
      } catch (rebuildError) {
        this.close()
        this.broadcastIndexingError(rebuildError)
        this.publishEmbeddingStatus()
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
          log: (message, detail) => console.warn(message, detail),
          onChange: () => this.publishEmbeddingStatus()
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

  /**
   * What smart search is doing, from the embedding step and the index. `off` when no step runs, with the reason when smart
   * search is on but cannot send (no key, or no saved agreement for this provider and model).
   */
  getEmbeddingStatus(): EmbeddingStatus {
    const kind = this.embeddingKind()
    const indexState = this.indexState
    if (kind.state === 'off' || !indexState) return { ...kind, total: 0, done: 0, pending: 0 }
    const total = indexState.embeddableCount()
    const pending = Math.min(indexState.unembeddedCount(), total)
    return { ...kind, total, done: total - pending, pending }
  }

  /** The state, the reason and the retry time: what changes the sentence, without the counts, which cost a query. */
  private embeddingKind(): Pick<EmbeddingStatus, 'state' | 'reason' | 'retryAt'> {
    const backfill = this.backfill
    if (!backfill || !this.indexState) {
      return { state: 'off', ...(this.embeddingProblem ? { reason: this.embeddingProblem } : {}) }
    }
    const reason = backfill.reason
    const retryAt = backfill.retryAt
    return {
      state: backfill.state,
      ...(reason ? { reason } : {}),
      ...(retryAt !== null ? { retryAt: new Date(retryAt).toISOString() } : {})
    }
  }

  /** Every change of what smart search is doing, for the windows. */
  subscribeEmbeddingStatus(callback: (status: EmbeddingStatus) => void): () => void {
    this.on(EMBEDDING_STATUS_EVENT, callback)
    return () => this.off(EMBEDDING_STATUS_EVENT, callback)
  }

  /**
   * Tells the windows what smart search is doing. A change of state, reason or retry time goes out at once; progress alone
   * (the counts) at most every half second, so a long run does not flood the windows. Unchanged is not sent.
   */
  private publishEmbeddingStatus(): void {
    const kind = this.embeddingKind()
    const last = this.lastPublishedStatus
    const sameKind =
      last !== null &&
      last.state === kind.state &&
      last.reason === kind.reason &&
      last.retryAt === kind.retryAt
    const wait = this.lastPublishedAt + EMBEDDING_STATUS_INTERVAL_MS - Date.now()
    if (sameKind && wait > 0) {
      // Progress inside the interval: send the latest once the interval is over, without counting now.
      if (!this.embeddingStatusTimer) {
        this.embeddingStatusTimer = setTimeout(() => {
          this.embeddingStatusTimer = null
          this.publishEmbeddingStatus()
        }, wait)
      }
      return
    }
    const next = this.getEmbeddingStatus()
    if (last !== null && sameKind && last.done === next.done && last.total === next.total) return
    this.clearEmbeddingStatusTimer()
    this.lastPublishedStatus = next
    this.lastPublishedAt = Date.now()
    this.emit(EMBEDDING_STATUS_EVENT, next)
  }

  private clearEmbeddingStatusTimer(): void {
    if (this.embeddingStatusTimer) clearTimeout(this.embeddingStatusTimer)
    this.embeddingStatusTimer = null
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
      this.afterPass(await this.indexAll())
    } catch (err) {
      // Only a pass that was still wanted gets here: a stale pass's failure is dropped by `indexAll`, so it can never reach recovery.
      if (this.recoverIndexStore(err)) {
        try {
          // Recovery closed and reopened the stores, so this pass starts under the new generation.
          this.afterPass(await this.indexAll())
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
      this.afterPass(await this.indexAll())
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
    // A pass in flight is stale from here on.
    this.generation += 1
    // Before the store closes: a request still out must find the step stopped when it answers.
    this.backfill?.stop()
    this.backfill = null
    this.clearBackfillKickTimer()
    // Whatever opens next says what smart search is doing then; an old half-second wait must not speak for it.
    this.clearEmbeddingStatusTimer()
    this.lastPublishedStatus = null
    this.embeddingProblem = null
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

  /**
   * Runs one pass over the notes folder. The pass is stale once the indexer has been closed under it: it is told to stop at its next
   * checkpoint, its progress is no longer passed on, and a failure it ends with (its stores are closed) is dropped rather than
   * reported or recovered from. Returns whether it ended stale.
   */
  private async indexAll(): Promise<{ stale: boolean }> {
    const generation = this.generation
    const stale = (): boolean => this.generation !== generation
    try {
      await this.indexer!.indexAll({
        onProgress: (p) => {
          if (!stale()) this.broadcast(p)
        },
        shouldStop: stale
      })
    } catch (error) {
      if (!stale()) throw error
      const code = (error as { code?: unknown } | null)?.code
      console.warn(
        'Ryte dropped an index pass cut short.',
        typeof code === 'string' ? code : 'UNKNOWN'
      )
      return { stale: true }
    }
    return { stale: stale() }
  }

  /** What follows a pass: the embedding step looks for work after a pass that finished; a pass that was cut short asks for another. */
  private afterPass(result: { stale: boolean }): void {
    if (!result.stale) {
      this.backfill?.kick()
      this.publishEmbeddingStatus()
      return
    }
    // A new indexer, opened after the old stores were closed, has not done the work this pass was doing. Ask for one pass for it; a
    // folder change or a setting change that asks for its own is collapsed with this. When the app is quitting there is no
    // indexer and nothing is asked for.
    if (this.indexer) this.reindexQueued = true
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
    // The note's chunks changed or went, so the counts did.
    this.publishEmbeddingStatus()
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

import { stat } from 'node:fs/promises'
import { join } from 'node:path'

import {
  EmbeddingReplyError,
  classifyEmbeddingError,
  describeEmbeddingError,
  type EmbeddingProvider
} from './embedder'
import type { IndexStateStore, UnembeddedSource } from './index-state'
import type { VectorStore } from './vector-store'

// After a failure that may pass (offline, rate limit, a service error) the step waits this long before
// trying again, then the next, and keeps the last. A change to a note or a rebuild tries at once.
export const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000]
// A note found changed under the step is looked at again; this many times in one run is enough to
// know it is being edited and to leave it to the next run.
const MAX_STALE_RETRIES = 2

export type EmbeddingBackfillState = 'idle' | 'running' | 'paused'

/** Why a paused step is paused, as far as the person is told. */
export type EmbeddingPauseReason = 'offline' | 'rate-limit' | 'service' | 'auth'

export interface EmbeddingBackfillDeps {
  provider: EmbeddingProvider
  vectorStore: Pick<VectorStore, 'chunkTextsForFile' | 'attachVectors'>
  indexState: Pick<IndexStateStore, 'unembeddedSources'>
  /** The note's modification time as the indexer records it, or null when the file is gone. */
  fileMtimeMs: (sourcePath: string) => Promise<number | null>
  /** Only a class and a code are ever passed, never a message or a path. */
  log?: (message: string, detail: string) => void
  retryDelaysMs?: number[]
  /** The state or the progress changed. Carries nothing; ask the step. A listener that throws does not stop the step. */
  onChange?: () => void
}

/** The modification time the indexer records for a note under `notesRoot`. */
export function fileMtimeReader(notesRoot: string): (sourcePath: string) => Promise<number | null> {
  return async (sourcePath) => {
    try {
      return Math.floor((await stat(join(notesRoot, sourcePath))).mtimeMs)
    } catch {
      return null
    }
  }
}

/**
 * Gives notes that the indexer wrote for keyword search their vectors, one note at a time, in the
 * background. A failure only ever pauses this step: the keyword index is already complete and is
 * never touched. One instance belongs to one open index; `stop()` ends it for good, and an
 * instance that has been stopped never reads or writes a store again.
 */
export class EmbeddingBackfill {
  private stopped = false
  private running = false
  // A note is being sent or about to be: only then does the step say it is running. A run that finds nothing to do is silent, so
  // every pass and every edit does not flash "running" in the windows.
  private working = false
  private paused = false
  // A bad or refused key: nothing is sent again until the settings change, which makes a new instance.
  private authBlocked = false
  private rerun = false
  private attempt = 0
  private timer: ReturnType<typeof setTimeout> | null = null
  private pauseReason: EmbeddingPauseReason | null = null
  private retryAtMs: number | null = null
  // Notes the service rejected, by path and modification time, so they are not sent again until they change.
  private readonly rejected = new Set<string>()
  private readonly retryDelaysMs: number[]

  constructor(private readonly deps: EmbeddingBackfillDeps) {
    this.retryDelaysMs = deps.retryDelaysMs ?? RETRY_DELAYS_MS
  }

  get state(): EmbeddingBackfillState {
    if (this.working) return 'running'
    return this.paused ? 'paused' : 'idle'
  }

  /** Why the step is paused, or null when it is not. */
  get reason(): EmbeddingPauseReason | null {
    return this.state === 'paused' ? this.pauseReason : null
  }

  /** When a paused step will try again by itself (epoch milliseconds), or null when nothing will. */
  get retryAt(): number | null {
    return this.state === 'paused' ? this.retryAtMs : null
  }

  private changed(): void {
    try {
      this.deps.onChange?.()
    } catch {
      // A listener must never stop the step.
    }
  }

  /** Something may have changed: look for notes without vectors. Retries a paused step at once. */
  kick(): void {
    if (this.stopped || this.authBlocked) return
    if (this.running) {
      this.rerun = true
      return
    }
    this.clearTimer()
    void this.run()
  }

  stop(): void {
    this.stopped = true
    this.working = false
    this.paused = false
    this.pauseReason = null
    this.retryAtMs = null
    this.clearTimer()
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  private pauseAndRetryLater(reason: EmbeddingPauseReason): void {
    this.paused = true
    this.pauseReason = reason
    const delay = this.retryDelaysMs[Math.min(this.attempt, this.retryDelaysMs.length - 1)]
    this.attempt += 1
    this.retryAtMs = Date.now() + delay
    this.timer = setTimeout(() => {
      this.timer = null
      if (!this.stopped) void this.run()
    }, delay)
  }

  private async run(): Promise<void> {
    if (this.running || this.stopped) return
    this.running = true
    this.paused = false
    this.pauseReason = null
    this.retryAtMs = null
    try {
      do {
        // A kick that arrived while a request was out asks for a try now, even if that request then failed.
        if (this.rerun && this.paused) {
          this.clearTimer()
          this.paused = false
          this.pauseReason = null
          this.retryAtMs = null
        }
        this.rerun = false
        await this.drain()
      } while (this.rerun && !this.stopped && !this.authBlocked)
    } catch (error) {
      // Not a service failure: the index could not be read or written. The next kick tries again.
      this.deps.log?.('Ryte embedding step stopped.', describeStoreError(error))
    } finally {
      this.running = false
      this.working = false
      if (!this.stopped) this.changed()
    }
  }

  private async drain(): Promise<void> {
    const { provider, vectorStore, indexState, fileMtimeMs } = this.deps
    // Notes set aside for this run only: changed under the step, or being edited.
    const deferred = new Set<string>()
    const staleCount = new Map<string, number>()
    // The queue is read once and walked, not read again for every note: reading it is a query over every waiting
    // note. Each note is checked against the disk and the store when its turn comes, so an old snapshot cannot
    // attach stale vectors. When it runs out, one more read finds notes queued meanwhile.
    let queue: UnembeddedSource[] = []
    let position = 0
    let fresh = false
    for (;;) {
      if (this.stopped) return
      if (position >= queue.length) {
        if (fresh) return
        queue = indexState.unembeddedSources()
        position = 0
        fresh = true
      }
      const next = queue[position]
      position += 1
      if (!next) continue
      if (
        deferred.has(next.sourcePath) ||
        this.rejected.has(`${next.sourcePath}\n${next.mtimeMs}`)
      ) {
        continue
      }
      fresh = false
      const { sourcePath, mtimeMs } = next

      // The state row alone does not know the file changed since it was indexed.
      const onDisk = await fileMtimeMs(sourcePath)
      if (this.stopped) return
      if (onDisk !== mtimeMs) {
        deferred.add(sourcePath)
        continue
      }

      const chunks = vectorStore.chunkTextsForFile(sourcePath)
      if (chunks.length === 0) {
        deferred.add(sourcePath)
        continue
      }

      if (!this.working) {
        this.working = true
        this.changed()
      }

      let vectors: Float32Array[]
      try {
        vectors = await provider.embed(chunks.map((chunk) => chunk.text))
        // The provider leaves a slot empty for a vector it never got; `some` would skip it.
        if (vectors.length !== chunks.length || Array.from(vectors).some((vector) => !vector)) {
          throw new EmbeddingReplyError('The service did not return one vector per chunk.')
        }
      } catch (error) {
        if (this.stopped) return
        const failure = classifyEmbeddingError(error)
        this.deps.log?.('Ryte embedding step paused.', describeEmbeddingError(error))
        if (failure === 'bad-input') {
          this.rejected.add(`${sourcePath}\n${mtimeMs}`)
          continue
        }
        if (failure === 'auth') {
          this.authBlocked = true
          this.paused = true
          this.pauseReason = 'auth'
          this.retryAtMs = null
        } else {
          this.pauseAndRetryLater(failure)
        }
        return
      }
      if (this.stopped) return

      let result: 'attached' | 'stale'
      try {
        result = vectorStore.attachVectors(
          sourcePath,
          mtimeMs,
          chunks.map((chunk, index) => ({ ...chunk, vector: vectors[index] }))
        )
      } catch (error) {
        // A vector that does not fit the index is the same for every attempt; leave the note alone.
        this.deps.log?.('Ryte embedding step could not store vectors.', describeStoreError(error))
        this.rejected.add(`${sourcePath}\n${mtimeMs}`)
        continue
      }
      if (result === 'attached') {
        this.attempt = 0
        this.changed()
        continue
      }
      const stale = (staleCount.get(sourcePath) ?? 0) + 1
      staleCount.set(sourcePath, stale)
      if (stale > MAX_STALE_RETRIES) deferred.add(sourcePath)
    }
  }
}

function describeStoreError(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code
  return typeof code === 'string' ? code : 'UNKNOWN'
}

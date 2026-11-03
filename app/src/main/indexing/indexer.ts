import { stat } from 'node:fs/promises'
import { relative } from 'node:path'

import { chunkFile } from './chunker'
import type { IndexStateStore } from './index-state'
import type { VectorStore } from './vector-store'
import { walkNotes } from './walker'

export interface IndexerDeps {
  notesRoot: string
  vectorStore: VectorStore
  indexState: IndexStateStore
}

export type IndexerPhase = 'idle' | 'walking' | 'indexing' | 'done' | 'error'

export interface IndexerProgress {
  phase: IndexerPhase
  filesTotal: number
  filesDone: number
  chunksTotal: number
  chunksDone: number
  lastIndexedAt?: string | null
  error?: string
}

export interface IndexAllOptions {
  onProgress?: (p: IndexerProgress) => void
}

export interface IndexAllSummary {
  filesIndexed: number
  chunksIndexed: number
}

const LOCAL_INDEX_YIELD_BATCH_SIZE = 8

function errorCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code
  return typeof code === 'string' ? code : 'UNKNOWN'
}

interface PendingFile {
  absPath: string
  relPath: string
  mtimeMs: number
}

export class Indexer {
  constructor(private readonly deps: IndexerDeps) {}

  async indexAll(opts: IndexAllOptions = {}): Promise<IndexAllSummary> {
    const { notesRoot, vectorStore, indexState } = this.deps
    const emit = (p: IndexerProgress): void => opts.onProgress?.(p)

    emit({ phase: 'walking', filesTotal: 0, filesDone: 0, chunksTotal: 0, chunksDone: 0 })
    const allPaths = await walkNotes(notesRoot)
    const currentRelPaths = new Set(allPaths.map((absPath) => relative(notesRoot, absPath)))

    for (const sourcePath of indexState.allSourcePaths()) {
      if (currentRelPaths.has(sourcePath)) continue
      vectorStore.deleteFileChunks(sourcePath)
      indexState.markRemoved(sourcePath)
    }

    // Phase 1: stat all files needing re-index. Keep this list metadata-only so
    // startup indexing never holds the changed corpus' chunks in memory.
    const pending: PendingFile[] = []
    for (const absPath of allPaths) {
      const relPath = relative(notesRoot, absPath)
      const stats = await stat(absPath)
      const mtimeMs = Math.floor(stats.mtimeMs)
      if (!indexState.shouldReindex(relPath, mtimeMs)) continue
      pending.push({ absPath, relPath, mtimeMs })
    }

    const filesTotal = pending.length
    let chunksTotal = 0
    let chunksDone = 0
    let filesDone = 0
    let filesSkipped = 0

    if (filesTotal === 0) {
      const totals = indexState.totals()
      emit({
        phase: 'done',
        filesTotal: totals.files,
        filesDone: totals.files,
        chunksTotal: totals.chunks,
        chunksDone: totals.chunks
      })
      return { filesIndexed: 0, chunksIndexed: 0 }
    }

    emit({ phase: 'indexing', filesTotal, filesDone, chunksTotal, chunksDone })

    // Phase 2: chunk and write file-by-file. This preserves the memory ceiling at
    // roughly one source file plus its chunks instead of all pending chunks.
    for (const [index, file] of pending.entries()) {
      let chunks: ReturnType<typeof chunkFile>
      try {
        chunks = chunkFile(file.absPath, notesRoot)
      } catch (error) {
        // A note that cannot be read (permissions, gone since the walk) is left out, not allowed to stop the others. It has no
        // row, so the next pass tries it again. Only the code is logged, never a path.
        console.warn('Ryte could not index a note.', errorCode(error))
        filesDone += 1
        filesSkipped += 1
        emit({ phase: 'indexing', filesTotal, filesDone, chunksTotal, chunksDone })
        continue
      }
      chunksTotal += chunks.length

      if (chunks.length === 0) {
        vectorStore.deleteFileChunks(file.relPath)
        // Nothing to embed, so there is nothing to come back for.
        indexState.markIndexed(file.relPath, file.mtimeMs, 0, Date.now(), true)
        filesDone += 1
        emit({ phase: 'indexing', filesTotal, filesDone, chunksTotal, chunksDone })
        if ((index + 1) % LOCAL_INDEX_YIELD_BATCH_SIZE === 0) {
          await new Promise<void>((resolve) => setImmediate(resolve))
        }
        continue
      }

      // Keyword rows only. The embedding step attaches vectors afterwards, so a note is searchable
      // as soon as it is written and a failing network cannot hold up or abort the pass.
      vectorStore.replaceFileTextChunks(file.relPath, chunks)
      indexState.markIndexed(file.relPath, file.mtimeMs, chunks.length, Date.now(), false)

      filesDone += 1
      chunksDone += chunks.length
      emit({ phase: 'indexing', filesTotal, filesDone, chunksTotal, chunksDone })

      if ((index + 1) % LOCAL_INDEX_YIELD_BATCH_SIZE === 0) {
        await new Promise<void>((resolve) => setImmediate(resolve))
      }
    }

    emit({ phase: 'done', filesTotal, filesDone, chunksTotal, chunksDone })
    return { filesIndexed: filesDone - filesSkipped, chunksIndexed: chunksDone }
  }

  async indexFile(absPath: string): Promise<{ chunkCount: number; skipped: boolean }> {
    const { notesRoot, vectorStore, indexState } = this.deps
    const relPath = relative(notesRoot, absPath)
    const stats = await stat(absPath)
    const mtimeMs = Math.floor(stats.mtimeMs)
    if (!indexState.shouldReindex(relPath, mtimeMs)) {
      return { chunkCount: 0, skipped: true }
    }
    const chunks = chunkFile(absPath, notesRoot)
    if (chunks.length === 0) {
      vectorStore.deleteFileChunks(relPath)
      indexState.markIndexed(relPath, mtimeMs, 0, Date.now(), true)
      return { chunkCount: 0, skipped: false }
    }
    vectorStore.replaceFileTextChunks(relPath, chunks)
    indexState.markIndexed(relPath, mtimeMs, chunks.length, Date.now(), false)
    return { chunkCount: chunks.length, skipped: false }
  }

  async removeFile(absPath: string): Promise<void> {
    const relPath = relative(this.deps.notesRoot, absPath)
    this.deps.vectorStore.deleteFileChunks(relPath)
    this.deps.indexState.markRemoved(relPath)
  }
}

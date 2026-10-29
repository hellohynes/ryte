import { mkdirSync, mkdtempSync, rmSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Excluded from `pnpm test` (vitest.config.ts) — see vector-store.test.ts for context.

import { Indexer, type IndexerProgress } from './indexer'
import { IndexStateStore } from './index-state'
import { VectorStore } from './vector-store'
import type { EmbeddingProvider } from './embedder'

const DIM = 4

function fakeEmbedder(): EmbeddingProvider {
  return {
    dim: DIM,
    embed: vi.fn(async (texts: string[]) => texts.map((_, i) => Float32Array.from([i, i, i, i])))
  }
}

describe('Indexer', () => {
  let tempDir: string
  let notesRoot: string
  let dbPath: string
  let store: VectorStore
  let state: IndexStateStore

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ryte-idx-'))
    notesRoot = join(tempDir, 'notes')
    mkdirSync(notesRoot, { recursive: true })
    dbPath = join(tempDir, 'index.db')
    store = new VectorStore(dbPath)
    store.init(DIM)
    state = new IndexStateStore(store.database)
    state.init()
  })

  afterEach(() => {
    store.close()
    rmSync(tempDir, { recursive: true, force: true })
  })

  function makeIndexer(embedder: EmbeddingProvider | null = fakeEmbedder()): Indexer {
    return new Indexer({ notesRoot, embedder, vectorStore: store, indexState: state })
  }

  it('indexAll produces correct chunk + file counts on a 3-file fixture', async () => {
    writeFileSync(join(notesRoot, 'a.md'), '# A\n\nbody A\n')
    writeFileSync(join(notesRoot, 'b.md'), '# B\n\nbody B\n## B2\n\nmore B\n')
    writeFileSync(join(notesRoot, 'c.md'), '# C\n\nbody C\n')

    const indexer = makeIndexer()
    const summary = await indexer.indexAll()

    expect(summary.filesIndexed).toBe(3)
    expect(summary.chunksIndexed).toBe(4) // a:1, b:2, c:1
    expect(store.fileCount()).toBe(3)
    expect(store.chunkCount()).toBe(4)
  })

  it('revisits notes that were indexed without embeddings once an embedder is available', async () => {
    writeFileSync(join(notesRoot, 'a.md'), '# A\n\nbody A\n')

    await makeIndexer(null).indexAll()
    const embedder = fakeEmbedder()
    const summary = await makeIndexer(embedder).indexAll()

    expect(summary.filesIndexed).toBe(1)
    expect(embedder.embed).toHaveBeenCalledTimes(1)
    // Once embedded it is left alone again.
    expect((await makeIndexer(embedder).indexAll()).filesIndexed).toBe(0)
    expect(embedder.embed).toHaveBeenCalledTimes(1)
  })

  it('does not record a note as embedded when the service returns too few vectors', async () => {
    writeFileSync(join(notesRoot, 'a.md'), '# A\n\nbody A\n\n## A2\n\nmore A\n')
    const short: EmbeddingProvider = {
      dim: DIM,
      embed: vi.fn(async () => [Float32Array.from([1, 1, 1, 1])])
    }

    await expect(makeIndexer(short).indexAll()).rejects.toThrow(/1 vectors for 2 chunks/)

    expect(state.shouldReindex('a.md', Math.floor(Date.now() + 10_000), true)).toBe(true)
    // Nothing was stored for it, and the next run with a working service tries it again.
    expect(store.chunkCount()).toBe(0)
    expect((await makeIndexer().indexAll()).filesIndexed).toBe(1)
  })

  it('does not record a note as embedded when a vector is missing from a full-length reply', async () => {
    writeFileSync(join(notesRoot, 'a.md'), '# A\n\nbody A\n\n## A2\n\nmore A\n')
    // As the real provider answers a short batch: the array has a slot per text, one left empty.
    const gappy: EmbeddingProvider = {
      dim: DIM,
      embed: vi.fn(async (texts: string[]) => {
        const result: Float32Array[] = new Array(texts.length)
        result[0] = Float32Array.from([1, 1, 1, 1])
        return result
      })
    }

    await expect(makeIndexer(gappy).indexAll()).rejects.toThrow(/missing/i)

    expect(store.chunkCount()).toBe(0)
    expect((await makeIndexer().indexAll()).filesIndexed).toBe(1)
  })

  it('does not record a note as embedded through the single-file path either', async () => {
    const file = join(notesRoot, 'a.md')
    writeFileSync(file, '# A\n\nbody A\n\n## A2\n\nmore A\n')
    const gappy: EmbeddingProvider = {
      dim: DIM,
      embed: vi.fn(async (texts: string[]) => {
        const result: Float32Array[] = new Array(texts.length)
        result[0] = Float32Array.from([1, 1, 1, 1])
        return result
      })
    }

    await expect(makeIndexer(gappy).indexFile(file)).rejects.toThrow(/missing/i)

    expect(store.chunkCount()).toBe(0)
    expect(state.shouldReindex('a.md', Math.floor(Date.now() + 10_000), true)).toBe(true)
  })

  it('does not keep revisiting a note with nothing to embed', async () => {
    writeFileSync(join(notesRoot, 'empty.md'), '')
    const embedder = fakeEmbedder()

    await makeIndexer(embedder).indexAll()
    const second = await makeIndexer(embedder).indexAll()

    expect(second.filesIndexed).toBe(0)
  })

  it('works out which notes already have embeddings when an older index is opened', async () => {
    writeFileSync(join(notesRoot, 'embedded.md'), '# E\n\nbody E\n')
    writeFileSync(join(notesRoot, 'text-only.md'), '# T\n\nbody T\n')
    await makeIndexer().indexAll()
    // Make text-only.md look as if an earlier version indexed it without embeddings.
    store.replaceFileTextChunks('text-only.md', [
      {
        text: 'body T',
        sourcePath: 'text-only.md',
        headingPath: ['T'],
        date: null,
        frontmatter: {}
      }
    ])
    // An index from before the per-note embedding flag existed.
    store.database.exec('ALTER TABLE file_state DROP COLUMN embedded')
    new IndexStateStore(store.database).init()

    const embedder = fakeEmbedder()
    const summary = await makeIndexer(embedder).indexAll()

    expect(summary.filesIndexed).toBe(1)
    expect(embedder.embed).toHaveBeenCalledTimes(1)
    const embeddedTexts = vi.mocked(embedder.embed).mock.calls[0]?.[0] ?? []
    expect(embeddedTexts).toHaveLength(1)
    expect(embeddedTexts[0]).toContain('body T')
  })

  it('indexAll skips files unchanged since prior run', async () => {
    const filePath = join(notesRoot, 'a.md')
    writeFileSync(filePath, '# A\n\nbody A\n')

    const embedder = fakeEmbedder()
    const indexer = makeIndexer(embedder)
    await indexer.indexAll()
    expect(embedder.embed).toHaveBeenCalledTimes(1)

    // Re-run — should skip (mtime unchanged)
    await indexer.indexAll()
    expect(embedder.embed).toHaveBeenCalledTimes(1)
  })

  it('indexAll removes stale rows for files deleted while the watcher was offline', async () => {
    const filePath = join(notesRoot, 'a.md')
    writeFileSync(filePath, '# A\n\nbody A\n')

    const indexer = makeIndexer()
    await indexer.indexAll()
    expect(store.fileCount()).toBe(1)
    expect(state.totals()).toEqual({ files: 1, chunks: 1 })

    unlinkSync(filePath)
    const summary = await indexer.indexAll()
    expect(summary).toEqual({ filesIndexed: 0, chunksIndexed: 0 })
    expect(store.fileCount()).toBe(0)
    expect(store.chunkCount()).toBe(0)
    expect(state.totals()).toEqual({ files: 0, chunks: 0 })
  })

  it('indexAll re-indexes a file when its mtime advances', async () => {
    const filePath = join(notesRoot, 'a.md')
    writeFileSync(filePath, '# A\n\nbody A\n')

    const embedder = fakeEmbedder()
    const indexer = makeIndexer(embedder)
    await indexer.indexAll()
    const callsAfterFirst = (embedder.embed as ReturnType<typeof vi.fn>).mock.calls.length

    // Advance mtime
    writeFileSync(filePath, '# A\n\nbody A\n\n# B\n\nbody B\n')
    const future = (Date.now() + 5000) / 1000
    utimesSync(filePath, future, future)

    await indexer.indexAll()
    expect((embedder.embed as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(
      callsAfterFirst
    )
    expect(store.chunkCount()).toBe(2) // re-indexed file replaces prior chunks
  })

  it('emits onProgress with walking, indexing, done phases', async () => {
    writeFileSync(join(notesRoot, 'a.md'), '# A\n\nbody A\n')

    const events: IndexerProgress[] = []
    const indexer = makeIndexer()
    await indexer.indexAll({ onProgress: (p) => events.push({ ...p }) })

    const phases = events.map((e) => e.phase)
    expect(phases).toContain('walking')
    expect(phases).toContain('indexing')
    expect(phases[phases.length - 1]).toBe('done')
  })

  it('indexFile handles one file and respects mtime skip', async () => {
    const filePath = join(notesRoot, 'a.md')
    writeFileSync(filePath, '# A\n\nbody A\n')

    const embedder = fakeEmbedder()
    const indexer = makeIndexer(embedder)
    const first = await indexer.indexFile(filePath)
    expect(first.skipped).toBe(false)
    expect(first.chunkCount).toBe(1)

    const second = await indexer.indexFile(filePath)
    expect(second.skipped).toBe(true)
    expect(second.chunkCount).toBe(0)
    expect(embedder.embed).toHaveBeenCalledTimes(1)
  })

  it('removeFile zeros chunks for that file', async () => {
    const filePath = join(notesRoot, 'a.md')
    writeFileSync(filePath, '# A\n\nbody\n')
    const indexer = makeIndexer()
    await indexer.indexFile(filePath)
    expect(store.chunkCount()).toBe(1)

    await indexer.removeFile(filePath)
    expect(store.chunkCount()).toBe(0)
    expect(state.totals().files).toBe(0)
  })

  it('indexAll handles empty notes root gracefully', async () => {
    const indexer = makeIndexer()
    const summary = await indexer.indexAll()
    expect(summary).toEqual({ filesIndexed: 0, chunksIndexed: 0 })
  })

  it('yields to the event loop between bounded local-only indexing batches', async () => {
    for (let index = 0; index < 40; index += 1) {
      writeFileSync(join(notesRoot, `local-${index}.md`), `# Local ${index}\n\nbody\n`)
    }

    let yieldedDuringIndexing = false
    const indexer = new Indexer({
      notesRoot,
      embedder: null,
      vectorStore: store,
      indexState: state
    })

    await indexer.indexAll({
      onProgress: (progress) => {
        if (progress.phase !== 'indexing' || progress.filesDone !== 0) return
        setImmediate(() => {
          yieldedDuringIndexing = true
        })
      }
    })

    expect(yieldedDuringIndexing).toBe(true)
  })
})

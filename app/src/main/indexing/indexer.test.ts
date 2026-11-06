import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  unlinkSync,
  utimesSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Excluded from `pnpm test` (vitest.config.ts); run by `pnpm test:native`, which uses Electron's Node.

import { Indexer, type IndexerProgress } from './indexer'
import { IndexStateStore } from './index-state'
import { VectorStore } from './vector-store'

const DIM = 4

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

  function makeIndexer(): Indexer {
    return new Indexer({ notesRoot, vectorStore: store, indexState: state })
  }

  function vectorCount(): number {
    const row = store.database.prepare('SELECT COUNT(*) AS n FROM chunk_vectors').get() as {
      n: number
    }
    return row.n
  }

  /** What the embedding step does for one note: vectors for every chunk it has, at the state's mtime. */
  function embed(sourcePath: string, mtimeMs: number): string {
    const chunks = store.chunkTextsForFile(sourcePath)
    return store.attachVectors(
      sourcePath,
      mtimeMs,
      chunks.map((chunk) => ({ ...chunk, vector: Float32Array.from([1, 0, 0, 0]) }))
    )
  }

  it('indexAll produces correct chunk + file counts on a 3-file fixture', async () => {
    writeFileSync(join(notesRoot, 'a.md'), '# A\n\nbody A\n')
    writeFileSync(join(notesRoot, 'b.md'), '# B\n\nbody B\n## B2\n\nmore B\n')
    writeFileSync(join(notesRoot, 'c.md'), '# C\n\nbody C\n')

    const summary = await makeIndexer().indexAll()

    expect(summary.filesIndexed).toBe(3)
    expect(summary.chunksIndexed).toBe(4) // a:1, b:2, c:1
    expect(store.fileCount()).toBe(3)
    expect(store.chunkCount()).toBe(4)
  })

  it('writes keyword rows only and queues every note with chunks for vectors', async () => {
    writeFileSync(join(notesRoot, 'a.md'), '# A\n\nbody about harbours\n')
    writeFileSync(join(notesRoot, 'b.md'), '# B\n\nbody B\n## B2\n\nmore B\n')

    await makeIndexer().indexAll()

    expect(vectorCount()).toBe(0)
    expect(store.keywordSearch('harbours').map((row) => row.sourcePath)).toEqual(['a.md'])
    expect(
      state
        .unembeddedSources()
        .map((source) => source.sourcePath)
        .sort()
    ).toEqual(['a.md', 'b.md'])
    expect(state.unembeddedCount()).toBe(2)
  })

  it('does not keep a note with nothing to embed in the queue', async () => {
    writeFileSync(join(notesRoot, 'empty.md'), '')

    const first = await makeIndexer().indexAll()
    const second = await makeIndexer().indexAll()

    expect(first.filesIndexed).toBe(1)
    expect(second.filesIndexed).toBe(0)
    expect(state.unembeddedCount()).toBe(0)
  })

  it('leaves a note that has vectors alone, and queues it again only when the note changes', async () => {
    const filePath = join(notesRoot, 'a.md')
    writeFileSync(filePath, '# A\n\nbody A\n')
    const indexer = makeIndexer()
    await indexer.indexAll()
    const [{ mtimeMs }] = state.unembeddedSources()
    expect(embed('a.md', mtimeMs)).toBe('attached')
    expect(state.unembeddedCount()).toBe(0)

    expect((await indexer.indexAll()).filesIndexed).toBe(0)
    expect(vectorCount()).toBe(1)

    writeFileSync(filePath, '# A\n\nbody A changed\n')
    const future = (Date.now() + 5000) / 1000
    utimesSync(filePath, future, future)
    expect((await indexer.indexAll()).filesIndexed).toBe(1)

    // The rewrite dropped the old vector with the old chunk, and the note waits for new ones.
    expect(vectorCount()).toBe(0)
    expect(state.unembeddedCount()).toBe(1)
  })

  it('works out which notes already have embeddings when an older index is opened', async () => {
    writeFileSync(join(notesRoot, 'embedded.md'), '# E\n\nbody E\n')
    writeFileSync(join(notesRoot, 'text-only.md'), '# T\n\nbody T\n')
    await makeIndexer().indexAll()
    const embeddedState = state.unembeddedSources().find((s) => s.sourcePath === 'embedded.md')
    expect(embed('embedded.md', embeddedState?.mtimeMs ?? 0)).toBe('attached')
    // An index from before the per-note embedding flag existed.
    store.database.exec('ALTER TABLE file_state DROP COLUMN embedded')
    new IndexStateStore(store.database).init()

    expect(state.unembeddedSources().map((source) => source.sourcePath)).toEqual(['text-only.md'])
  })

  it('indexes every note when one has front matter that is not valid YAML', async () => {
    writeFileSync(join(notesRoot, 'a.md'), '# A\n\nbody A\n')
    writeFileSync(
      join(notesRoot, 'b-broken.md'),
      '---\ndescription: Live data from the store: one model, one order\n---\n\n# B\n\nbody about harbours\n'
    )
    writeFileSync(join(notesRoot, 'c.md'), '# C\n\nbody C\n')

    const summary = await makeIndexer().indexAll()

    expect(summary.filesIndexed).toBe(3)
    expect(store.keywordSearch('harbours').map((row) => row.sourcePath)).toEqual(['b-broken.md'])
    expect(store.fileCount()).toBe(3)
  })

  it.skipIf(process.getuid?.() === 0)(
    'carries on past a note that cannot be read, and picks it up on a later pass',
    async () => {
      writeFileSync(join(notesRoot, 'a.md'), '# A\n\nbody A\n')
      const locked = join(notesRoot, 'b-locked.md')
      writeFileSync(locked, '# B\n\nbody about harbours\n')
      writeFileSync(join(notesRoot, 'c.md'), '# C\n\nbody C\n')
      chmodSync(locked, 0o000)
      try {
        const events: IndexerProgress[] = []
        const summary = await makeIndexer().indexAll({ onProgress: (p) => events.push({ ...p }) })

        expect(summary.filesIndexed).toBe(2)
        expect(store.fileCount()).toBe(2)
        expect(events.at(-1)).toMatchObject({ phase: 'done', filesTotal: 3, filesDone: 3 })
        // It has no row, so it is not mistaken for indexed.
        expect(state.allSourcePaths().sort()).toEqual(['a.md', 'c.md'])
      } finally {
        chmodSync(locked, 0o644)
      }

      const again = await makeIndexer().indexAll()
      expect(again.filesIndexed).toBe(1)
      expect(store.fileCount()).toBe(3)
    }
  )

  describe('being told to stop', () => {
    function writeNotes(count: number): void {
      for (let i = 0; i < count; i += 1) {
        writeFileSync(
          join(notesRoot, `n${String(i).padStart(2, '0')}.md`),
          `# N${i}\n\nbody ${i}\n`
        )
      }
    }

    /** True once the call number given has been reached: the Nth time the indexer asks whether to stop. */
    function stopAtCheck(n: number): { shouldStop: () => boolean; asked: () => number } {
      let asked = 0
      return {
        shouldStop: () => ++asked >= n,
        asked: () => asked
      }
    }

    it('reports nothing special, and keeps no `stopped` field, when it is never told to stop', async () => {
      writeNotes(3)

      const summary = await makeIndexer().indexAll({ shouldStop: () => false })

      expect(summary).toEqual({ filesIndexed: 3, chunksIndexed: 3 })
      expect('stopped' in summary).toBe(false)
    })

    it('stops right after the folder scan, before it reads or changes the index', async () => {
      writeNotes(3)
      await makeIndexer().indexAll()
      unlinkSync(join(notesRoot, 'n00.md'))
      const events: IndexerProgress[] = []

      const summary = await makeIndexer().indexAll({
        shouldStop: () => true,
        onProgress: (p) => events.push({ ...p })
      })

      expect(summary).toMatchObject({ filesIndexed: 0, chunksIndexed: 0, stopped: true })
      // The row of the vanished note is still there: nothing was removed.
      expect(state.allSourcePaths()).toContain('n00.md')
      expect(events.map((e) => e.phase)).not.toContain('done')
    })

    it('stops before it removes the rows of a note that has gone', async () => {
      writeNotes(3)
      await makeIndexer().indexAll()
      unlinkSync(join(notesRoot, 'n00.md'))
      // The first question comes after the scan; the second is asked before the first removal.
      const { shouldStop } = stopAtCheck(2)

      const summary = await makeIndexer().indexAll({ shouldStop })

      expect(summary.stopped).toBe(true)
      expect(state.allSourcePaths()).toContain('n00.md')
      expect(store.fileCount()).toBe(3)
    })

    it('stops while it looks at which notes changed, having written nothing', async () => {
      writeNotes(6)
      const { shouldStop, asked } = stopAtCheck(4)

      const summary = await makeIndexer().indexAll({ shouldStop })

      expect(summary).toMatchObject({ filesIndexed: 0, stopped: true })
      expect(store.chunkCount()).toBe(0)
      expect(state.allSourcePaths()).toEqual([])
      expect(asked()).toBe(4)
    })

    it('stops before the next note once told to, and what it wrote is complete', async () => {
      writeNotes(10)
      const events: IndexerProgress[] = []

      const summary = await makeIndexer().indexAll({
        // Asked before each note of the writing loop, among other places: stop once four notes are in.
        shouldStop: () => store.fileCount() >= 4,
        onProgress: (p) => events.push({ ...p })
      })

      expect(summary).toMatchObject({ filesIndexed: 4, chunksIndexed: 4, stopped: true })
      expect(store.fileCount()).toBe(4)
      // Every row of the index state has its chunks, and the other way round.
      expect(state.allSourcePaths()).toHaveLength(4)
      expect(state.totals()).toEqual({ files: 4, chunks: 4 })
      expect(events.map((e) => e.phase)).not.toContain('done')
    })

    it('stops before it writes the first note when told just before the writing begins', async () => {
      writeNotes(3)
      // One question after the scan, one for each of the three notes in the stat loop, then the first note of the writing loop.
      const { shouldStop } = stopAtCheck(5)

      const summary = await makeIndexer().indexAll({ shouldStop })

      expect(summary).toMatchObject({ filesIndexed: 0, chunksIndexed: 0, stopped: true })
      expect(store.chunkCount()).toBe(0)
      expect(state.allSourcePaths()).toEqual([])
    })

    it('sends no `done` when it is told to stop only after the last note was written', async () => {
      writeNotes(3)
      const events: IndexerProgress[] = []

      const summary = await makeIndexer().indexAll({
        shouldStop: () => store.fileCount() >= 3,
        onProgress: (p) => events.push({ ...p })
      })

      expect(summary).toMatchObject({ filesIndexed: 3, stopped: true })
      expect(events.map((e) => e.phase)).not.toContain('done')
    })

    it('never stops in the middle of a note: the one being written is whole, then it stops', async () => {
      writeNotes(5)
      let stop = false
      const original = store.replaceFileTextChunks.bind(store)
      vi.spyOn(store, 'replaceFileTextChunks').mockImplementation((path, chunks) => {
        original(path, chunks)
        stop = true
      })

      const summary = await makeIndexer().indexAll({ shouldStop: () => stop })

      expect(summary).toMatchObject({ filesIndexed: 1, stopped: true })
      expect(store.fileCount()).toBe(1)
      expect(state.totals()).toEqual({ files: 1, chunks: 1 })
    })

    it('finishes the notes it did not reach on a later pass', async () => {
      writeNotes(8)
      await makeIndexer().indexAll({ shouldStop: () => store.fileCount() >= 3 })

      const later = await makeIndexer().indexAll()

      expect(later.filesIndexed).toBe(5)
      expect(store.fileCount()).toBe(8)
    })
  })

  it('indexAll skips files unchanged since prior run', async () => {
    writeFileSync(join(notesRoot, 'a.md'), '# A\n\nbody A\n')
    const indexer = makeIndexer()
    expect((await indexer.indexAll()).filesIndexed).toBe(1)

    expect((await indexer.indexAll()).filesIndexed).toBe(0)
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
    const indexer = makeIndexer()
    await indexer.indexAll()

    writeFileSync(filePath, '# A\n\nbody A\n\n# B\n\nbody B\n')
    const future = (Date.now() + 5000) / 1000
    utimesSync(filePath, future, future)

    expect((await indexer.indexAll()).filesIndexed).toBe(1)
    expect(store.chunkCount()).toBe(2) // re-indexed file replaces prior chunks
  })

  it('emits onProgress with walking, indexing, done phases', async () => {
    writeFileSync(join(notesRoot, 'a.md'), '# A\n\nbody A\n')

    const events: IndexerProgress[] = []
    await makeIndexer().indexAll({ onProgress: (p) => events.push({ ...p }) })

    const phases = events.map((e) => e.phase)
    expect(phases).toContain('walking')
    expect(phases).toContain('indexing')
    expect(phases[phases.length - 1]).toBe('done')
  })

  it('indexFile writes keyword rows for one file and respects mtime skip', async () => {
    const filePath = join(notesRoot, 'a.md')
    writeFileSync(filePath, '# A\n\nbody A\n')

    const indexer = makeIndexer()
    const first = await indexer.indexFile(filePath)
    expect(first.skipped).toBe(false)
    expect(first.chunkCount).toBe(1)
    expect(vectorCount()).toBe(0)
    expect(state.unembeddedCount()).toBe(1)

    const second = await indexer.indexFile(filePath)
    expect(second.skipped).toBe(true)
    expect(second.chunkCount).toBe(0)
  })

  it('indexFile leaves a note with nothing to embed out of the queue', async () => {
    const filePath = join(notesRoot, 'empty.md')
    writeFileSync(filePath, '')

    await makeIndexer().indexFile(filePath)

    expect(state.unembeddedCount()).toBe(0)
  })

  it('indexFile stops before touching stores closed while stat was pending', async () => {
    const filePath = join(notesRoot, 'a.md')
    writeFileSync(filePath, '# A\n\nbody A\n')
    let stopped = false
    const pending = makeIndexer().indexFile(filePath, { shouldStop: () => stopped })

    // indexFile has yielded to stat, but has not read or written the stores yet.
    stopped = true
    store.close()

    await expect(pending).resolves.toEqual({ chunkCount: 0, skipped: true })
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
    const summary = await makeIndexer().indexAll()
    expect(summary).toEqual({ filesIndexed: 0, chunksIndexed: 0 })
  })

  it('yields to the event loop between bounded indexing batches', async () => {
    for (let index = 0; index < 40; index += 1) {
      writeFileSync(join(notesRoot, `local-${index}.md`), `# Local ${index}\n\nbody\n`)
    }

    let yieldedDuringIndexing = false
    await makeIndexer().indexAll({
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

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

// Excluded from `pnpm test` (vitest.config.ts) because better-sqlite3 is
// compiled for Electron ABI during dev. Kept for reference / manual run
// under Node ABI. Behavior validated via scripts/smoke-indexer.ts + TS-001.

import { VectorStore, type ChunkWithVector } from './vector-store'

const DIM = 4 // small dim for tests

function fakeChunk(sourcePath: string, headingPath: string[], text: string): ChunkWithVector {
  return {
    chunk: {
      text,
      sourcePath,
      headingPath,
      date: null,
      frontmatter: {}
    },
    vector: Float32Array.from([1, 0, 0, 0])
  }
}

describe('VectorStore', () => {
  let tempDir: string
  let dbPath: string
  let store: VectorStore

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ryte-vs-'))
    dbPath = join(tempDir, 'index.db')
    store = new VectorStore(dbPath)
    store.init(DIM)
  })

  afterEach(() => {
    store.close()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('initializes with vec extension loaded and reports a version', () => {
    const version = store.vecVersion()
    expect(typeof version).toBe('string')
    expect(version.length).toBeGreaterThan(0)
  })

  it('starts empty: chunkCount and fileCount are 0', () => {
    expect(store.chunkCount()).toBe(0)
    expect(store.fileCount()).toBe(0)
  })

  it('inserts chunks via replaceFileChunks and counts them', () => {
    store.replaceFileChunks('a.md', [
      fakeChunk('a.md', ['H1'], 'body1'),
      fakeChunk('a.md', ['H1', 'H2'], 'body2')
    ])
    expect(store.chunkCount()).toBe(2)
    expect(store.fileCount()).toBe(1)
  })

  it('atomically replaces chunks for a file (old chunks deleted, new chunks inserted)', () => {
    store.replaceFileChunks('a.md', [
      fakeChunk('a.md', ['H1'], 'old1'),
      fakeChunk('a.md', ['H1'], 'old2')
    ])
    store.replaceFileChunks('a.md', [fakeChunk('a.md', ['H1'], 'new1')])
    expect(store.chunkCount()).toBe(1)
  })

  it('counts unique files via fileCount', () => {
    store.replaceFileChunks('a.md', [fakeChunk('a.md', ['A'], 'a')])
    store.replaceFileChunks('b.md', [fakeChunk('b.md', ['B'], 'b')])
    expect(store.fileCount()).toBe(2)
  })

  it('deleteFileChunks removes all chunks for a file', () => {
    store.replaceFileChunks('a.md', [
      fakeChunk('a.md', ['A'], 'a1'),
      fakeChunk('a.md', ['A'], 'a2')
    ])
    store.replaceFileChunks('b.md', [fakeChunk('b.md', ['B'], 'b')])
    store.deleteFileChunks('a.md')
    expect(store.chunkCount()).toBe(1)
    expect(store.fileCount()).toBe(1)
  })

  it('persists across reopen', () => {
    store.replaceFileChunks('a.md', [fakeChunk('a.md', ['A'], 'a1')])
    store.close()
    const store2 = new VectorStore(dbPath)
    store2.init(DIM)
    expect(store2.chunkCount()).toBe(1)
    store2.close()
  })

  it('round-trips chunk text and heading_path', () => {
    store.replaceFileChunks('a.md', [fakeChunk('a.md', ['Outer', 'Inner'], 'hello world')])
    const rows = store.allChunksForFile('a.md')
    expect(rows).toHaveLength(1)
    expect(rows[0].text).toBe('hello world')
    expect(rows[0].headingPath).toEqual(['Outer', 'Inner'])
  })
})

describe('VectorStore — FTS5 + hybridSearch (native, excluded from pnpm test)', () => {
  let tempDir: string
  let store: VectorStore

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ryte-fts-'))
    store = new VectorStore(join(tempDir, 'index.db'))
    store.init(DIM)
  })

  afterEach(() => {
    store.close()
    rmSync(tempDir, { recursive: true, force: true })
  })

  function makeChunk(sourcePath: string, text: string, vec: number[]): ChunkWithVector {
    return {
      chunk: { text, sourcePath, headingPath: [], date: null, frontmatter: {} },
      vector: Float32Array.from(vec)
    }
  }

  it('FTS5 keyword search finds matching chunk', () => {
    store.replaceFileChunks('a.md', [makeChunk('a.md', 'the quick brown fox jumps', [1, 0, 0, 0])])
    store.replaceFileChunks('b.md', [makeChunk('b.md', 'unrelated noise about cats', [0, 1, 0, 0])])
    const results = store.hybridSearch('quick fox', Float32Array.from([0, 0, 0, 1]), 5)
    expect(results.some((r) => r.sourcePath === 'a.md')).toBe(true)
  })

  it('vector search finds semantically close chunk', () => {
    store.replaceFileChunks('close.md', [
      makeChunk('close.md', 'vector match text here', [1, 0, 0, 0])
    ])
    store.replaceFileChunks('far.md', [makeChunk('far.md', 'distant vector content', [0, 0, 0, 1])])
    // Query vector close to close.md's vector
    const results = store.hybridSearch('zzz no keywords', Float32Array.from([0.99, 0.1, 0, 0]), 5)
    expect(results.some((r) => r.sourcePath === 'close.md')).toBe(true)
  })

  it('hybridSearch returns chunks from both retrieval paths', () => {
    // keyword match only
    store.replaceFileChunks('kw.md', [makeChunk('kw.md', 'elephant habitat savanna', [0, 0, 1, 0])])
    // vector match only
    store.replaceFileChunks('vec.md', [makeChunk('vec.md', 'zzz noise words', [1, 0, 0, 0])])
    const results = store.hybridSearch('elephant', Float32Array.from([0.98, 0.1, 0, 0]), 5)
    const paths = results.map((r) => r.sourcePath)
    expect(paths).toContain('kw.md')
    expect(paths).toContain('vec.md')
  })

  it('FTS5 is backfilled when chunks exist but FTS index is empty (reopen scenario)', () => {
    store.replaceFileChunks('pre.md', [
      makeChunk('pre.md', 'backfill this content elephant', [1, 0, 0, 0])
    ])
    store.close()
    // Reopen — backfill should run since FTS is not synced from old DB
    const store2 = new VectorStore(join(tempDir, 'index.db'))
    store2.init(DIM)
    const results = store2.hybridSearch('elephant', Float32Array.from([0, 0, 0, 1]), 5)
    expect(results.some((r) => r.sourcePath === 'pre.md')).toBe(true)
    store2.close()
  })

  it('deleteFileChunks syncs FTS — deleted file no longer appears in keyword search', () => {
    store.replaceFileChunks('del.md', [makeChunk('del.md', 'unique word porcupine', [1, 0, 0, 0])])
    store.deleteFileChunks('del.md')
    const results = store.hybridSearch('porcupine', Float32Array.from([0, 0, 0, 1]), 5)
    expect(results.every((r) => r.sourcePath !== 'del.md')).toBe(true)
  })

  it('replaceFileChunks syncs FTS — old text no longer searchable after replace', () => {
    store.replaceFileChunks('r.md', [makeChunk('r.md', 'old content walrus', [1, 0, 0, 0])])
    store.replaceFileChunks('r.md', [makeChunk('r.md', 'new content penguin', [1, 0, 0, 0])])
    // The keyword path alone: hybridSearch also ranks by vector, and the replaced file's new chunk
    // is the only vector in the store, so it comes back for any query.
    expect(store.keywordSearch('walrus', 5)).toEqual([])
    const fresh = store.keywordSearch('penguin', 5)
    expect(fresh.map((r) => r.text)).toEqual(['new content penguin'])
  })
})

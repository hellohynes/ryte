import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { IndexStateStore } from './index-state'

// Excluded from `pnpm test` (vitest.config.ts) — see vector-store.test.ts for context.

describe('IndexStateStore', () => {
  let tempDir: string
  let db: ReturnType<typeof Database>
  let store: IndexStateStore

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ryte-is-'))
    db = new Database(join(tempDir, 'index.db'))
    store = new IndexStateStore(db)
    store.init()
  })

  afterEach(() => {
    db.close()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('reports shouldReindex=true for unseen file', () => {
    expect(store.shouldReindex('a.md', 100)).toBe(true)
  })

  it('reports shouldReindex=false after markIndexed with same mtime', () => {
    store.markIndexed('a.md', 100, 5)
    expect(store.shouldReindex('a.md', 100)).toBe(false)
  })

  it('asks for a note recorded without embeddings only when vectors are wanted', () => {
    store.markIndexed('a.md', 100, 5)
    expect(store.shouldReindex('a.md', 100)).toBe(false)
    expect(store.shouldReindex('a.md', 100, true)).toBe(true)

    store.markIndexed('a.md', 100, 5, 1000, true)
    expect(store.shouldReindex('a.md', 100, true)).toBe(false)
  })

  it('still opens an older index whose embeddings cannot be worked out, assuming its notes have them', () => {
    const legacy = new Database(join(tempDir, 'legacy.db'))
    try {
      legacy.exec(`
        CREATE TABLE file_state (
          source_path TEXT PRIMARY KEY,
          mtime_ms INTEGER NOT NULL,
          chunk_count INTEGER NOT NULL,
          indexed_at_ms INTEGER NOT NULL DEFAULT 0
        );
        INSERT INTO file_state VALUES ('a.md', 1, 2, 0);
        -- Present, but not shaped like the real tables, so working out embeddings fails.
        CREATE TABLE chunks (id INTEGER);
        CREATE TABLE chunk_vectors (embedding BLOB);
      `)
      const old = new IndexStateStore(legacy)

      // Search must keep working: the index opens, and nothing is re-embedded on a guess.
      expect(() => old.init()).not.toThrow()
      expect(old.shouldReindex('a.md', 1, true)).toBe(false)
      const columns = legacy.prepare('PRAGMA table_info(file_state)').all() as Array<{
        name: string
      }>
      expect(columns.filter((column) => column.name === 'embedded')).toHaveLength(1)
    } finally {
      legacy.close()
    }
  })

  it('does not hide a failure that is not a schema mismatch behind the fallback', () => {
    const legacy = new Database(join(tempDir, 'busy.db'))
    try {
      legacy.exec(`
        CREATE TABLE file_state (
          source_path TEXT PRIMARY KEY,
          mtime_ms INTEGER NOT NULL,
          chunk_count INTEGER NOT NULL,
          indexed_at_ms INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE chunks (id INTEGER, source_path TEXT);
        CREATE TABLE chunk_vectors (embedding BLOB);
      `)
      // A locked database part way through working out embeddings.
      const flaky = new Proxy(legacy, {
        get(target, prop) {
          if (prop === 'exec') {
            return (sql: string) => {
              if (sql.includes('chunk_count = 0')) {
                throw Object.assign(new Error('database is locked'), { code: 'SQLITE_BUSY' })
              }
              return target.exec(sql)
            }
          }
          const value = Reflect.get(target, prop, target)
          return typeof value === 'function' ? value.bind(target) : value
        }
      })

      expect(() => new IndexStateStore(flaky).init()).toThrow('database is locked')

      const columns = legacy.prepare('PRAGMA table_info(file_state)').all() as Array<{
        name: string
      }>
      expect(columns.map((column) => column.name)).not.toContain('embedded')
    } finally {
      legacy.close()
    }
  })

  it('reports shouldReindex=true when mtime is newer than recorded', () => {
    store.markIndexed('a.md', 100, 5)
    expect(store.shouldReindex('a.md', 101)).toBe(true)
  })

  it('totals reflects sum of chunk counts across files', () => {
    store.markIndexed('a.md', 100, 5)
    store.markIndexed('b.md', 200, 3)
    expect(store.totals()).toEqual({ files: 2, chunks: 8 })
  })

  it('markRemoved drops a file from totals', () => {
    store.markIndexed('a.md', 100, 5)
    store.markIndexed('b.md', 200, 3)
    store.markRemoved('a.md')
    expect(store.totals()).toEqual({ files: 1, chunks: 3 })
  })

  it('lists tracked source paths in stable order', () => {
    store.markIndexed('b.md', 100, 1)
    store.markIndexed('a.md', 100, 1)
    expect(store.allSourcePaths()).toEqual(['a.md', 'b.md'])
  })

  it('lists only sources indexed after a snapshot timestamp', () => {
    store.markIndexed('old.md', 100, 1, 1000)
    store.markIndexed('new.md', 200, 1, 2000)

    expect(store.sourceStatesIndexedAfter(1000)).toEqual([
      { sourcePath: 'new.md', mtimeMs: 200, indexedAtMs: 2000 }
    ])
  })

  it('markIndexed on existing path updates mtime and chunk count', () => {
    store.markIndexed('a.md', 100, 5)
    store.markIndexed('a.md', 200, 7)
    expect(store.totals()).toEqual({ files: 1, chunks: 7 })
    expect(store.shouldReindex('a.md', 200)).toBe(false)
    expect(store.shouldReindex('a.md', 100)).toBe(false) // older mtime is not newer
  })

  it('persists across reconstruction (same db handle)', () => {
    store.markIndexed('a.md', 100, 5)
    const store2 = new IndexStateStore(db)
    store2.init()
    expect(store2.totals()).toEqual({ files: 1, chunks: 5 })
  })
})

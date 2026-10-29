import Database, { type Database as DatabaseType } from 'better-sqlite3'
import * as sqliteVec from 'sqlite-vec'

import { buildFtsMatchQuery } from './fts-query'
import { resolveSQLiteVecLoadablePath } from './sqlite-vec-path'
import type { Chunk } from './chunker'

export interface ChunkWithVector {
  chunk: Chunk
  vector: Float32Array
}

export interface StoredChunkRow {
  text: string
  sourcePath: string
  headingPath: string[]
  date: string | null
}

const RRF_K = 60
const DEFAULT_HYBRID_RESULTS = 8

export class VectorStore {
  private db: DatabaseType | null = null
  private dim = 0

  constructor(private readonly dbPath: string) {}

  init(dim: number): void {
    this.dim = dim
    this.db = new Database(this.dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.loadExtension(resolveSQLiteVecLoadablePath(sqliteVec.getLoadablePath()))
    this.createSchema()
  }

  get database(): DatabaseType {
    if (!this.db) throw new Error('VectorStore not initialized — call init() first')
    return this.db
  }

  vecVersion(): string {
    const row = this.database.prepare('SELECT vec_version() AS v').get() as { v: string }
    return row.v
  }

  chunkCount(): number {
    const row = this.database.prepare('SELECT COUNT(*) AS n FROM chunks').get() as { n: number }
    return row.n
  }

  fileCount(): number {
    const row = this.database
      .prepare('SELECT COUNT(DISTINCT source_path) AS n FROM chunks')
      .get() as { n: number }
    return row.n
  }

  sourcePathsIndexedAfter(indexedAfterMs: number): string[] {
    const rows = this.database
      .prepare(
        `SELECT source_path AS sourcePath
         FROM file_state
         WHERE indexed_at_ms > ?
         ORDER BY source_path`
      )
      .all(indexedAfterMs) as Array<{ sourcePath: string }>
    return rows.map((row) => row.sourcePath)
  }

  existingSourcePaths(sourcePaths: string[]): string[] {
    if (sourcePaths.length === 0) return []
    const placeholders = sourcePaths.map(() => '?').join(', ')
    const rows = this.database
      .prepare(
        `SELECT source_path AS sourcePath FROM file_state WHERE source_path IN (${placeholders})`
      )
      .all(...sourcePaths) as Array<{ sourcePath: string }>
    return rows.map((row) => row.sourcePath)
  }

  allChunksForFile(sourcePath: string): StoredChunkRow[] {
    const rows = this.database
      .prepare(
        'SELECT text, source_path AS sourcePath, heading_path AS headingPath, date FROM chunks WHERE source_path = ? ORDER BY id'
      )
      .all(sourcePath) as Array<{
      text: string
      sourcePath: string
      headingPath: string
      date: string | null
    }>
    return rows.map((r) => ({
      text: r.text,
      sourcePath: r.sourcePath,
      headingPath: JSON.parse(r.headingPath) as string[],
      date: r.date
    }))
  }

  replaceFileChunks(sourcePath: string, items: ChunkWithVector[]): void {
    this.replaceChunks(
      sourcePath,
      items.map(({ chunk, vector }) => ({ chunk, vector }))
    )
  }

  replaceFileTextChunks(sourcePath: string, chunks: Chunk[]): void {
    this.replaceChunks(
      sourcePath,
      chunks.map((chunk) => ({ chunk }))
    )
  }

  keywordSearch(queryText: string, maxResults = DEFAULT_HYBRID_RESULTS): StoredChunkRow[] {
    const matchQuery = buildFtsMatchQuery(queryText)
    if (!matchQuery) return []

    let ftsRows: Array<{ id: number }> = []
    try {
      ftsRows = this.database
        .prepare(
          `SELECT rowid AS id FROM chunk_fts WHERE chunk_fts MATCH ? ORDER BY bm25(chunk_fts) LIMIT ?`
        )
        .all(matchQuery, maxResults) as Array<{ id: number }>
    } catch {
      return []
    }
    return this.chunksForIds(ftsRows.map(({ id }) => id))
  }

  private replaceChunks(
    sourcePath: string,
    items: Array<{ chunk: Chunk; vector?: Float32Array }>
  ): void {
    const db = this.database
    const txn = db.transaction(
      (path: string, list: Array<{ chunk: Chunk; vector?: Float32Array }>) => {
        const oldRows = db
          .prepare('SELECT id, text FROM chunks WHERE source_path = ?')
          .all(path) as Array<{
          id: number
          text: string
        }>
        const deleteFts = db.prepare(
          `INSERT INTO chunk_fts(chunk_fts, rowid, text) VALUES('delete', ?, ?)`
        )
        const deleteVec = db.prepare('DELETE FROM chunk_vectors WHERE rowid = ?')
        for (const { id, text } of oldRows) {
          deleteFts.run(id, text)
          deleteVec.run(id)
        }
        db.prepare('DELETE FROM chunks WHERE source_path = ?').run(path)

        const insertChunk = db.prepare(
          'INSERT INTO chunks (source_path, heading_path, date, frontmatter, text) VALUES (?, ?, ?, ?, ?)'
        )
        const insertVec = db.prepare('INSERT INTO chunk_vectors (rowid, embedding) VALUES (?, ?)')
        const insertFts = db.prepare('INSERT INTO chunk_fts(rowid, text) VALUES(?, ?)')
        for (const { chunk, vector } of list) {
          if (vector && vector.length !== this.dim) {
            throw new Error(`Vector dim ${vector.length} does not match store dim ${this.dim}`)
          }
          const info = insertChunk.run(
            chunk.sourcePath,
            JSON.stringify(chunk.headingPath),
            chunk.date,
            JSON.stringify(chunk.frontmatter),
            chunk.text
          )
          const id = BigInt(info.lastInsertRowid)
          if (vector) {
            insertVec.run(id, vector)
          }
          insertFts.run(id, chunk.text)
        }
      }
    )
    txn(sourcePath, items)
  }

  deleteFileChunks(sourcePath: string): void {
    const db = this.database
    const txn = db.transaction((path: string) => {
      const oldRows = db
        .prepare('SELECT id, text FROM chunks WHERE source_path = ?')
        .all(path) as Array<{
        id: number
        text: string
      }>
      const deleteFts = db.prepare(
        `INSERT INTO chunk_fts(chunk_fts, rowid, text) VALUES('delete', ?, ?)`
      )
      const deleteVec = db.prepare('DELETE FROM chunk_vectors WHERE rowid = ?')
      for (const { id, text } of oldRows) {
        deleteFts.run(id, text)
        deleteVec.run(id)
      }
      db.prepare('DELETE FROM chunks WHERE source_path = ?').run(path)
    })
    txn(sourcePath)
  }

  hybridSearch(
    queryText: string,
    queryVec: Float32Array,
    k: number,
    maxResults = DEFAULT_HYBRID_RESULTS
  ): StoredChunkRow[] {
    const db = this.database

    const vectorRows = db
      .prepare(`SELECT rowid AS id FROM chunk_vectors WHERE embedding MATCH ? AND k = ?`)
      .all(queryVec, k) as Array<{ id: number }>

    let ftsRows: Array<{ id: number }> = []
    const matchQuery = buildFtsMatchQuery(queryText)
    if (matchQuery) {
      try {
        ftsRows = db
          .prepare(
            `SELECT rowid AS id FROM chunk_fts WHERE chunk_fts MATCH ? ORDER BY bm25(chunk_fts) LIMIT ?`
          )
          .all(matchQuery, k) as Array<{ id: number }>
      } catch {
        // Malformed FTS5 query after sanitization should be rare; fall through to vector-only.
      }
    }

    const scores = new Map<number, number>()
    vectorRows.forEach(({ id }, i) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (RRF_K + i + 1))
    })
    ftsRows.forEach(({ id }, i) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (RRF_K + i + 1))
    })

    const topIds = [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxResults)
      .map(([id]) => id)

    return this.chunksForIds(topIds)
  }

  private chunksForIds(ids: number[]): StoredChunkRow[] {
    const db = this.database
    return ids.map((id) => {
      const row = db
        .prepare(
          'SELECT text, source_path AS sourcePath, heading_path AS headingPath, date FROM chunks WHERE id = ?'
        )
        .get(id) as { text: string; sourcePath: string; headingPath: string; date: string | null }
      return { ...row, headingPath: JSON.parse(row.headingPath) as string[] }
    })
  }

  close(): void {
    this.db?.close()
    this.db = null
  }

  private createSchema(): void {
    const db = this.database
    db.exec(`
      CREATE TABLE IF NOT EXISTS chunks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_path TEXT NOT NULL,
        heading_path TEXT NOT NULL,
        date TEXT,
        frontmatter TEXT NOT NULL,
        text TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_chunks_source_path ON chunks (source_path);
    `)
    db.exec(
      `CREATE VIRTUAL TABLE IF NOT EXISTS chunk_vectors USING vec0(embedding float[${this.dim}])`
    )
    db.exec(
      `CREATE VIRTUAL TABLE IF NOT EXISTS chunk_fts USING fts5(text, content='chunks', content_rowid='id')`
    )
    // One-time backfill: populate FTS index for chunks indexed before FTS was added.
    const ftsCount = (db.prepare('SELECT COUNT(*) AS n FROM chunk_fts').get() as { n: number }).n
    if (ftsCount === 0 && this.chunkCount() > 0) {
      db.exec('INSERT INTO chunk_fts(rowid, text) SELECT id, text FROM chunks')
    }
  }
}

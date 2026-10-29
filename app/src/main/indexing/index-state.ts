import type { Database as DatabaseType } from 'better-sqlite3'

export interface IndexTotals {
  files: number
  chunks: number
}

export interface IndexedSourceState {
  sourcePath: string
  mtimeMs: number
  indexedAtMs: number
}

/**
 * Per-file mtime tracking. Lives alongside chunks/chunk_vectors in the same
 * index.db. Lets the indexer skip unchanged files on re-launch.
 */
export class IndexStateStore {
  constructor(private readonly db: DatabaseType) {}

  init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS file_state (
        source_path TEXT PRIMARY KEY,
        mtime_ms INTEGER NOT NULL,
        chunk_count INTEGER NOT NULL,
        indexed_at_ms INTEGER NOT NULL DEFAULT 0,
        embedded INTEGER NOT NULL DEFAULT 0
      )
    `)
    const columns = this.db.prepare('PRAGMA table_info(file_state)').all() as Array<{
      name: string
    }>
    if (!columns.some((column) => column.name === 'indexed_at_ms')) {
      this.db.exec('ALTER TABLE file_state ADD COLUMN indexed_at_ms INTEGER NOT NULL DEFAULT 0')
    }
    if (!columns.some((column) => column.name === 'embedded')) {
      // All or nothing: a column added without the inference after it would look as if no note had
      // embeddings, and the next indexing run would embed all of them again.
      const addColumn = (infer: () => void): void =>
        this.db.transaction(() => {
          this.db.exec('ALTER TABLE file_state ADD COLUMN embedded INTEGER NOT NULL DEFAULT 0')
          infer()
        })()
      try {
        addColumn(() => this.inferEmbedded())
      } catch (error) {
        // Only an index that is not shaped as expected is given up on; a locked or failing disk
        // is a real fault and surfaces.
        if ((error as { code?: unknown }).code !== 'SQLITE_ERROR') throw error
        // It must still open: local search has to keep working. Its notes are assumed to have
        // embeddings, which never causes a surprise re-embed; a rebuild gives them real ones.
        console.warn(
          'Index state: could not tell which notes have embeddings; assuming all do. ' +
            'Clear and rebuild the index to embed any that do not.'
        )
        addColumn(() => this.db.exec('UPDATE file_state SET embedded = 1'))
      }
    }
  }

  /**
   * An index from before `embedded` existed: a note counts as embedded when it has chunks and all
   * of them have vectors, or when it has nothing to embed. Run once, as the column is added.
   */
  private inferEmbedded(): void {
    const tables = this.db
      .prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name IN ('chunks', 'chunk_vectors')")
      .get() as { n: number }
    if (tables.n < 2) return
    this.db.exec(`
      UPDATE file_state SET embedded = 1
      WHERE chunk_count = 0
         OR (
           EXISTS (SELECT 1 FROM chunks c WHERE c.source_path = file_state.source_path)
           AND NOT EXISTS (
             SELECT 1 FROM chunks c
             WHERE c.source_path = file_state.source_path
               AND c.id NOT IN (SELECT rowid FROM chunk_vectors)
           )
         )
    `)
  }

  /**
   * Whether a note needs indexing: it is new, it changed, or (when `needsVectors`) it was indexed
   * without embeddings and an embedder is now available to give it some.
   */
  shouldReindex(sourcePath: string, mtimeMs: number, needsVectors = false): boolean {
    const row = this.db
      .prepare('SELECT mtime_ms AS mtime, embedded FROM file_state WHERE source_path = ?')
      .get(sourcePath) as { mtime: number; embedded: number } | undefined
    if (!row) return true
    if (row.mtime < mtimeMs) return true
    return needsVectors && row.embedded === 0
  }

  markIndexed(
    sourcePath: string,
    mtimeMs: number,
    chunkCount: number,
    indexedAtMs = Date.now(),
    embedded = false
  ): void {
    this.db
      .prepare(
        `INSERT INTO file_state (source_path, mtime_ms, chunk_count, indexed_at_ms, embedded)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(source_path) DO UPDATE SET
           mtime_ms = excluded.mtime_ms,
           chunk_count = excluded.chunk_count,
           indexed_at_ms = excluded.indexed_at_ms,
           embedded = excluded.embedded`
      )
      .run(sourcePath, mtimeMs, chunkCount, indexedAtMs, embedded ? 1 : 0)
  }

  markRemoved(sourcePath: string): void {
    this.db.prepare('DELETE FROM file_state WHERE source_path = ?').run(sourcePath)
  }

  allSourcePaths(): string[] {
    const rows = this.db
      .prepare('SELECT source_path AS sourcePath FROM file_state ORDER BY source_path')
      .all() as Array<{ sourcePath: string }>
    return rows.map((row) => row.sourcePath)
  }

  sourceStatesIndexedAfter(indexedAfterMs: number): IndexedSourceState[] {
    const rows = this.db
      .prepare(
        `SELECT source_path AS sourcePath, mtime_ms AS mtimeMs, indexed_at_ms AS indexedAtMs
         FROM file_state
         WHERE indexed_at_ms > ?
         ORDER BY source_path`
      )
      .all(indexedAfterMs) as IndexedSourceState[]
    return rows
  }

  totals(): IndexTotals {
    const row = this.db
      .prepare('SELECT COUNT(*) AS files, COALESCE(SUM(chunk_count), 0) AS chunks FROM file_state')
      .get() as { files: number; chunks: number }
    return { files: row.files, chunks: row.chunks }
  }
}

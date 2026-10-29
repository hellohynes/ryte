import type { StoredChunkRow } from '../indexing/vector-store'

const DAY_MS = 24 * 60 * 60 * 1000
// Plans and notes go stale: relevance halves roughly every quarter, but never to zero, so a
// highly relevant older note can still make the evidence set.
const HALF_LIFE_DAYS = 90
const FLOOR = 0.3
const UNDATED = 0.6
// Relevance falls off with rank so recency reorders neighbours, not the whole result set.
const RANK_FALLOFF = 10

/**
 * How much a note's date should count, from 1 (today) down to FLOOR.
 *
 * SHORTCUT: dates come from the path (`sessions/2026-06-12/...`, date-prefixed names) because
 * chunk rows carry nothing else. Undated notes get a neutral weight. Upgrade trigger: if undated
 * notes are common, join `file_state.mtime_ms` into retrieval and use it as the fallback.
 */
export function recencyWeight(date: string | null, now: number): number {
  const time = date ? Date.parse(date) : Number.NaN
  if (Number.isNaN(time)) return UNDATED
  const ageDays = Math.max(0, (now - time) / DAY_MS)
  return Math.max(FLOOR, 0.5 ** (ageDays / HALF_LIFE_DAYS))
}

/**
 * Reorders retrieved rows document by document, favouring newer notes without discarding
 * relevance. Rows arrive best-first, so a document's relevance is that of its best chunk. All
 * chunks of a document stay together in their original order.
 */
export function rankByRecency(rows: StoredChunkRow[], now: number): StoredChunkRow[] {
  const documents = new Map<string, { rows: StoredChunkRow[]; firstRank: number }>()
  rows.forEach((row, rank) => {
    const document = documents.get(row.sourcePath)
    if (document) document.rows.push(row)
    else documents.set(row.sourcePath, { rows: [row], firstRank: rank })
  })

  return [...documents.values()]
    .map((document) => ({
      rows: document.rows,
      firstRank: document.firstRank,
      score:
        (1 / (1 + document.firstRank / RANK_FALLOFF)) * recencyWeight(document.rows[0].date, now)
    }))
    .sort((a, b) => b.score - a.score || a.firstRank - b.firstRank)
    .flatMap((document) => document.rows)
}

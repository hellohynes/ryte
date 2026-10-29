import type { StoredChunkRow } from '../indexing/vector-store'

/** Prefer breadth across documents before adding a second chunk from any one document. */
export function buildEvidenceBundle(
  rows: StoredChunkRow[],
  maxDocuments = 8,
  maxChunks = 12
): StoredChunkRow[] {
  const groups = new Map<string, StoredChunkRow[]>()
  for (const row of rows) {
    const group = groups.get(row.sourcePath) ?? []
    group.push(row)
    groups.set(row.sourcePath, group)
  }

  const selectedGroups = [...groups.values()].slice(0, maxDocuments)
  const bundle: StoredChunkRow[] = []
  for (let chunkIndex = 0; bundle.length < maxChunks; chunkIndex += 1) {
    let added = false
    for (const group of selectedGroups) {
      const chunk = group[chunkIndex]
      if (!chunk || bundle.length >= maxChunks) continue
      bundle.push(chunk)
      added = true
    }
    if (!added) break
  }
  return bundle
}

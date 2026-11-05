// FROZEN SNAPSHOT of the hand-written declarations of the search operation that moved onto the contract, copied
// from `SearchRetrievalMode`, `SearchSnapshotFreshnessInput` and `SearchSnapshotFreshness` in
// `src/main/search/search-service.ts` and from `LegacyRyteApi.search.checkSnapshotFreshness` in
// `src/preload/index.ts` at 68bf229, before the contract replaced them. It is the oracle for the type-equality check
// in `search.wire-types.check.ts`: the types inferred from the contract must equal it. Only the migrated operation is
// here; the rest of `window.ryte.search` is still hand-written. Do not edit.

export type SearchRetrievalMode = 'auto' | 'keyword' | 'hybrid'

export interface SearchSnapshotFreshnessInput {
  query: string
  retrievalMode: SearchRetrievalMode
  generatedAt: number
  sourcePaths: string[]
}

export interface SearchSnapshotFreshness {
  state: 'current' | 'updates-available'
  changedSourcePaths: string[]
  relevantSourcePaths: string[]
}

/** The members of `window.ryte.search` that are on the contract. */
export interface SearchApi {
  checkSnapshotFreshness(input: SearchSnapshotFreshnessInput): Promise<SearchSnapshotFreshness>
}

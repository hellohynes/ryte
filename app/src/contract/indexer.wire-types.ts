// FROZEN SNAPSHOT of the hand-written declarations in `src/preload/index.ts` before the contract replaced
// them (copied from git at bc66b4e). It is the oracle for the type-equality check in
// `indexer.wire-types.check.ts`: the types inferred from the contract must equal these. Do not edit.

export interface IndexerStatus {
  phase: 'idle' | 'walking' | 'indexing' | 'done' | 'error'
  filesTotal: number
  filesDone: number
  chunksTotal: number
  chunksDone: number
  lastIndexedAt: string | null
  error?: string
}

export interface IndexerApi {
  triggerReindex(): Promise<void>
  clearAndRebuild(): Promise<void>
  getStatus(): Promise<IndexerStatus>
  onStatus(cb: (status: IndexerStatus) => void): () => void
}

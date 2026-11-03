// Compile-time check, enforced by `pnpm typecheck`: the types inferred from the contract equal the
// hand-written declarations the contract replaced, and the members added since are exactly the ones declared below.
// A looser or different inferred type fails the build here.
import type { ContractApi } from '../preload/contract-api'
import type * as contract from './indexer'
import type * as wire from './indexer.wire-types'

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Assert<T extends true> = T
// `ContractApi['indexer']` is built as an intersection of the operation and event mappings; flatten it to one
// object type so it can be compared with the single declaration it replaced.
type Flatten<T> = { [K in keyof T]: T[K] }

// What was added after the freeze (additive only): the rebuild notice, with the exact types it is expected to have.
interface AddedIndexerApi {
  getRebuildNotice(): Promise<{ message: string; detail: string } | null>
  dismissRebuildNotice(): Promise<void>
  onRebuildNotice(cb: (notice: { message: string; detail: string } | null) => void): () => void
}

type Api = Flatten<ContractApi['indexer']>

export type IndexerWireTypeChecks = [
  Assert<Equal<contract.IndexerStatus, wire.IndexerStatus>>,
  // The four members `window.ryte.indexer` had: names, argument lists, results and the unsubscribe function. They must stay
  // exactly as they were.
  Assert<Equal<Pick<Api, keyof wire.IndexerApi>, wire.IndexerApi>>,
  // Everything else on the area is the additive set above, and nothing more.
  Assert<Equal<Omit<Api, keyof wire.IndexerApi>, AddedIndexerApi>>
]

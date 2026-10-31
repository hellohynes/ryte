// Compile-time check, enforced by `pnpm typecheck`: the types inferred from the contract equal the
// hand-written declarations the contract replaced. A looser or different inferred type fails the build here.
import type { ContractApi } from '../preload/contract-api'
import type * as contract from './indexer'
import type * as wire from './indexer.wire-types'

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Assert<T extends true> = T
// `ContractApi['indexer']` is built as an intersection of the operation and event mappings; flatten it to one
// object type so it can be compared with the single declaration it replaced.
type Flatten<T> = { [K in keyof T]: T[K] }

export type IndexerWireTypeChecks = [
  Assert<Equal<contract.IndexerStatus, wire.IndexerStatus>>,
  // The four members `window.ryte.indexer` had: names, argument lists, results and the unsubscribe function.
  Assert<Equal<Flatten<ContractApi['indexer']>, wire.IndexerApi>>
]

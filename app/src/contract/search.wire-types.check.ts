// Compile-time check, enforced by `pnpm typecheck`: the types inferred from the contract equal the hand-written
// declarations the contract replaced. A looser, wider or different inferred type fails the build here.
import type { AreaApi, ContractApi } from '../preload/contract-api'
import type { RyteApi } from '../preload/index'
import type * as contract from './search'
import type * as wire from './search.wire-types'

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Assert<T extends true> = T
// `AreaApi` is built as an intersection of the operation and event mappings; flatten it to one object type so it
// can be compared with the single declaration it replaces.
type Flatten<T> = { [K in keyof T]: T[K] }

type Built = Flatten<AreaApi<typeof contract.search>>
type Registered = Flatten<ContractApi['search']>

export type SearchWireTypeChecks = [
  Assert<Equal<contract.SearchRetrievalMode, wire.SearchRetrievalMode>>,
  Assert<Equal<contract.SearchSnapshotFreshnessInput, wire.SearchSnapshotFreshnessInput>>,
  Assert<Equal<contract.SearchSnapshotFreshness, wire.SearchSnapshotFreshness>>,
  // The area carries exactly the members that moved: a missing or extra one fails this.
  Assert<Equal<keyof Built, keyof wire.SearchApi>>,
  // Names, argument lists and results of those members.
  Assert<Equal<Built, wire.SearchApi>>,
  // And what the renderer gets: the merged `window.ryte.search`, compared only on the migrated members because the
  // query, cancel and event members are still hand-written. The last search slice compares the whole object.
  Assert<Equal<Registered, wire.SearchApi>>,
  Assert<Equal<Pick<RyteApi['search'], keyof wire.SearchApi>, wire.SearchApi>>
]

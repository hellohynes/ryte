// Compile-time check, enforced by `pnpm typecheck`: the types inferred from the contract equal the hand-written
// shapes in `search.wire-types.ts`. A looser, wider or different inferred type fails the build here.
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
  Assert<Equal<contract.SearchAnswerMode, wire.SearchAnswerMode>>,
  Assert<Equal<contract.SearchStage, wire.SearchStage>>,
  Assert<Equal<contract.SearchSource, wire.SearchSource>>,
  Assert<Equal<contract.SearchCitation, wire.SearchCitation>>,
  Assert<Equal<contract.SearchNotice, wire.SearchNotice>>,
  Assert<Equal<contract.SearchOptions, wire.SearchQueryOptions>>,
  Assert<Equal<contract.SearchSnapshotFreshnessInput, wire.SearchSnapshotFreshnessInput>>,
  Assert<Equal<contract.SearchSnapshotFreshness, wire.SearchSnapshotFreshness>>,
  // The area carries exactly the members `window.ryte.search` has: a missing or extra one fails this.
  Assert<Equal<keyof Built, keyof wire.SearchApi>>,
  // Names, argument lists, results and subscriber callbacks of every member.
  Assert<Equal<Built, wire.SearchApi>>,
  // And what the renderer gets: the whole `window.ryte.search`.
  Assert<Equal<Registered, wire.SearchApi>>,
  Assert<Equal<Flatten<RyteApi['search']>, wire.SearchApi>>
]

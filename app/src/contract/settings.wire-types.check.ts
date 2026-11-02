// Compile-time check, enforced by `pnpm typecheck`: the types inferred from the contract equal the hand-written
// declarations the contract replaced. A looser, wider or different inferred type fails the build here.
import type { AreaApi, ContractApi } from '../preload/contract-api'
import type { ProviderId } from '../shared/provider-registry'
import type * as contract from './settings'
import type * as wire from './settings.wire-types'

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Assert<T extends true> = T
// `AreaApi` is built as an intersection of the operation and event mappings; flatten it to one object type so it
// can be compared with the single declaration it replaces.
type Flatten<T> = { [K in keyof T]: T[K] }

export type SettingsWireTypeChecks = [
  Assert<Equal<contract.ProviderId, ProviderId>>,
  Assert<Equal<contract.ColorMode, wire.ColorMode>>,
  Assert<Equal<contract.ScrollbarVisibility, wire.ScrollbarVisibility>>,
  Assert<Equal<contract.SearchHistoryRetention, wire.SearchHistoryRetention>>,
  Assert<Equal<contract.DataFlowAcknowledgement, wire.DataFlowAcknowledgement>>,
  Assert<Equal<contract.ProviderKeyMetadata, wire.ProviderKeyMetadata>>,
  Assert<Equal<contract.PublicSettingsState, wire.PublicSettingsState>>,
  Assert<Equal<contract.SettingsUpdate, wire.SettingsUpdate>>,
  Assert<Equal<contract.ProviderKeyValidationResult, wire.ProviderKeyValidationResult>>,
  // The four members `window.ryte.settings` will have: names, argument lists and results.
  Assert<Equal<Flatten<AreaApi<typeof contract.settings>>, wire.SettingsApi>>,
  // And the object the renderer actually gets, once the area is registered.
  Assert<Equal<Flatten<ContractApi['settings']>, wire.SettingsApi>>
]

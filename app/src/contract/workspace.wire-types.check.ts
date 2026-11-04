// Compile-time check, enforced by `pnpm typecheck`: the types inferred from the contract equal the hand-written
// declarations the contract replaced. A looser, wider or different inferred type fails the build here.
import type { AreaApi, ContractApi } from '../preload/contract-api'
import type * as contract from './workspace'
import type * as wire from './workspace.wire-types'

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Assert<T extends true> = T
// `AreaApi` is built as an intersection of the operation and event mappings; flatten it to one object type so it
// can be compared with the single declaration it replaces.
type Flatten<T> = { [K in keyof T]: T[K] }

export type WorkspaceWireTypeChecks = [
  Assert<Equal<contract.WorkspaceState, wire.WorkspaceState>>,
  Assert<Equal<contract.WorkspaceShellUpdate, wire.WorkspaceShellUpdate>>,
  Assert<Equal<contract.WorkspaceLibraryUpdate, wire.WorkspaceLibraryUpdate>>,
  Assert<Equal<contract.WorkspaceFocusTabInput, wire.WorkspaceFocusTabInput>>,
  Assert<Equal<contract.WorkspaceCloseTabInput, wire.WorkspaceCloseTabInput>>,
  Assert<Equal<contract.WorkspaceUpdateTabViewModeInput, wire.WorkspaceUpdateTabViewModeInput>>,
  Assert<Equal<contract.WorkspaceSetOutlineCollapsedInput, wire.WorkspaceSetOutlineCollapsedInput>>,
  Assert<Equal<contract.WorkspaceSetOutlineWidthInput, wire.WorkspaceSetOutlineWidthInput>>,
  // The eight members `window.ryte.workspace` gets from the contract: names, argument lists and results.
  Assert<Equal<Flatten<AreaApi<typeof contract.workspace>>, wire.WorkspaceApi>>,
  // And the object the renderer actually gets, once the area is registered.
  Assert<Equal<Flatten<ContractApi['workspace']>, wire.WorkspaceApi>>
]

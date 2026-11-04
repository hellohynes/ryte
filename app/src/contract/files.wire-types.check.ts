// Compile-time check, enforced by `pnpm typecheck`: the types inferred from the contract equal the hand-written
// declarations the contract replaced. A looser, wider or different inferred type fails the build here.
import type { AreaApi, ContractApi } from '../preload/contract-api'
import type * as contract from './files'
import type * as wire from './files.wire-types'

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Assert<T extends true> = T
// `AreaApi` is built as an intersection of the operation and event mappings; flatten it to one object type so it
// can be compared with the single declaration it replaces.
type Flatten<T> = { [K in keyof T]: T[K] }
// The old rename input is an intersection of the file reference and `{ name }`; the inferred one is a union of
// plain objects. Flatten each member so the two compare by their properties.
type Plain<T> = T extends unknown ? { [K in keyof T]: T[K] } : never

// `rename` takes the intersection type, so it is compared by its flattened argument and its result; the other
// members are compared as declared.
type WithoutRename<T> = Omit<T, 'rename'>
type RenameOf<T extends { rename(...args: never[]): unknown }> = [
  Plain<Parameters<T['rename']>[0]>,
  ReturnType<T['rename']>
]

type Built = Flatten<AreaApi<typeof contract.files>>
type Registered = Flatten<ContractApi['files']>

export type FilesWireTypeChecks = [
  Assert<Equal<contract.FileTreeResponse, wire.FileTreeResponse>>,
  Assert<Equal<contract.FileCatalogEntry, wire.FileCatalogEntry>>,
  Assert<Equal<contract.FileCatalogResponse, wire.FileCatalogResponse>>,
  Assert<Equal<Plain<contract.FileRenameInput>, Plain<wire.FileRenameInput>>>,
  Assert<Equal<contract.FileRenameResult, wire.FileRenameResult>>,
  Assert<Equal<contract.FileTrashResult, wire.FileTrashResult>>,
  Assert<Equal<contract.FilesWorkspaceTabInput, wire.WorkspaceTabFileInput>>,
  Assert<Equal<contract.FileCatalogChange, wire.FileCatalogChangeEvent>>,
  // The area carries exactly the members `window.ryte.files` had: a missing or extra one fails this.
  Assert<Equal<keyof Built, keyof wire.FilesApi>>,
  // Every member of `window.ryte.files`: names, argument lists, results and subscriber callbacks.
  Assert<Equal<WithoutRename<Built>, WithoutRename<wire.FilesApi>>>,
  Assert<Equal<RenameOf<Built>, RenameOf<wire.FilesApi>>>,
  // And the object the renderer actually gets, once the area is registered.
  Assert<Equal<WithoutRename<Registered>, WithoutRename<wire.FilesApi>>>,
  Assert<Equal<RenameOf<Registered>, RenameOf<wire.FilesApi>>>
]

// Compile-time check, enforced by `pnpm typecheck`: the `window.ryte.dialog` method built from the contract equals the
// hand-written declaration it replaced, and the area has nothing else. A looser or different inferred type fails the
// build here.
import type { ContractApi } from '../preload/contract-api'
import type * as wire from './dialog.wire-types'

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Assert<T extends true> = T
type Flatten<T> = { [K in keyof T]: T[K] }

type Api = Flatten<ContractApi['dialog']>

export type DialogWireTypeChecks = [Assert<Equal<Api, wire.DialogApi>>]

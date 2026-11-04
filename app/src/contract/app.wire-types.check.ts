// Compile-time check, enforced by `pnpm typecheck`: the `window.ryte.app` method built from the contract equals the
// hand-written declaration it replaced. A looser or different inferred type fails the build here.
import type { ContractApi } from '../preload/contract-api'
import type * as wire from './app.wire-types'

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Assert<T extends true> = T
// `ContractApi['app']` is an intersection of the operation and event mappings; flatten it so it can be compared
// with the single declaration it replaced.
type Flatten<T> = { [K in keyof T]: T[K] }

type Api = Flatten<ContractApi['app']>

export type AppWireTypeChecks = [Assert<Equal<Pick<Api, keyof wire.AppApi>, wire.AppApi>>]

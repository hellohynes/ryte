// Compile-time check, enforced by `pnpm typecheck`: the types inferred from the contract equal the
// hand-written interfaces the contract replaced. A looser inferred type fails the build here.
import type * as contract from './tasks'
import type * as wire from './tasks.wire-types'

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Assert<T extends true> = T

export type WireTypeChecks = [
  Assert<Equal<contract.MarkdownTaskFact, wire.MarkdownTaskFact>>,
  Assert<Equal<contract.TaskFactsResponse, wire.TaskFactsResponse>>,
  Assert<Equal<contract.TaskRefreshResponse, wire.TaskRefreshResponse>>,
  Assert<Equal<contract.TaskToggleFailureReason, wire.TaskToggleFailureReason>>,
  Assert<Equal<contract.TaskToggleResponse, wire.TaskToggleResponse>>,
  Assert<Equal<contract.TaskToggleInput, wire.TaskToggleInput>>,
  Assert<Equal<contract.TaskListParsed, wire.TaskListInput>>,
  Assert<Equal<contract.TaskListCallInput, wire.TaskListInput | null | undefined>>
]

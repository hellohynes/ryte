// Compile-time check, enforced by `pnpm typecheck`: the `tasks` API derived from the contract is
// call-compatible with the hand-written shape it replaced, so renderer code written against the old
// declaration keeps compiling.
import type { ContractApi } from './contract-api'
import type {
  MarkdownTaskFact,
  TaskFactsResponse,
  TaskListInput,
  TaskRefreshResponse,
  TaskToggleInput,
  TaskToggleResponse
} from '../contract/tasks.wire-types'

// The `tasks` block of RyteApi before the contract replaced it (src/preload/index.ts at c4c7b3c).
interface PreChangeTasksApi {
  list(input?: TaskListInput): Promise<TaskFactsResponse>
  refresh(): Promise<TaskRefreshResponse>
  toggle(input: TaskToggleInput): Promise<TaskToggleResponse>
  onChanged(cb: () => void): () => void
}

type Assert<T extends true> = T
type Extends<A, B> = [A] extends [B] ? true : false

export type CompatibilityChecks = [
  // Anything the old API accepted, the derived API accepts, and it returns the same types.
  Assert<Extends<ContractApi['tasks'], PreChangeTasksApi>>,
  Assert<Extends<Awaited<ReturnType<ContractApi['tasks']['list']>>, TaskFactsResponse>>,
  Assert<Extends<TaskFactsResponse, Awaited<ReturnType<ContractApi['tasks']['list']>>>>,
  Assert<Extends<MarkdownTaskFact, TaskFactsResponse['tasks'][number]>>,
  // Every pre-change member is still exposed (new operations may add more).
  Assert<Extends<'list' | 'refresh' | 'toggle' | 'onChanged', keyof ContractApi['tasks']>>
]

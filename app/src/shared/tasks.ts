// Wire types for the tasks area, inferred from the contract definition in `src/contract/tasks.ts`.
// Import them from here so existing importers do not change; edit the definition, not this file.
export type {
  MarkdownTaskFact,
  TaskFactsResponse,
  TaskListParsed as TaskListInput,
  TaskRefreshResponse,
  TaskToggleFailureReason,
  TaskToggleInput,
  TaskToggleResponse
} from '../contract/tasks'

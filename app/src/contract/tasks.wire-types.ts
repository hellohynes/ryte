// FROZEN SNAPSHOT of the hand-written interfaces in `src/shared/tasks.ts` before the contract replaced
// them (copied from git at a9ce30b). It is the oracle for the type-equality check in
// `tasks.wire-types.check.ts`: the types inferred from the contract must equal these. Do not edit.

export interface MarkdownTaskFact {
  id: string
  sourcePath: string
  line: number
  checkboxColumn: number
  checked: boolean
  rawLine: string
  normalizedText: string
  headingPath: string[]
  occurrenceIndex: number
  fingerprint: string
  sourceMtimeMs: number | null
  extractedAt: string
}

export interface TaskListInput {
  checked?: boolean
  limit?: number
}

export interface TaskFactsResponse {
  notesRoot: string
  tasks: MarkdownTaskFact[]
  refreshedAt: string
}

export interface TaskRefreshResponse {
  notesRoot: string
  taskCount: number
  refreshedAt: string
}

export interface TaskToggleInput {
  sourcePath: string
  line: number
  checkboxColumn: number
  checked: boolean
  expectedLine: string
}

export type TaskToggleFailureReason =
  | 'line-missing'
  | 'checkbox-missing'
  | 'task-text-changed'
  | 'fingerprint-mismatch'
  | 'source-path-mismatch'
  | 'source-line-changed'
  | 'missing-file'
  | 'invalid-source'

export type TaskToggleResponse =
  | {
      ok: true
      markdown: string
      task: MarkdownTaskFact
    }
  | {
      ok: false
      reason: TaskToggleFailureReason
    }

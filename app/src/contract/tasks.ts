import { z } from 'zod'

import { defineArea, defineEvent, defineOperation } from './define'
import { hasNoExplicitUndefined, integer, sourcePath } from './primitives'

const MAX_TASK_LIST_LIMIT = 200
const MAX_TASK_SOURCE_LINE_LENGTH = 20000

const markdownTaskFact = z.object({
  id: z.string(),
  sourcePath: z.string(),
  line: z.number(),
  checkboxColumn: z.number(),
  checked: z.boolean(),
  rawLine: z.string(),
  normalizedText: z.string(),
  headingPath: z.array(z.string()),
  occurrenceIndex: z.number(),
  fingerprint: z.string(),
  sourceMtimeMs: z.number().nullable(),
  extractedAt: z.string()
})

const taskFactsResponse = z.object({
  notesRoot: z.string(),
  tasks: z.array(markdownTaskFact),
  refreshedAt: z.string()
})

const taskRefreshResponse = z.object({
  notesRoot: z.string(),
  taskCount: z.number(),
  refreshedAt: z.string()
})

const taskToggleFailureReason = z.enum([
  'line-missing',
  'checkbox-missing',
  'task-text-changed',
  'fingerprint-mismatch',
  'source-path-mismatch',
  'source-line-changed',
  'missing-file',
  'invalid-source'
])

const taskToggleResponse = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), markdown: z.string(), task: markdownTaskFact }),
  z.object({ ok: z.literal(false), reason: taskToggleFailureReason })
])

export type TaskListParsed = { checked?: boolean; limit?: number }

// The legacy validator accepted `undefined` or `null` as "no filter" and otherwise required a strict object.
// The schema is declared with an explicit call type so callers see `TaskListParsed | null | undefined`.
const taskListInput: z.ZodType<TaskListParsed, TaskListParsed | null | undefined> = z.preprocess(
  (value) => value ?? {},
  z
    .strictObject({
      checked: z.boolean().optional(),
      limit: z.number().min(0).max(MAX_TASK_LIST_LIMIT).transform(Math.floor).optional()
    })
    .refine(hasNoExplicitUndefined, 'Expected defined values')
)

const taskToggleInput = z.strictObject({
  sourcePath,
  line: integer.min(1),
  checkboxColumn: integer.min(0),
  checked: z.boolean(),
  expectedLine: z.string().max(MAX_TASK_SOURCE_LINE_LENGTH)
})

const exampleTask = {
  id: 'task-1',
  sourcePath: 'folder/tasks.md',
  line: 3,
  checkboxColumn: 2,
  checked: false,
  rawLine: '- [ ] Follow up',
  normalizedText: 'follow up',
  headingPath: ['Tasks'],
  occurrenceIndex: 0,
  fingerprint: 'f0',
  sourceMtimeMs: 1,
  extractedAt: '2026-10-30T00:00:00.000Z'
}

export const list = defineOperation({
  channel: 'tasks:list',
  description: 'List markdown tasks found in the notes folder, optionally filtered and limited.',
  input: taskListInput,
  output: taskFactsResponse,
  example: {
    input: { checked: false, limit: 25 },
    output: { notesRoot: '/notes', tasks: [exampleTask], refreshedAt: '2026-10-30T00:00:00.000Z' }
  }
})

export const refresh = defineOperation({
  channel: 'tasks:refresh',
  description: 'Rescan the notes folder for tasks and report how many were found.',
  input: z.undefined(),
  output: taskRefreshResponse,
  example: {
    input: undefined,
    output: { notesRoot: '/notes', taskCount: 1, refreshedAt: '2026-10-30T00:00:00.000Z' }
  }
})

export const toggle = defineOperation({
  channel: 'tasks:toggle',
  description:
    'Check or uncheck one task line, only if the line still matches what the caller saw.',
  input: taskToggleInput,
  output: taskToggleResponse,
  example: {
    input: {
      sourcePath: 'folder/tasks.md',
      line: 3,
      checkboxColumn: 2,
      checked: true,
      expectedLine: '- [ ] Follow up'
    },
    output: { ok: true, markdown: '- [x] Follow up', task: { ...exampleTask, checked: true } }
  }
})

export const changed = defineEvent({
  channel: 'tasks:changed',
  description: 'Tasks may have changed on disk or through a toggle; callers should reload.'
})

export const tasks = defineArea('tasks', {
  operations: { list, refresh, toggle },
  events: { changed }
})

export type MarkdownTaskFact = z.output<typeof markdownTaskFact>
export type TaskFactsResponse = z.output<typeof taskFactsResponse>
export type TaskRefreshResponse = z.output<typeof taskRefreshResponse>
export type TaskToggleFailureReason = z.output<typeof taskToggleFailureReason>
export type TaskToggleResponse = z.output<typeof taskToggleResponse>
export type TaskListCallInput = z.input<typeof taskListInput>
export type TaskToggleInput = z.input<typeof taskToggleInput>

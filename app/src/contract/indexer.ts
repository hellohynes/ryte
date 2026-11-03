import { z } from 'zod'

import { defineArea, defineEvent, defineOperation } from './define'

const indexerStatus = z.object({
  phase: z.enum(['idle', 'walking', 'indexing', 'done', 'error']),
  filesTotal: z.number(),
  filesDone: z.number(),
  chunksTotal: z.number(),
  chunksDone: z.number(),
  lastIndexedAt: z.string().nullable(),
  error: z.string().optional()
})

// What a person is told when the search index is rebuilt after an update. Plain sentences: no path, no note, no key.
const rebuildNotice = z.object({ message: z.string().max(200), detail: z.string().max(1000) })

const exampleStatus = {
  phase: 'done' as const,
  filesTotal: 12,
  filesDone: 12,
  chunksTotal: 80,
  chunksDone: 80,
  lastIndexedAt: '2026-10-30T00:00:00.000Z'
}

export const getStatus = defineOperation({
  channel: 'indexer:get-status',
  description: 'The current state of the notes index: phase, progress and when it last finished.',
  input: z.undefined(),
  output: indexerStatus,
  example: { input: undefined, output: exampleStatus }
})

export const triggerReindex = defineOperation({
  channel: 'indexer:trigger-reindex',
  description:
    'Start indexing changed notes and return at once; progress arrives as status events.',
  input: z.undefined(),
  output: z.void(),
  example: { input: undefined, output: undefined }
})

export const clearAndRebuild = defineOperation({
  channel: 'indexer:clear-and-rebuild',
  description:
    'Empty the index and rebuild it from the notes folder, stopping running searches once the rebuild is certain.',
  input: z.undefined(),
  output: z.void(),
  example: { input: undefined, output: undefined }
})

export const getRebuildNotice = defineOperation({
  channel: 'indexer:get-rebuild-notice',
  description:
    'The notice to show after an update removed the old search index and is rebuilding it, or null when there is none. It stays until dismissed.',
  input: z.undefined(),
  output: rebuildNotice.nullable(),
  example: {
    input: undefined,
    output: {
      message: 'Ryte is rebuilding its search index',
      detail: 'Search may be incomplete for a short while. Your notes are not changed.'
    }
  }
})

export const dismissRebuildNotice = defineOperation({
  channel: 'indexer:dismiss-rebuild-notice',
  description: 'Dismiss the rebuild notice; every window is told it is gone.',
  input: z.undefined(),
  output: z.void(),
  example: { input: undefined, output: undefined }
})

export const status = defineEvent({
  channel: 'indexer:status-event',
  description: 'The index state changed; sent to every open window as indexing progresses.',
  payload: indexerStatus
})

export const rebuildNoticeChanged = defineEvent({
  channel: 'indexer:rebuild-notice-event',
  description:
    'The rebuild notice appeared or was dismissed (null); sent to every open window, so a window that opened before the notice existed still shows it.',
  payload: rebuildNotice.nullable()
})

export const indexer = defineArea('indexer', {
  operations: {
    getStatus,
    triggerReindex,
    clearAndRebuild,
    getRebuildNotice,
    dismissRebuildNotice
  },
  events: { status, rebuildNotice: rebuildNoticeChanged }
})

export type IndexerStatus = z.output<typeof indexerStatus>
export type RebuildNotice = z.output<typeof rebuildNotice>

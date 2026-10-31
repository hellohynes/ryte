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

export const status = defineEvent({
  channel: 'indexer:status-event',
  description: 'The index state changed; sent to every open window as indexing progresses.',
  payload: indexerStatus
})

export const indexer = defineArea('indexer', {
  operations: { getStatus, triggerReindex, clearAndRebuild },
  events: { status }
})

export type IndexerStatus = z.output<typeof indexerStatus>

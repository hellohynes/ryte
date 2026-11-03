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

// What smart search (the vectors added after the keyword index) is doing. Counts, a state, a reason and a time: no path, no note,
// no key and no error message. `retryAt` is the time of the next automatic try; it is absent when nothing will retry by itself.
const embeddingStatus = z.object({
  state: z.enum(['off', 'idle', 'running', 'paused']),
  total: z.number().int().nonnegative(),
  done: z.number().int().nonnegative(),
  pending: z.number().int().nonnegative(),
  reason: z.enum(['no-key', 'no-agreement', 'offline', 'rate-limit', 'service', 'auth']).optional(),
  retryAt: z.string().optional()
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

export const getEmbeddingStatus = defineOperation({
  channel: 'indexer:get-embedding-status',
  description:
    'What smart search is doing: off, idle, running or paused, how many notes have their embeddings, and why it is paused or off.',
  input: z.undefined(),
  output: embeddingStatus,
  example: {
    input: undefined,
    output: {
      state: 'paused' as const,
      total: 3200,
      done: 120,
      pending: 3080,
      reason: 'offline' as const,
      retryAt: '2026-11-03T15:42:00.000Z'
    }
  }
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

export const embeddingStatusChanged = defineEvent({
  channel: 'indexer:embedding-status-event',
  description:
    'What smart search is doing changed; sent to every open window at once when its state changes and at most a few times a second while it makes progress.',
  payload: embeddingStatus
})

export const indexer = defineArea('indexer', {
  operations: {
    getStatus,
    triggerReindex,
    clearAndRebuild,
    getRebuildNotice,
    dismissRebuildNotice,
    getEmbeddingStatus
  },
  events: {
    status,
    rebuildNotice: rebuildNoticeChanged,
    embeddingStatus: embeddingStatusChanged
  }
})

export type IndexerStatus = z.output<typeof indexerStatus>
export type RebuildNotice = z.output<typeof rebuildNotice>
export type EmbeddingStatus = z.output<typeof embeddingStatus>

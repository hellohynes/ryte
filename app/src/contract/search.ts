import { z } from 'zod'

import { MAX_PATH_LENGTH } from '../shared/source-path'
import { defineArea, defineEvent, defineOperation } from './define'
import { hasNoExplicitUndefined, requestId, searchQuery } from './primitives'

/** How a search finds sources. `auto` lets the main process choose. */
export const searchRetrievalMode = z.enum(['auto', 'keyword', 'hybrid'])

/** Whether the answer may come from a cloud provider. `local-only` stops after the local sources. */
export const searchAnswerMode = z.enum(['settings', 'local-only'])

const searchStage = z.enum(['searching-local', 'gathering-evidence', 'writing-summary'])

// A source is shown with the mode that found it, which is never `auto`.
const searchSource = z.strictObject({
  index: z.number(),
  sourcePath: z.string(),
  headingPath: z.array(z.string()),
  preview: z.string(),
  matchCount: z.number(),
  retrievalMode: z.enum(['keyword', 'hybrid'])
})

const searchCitation = z.strictObject({
  index: z.number(),
  sourcePath: z.string(),
  headingPath: z.array(z.string())
})

const searchNotice = z.strictObject({
  code: z.enum([
    'no-local-sources',
    'semantic-unavailable',
    'cloud-answers-disabled',
    'cloud-answers-not-acknowledged',
    'provider-key-missing'
  ]),
  message: z.string()
})

const MAX_SNAPSHOT_SOURCE_PATHS = 100

// Paths are kept as sent (not normalized, since the index stores them as the renderer saw them), then repeats are
// dropped keeping the first of each.
const snapshotSourcePaths = z
  .array(z.string().min(1).max(MAX_PATH_LENGTH))
  .max(MAX_SNAPSHOT_SOURCE_PATHS)
  .transform((paths) => [...new Set(paths)])

// All four keys are required, so a missing key and an explicit `undefined` are both refused.
const snapshotFreshnessInput = z.strictObject({
  query: searchQuery,
  retrievalMode: searchRetrievalMode,
  // Epoch milliseconds the saved summary was generated; finite and not negative.
  generatedAt: z.number().min(0),
  sourcePaths: snapshotSourcePaths
})

// What the main process returns. Nothing parses a response at runtime, so this describes what the handler can
// return rather than guards it.
const snapshotFreshness = z.object({
  state: z.enum(['current', 'updates-available']),
  changedSourcePaths: z.array(z.string()),
  relevantSourcePaths: z.array(z.string())
})

export const checkSnapshotFreshness = defineOperation({
  channel: 'search:check-snapshot-freshness',
  description:
    'Whether notes changed since a saved search summary was generated, and which of them matter to its query. Fails when the index is not ready.',
  input: snapshotFreshnessInput,
  output: snapshotFreshness,
  example: {
    input: {
      query: 'jira plans',
      retrievalMode: 'keyword',
      generatedAt: 1767312000000,
      sourcePaths: ['plans/jira.md']
    },
    output: {
      state: 'updates-available',
      changedSourcePaths: ['plans/jira.md'],
      relevantSourcePaths: ['plans/jira.md']
    }
  }
})

// One object, not positional arguments. Optional keys may be left out but not sent as `undefined`, which was
// refused before as well.
const queryInput = z
  .strictObject({
    query: searchQuery,
    retrievalMode: searchRetrievalMode.optional(),
    answerMode: searchAnswerMode.optional()
  })
  .refine(hasNoExplicitUndefined, 'Expected defined values')

export const query = defineOperation({
  channel: 'search:query',
  description:
    'Start a search. Returns the id of the request at once; the results arrive as events to the window that asked, each carrying that id. Returns null, after sending `error` with an empty id, when the index is not ready.',
  input: queryInput,
  output: z.string().nullable(),
  example: {
    input: { query: 'jira plans', retrievalMode: 'keyword' },
    output: '3f9c1d2e-7a4b-4c8e-9d1f-0a2b3c4d5e6f'
  }
})

export const cancel = defineOperation({
  channel: 'search:cancel',
  description:
    "Stop a search that the calling window started. An id that is unknown, finished or another window's is ignored. A cancelled search sends no further event, not even `done`.",
  input: z.strictObject({ requestId }),
  output: z.void(),
  example: { input: { requestId: '3f9c1d2e-7a4b-4c8e-9d1f-0a2b3c4d5e6f' }, output: undefined }
})

// The request id on an event is a plain string: the not-ready `error` carries an empty one.
export const stage = defineEvent({
  channel: 'search:stage',
  description: 'The search moved to a new stage. Sent to the window that asked only.',
  payload: z.strictObject({ requestId: z.string(), stage: searchStage })
})

// The key is `streamToken` so the renderer-facing subscriber is `onStreamToken`; the old one was `onToken`.
export const streamToken = defineEvent({
  channel: 'search:stream-token',
  description: 'The next piece of the written summary. Sent to the window that asked only.',
  payload: z.strictObject({ requestId: z.string(), token: z.string() })
})

export const sources = defineEvent({
  channel: 'search:sources',
  description: 'The local sources found for the search. Sent to the window that asked only.',
  payload: z.strictObject({ requestId: z.string(), sources: z.array(searchSource) })
})

// Flat, as it is sent: the citation fields sit beside the request id.
export const citation = defineEvent({
  channel: 'search:citation',
  description:
    'A source the summary cites, sent as soon as its marker is complete. Sent to the window that asked only.',
  payload: searchCitation.extend({ requestId: z.string() })
})

export const notice = defineEvent({
  channel: 'search:notice',
  description: 'Something the search skipped or fell back on. Sent to the window that asked only.',
  payload: z.strictObject({ requestId: z.string(), notice: searchNotice })
})

export const done = defineEvent({
  channel: 'search:done',
  description:
    'The search finished. Sent to the window that asked only, once, and not after a cancel.',
  payload: z.strictObject({ requestId: z.string() })
})

export const error = defineEvent({
  channel: 'search:error',
  description:
    'The search failed, or could not start because the index is not ready (then the request id is empty). Sent to the window that asked only.',
  payload: z.strictObject({ requestId: z.string(), error: z.string() })
})

export const search = defineArea('search', {
  operations: { query, cancel, checkSnapshotFreshness },
  events: { stage, streamToken, sources, citation, notice, done, error }
})

export type SearchRetrievalMode = z.output<typeof searchRetrievalMode>
export type SearchAnswerMode = z.output<typeof searchAnswerMode>
export type SearchStage = z.output<typeof searchStage>
export type SearchSource = z.output<typeof searchSource>
export type SearchCitation = z.output<typeof searchCitation>
export type SearchNotice = z.output<typeof searchNotice>
export type SearchNoticeCode = SearchNotice['code']
/** What the service takes beside the query. */
export type SearchOptions = Omit<z.output<typeof queryInput>, 'query'>
export type SearchSnapshotFreshnessInput = z.output<typeof snapshotFreshnessInput>
export type SearchSnapshotFreshness = z.output<typeof snapshotFreshness>

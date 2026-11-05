import { z } from 'zod'

import { MAX_PATH_LENGTH } from '../shared/source-path'
import { defineArea, defineOperation } from './define'
import { searchQuery } from './primitives'

/** How a search finds sources. `auto` lets the main process choose. */
export const searchRetrievalMode = z.enum(['auto', 'keyword', 'hybrid'])

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

export const search = defineArea('search', {
  operations: { checkSnapshotFreshness },
  events: {}
})

export type SearchRetrievalMode = z.output<typeof searchRetrievalMode>
export type SearchSnapshotFreshnessInput = z.output<typeof snapshotFreshnessInput>
export type SearchSnapshotFreshness = z.output<typeof snapshotFreshness>

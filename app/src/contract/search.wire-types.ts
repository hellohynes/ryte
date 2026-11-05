// The AGREED shapes of `window.ryte.search`, written by hand from the declarations in `LegacyRyteApi.search`
// (`src/preload/index.ts`) and `src/main/search/search-service.ts` at 1bffddd and the owner's decision to take one
// object where the old methods took positional arguments: `query` takes one object, `cancel` takes `{ requestId }`,
// and each event hands its listener one object (the old `cb(requestId, x)` became `cb({ requestId, x })`). Everything
// else is as it was. It is the oracle for the type-equality check in `search.wire-types.check.ts`: the types
// inferred from the contract must equal it, and it is not derived from the schemas. `onToken` is now
// `onStreamToken`. Do not edit.

export type SearchRetrievalMode = 'auto' | 'keyword' | 'hybrid'
export type SearchAnswerMode = 'settings' | 'local-only'
export type SearchStage = 'searching-local' | 'gathering-evidence' | 'writing-summary'

export interface SearchSource {
  index: number
  sourcePath: string
  headingPath: string[]
  preview: string
  matchCount: number
  retrievalMode: 'keyword' | 'hybrid'
}

export interface SearchCitation {
  index: number
  sourcePath: string
  headingPath: string[]
}

export interface SearchNotice {
  code:
    | 'no-local-sources'
    | 'semantic-unavailable'
    | 'cloud-answers-disabled'
    | 'cloud-answers-not-acknowledged'
    | 'provider-key-missing'
  message: string
}

/** What the service takes beside the query (the old second argument). */
export interface SearchQueryOptions {
  retrievalMode?: SearchRetrievalMode
  answerMode?: SearchAnswerMode
}

export interface SearchQueryInput {
  query: string
  retrievalMode?: SearchRetrievalMode
  answerMode?: SearchAnswerMode
}

export interface SearchCancelInput {
  requestId: string
}

export interface SearchSnapshotFreshnessInput {
  query: string
  retrievalMode: SearchRetrievalMode
  generatedAt: number
  sourcePaths: string[]
}

export interface SearchSnapshotFreshness {
  state: 'current' | 'updates-available'
  changedSourcePaths: string[]
  relevantSourcePaths: string[]
}

/** The citation fields sit beside the request id, as they are sent. */
export interface SearchCitationEvent {
  requestId: string
  index: number
  sourcePath: string
  headingPath: string[]
}

/** The members of `window.ryte.search`. */
export interface SearchApi {
  query(input: SearchQueryInput): Promise<string | null>
  cancel(input: SearchCancelInput): Promise<void>
  checkSnapshotFreshness(input: SearchSnapshotFreshnessInput): Promise<SearchSnapshotFreshness>
  onStage(cb: (payload: { requestId: string; stage: SearchStage }) => void): () => void
  onStreamToken(cb: (payload: { requestId: string; token: string }) => void): () => void
  onSources(cb: (payload: { requestId: string; sources: SearchSource[] }) => void): () => void
  onCitation(cb: (payload: SearchCitationEvent) => void): () => void
  onNotice(cb: (payload: { requestId: string; notice: SearchNotice }) => void): () => void
  onDone(cb: (payload: { requestId: string }) => void): () => void
  onError(cb: (payload: { requestId: string; error: string }) => void): () => void
}

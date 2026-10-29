import { AnthropicProvider } from './anthropic-provider'
import { type LLMProvider, type SearchChunk } from './llm-provider'
import { OpenAIProvider } from './openai-provider'
import { buildEvidenceBundle } from './evidence-bundle'
import { rankByRecency } from './recency'
import { describeProviderError } from '../settings/provider-errors'
import { type StoredChunkRow } from '../indexing/vector-store'
import {
  type AnswerModelId,
  type AnswerProviderId,
  type ProviderId
} from '../settings/settings-store'

export interface CitationResult {
  index: number
  sourcePath: string
  headingPath: string[]
}

export interface SourceResult {
  index: number
  sourcePath: string
  headingPath: string[]
  preview: string
  matchCount: number
  retrievalMode: SearchAppliedRetrievalMode
}

export type SearchRetrievalMode = 'auto' | 'keyword' | 'hybrid'
export type SearchAppliedRetrievalMode = 'keyword' | 'hybrid'
export type SearchAnswerMode = 'settings' | 'local-only'

export interface SearchOptions {
  retrievalMode?: SearchRetrievalMode
  answerMode?: SearchAnswerMode
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

export type SearchNoticeCode =
  | 'no-local-sources'
  | 'semantic-unavailable'
  | 'cloud-answers-disabled'
  | 'cloud-answers-not-acknowledged'
  | 'provider-key-missing'

export interface SearchNotice {
  code: SearchNoticeCode
  message: string
}

export type SearchStage = 'searching-local' | 'gathering-evidence' | 'writing-summary'

export interface SearchCallbacks {
  onStage: (stage: SearchStage) => void
  onToken: (token: string) => void
  onSources: (sources: SourceResult[]) => void
  onCitation: (citation: CitationResult) => void
  onNotice: (notice: SearchNotice) => void
  onDone: () => void
  onError: (error: string) => void
}

interface EmbedDep {
  embed(texts: string[]): Promise<Float32Array[]>
}

interface RetrieveDep {
  keywordSearch(queryText: string, maxResults?: number): StoredChunkRow[]
  hybridSearch(
    queryText: string,
    queryVec: Float32Array,
    k: number,
    maxResults?: number
  ): StoredChunkRow[]
  sourcePathsIndexedAfter(indexedAfterMs: number): string[]
  existingSourcePaths(sourcePaths: string[]): string[]
}

interface SettingsDep {
  load(): {
    cloudAnswersEnabled: boolean
    cloudAnswersAcknowledgement: {
      acknowledgedAt: string
      provider: ProviderId
      model: string
    } | null
    answerProvider: AnswerProviderId
    answerModel: AnswerModelId
  }
  getSecret(provider: ProviderId): string | null
}

const RETRIEVE_K = 60
const RETRIEVE_MAX = 40
const CITATION_RE = /\[(\d+)\]/g
const PREVIEW_MAX_CHARS = 240

function providerLabel(provider: AnswerProviderId): string {
  return provider === 'anthropic' ? 'Anthropic' : 'OpenAI'
}

function queryTerms(query: string): string[] {
  return [...new Set(query.toLocaleLowerCase().match(/[\p{L}\p{N}_-]+/gu) ?? [])]
}

function queryMatchDetails(text: string, query: string): { firstIndex: number; count: number } {
  const normalized = text.replace(/\s+/g, ' ').trim()
  const lowerText = normalized.toLocaleLowerCase()
  let firstIndex = -1
  let count = 0

  for (const term of queryTerms(query)) {
    let index = lowerText.indexOf(term)
    while (index !== -1) {
      if (firstIndex === -1 || index < firstIndex) firstIndex = index
      count += 1
      index = lowerText.indexOf(term, index + term.length)
    }
  }

  return { firstIndex, count }
}

function previewText(text: string, query: string): { preview: string; matchCount: number } {
  const normalized = text.replace(/\s+/g, ' ').trim()
  const { firstIndex, count } = queryMatchDetails(normalized, query)
  if (normalized.length <= PREVIEW_MAX_CHARS) return { preview: normalized, matchCount: count }
  if (firstIndex === -1) {
    return {
      preview: `${normalized.slice(0, PREVIEW_MAX_CHARS - 1).trimEnd()}...`,
      matchCount: count
    }
  }

  const start = Math.max(0, firstIndex - Math.floor(PREVIEW_MAX_CHARS / 3))
  const end = Math.min(normalized.length, start + PREVIEW_MAX_CHARS)
  const prefix = start > 0 ? '...' : ''
  const suffix = end < normalized.length ? '...' : ''
  return {
    preview: `${prefix}${normalized.slice(start, end).trim()}${suffix}`,
    matchCount: count
  }
}

export class SearchService {
  private readonly cancelled = new Set<string>()
  private readonly controllers = new Map<string, AbortController>()

  constructor(
    private readonly embedDep: EmbedDep,
    private readonly retrieveDep: RetrieveDep,
    private readonly settings: SettingsDep
  ) {}

  async checkSnapshotFreshness(
    input: SearchSnapshotFreshnessInput
  ): Promise<SearchSnapshotFreshness> {
    const changedSourcePaths = this.retrieveDep.sourcePathsIndexedAfter(input.generatedAt)
    const existingSourcePaths = new Set(this.retrieveDep.existingSourcePaths(input.sourcePaths))
    const missingSourcePaths = input.sourcePaths.filter((path) => !existingSourcePaths.has(path))
    const changedSavedSourcePaths = changedSourcePaths.filter((path) =>
      input.sourcePaths.includes(path)
    )
    const candidateSourcePaths = new Set(changedSourcePaths)

    if (candidateSourcePaths.size === 0 && missingSourcePaths.length === 0) {
      return { state: 'current', changedSourcePaths: [], relevantSourcePaths: [] }
    }

    const { rows } = await this.retrieveRows(input.query, input.retrievalMode)
    const relevantSourcePaths = [
      ...new Set(
        rows
          .map((row) => row.sourcePath)
          .filter((sourcePath) => candidateSourcePaths.has(sourcePath))
      )
    ]
    const updatePaths = [
      ...new Set([...changedSavedSourcePaths, ...missingSourcePaths, ...relevantSourcePaths])
    ]
    return {
      state: updatePaths.length > 0 ? 'updates-available' : 'current',
      changedSourcePaths,
      relevantSourcePaths: updatePaths
    }
  }

  async search(
    query: string,
    requestId: string,
    callbacks: SearchCallbacks,
    options: SearchOptions = {}
  ): Promise<void> {
    const controller = new AbortController()
    this.controllers.set(requestId, controller)
    try {
      if (this.cancelled.has(requestId)) return

      callbacks.onStage('searching-local')

      const { rows, retrievalMode, semanticFallback } = await this.retrieveRows(
        query,
        options.retrievalMode
      )

      if (semanticFallback && options.retrievalMode === 'hybrid') {
        callbacks.onNotice({
          code: 'semantic-unavailable',
          message: 'Semantic retrieval unavailable; showing keyword results.'
        })
      }

      if (this.cancelled.has(requestId) || controller.signal.aborted) return

      const chunks: SearchChunk[] = rows.map((r, i) => ({
        index: i + 1,
        sourcePath: r.sourcePath,
        headingPath: r.headingPath,
        text: r.text
      }))

      callbacks.onSources(
        chunks.map((c) => {
          const { preview, matchCount } = previewText(c.text, query)
          return {
            index: c.index,
            sourcePath: c.sourcePath,
            headingPath: c.headingPath,
            preview,
            matchCount,
            retrievalMode
          }
        })
      )

      if (chunks.length === 0) {
        callbacks.onNotice({
          code: 'no-local-sources',
          message: 'No local sources found. Try a different query or rebuild the local index.'
        })
        callbacks.onDone()
        return
      }

      callbacks.onStage('gathering-evidence')
      const evidenceChunks: SearchChunk[] = buildEvidenceBundle(
        rankByRecency(rows, Date.now())
      ).map((r, i) => ({
        index: i + 1,
        sourcePath: r.sourcePath,
        headingPath: r.headingPath,
        text: r.text,
        date: r.date
      }))

      if (options.answerMode === 'local-only') {
        callbacks.onDone()
        return
      }

      const settings = this.settings.load()
      if (!settings.cloudAnswersEnabled) {
        callbacks.onNotice({
          code: 'cloud-answers-disabled',
          message: 'Cloud answer skipped because Cloud Answers are disabled in Preferences.'
        })
        callbacks.onDone()
        return
      }

      const acknowledgement = settings.cloudAnswersAcknowledgement
      if (!acknowledgement) {
        callbacks.onNotice({
          code: 'cloud-answers-not-acknowledged',
          message: 'Cloud answer skipped until the first-use warning is accepted.'
        })
        callbacks.onDone()
        return
      }
      // Consent is for one provider and model; a changed choice needs the warning again, however
      // the setting was changed.
      if (
        acknowledgement.provider !== settings.answerProvider ||
        acknowledgement.model !== settings.answerModel
      ) {
        callbacks.onNotice({
          code: 'cloud-answers-not-acknowledged',
          message: 'Cloud answer skipped until the warning is accepted for this provider and model.'
        })
        callbacks.onDone()
        return
      }

      const provider = settings.answerProvider
      const model = settings.answerModel
      const apiKey = this.settings.getSecret(provider)
      if (!apiKey) {
        callbacks.onNotice({
          code: 'provider-key-missing',
          message: `Cloud answer skipped because no ${providerLabel(provider)} API key is saved for ${model}.`
        })
        callbacks.onDone()
        return
      }

      const llm: LLMProvider =
        provider === 'anthropic'
          ? new AnthropicProvider(apiKey, model)
          : new OpenAIProvider(apiKey, model)

      if (this.cancelled.has(requestId) || controller.signal.aborted) return

      callbacks.onStage('writing-summary')
      let answer = ''
      const cited = new Set<number>()
      // Emit each citation the moment its marker completes, so the UI can show the source while
      // the sentence that cites it is still being written.
      const emitNewCitations = (): void => {
        for (const match of answer.matchAll(CITATION_RE)) {
          const idx = parseInt(match[1], 10)
          const chunk = evidenceChunks[idx - 1]
          if (cited.has(idx) || !chunk) continue
          cited.add(idx)
          callbacks.onCitation({
            index: idx,
            sourcePath: chunk.sourcePath,
            headingPath: chunk.headingPath
          })
        }
      }
      try {
        await llm.synthesize(
          query,
          evidenceChunks,
          (token) => {
            if (this.cancelled.has(requestId) || controller.signal.aborted) return
            answer += token
            callbacks.onToken(token)
            emitNewCitations()
          },
          { signal: controller.signal }
        )
      } catch (err) {
        if (this.cancelled.has(requestId) || controller.signal.aborted) return
        const message = describeProviderError(err, apiKey)
        throw new Error(`${providerLabel(provider)} ${model} answer failed: ${message}`)
      }

      if (this.cancelled.has(requestId) || controller.signal.aborted) return

      callbacks.onDone()
    } catch (err) {
      if (!this.cancelled.has(requestId)) {
        callbacks.onError(err instanceof Error ? err.message : String(err))
      }
    } finally {
      this.cancelled.delete(requestId)
      this.controllers.delete(requestId)
    }
  }

  cancel(requestId: string): void {
    this.cancelled.add(requestId)
    this.controllers.get(requestId)?.abort()
  }

  private async retrieveRows(
    query: string,
    requestedMode: SearchRetrievalMode | undefined
  ): Promise<{
    rows: StoredChunkRow[]
    retrievalMode: SearchAppliedRetrievalMode
    semanticFallback: boolean
  }> {
    if (requestedMode === 'keyword') {
      return {
        rows: this.retrieveDep.keywordSearch(query, RETRIEVE_MAX),
        retrievalMode: 'keyword',
        semanticFallback: false
      }
    }

    try {
      const [queryVec] = await this.embedDep.embed([query])
      return {
        rows: this.retrieveDep.hybridSearch(query, queryVec, RETRIEVE_K, RETRIEVE_MAX),
        retrievalMode: 'hybrid',
        semanticFallback: false
      }
    } catch {
      return {
        rows: this.retrieveDep.keywordSearch(query, RETRIEVE_MAX),
        retrievalMode: 'keyword',
        semanticFallback: true
      }
    }
  }
}

import { defineStore } from 'pinia'
import { ref } from 'vue'

import {
  clearSavedSearchHistory,
  loadSearchHistory,
  normalizeSearchQuery,
  saveSearchHistory,
  hasSavedSearchSnapshot,
  upsertSearchHistory,
  type HistoryEntry,
  type SearchHistoryOptions
} from './search-history'
import type {
  SearchCitation,
  SearchNotice,
  SearchQueryOptions,
  SearchStage,
  SearchSource
} from '../../../preload/index'

export type SearchStatus = 'idle' | 'searching' | 'streaming' | 'done' | 'error'

export interface SearchRunMetadata {
  answerModel?: string | null
  /** Keep the summary on screen until the new one starts writing (an update of the same query). */
  keepPrevious?: boolean
}

/** The summary an update replaces: still shown while the new run searches. */
export interface PreviousSummary {
  answer: string
  sources: SearchSource[]
  citations: SearchCitation[]
}

/** Whether a restored summary may be outdated; only `updates-available` shows the notice. */
export type SearchFreshnessState =
  | 'idle'
  | 'checking'
  | 'current'
  | 'updates-available'
  | 'kept'
  | 'unavailable'

export interface SearchFreshness {
  state: SearchFreshnessState
  relevantCount: number
}

/** Factual timings for the completed-work trace; never provider reasoning. */
export interface SearchTrace {
  startedAt: number | null
  completedAt: number | null
  stageAt: Partial<Record<SearchStage, number>>
}

const IDLE_FRESHNESS: SearchFreshness = { state: 'idle', relevantCount: 0 }

function emptyTrace(): SearchTrace {
  return { startedAt: null, completedAt: null, stageAt: {} }
}

// Invalidates in-flight freshness checks when the displayed summary changes.
let freshnessToken = 0

export const useSearchStore = defineStore('search', () => {
  const query = ref('')
  const answer = ref('')
  const sources = ref<SearchSource[]>([])
  const citations = ref<SearchCitation[]>([])
  const notices = ref<SearchNotice[]>([])
  const status = ref<SearchStatus>('idle')
  const error = ref<string | null>(null)
  const activeRequestId = ref<string | null>(null)
  const stage = ref<SearchStage | null>(null)
  const activeAnswerModel = ref<string | null>(null)
  const activeRetrievalMode = ref<SearchQueryOptions['retrievalMode']>('auto')
  const restoredSnapshotId = ref<string | null>(null)
  const previousSummary = ref<PreviousSummary | null>(null)
  const generatedAt = ref<number | null>(null)
  const freshness = ref<SearchFreshness>({ ...IDLE_FRESHNESS })
  const trace = ref<SearchTrace>(emptyTrace())
  const history = ref<HistoryEntry[]>([])
  const historyOptions = ref<SearchHistoryOptions>({
    retention: '30-days',
    includeAnswers: false
  })

  function reset(): void {
    answer.value = ''
    sources.value = []
    citations.value = []
    notices.value = []
    status.value = 'idle'
    error.value = null
    activeRequestId.value = null
    stage.value = null
    activeAnswerModel.value = null
    activeRetrievalMode.value = 'auto'
    restoredSnapshotId.value = null
    previousSummary.value = null
    generatedAt.value = null
    freshness.value = { ...IDLE_FRESHNESS }
    trace.value = emptyTrace()
    freshnessToken++
  }

  async function runQuery(
    q: string,
    options: SearchQueryOptions = {},
    metadata: SearchRunMetadata = {}
  ): Promise<void> {
    const held: PreviousSummary | null =
      metadata.keepPrevious &&
      status.value === 'done' &&
      answer.value &&
      normalizeSearchQuery(query.value) === normalizeSearchQuery(q)
        ? { answer: answer.value, sources: sources.value, citations: citations.value }
        : null
    reset()
    previousSummary.value = held
    query.value = q
    activeAnswerModel.value = metadata.answerModel ?? null
    activeRetrievalMode.value = options.retrievalMode ?? 'auto'
    status.value = 'searching'
    trace.value.startedAt = Date.now()
    activeRequestId.value = await window.ryte.search.query(q, options)
    if (!activeRequestId.value) {
      status.value = 'error'
      error.value = 'Indexer not ready — wait for local indexing to initialize'
    }
  }

  async function cancel(): Promise<void> {
    if (activeRequestId.value) {
      await window.ryte.search.cancel(activeRequestId.value)
    }
    reset()
  }

  function restoreSnapshot(entry: HistoryEntry): boolean {
    if (!hasSavedSearchSnapshot(entry)) return false
    reset()
    query.value = entry.query
    answer.value = entry.answer
    sources.value = entry.sources
    citations.value = entry.citations
    status.value = 'done'
    restoredSnapshotId.value = entry.id
    generatedAt.value = entry.timestamp
    void checkFreshness(entry)
    return true
  }

  /** Local-only check; never calls the answer provider or regenerates the summary. */
  async function checkFreshness(entry: HistoryEntry): Promise<void> {
    const token = ++freshnessToken
    freshness.value = { state: 'checking', relevantCount: 0 }
    try {
      const result = await window.ryte.search.checkSnapshotFreshness({
        query: entry.query,
        retrievalMode: entry.retrievalMode,
        generatedAt: entry.timestamp,
        sourcePaths: [...new Set(entry.sources.map((source) => source.sourcePath))]
      })
      if (token !== freshnessToken) return
      freshness.value =
        result.state === 'updates-available'
          ? { state: 'updates-available', relevantCount: result.relevantSourcePaths.length }
          : { state: 'current', relevantCount: 0 }
    } catch {
      if (token === freshnessToken) freshness.value = { state: 'unavailable', relevantCount: 0 }
    }
  }

  function keepCurrent(): void {
    if (freshness.value.state === 'updates-available') {
      freshness.value = { state: 'kept', relevantCount: freshness.value.relevantCount }
    }
  }

  // Tracks the active IPC listener cleanup so re-calls (e.g. HMR) remove old listeners first.
  let _cleanup: (() => void) | null = null

  function bind(): () => void {
    _cleanup?.()
    const cleanups: Array<() => void> = []

    cleanups.push(
      window.ryte.search.onStage((requestId, nextStage) => {
        if (requestId !== activeRequestId.value) return
        stage.value = nextStage
        trace.value.stageAt[nextStage] = Date.now()
      })
    )

    cleanups.push(
      window.ryte.search.onSources((requestId, retrieved) => {
        if (requestId !== activeRequestId.value) return
        sources.value = retrieved
      })
    )

    cleanups.push(
      window.ryte.search.onToken((requestId, token) => {
        if (requestId !== activeRequestId.value) return
        status.value = 'streaming'
        answer.value += token
      })
    )

    cleanups.push(
      window.ryte.search.onCitation((requestId, citation) => {
        if (requestId !== activeRequestId.value) return
        citations.value.push(citation)
      })
    )

    cleanups.push(
      window.ryte.search.onNotice((requestId, notice) => {
        if (requestId !== activeRequestId.value) return
        notices.value.push(notice)
      })
    )

    cleanups.push(
      window.ryte.search.onDone((requestId) => {
        if (requestId !== activeRequestId.value) return
        const completedAt = Date.now()
        if (historyOptions.value.retention !== 'off') {
          const entry: HistoryEntry = {
            id: crypto.randomUUID(),
            query: query.value,
            answer: historyOptions.value.includeAnswers ? answer.value : '',
            sources: historyOptions.value.includeAnswers ? sources.value : [],
            citations: historyOptions.value.includeAnswers ? citations.value : [],
            timestamp: completedAt,
            answerModel: activeAnswerModel.value,
            retrievalMode: activeRetrievalMode.value ?? 'auto'
          }
          history.value = upsertSearchHistory(history.value, entry)
          saveSearchHistory(history.value, undefined, historyOptions.value)
        }
        generatedAt.value = completedAt
        trace.value.completedAt = completedAt
        status.value = 'done'
        previousSummary.value = null
        activeRequestId.value = null
      })
    )

    cleanups.push(
      window.ryte.search.onError((requestId, msg) => {
        if (requestId !== activeRequestId.value) return
        status.value = 'error'
        error.value = msg
        activeRequestId.value = null
      })
    )

    _cleanup = () => cleanups.forEach((fn) => fn())
    return _cleanup
  }

  function clearHistory(): void {
    history.value = []
    clearSavedSearchHistory()
  }

  function configureHistory(options: SearchHistoryOptions): void {
    const previousRetention = historyOptions.value.retention
    historyOptions.value = options
    if (options.retention === 'off') {
      history.value = []
      clearSavedSearchHistory()
      return
    }
    if (options.retention === 'session') {
      if (previousRetention !== 'session') {
        history.value = []
      } else if (!options.includeAnswers) {
        history.value = history.value.map((entry) => ({
          ...entry,
          answer: '',
          sources: [],
          citations: []
        }))
      }
      clearSavedSearchHistory()
      return
    }
    history.value = loadSearchHistory(undefined, options)
    saveSearchHistory(history.value, undefined, options)
  }

  return {
    query,
    answer,
    sources,
    citations,
    notices,
    status,
    error,
    activeRequestId,
    stage,
    restoredSnapshotId,
    previousSummary,
    generatedAt,
    freshness,
    trace,
    history,
    runQuery,
    restoreSnapshot,
    keepCurrent,
    cancel,
    bind,
    clearHistory,
    configureHistory
  }
})

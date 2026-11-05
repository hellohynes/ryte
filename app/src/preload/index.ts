import { contextBridge, ipcRenderer } from 'electron'

import type {
  SearchAnswerMode as MainSearchAnswerMode,
  SearchRetrievalMode as MainSearchRetrievalMode,
  SearchStage as MainSearchStage,
  SearchSnapshotFreshness,
  SearchSnapshotFreshnessInput
} from '../main/search/search-service'
import {
  createContractApi,
  mergeContractApi,
  type ContractApi,
  type MergeApi
} from './contract-api'

export type SearchRetrievalMode = MainSearchRetrievalMode
export type SearchAnswerMode = MainSearchAnswerMode
export type SearchStage = MainSearchStage

export type { IndexerStatus } from '../shared/indexer'

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

export interface SearchQueryOptions {
  retrievalMode?: SearchRetrievalMode
  answerMode?: SearchAnswerMode
}

interface LegacyRyteApi {
  search: {
    query(q: string, options?: SearchQueryOptions): Promise<string | null>
    cancel(requestId: string): Promise<void>
    checkSnapshotFreshness(input: SearchSnapshotFreshnessInput): Promise<SearchSnapshotFreshness>
    onStage(cb: (requestId: string, stage: SearchStage) => void): () => void
    onToken(cb: (requestId: string, token: string) => void): () => void
    onSources(cb: (requestId: string, sources: SearchSource[]) => void): () => void
    onCitation(cb: (requestId: string, citation: SearchCitation) => void): () => void
    onNotice(cb: (requestId: string, notice: SearchNotice) => void): () => void
    onDone(cb: (requestId: string) => void): () => void
    onError(cb: (requestId: string, error: string) => void): () => void
  }
}

/** The full `window.ryte` API: the hand-written areas plus the areas built from the contract. */
export type RyteApi = MergeApi<LegacyRyteApi, ContractApi>

const legacyApi: LegacyRyteApi = {
  search: {
    query: (q, options) => ipcRenderer.invoke('search:query', q, options),
    cancel: (requestId) => ipcRenderer.invoke('search:cancel', requestId),
    checkSnapshotFreshness: (input) => ipcRenderer.invoke('search:check-snapshot-freshness', input),
    onStage: (cb) => {
      const listener = (_: unknown, payload: { requestId: string; stage: SearchStage }): void =>
        cb(payload.requestId, payload.stage)
      ipcRenderer.on('search:stage', listener)
      return () => ipcRenderer.removeListener('search:stage', listener)
    },
    onToken: (cb) => {
      const listener = (_: unknown, payload: { requestId: string; token: string }): void =>
        cb(payload.requestId, payload.token)
      ipcRenderer.on('search:stream-token', listener)
      return () => ipcRenderer.removeListener('search:stream-token', listener)
    },
    onSources: (cb) => {
      const listener = (
        _: unknown,
        payload: { requestId: string; sources: SearchSource[] }
      ): void => cb(payload.requestId, payload.sources)
      ipcRenderer.on('search:sources', listener)
      return () => ipcRenderer.removeListener('search:sources', listener)
    },
    onCitation: (cb) => {
      const listener = (_: unknown, payload: SearchCitation & { requestId: string }): void =>
        cb(payload.requestId, {
          index: payload.index,
          sourcePath: payload.sourcePath,
          headingPath: payload.headingPath
        })
      ipcRenderer.on('search:citation', listener)
      return () => ipcRenderer.removeListener('search:citation', listener)
    },
    onNotice: (cb) => {
      const listener = (_: unknown, payload: { requestId: string; notice: SearchNotice }): void =>
        cb(payload.requestId, payload.notice)
      ipcRenderer.on('search:notice', listener)
      return () => ipcRenderer.removeListener('search:notice', listener)
    },
    onDone: (cb) => {
      const listener = (_: unknown, payload: { requestId: string }): void => cb(payload.requestId)
      ipcRenderer.on('search:done', listener)
      return () => ipcRenderer.removeListener('search:done', listener)
    },
    onError: (cb) => {
      const listener = (_: unknown, payload: { requestId: string; error: string }): void =>
        cb(payload.requestId, payload.error)
      ipcRenderer.on('search:error', listener)
      return () => ipcRenderer.removeListener('search:error', listener)
    }
  }
}

const api: RyteApi = mergeContractApi(legacyApi, createContractApi(ipcRenderer))

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('ryte', api)
  } catch (error) {
    console.error('Failed to expose ryte api:', error)
  }
}

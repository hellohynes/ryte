import { contextBridge, ipcRenderer } from 'electron'

import type {
  FileCatalogResponse,
  FileCatalogChangeEvent,
  FileRenameInput,
  FileRenameResult,
  FileTrashResult,
  FileTreeResponse
} from '../shared/files'
import type {
  WorkspaceFileRef,
  WorkspaceOpenFileInput,
  WorkspaceTabFileInput
} from '../shared/workspace'
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
  files: {
    listTree(): Promise<FileTreeResponse>
    listCatalog(): Promise<FileCatalogResponse>
    copyContent(input: WorkspaceFileRef): Promise<void>
    copyPath(input: WorkspaceFileRef): Promise<void>
    showInFinder(input: WorkspaceFileRef): Promise<void>
    rename(input: FileRenameInput): Promise<FileRenameResult>
    moveToTrash(input: WorkspaceFileRef): Promise<FileTrashResult>
    read(absPath: string): Promise<string>
    readSource(input: WorkspaceOpenFileInput): Promise<string>
    readSourceTitle(input: WorkspaceOpenFileInput): Promise<string | null>
    readWorkspaceTab(input: WorkspaceTabFileInput): Promise<string>
    watch(absPath: string): Promise<void>
    watchSource(input: WorkspaceOpenFileInput): Promise<void>
    watchWorkspaceTab(input: WorkspaceTabFileInput): Promise<void>
    unwatch(): Promise<void>
    onChange(cb: (path: string) => void): () => void
    onSourceChange(cb: (sourcePath: string) => void): () => void
    onWorkspaceTabChange(cb: (tabId: string) => void): () => void
    onTreeChanged(cb: () => void): () => void
    onCatalogChanged(cb: (event?: FileCatalogChangeEvent) => void): () => void
  }
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
  files: {
    listTree: () => ipcRenderer.invoke('files:list-tree'),
    listCatalog: () => ipcRenderer.invoke('files:list-catalog'),
    copyContent: (input) => ipcRenderer.invoke('files:copy-content', input),
    copyPath: (input) => ipcRenderer.invoke('files:copy-path', input),
    showInFinder: (input) => ipcRenderer.invoke('files:show-in-finder', input),
    rename: (input) => ipcRenderer.invoke('files:rename', input),
    moveToTrash: (input) => ipcRenderer.invoke('files:move-to-trash', input),
    read: (absPath) => ipcRenderer.invoke('files:read', absPath),
    readSource: (input) => ipcRenderer.invoke('files:read-source', input),
    readSourceTitle: (input) => ipcRenderer.invoke('files:read-source-title', input),
    readWorkspaceTab: (input) => ipcRenderer.invoke('files:read-workspace-tab', input),
    watch: (absPath) => ipcRenderer.invoke('files:watch', absPath),
    watchSource: (input) => ipcRenderer.invoke('files:watch-source', input),
    watchWorkspaceTab: (input) => ipcRenderer.invoke('files:watch-workspace-tab', input),
    unwatch: () => ipcRenderer.invoke('files:unwatch'),
    onChange: (cb) => {
      const listener = (_: unknown, path: string): void => cb(path)
      ipcRenderer.on('viewer:file-changed', listener)
      return () => ipcRenderer.removeListener('viewer:file-changed', listener)
    },
    onSourceChange: (cb) => {
      const listener = (_: unknown, sourcePath: string): void => cb(sourcePath)
      ipcRenderer.on('viewer:source-changed', listener)
      return () => ipcRenderer.removeListener('viewer:source-changed', listener)
    },
    onWorkspaceTabChange: (cb) => {
      const listener = (_: unknown, tabId: string): void => cb(tabId)
      ipcRenderer.on('viewer:workspace-tab-changed', listener)
      return () => ipcRenderer.removeListener('viewer:workspace-tab-changed', listener)
    },
    onTreeChanged: (cb) => {
      const listener = (): void => cb()
      ipcRenderer.on('files:tree-changed', listener)
      return () => ipcRenderer.removeListener('files:tree-changed', listener)
    },
    onCatalogChanged: (cb) => {
      const listener = (_: unknown, event?: FileCatalogChangeEvent): void => cb(event)
      ipcRenderer.on('files:catalog-changed', listener)
      return () => ipcRenderer.removeListener('files:catalog-changed', listener)
    }
  },
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

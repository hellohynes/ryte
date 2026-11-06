import { contextBridge, ipcRenderer } from 'electron'

import type {
  SearchAnswerMode as ContractSearchAnswerMode,
  SearchCitation as ContractSearchCitation,
  SearchNotice as ContractSearchNotice,
  SearchOptions as ContractSearchOptions,
  SearchRetrievalMode as ContractSearchRetrievalMode,
  SearchSource as ContractSearchSource,
  SearchStage as ContractSearchStage
} from '../contract/search'
import { createContractApi, type ContractApi } from './contract-api'

export type SearchRetrievalMode = ContractSearchRetrievalMode
export type SearchAnswerMode = ContractSearchAnswerMode
export type SearchStage = ContractSearchStage
export type SearchSource = ContractSearchSource
export type SearchCitation = ContractSearchCitation
export type SearchNotice = ContractSearchNotice
export type SearchQueryOptions = ContractSearchOptions

export type { IndexerStatus } from '../shared/indexer'

/** The full `window.ryte` API, built from the contract. */
export type RyteApi = ContractApi

const api: RyteApi = createContractApi(ipcRenderer)

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('ryte', api)
  } catch (error) {
    console.error('Failed to expose ryte api:', error)
  }
}

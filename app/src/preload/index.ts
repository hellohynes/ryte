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
import {
  createContractApi,
  mergeContractApi,
  type ContractApi,
  type MergeApi
} from './contract-api'

export type SearchRetrievalMode = ContractSearchRetrievalMode
export type SearchAnswerMode = ContractSearchAnswerMode
export type SearchStage = ContractSearchStage
export type SearchSource = ContractSearchSource
export type SearchCitation = ContractSearchCitation
export type SearchNotice = ContractSearchNotice
export type SearchQueryOptions = ContractSearchOptions

export type { IndexerStatus } from '../shared/indexer'

// Every area is on the contract. The empty shell stays until `scripts/check-contract.mjs` stops looking for it.
interface LegacyRyteApi {}

/** The full `window.ryte` API: the hand-written areas plus the areas built from the contract. */
export type RyteApi = MergeApi<LegacyRyteApi, ContractApi>

const legacyApi: LegacyRyteApi = {}

const api: RyteApi = mergeContractApi(legacyApi, createContractApi(ipcRenderer))

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('ryte', api)
  } catch (error) {
    console.error('Failed to expose ryte api:', error)
  }
}

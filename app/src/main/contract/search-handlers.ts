import type { Contract } from '../../contract'
import type { SearchService } from '../search/search-service'
import type { Handlers } from './register'

export interface SearchHandlerDependencies {
  /**
   * The search service, or null while the index is not ready. Asked on every call: the service is replaced when the
   * index is rebuilt or the vector store changes, so a handler that kept one would search a closed store.
   */
  getSearchService: () => Pick<SearchService, 'checkSnapshotFreshness'> | null
}

/** The handlers for the search operations that are on the contract. Input is already validated and trimmed. */
export function createSearchHandlers({
  getSearchService
}: SearchHandlerDependencies): Handlers<Contract>['search'] {
  return {
    checkSnapshotFreshness: async (input) => {
      const service = getSearchService()
      if (!service) throw new Error('Indexer not initialized')
      return service.checkSnapshotFreshness(input)
    }
  }
}

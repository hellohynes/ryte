import { contract, type Contract } from '../../contract'
import type { IndexerStatus } from '../../contract/indexer'
import type { IndexerProgress } from '../indexing/indexer'
import type { Emit, Handlers } from './register'

export interface IndexerHandlerDependencies {
  service: {
    getStatus(): IndexerProgress
    triggerReindex(): Promise<void>
    clearAndRebuild(beforeClear?: () => void): Promise<void>
  }
  /**
   * Runs only when the service is certain the rebuild will happen, so a refused or failed rebuild never
   * stops a search that is still running. The handler never calls it; the service decides when.
   */
  beforeClear: () => void
}

/** The service keeps `lastIndexedAt` optional in its type but always sets it; the renderer needs it set. */
function toStatus(progress: IndexerProgress): IndexerStatus {
  return { ...progress, lastIndexedAt: progress.lastIndexedAt ?? null }
}

/** The handlers for the `indexer` operations, built from injected dependencies so they run without Electron. */
export function createIndexerHandlers({
  service,
  beforeClear
}: IndexerHandlerDependencies): Handlers<Contract>['indexer'] {
  return {
    getStatus: async () => toStatus(service.getStatus()),

    triggerReindex: async () => {
      // Fire and forget: progress arrives as status events, and the caller is not held up by a long run.
      void service.triggerReindex()
    },

    clearAndRebuild: async () => {
      await service.clearAndRebuild(beforeClear)
    }
  }
}

/** Sends every status the service publishes to every window through the registry's emitter. */
export function forwardIndexerStatus(
  service: { subscribe(callback: (status: IndexerProgress) => void): () => void },
  emit: Emit
): () => void {
  return service.subscribe((progress) => emit(contract.indexer.events.status, toStatus(progress)))
}

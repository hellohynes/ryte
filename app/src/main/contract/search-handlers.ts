import type { WebContents } from 'electron'

import { contract, type Contract } from '../../contract'
import type { EventDefinition, EventPayloadArgs } from '../../contract/define'
import type { SearchService } from '../search/search-service'
import type { EmitTo, Handlers } from './register'

export type SearchHandlers = Handlers<Contract>['search']

type SearchServiceLike = Pick<SearchService, 'checkSnapshotFreshness' | 'search' | 'cancel'>

export interface SearchDependencies {
  /**
   * The search service, or null while the index is not ready. Asked on every call: the service is replaced when the
   * index is rebuilt or the vector store changes, so a handler that kept one would search a closed store.
   */
  getSearchService: () => SearchServiceLike | null
  /** Sends an event to one window. Every search event goes through it: a search belongs to the window that asked. */
  emitTo: EmitTo
  randomUUID: () => string
  /** Runs a task after the current call has returned, so the reply that carries the id reaches the window first. */
  schedule: (task: () => void) => void
}

export interface Search {
  handlers: SearchHandlers
  /** Cancels every running search of every window, for a rebuild or restart that replaces the store they read. */
  cancelAll: () => void
}

interface ActiveRequest {
  owner: WebContents
  service: SearchServiceLike
  onOwnerDestroyed: () => void
}

const events = contract.search.events

/**
 * The search operations and the registry of running searches. A request is owned by the window that started it:
 * its events go to that window only, only that window can cancel it, and closing it cancels the request. The
 * registry is also what `cancelAll` empties, so the indexer's clear-and-rebuild hook and the settings restart can
 * stop searches that would read from a store about to be replaced.
 */
export function createSearch({
  getSearchService,
  emitTo,
  randomUUID,
  schedule
}: SearchDependencies): Search {
  const requests = new Map<string, ActiveRequest>()

  const clear = (requestId: string): void => {
    const request = requests.get(requestId)
    if (!request) return
    request.owner.removeListener('destroyed', request.onOwnerDestroyed)
    requests.delete(requestId)
  }

  const cancel = (requestId: string): void => {
    const request = requests.get(requestId)
    if (!request) return
    request.service.cancel(requestId)
    clear(requestId)
  }

  const cancelAll = (): void => {
    for (const requestId of [...requests.keys()]) cancel(requestId)
  }

  // An event for a request that is gone (cancelled, finished or never known) is dropped, and one for a window that
  // is gone cancels the request.
  const send = <TEvent extends EventDefinition>(
    requestId: string,
    event: TEvent,
    ...payload: EventPayloadArgs<TEvent>
  ): void => {
    const request = requests.get(requestId)
    if (!request) return
    if (request.owner.isDestroyed()) {
      cancel(requestId)
      return
    }
    emitTo(request.owner, event, ...payload)
  }

  const handlers: SearchHandlers = {
    query: async ({ query, ...options }, { sender }) => {
      const service = getSearchService()
      if (!service) {
        emitTo(sender, events.error, { requestId: '', error: 'Indexer not initialized' })
        return null
      }
      const requestId = randomUUID()
      const onOwnerDestroyed = (): void => cancel(requestId)
      requests.set(requestId, { owner: sender, service, onOwnerDestroyed })
      sender.once('destroyed', onOwnerDestroyed)
      schedule(() => {
        void service
          .search(
            query,
            requestId,
            {
              onStage: (stage) => send(requestId, events.stage, { requestId, stage }),
              onToken: (token) => send(requestId, events.streamToken, { requestId, token }),
              onSources: (sources) => send(requestId, events.sources, { requestId, sources }),
              onCitation: (citation) =>
                send(requestId, events.citation, { requestId, ...citation }),
              onNotice: (notice) => send(requestId, events.notice, { requestId, notice }),
              onDone: () => send(requestId, events.done, { requestId }),
              onError: (error) => send(requestId, events.error, { requestId, error })
            },
            options
          )
          .finally(() => clear(requestId))
      })
      return requestId
    },

    cancel: async ({ requestId }, { sender }) => {
      if (requests.get(requestId)?.owner === sender) cancel(requestId)
    },

    checkSnapshotFreshness: async (input) => {
      const service = getSearchService()
      if (!service) throw new Error('Indexer not initialized')
      return service.checkSnapshotFreshness(input)
    }
  }

  return { handlers, cancelAll }
}

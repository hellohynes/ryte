import { describe, expect, it, vi } from 'vitest'

import { contract } from '../../contract'
import type { EmbeddingStatus } from '../../contract/indexer'
import type { IndexerProgress } from '../indexing/indexer'
import {
  createIndexerHandlers,
  forwardEmbeddingStatus,
  forwardIndexerStatus,
  forwardRebuildNotice
} from './indexer-handlers'

const ctx = { sender: {} as never }

const fullStatus: IndexerProgress = {
  phase: 'error',
  filesTotal: 10,
  filesDone: 4,
  chunksTotal: 50,
  chunksDone: 20,
  lastIndexedAt: '2026-10-30T00:00:00.000Z',
  error: 'disk full'
}

// A status the service has not finished setting up: no `lastIndexedAt` and no `error` at all.
const bareStatus: IndexerProgress = {
  phase: 'idle',
  filesTotal: 10,
  filesDone: 4,
  chunksTotal: 50,
  chunksDone: 20
}

const idleEmbedding: EmbeddingStatus = { state: 'idle', total: 12, done: 12, pending: 0 }

interface FakeService {
  pendingRebuildNotice: ReturnType<typeof vi.fn<() => { message: string; detail: string } | null>>
  dismissRebuildNotice: ReturnType<typeof vi.fn<() => void>>
  subscribeRebuildNotice: ReturnType<typeof vi.fn>
  getEmbeddingStatus: ReturnType<typeof vi.fn<() => EmbeddingStatus>>
  subscribeEmbeddingStatus: ReturnType<typeof vi.fn>
  getStatus: ReturnType<typeof vi.fn<() => IndexerProgress>>
  triggerReindex: ReturnType<typeof vi.fn<() => Promise<void>>>
  clearAndRebuild: ReturnType<typeof vi.fn<(beforeClear?: () => void) => Promise<void>>>
}

function fakeService(overrides: Partial<Record<string, unknown>> = {}): FakeService {
  return {
    pendingRebuildNotice: vi.fn(() => null),
    dismissRebuildNotice: vi.fn(),
    subscribeRebuildNotice: vi.fn(() => () => undefined),
    getEmbeddingStatus: vi.fn(() => idleEmbedding),
    subscribeEmbeddingStatus: vi.fn(() => () => undefined),
    getStatus: vi.fn(() => fullStatus),
    triggerReindex: vi.fn(async () => undefined),
    clearAndRebuild: vi.fn(async () => undefined),
    ...overrides
  } as FakeService
}

describe('indexer getStatus', () => {
  it('returns every field of the service status, including error', async () => {
    const handlers = createIndexerHandlers({ service: fakeService(), beforeClear: vi.fn() })

    await expect(handlers.getStatus(undefined, ctx)).resolves.toStrictEqual(fullStatus)
  })

  it('reports an absent lastIndexedAt as null and adds no error key', async () => {
    const service = fakeService({ getStatus: vi.fn(() => bareStatus) })
    const handlers = createIndexerHandlers({ service, beforeClear: vi.fn() })

    const status = await handlers.getStatus(undefined, ctx)
    expect(status.lastIndexedAt).toBeNull()
    expect('error' in status).toBe(false)
  })
})

describe('indexer triggerReindex', () => {
  it('resolves while the reindex is still running', async () => {
    const service = fakeService({ triggerReindex: vi.fn(() => new Promise<void>(() => undefined)) })
    const handlers = createIndexerHandlers({ service, beforeClear: vi.fn() })

    await expect(handlers.triggerReindex(undefined, ctx)).resolves.toBeUndefined()
    expect(service.triggerReindex).toHaveBeenCalledTimes(1)
  })
})

describe('indexer clearAndRebuild', () => {
  it('passes the exact beforeClear callback to the service and awaits it', async () => {
    let finish: () => void = () => undefined
    const service = fakeService({
      clearAndRebuild: vi.fn(() => new Promise<void>((resolve) => (finish = resolve)))
    })
    const beforeClear = vi.fn()
    const handlers = createIndexerHandlers({ service, beforeClear })

    let done = false
    const pending = (async (): Promise<void> => {
      await handlers.clearAndRebuild(undefined, ctx)
      done = true
    })()
    await Promise.resolve()
    expect(done, 'the handler must wait for the service').toBe(false)
    expect(service.clearAndRebuild).toHaveBeenCalledWith(beforeClear)

    finish()
    await pending
    expect(done).toBe(true)
  })

  it('never calls beforeClear itself: not when the service returns without calling it, and not when it fails', async () => {
    const beforeClear = vi.fn()
    const returnsWithoutCalling = fakeService({ clearAndRebuild: vi.fn(async () => undefined) })
    await createIndexerHandlers({ service: returnsWithoutCalling, beforeClear }).clearAndRebuild(
      undefined,
      ctx
    )

    const fail = fakeService({ clearAndRebuild: vi.fn(async () => Promise.reject(new Error('x'))) })
    await expect(
      createIndexerHandlers({ service: fail, beforeClear }).clearAndRebuild(undefined, ctx)
    ).rejects.toThrow('x')

    expect(beforeClear).not.toHaveBeenCalled()
  })

  it('calls beforeClear exactly as often as the service does', async () => {
    const beforeClear = vi.fn()
    const service = fakeService({
      clearAndRebuild: vi.fn(async (callback?: () => void) => callback?.())
    })
    await createIndexerHandlers({ service, beforeClear }).clearAndRebuild(undefined, ctx)

    expect(beforeClear).toHaveBeenCalledTimes(1)
  })
})

describe('forwardIndexerStatus', () => {
  function fakeSubscribe(current: IndexerProgress): {
    subscribe: ReturnType<typeof vi.fn>
    unsubscribe: ReturnType<typeof vi.fn>
    publish: (status: IndexerProgress) => void
  } {
    let listener: ((status: IndexerProgress) => void) | null = null
    const unsubscribe = vi.fn(() => {
      listener = null
    })
    // Like the real service: calls back at once with the current status.
    const subscribe = vi.fn((callback: (status: IndexerProgress) => void) => {
      listener = callback
      callback(current)
      return unsubscribe
    })
    return { subscribe, unsubscribe, publish: (status: IndexerProgress) => listener?.(status) }
  }

  it('emits the status event with the full status as its payload, including the first status', () => {
    const service = fakeSubscribe(fullStatus)
    const emit = vi.fn()

    forwardIndexerStatus(service, emit)
    expect(emit).toHaveBeenCalledTimes(1)
    expect(emit).toHaveBeenLastCalledWith(contract.indexer.events.status, fullStatus)

    const next = { ...fullStatus, phase: 'done' as const, filesDone: 10 }
    service.publish(next)
    expect(emit).toHaveBeenCalledTimes(2)
    expect(emit).toHaveBeenLastCalledWith(contract.indexer.events.status, next)
  })

  it('reports an absent lastIndexedAt as null in the payload', () => {
    const emit = vi.fn()

    forwardIndexerStatus(fakeSubscribe(bareStatus), emit)

    expect(emit.mock.calls[0]?.[1]).toMatchObject({ lastIndexedAt: null })
  })

  it('returns the service unsubscribe', () => {
    const service = fakeSubscribe(fullStatus)

    const stop = forwardIndexerStatus(service, vi.fn())
    stop()

    expect(service.unsubscribe).toHaveBeenCalledTimes(1)
  })
})

describe('indexer rebuild notice', () => {
  const notice = {
    message: 'Ryte is rebuilding its search index',
    detail: 'Search may be incomplete.'
  }

  it('returns the pending notice, and null when there is none', async () => {
    const service = fakeService({ pendingRebuildNotice: vi.fn(() => notice) })
    const handlers = createIndexerHandlers({ service, beforeClear: vi.fn() })
    await expect(handlers.getRebuildNotice(undefined, ctx)).resolves.toStrictEqual(notice)

    service.pendingRebuildNotice.mockReturnValue(null)
    await expect(handlers.getRebuildNotice(undefined, ctx)).resolves.toBeNull()
  })

  it('asking for it does not dismiss it', async () => {
    const service = fakeService({ pendingRebuildNotice: vi.fn(() => notice) })
    const handlers = createIndexerHandlers({ service, beforeClear: vi.fn() })

    await handlers.getRebuildNotice(undefined, ctx)

    expect(service.dismissRebuildNotice).not.toHaveBeenCalled()
  })

  it('dismisses it through the service', async () => {
    const service = fakeService()
    const handlers = createIndexerHandlers({ service, beforeClear: vi.fn() })

    await expect(handlers.dismissRebuildNotice(undefined, ctx)).resolves.toBeUndefined()
    expect(service.dismissRebuildNotice).toHaveBeenCalledTimes(1)
  })
})

describe('forwardRebuildNotice', () => {
  it('sends every change of the notice to every window through the emitter', () => {
    let listener: ((notice: { message: string; detail: string } | null) => void) | undefined
    const service = {
      subscribeRebuildNotice: vi.fn((cb: typeof listener) => {
        listener = cb
        return () => undefined
      })
    }
    const emit = vi.fn()

    forwardRebuildNotice(service as never, emit)
    listener?.({ message: 'm', detail: 'd' })
    listener?.(null)

    expect(emit).toHaveBeenNthCalledWith(1, contract.indexer.events.rebuildNotice, {
      message: 'm',
      detail: 'd'
    })
    expect(emit).toHaveBeenNthCalledWith(2, contract.indexer.events.rebuildNotice, null)
  })
})

describe('indexer embedding status', () => {
  const paused: EmbeddingStatus = {
    state: 'paused',
    total: 3200,
    done: 120,
    pending: 3080,
    reason: 'offline',
    retryAt: '2026-11-03T15:42:00.000Z'
  }

  it('returns the current state from the service, for a window that opens mid-run', async () => {
    const service = fakeService({ getEmbeddingStatus: vi.fn(() => paused) })
    const handlers = createIndexerHandlers({ service, beforeClear: vi.fn() })

    await expect(handlers.getEmbeddingStatus(undefined, ctx)).resolves.toStrictEqual(paused)
  })

  it('answers with the service state each time it is asked, not a copy from the first time', async () => {
    const service = fakeService()
    const handlers = createIndexerHandlers({ service, beforeClear: vi.fn() })

    await handlers.getEmbeddingStatus(undefined, ctx)
    service.getEmbeddingStatus.mockReturnValue(paused)

    await expect(handlers.getEmbeddingStatus(undefined, ctx)).resolves.toStrictEqual(paused)
  })
})

describe('forwardEmbeddingStatus', () => {
  it('sends every change to every window through the emitter on the embedding status event', () => {
    let listener: ((status: EmbeddingStatus) => void) | null = null
    const unsubscribe = vi.fn()
    const service = {
      subscribeEmbeddingStatus: vi.fn((callback: (status: EmbeddingStatus) => void) => {
        listener = callback
        return unsubscribe
      })
    }
    const emit = vi.fn()

    const stop = forwardEmbeddingStatus(service, emit)
    const running: EmbeddingStatus = { state: 'running', total: 10, done: 3, pending: 7 }
    listener!(running)

    expect(emit).toHaveBeenCalledTimes(1)
    expect(emit).toHaveBeenCalledWith(contract.indexer.events.embeddingStatus, running)
    stop()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })
})

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { EmbeddingStatus } from '../../../contract/indexer'
import { useEmbeddingStatusStore } from './embedding-status'

const running: EmbeddingStatus = { state: 'running', total: 10, done: 3, pending: 7 }
const idle: EmbeddingStatus = { state: 'idle', total: 10, done: 10, pending: 0 }

function installIndexer(initial: EmbeddingStatus | Error): {
  onEmbeddingStatus: ReturnType<typeof vi.fn>
  getEmbeddingStatus: ReturnType<typeof vi.fn>
  emit(next: EmbeddingStatus): void
  resolveAsk(value: EmbeddingStatus): void
} {
  let listener: ((next: EmbeddingStatus) => void) | undefined
  let resolveAsk: (value: EmbeddingStatus) => void = () => undefined
  const indexer = {
    onEmbeddingStatus: vi.fn((cb: (next: EmbeddingStatus) => void) => {
      listener = cb
      return () => {
        listener = undefined
      }
    }),
    getEmbeddingStatus: vi.fn(() =>
      initial instanceof Error
        ? Promise.reject(initial)
        : new Promise<EmbeddingStatus>((resolve) => {
            resolveAsk = resolve
            resolve(initial)
          })
    ),
    emit: (next: EmbeddingStatus) => listener?.(next),
    resolveAsk: (value: EmbeddingStatus) => resolveAsk(value)
  }
  vi.stubGlobal('window', { ryte: { indexer } })
  return indexer
}

describe('useEmbeddingStatusStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.unstubAllGlobals()
  })

  it('shows nothing until it knows', () => {
    installIndexer(running)

    expect(useEmbeddingStatusStore().status).toBeNull()
  })

  it('shows what main says when the app binds', async () => {
    installIndexer(running)
    const store = useEmbeddingStatusStore()

    await store.bind()

    expect(store.status).toEqual(running)
  })

  it('follows every change main sends', async () => {
    const indexer = installIndexer(running)
    const store = useEmbeddingStatusStore()
    await store.bind()

    indexer.emit(idle)

    expect(store.status).toEqual(idle)
  })

  it('does not let the answer to the first ask overwrite a newer change', async () => {
    let answer: (value: EmbeddingStatus) => void = () => undefined
    const listeners: Array<(next: EmbeddingStatus) => void> = []
    vi.stubGlobal('window', {
      ryte: {
        indexer: {
          onEmbeddingStatus: (cb: (next: EmbeddingStatus) => void) => {
            listeners.push(cb)
            return () => undefined
          },
          getEmbeddingStatus: () => new Promise<EmbeddingStatus>((resolve) => (answer = resolve))
        }
      }
    })
    const store = useEmbeddingStatusStore()
    const binding = store.bind()

    listeners[0](idle)
    answer(running)
    await binding

    expect(store.status).toEqual(idle)
  })

  it('binds once, however many times it is asked', async () => {
    const indexer = installIndexer(running)
    const store = useEmbeddingStatusStore()

    await store.bind()
    await store.bind()

    expect(indexer.onEmbeddingStatus).toHaveBeenCalledTimes(1)
    expect(indexer.getEmbeddingStatus).toHaveBeenCalledTimes(1)
  })

  it('shows nothing, and does not throw, when main cannot answer', async () => {
    installIndexer(new Error('no'))
    const store = useEmbeddingStatusStore()

    await expect(store.bind()).resolves.toBeUndefined()

    expect(store.status).toBeNull()
  })
})

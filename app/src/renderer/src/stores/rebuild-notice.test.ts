import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useRebuildNoticeStore, type RebuildNotice } from './rebuild-notice'

const notice: RebuildNotice = {
  message: 'Ryte is rebuilding its search index',
  detail: 'Search may be incomplete for a short while.'
}

interface FakeIndexer {
  getRebuildNotice: ReturnType<typeof vi.fn<() => Promise<RebuildNotice | null>>>
  dismissRebuildNotice: ReturnType<typeof vi.fn<() => Promise<void>>>
  onRebuildNotice: ReturnType<typeof vi.fn>
  emit(next: RebuildNotice | null): void
}

function installIndexer(initial: RebuildNotice | null): FakeIndexer {
  let listener: ((next: RebuildNotice | null) => void) | undefined
  const indexer: FakeIndexer = {
    getRebuildNotice: vi.fn(async () => initial),
    dismissRebuildNotice: vi.fn(async () => undefined),
    onRebuildNotice: vi.fn((cb: (next: RebuildNotice | null) => void) => {
      listener = cb
      return () => {
        listener = undefined
      }
    }),
    emit: (next) => listener?.(next)
  }
  vi.stubGlobal('window', { ryte: { indexer } })
  return indexer
}

describe('useRebuildNoticeStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.unstubAllGlobals()
  })

  it('shows what main has pending when the app binds', async () => {
    installIndexer(notice)
    const store = useRebuildNoticeStore()

    await store.bind()

    expect(store.notice).toEqual(notice)
  })

  it('shows nothing when main has nothing pending', async () => {
    installIndexer(null)
    const store = useRebuildNoticeStore()

    await store.bind()

    expect(store.notice).toBeNull()
  })

  it('shows a notice that appears after the window opened', async () => {
    const indexer = installIndexer(null)
    const store = useRebuildNoticeStore()
    await store.bind()

    indexer.emit(notice)

    expect(store.notice).toEqual(notice)
  })

  it('hides it when main says it was dismissed, for instance from another window', async () => {
    const indexer = installIndexer(notice)
    const store = useRebuildNoticeStore()
    await store.bind()

    indexer.emit(null)

    expect(store.notice).toBeNull()
  })

  it('does not let a slow answer replace a newer notice that arrived while asking', async () => {
    const indexer = installIndexer(null)
    const later: RebuildNotice = { message: 'later', detail: 'later' }
    indexer.getRebuildNotice.mockImplementation(async () => {
      indexer.emit(later)
      return null
    })
    const store = useRebuildNoticeStore()

    await store.bind()

    expect(store.notice).toEqual(later)
  })

  it('binds once, however many times it is asked', async () => {
    const indexer = installIndexer(notice)
    const store = useRebuildNoticeStore()

    await store.bind()
    await store.bind()

    expect(indexer.onRebuildNotice).toHaveBeenCalledTimes(1)
    expect(indexer.getRebuildNotice).toHaveBeenCalledTimes(1)
  })

  it('dismissing hides it at once and tells main', async () => {
    const indexer = installIndexer(notice)
    const store = useRebuildNoticeStore()
    await store.bind()

    const dismissing = store.dismiss()
    expect(store.notice).toBeNull()
    await dismissing

    expect(indexer.dismissRebuildNotice).toHaveBeenCalledTimes(1)
  })

  it('shows nothing, and does not throw, when asking main fails', async () => {
    const indexer = installIndexer(notice)
    indexer.getRebuildNotice.mockRejectedValue(new Error('main is busy'))
    const store = useRebuildNoticeStore()

    await expect(store.bind()).resolves.toBeUndefined()

    expect(store.notice).toBeNull()
  })

  it('stays hidden, and does not throw, when dismissing fails in main', async () => {
    const indexer = installIndexer(notice)
    indexer.dismissRebuildNotice.mockRejectedValue(new Error('main is busy'))
    const store = useRebuildNoticeStore()
    await store.bind()

    await expect(store.dismiss()).resolves.toBeUndefined()

    expect(store.notice).toBeNull()
  })
})

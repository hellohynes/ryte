import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { FileCatalogResponse } from '../../../shared/files'
import { useFileCatalogStore } from './file-catalog'

type CatalogChangeEvent =
  | { type: 'upsert'; file: FileCatalogResponse['files'][number] }
  | { type: 'remove'; sourcePath: string }

function catalogEntry(sourcePath: string): FileCatalogResponse['files'][number] {
  return {
    sourcePath,
    title: sourcePath,
    directory: '',
    searchableText: sourcePath,
    pathDate: null,
    modifiedAt: '2026-06-22T12:00:00.000Z',
    modifiedAtMs: 1,
    createdAt: null,
    createdAtMs: null,
    sizeBytes: 1
  }
}

function catalogResponse(sourcePath: string): FileCatalogResponse {
  return {
    notesRoot: '/notes',
    files: [catalogEntry(sourcePath)]
  }
}

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
} {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  return { promise, resolve, reject }
}

async function flushAsync(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

describe('useFileCatalogStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('hydrates and refreshes on catalog change events', async () => {
    vi.useFakeTimers()
    const catalogChangedHandlers: Array<() => void> = []
    const listCatalog = vi
      .fn()
      .mockResolvedValueOnce(catalogResponse('plans/a.md'))
      .mockResolvedValueOnce({
        notesRoot: '/notes',
        files: []
      })

    vi.stubGlobal('window', {
      ryte: {
        files: {
          listCatalog,
          onCatalogChanged: vi.fn((cb: () => void) => {
            catalogChangedHandlers.push(cb)
            return vi.fn()
          })
        }
      }
    })

    const catalog = useFileCatalogStore()
    await catalog.hydrate()

    expect(catalog.files).toHaveLength(1)
    expect(catalog.notesRoot).toBe('/notes')

    expect(catalogChangedHandlers).toHaveLength(1)
    catalogChangedHandlers[0]?.()
    catalogChangedHandlers[0]?.()
    expect(listCatalog).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(100)
    await flushAsync()

    expect(listCatalog).toHaveBeenCalledTimes(2)
    expect(catalog.files).toEqual([])
  })

  it('patches one changed catalog entry and removes one deleted entry without rescanning the corpus', async () => {
    const catalogChangedHandlers: Array<(event: CatalogChangeEvent) => void> = []
    const listCatalog = vi.fn().mockResolvedValue({
      notesRoot: '/notes',
      files: [catalogEntry('plans/a.md'), catalogEntry('plans/b.md')]
    })
    vi.stubGlobal('window', {
      ryte: {
        files: {
          listCatalog,
          onCatalogChanged: vi.fn((cb: (event: CatalogChangeEvent) => void) => {
            catalogChangedHandlers.push(cb)
            return vi.fn()
          })
        }
      }
    })

    const catalog = useFileCatalogStore()
    await catalog.hydrate()

    catalogChangedHandlers[0]?.({
      type: 'upsert',
      file: { ...catalogEntry('plans/a.md'), title: 'Updated plan', modifiedAtMs: 2 }
    })
    catalogChangedHandlers[0]?.({ type: 'remove', sourcePath: 'plans/b.md' })
    await flushAsync()

    expect(listCatalog).toHaveBeenCalledOnce()
    expect(catalog.files).toEqual([
      expect.objectContaining({ sourcePath: 'plans/a.md', title: 'Updated plan', modifiedAtMs: 2 })
    ])
  })

  it('ignores stale catalog responses when refreshes complete out of order', async () => {
    const first = deferred<ReturnType<typeof catalogResponse>>()
    const second = deferred<ReturnType<typeof catalogResponse>>()
    vi.stubGlobal('window', {
      ryte: {
        files: {
          listCatalog: vi
            .fn()
            .mockReturnValueOnce(first.promise)
            .mockReturnValueOnce(second.promise),
          onCatalogChanged: vi.fn(() => vi.fn())
        }
      }
    })

    const catalog = useFileCatalogStore()
    const firstRefresh = catalog.refreshCatalog()
    const secondRefresh = catalog.refreshCatalog()

    second.resolve(catalogResponse('new.md'))
    await secondRefresh
    expect(catalog.files.map((file) => file.sourcePath)).toEqual(['new.md'])
    expect(catalog.loading).toBe(false)

    first.resolve(catalogResponse('old.md'))
    await firstRefresh
    expect(catalog.files.map((file) => file.sourcePath)).toEqual(['new.md'])
  })

  it('clears files instead of throwing when catalog loading fails', async () => {
    vi.stubGlobal('window', {
      ryte: {
        files: {
          listCatalog: vi.fn().mockRejectedValue(new Error('catalog failed')),
          onCatalogChanged: vi.fn(() => vi.fn())
        }
      }
    })

    const catalog = useFileCatalogStore()
    await catalog.hydrate()

    expect(catalog.files).toEqual([])
    expect(catalog.error).toBe('catalog failed')
  })

  it('retries catalog loading for a new consumer after a transient bound error', async () => {
    const listCatalog = vi
      .fn()
      .mockRejectedValueOnce(new Error('catalog failed'))
      .mockResolvedValueOnce(catalogResponse('plans/recovered.md'))
    vi.stubGlobal('window', {
      ryte: {
        files: {
          listCatalog,
          onCatalogChanged: vi.fn(() => vi.fn())
        }
      }
    })

    const catalog = useFileCatalogStore()
    await catalog.hydrate()
    expect(catalog.error).toBe('catalog failed')

    await catalog.hydrate()
    expect(listCatalog).toHaveBeenCalledTimes(2)
    expect(catalog.error).toBeNull()
    expect(catalog.files.map((file) => file.sourcePath)).toEqual(['plans/recovered.md'])
  })

  it('keeps the catalog subscription and cached files bound until every consumer unbinds', async () => {
    const unsubscribe = vi.fn()
    const onCatalogChanged = vi.fn(() => unsubscribe)
    const listCatalog = vi.fn().mockResolvedValue(catalogResponse('plans/a.md'))
    vi.stubGlobal('window', {
      ryte: {
        files: {
          listCatalog,
          onCatalogChanged
        }
      }
    })

    const catalog = useFileCatalogStore()
    await catalog.hydrate()
    await catalog.hydrate()

    expect(onCatalogChanged).toHaveBeenCalledOnce()
    expect(listCatalog).toHaveBeenCalledOnce()
    catalog.unbind()
    expect(unsubscribe).not.toHaveBeenCalled()

    catalog.unbind()
    expect(unsubscribe).toHaveBeenCalledOnce()

    await catalog.hydrate()
    expect(onCatalogChanged).toHaveBeenCalledTimes(2)
    expect(listCatalog).toHaveBeenCalledTimes(2)
  })
})

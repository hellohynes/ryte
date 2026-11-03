import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { FileCatalogResponse } from '../../../shared/files'
import { useFileCatalogStore } from './file-catalog'
import { useSettingsStore } from './settings'

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

describe('useFileCatalogStore when the notes folder changes', () => {
  function catalogOf(root: string, ...paths: string[]): FileCatalogResponse {
    return { notesRoot: root, files: paths.map(catalogEntry) }
  }

  function install(listCatalog: ReturnType<typeof vi.fn>): {
    changed: Array<(event?: CatalogChangeEvent) => void>
  } {
    const changed: Array<(event?: CatalogChangeEvent) => void> = []
    vi.stubGlobal('window', {
      ryte: {
        files: {
          listCatalog,
          onCatalogChanged: vi.fn((cb: (event?: CatalogChangeEvent) => void) => {
            changed.push(cb)
            return vi.fn()
          })
        }
      }
    })
    return { changed }
  }

  function setFolder(root: string | null): void {
    const settings = useSettingsStore()
    settings.state = (root === null ? null : { notesRoot: root, fontFamily: 'geist' }) as never
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("drops the old folder's entries at once and loads the new folder's", async () => {
    const second = deferred<FileCatalogResponse>()
    const listCatalog = vi
      .fn()
      .mockResolvedValueOnce(catalogOf('/a', 'a1.md', 'a2.md'))
      .mockReturnValueOnce(second.promise)
    install(listCatalog)
    const catalog = useFileCatalogStore()
    setFolder('/a')
    await catalog.hydrate()
    expect(catalog.files).toHaveLength(2)

    setFolder('/b')

    expect(catalog.files).toEqual([])
    expect(catalog.notesRoot).toBeNull()
    expect(catalog.loading).toBe(true)
    expect(listCatalog).toHaveBeenCalledTimes(2)

    second.resolve(catalogOf('/b', 'b1.md'))
    await flushAsync()

    expect(catalog.notesRoot).toBe('/b')
    expect(catalog.files.map((file) => file.sourcePath)).toEqual(['b1.md'])
    expect(catalog.loading).toBe(false)
  })

  it("never lets a load started for the old folder replace the new folder's entries", async () => {
    const first = deferred<FileCatalogResponse>()
    const listCatalog = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(catalogOf('/b', 'b1.md'))
    install(listCatalog)
    const catalog = useFileCatalogStore()
    setFolder('/a')
    const hydrating = catalog.hydrate()

    setFolder('/b')
    await flushAsync()
    first.resolve(catalogOf('/a', 'a1.md', 'a2.md'))
    await hydrating
    await flushAsync()

    expect(catalog.notesRoot).toBe('/b')
    expect(catalog.files.map((file) => file.sourcePath)).toEqual(['b1.md'])
  })

  it('does not load again for a settings change that keeps the folder', async () => {
    const listCatalog = vi.fn().mockResolvedValue(catalogOf('/a', 'a1.md'))
    install(listCatalog)
    const catalog = useFileCatalogStore()
    setFolder('/a')
    await catalog.hydrate()

    setFolder('/a')
    useSettingsStore().state = { notesRoot: '/a', fontFamily: 'roboto' } as never
    await flushAsync()

    expect(listCatalog).toHaveBeenCalledTimes(1)
    expect(catalog.files).toHaveLength(1)
  })

  it('does not load again when the settings first arrive', async () => {
    const listCatalog = vi.fn().mockResolvedValue(catalogOf('/a', 'a1.md'))
    install(listCatalog)
    const catalog = useFileCatalogStore()
    await catalog.hydrate()

    setFolder('/a')
    await flushAsync()

    expect(listCatalog).toHaveBeenCalledTimes(1)
    expect(catalog.files).toHaveLength(1)
  })

  it('loads nothing while no screen uses the catalog, and the next screen gets the new folder', async () => {
    const listCatalog = vi
      .fn()
      .mockResolvedValueOnce(catalogOf('/a', 'a1.md'))
      .mockResolvedValueOnce(catalogOf('/b', 'b1.md', 'b2.md'))
    install(listCatalog)
    const catalog = useFileCatalogStore()
    setFolder('/a')
    await catalog.hydrate()
    catalog.unbind()

    setFolder('/b')
    await flushAsync()
    expect(listCatalog).toHaveBeenCalledTimes(1)
    expect(catalog.files).toEqual([])

    await catalog.hydrate()
    expect(catalog.notesRoot).toBe('/b')
    expect(catalog.files).toHaveLength(2)
  })

  it("shows an error and none of the old folder's entries when the new folder's load fails", async () => {
    const listCatalog = vi
      .fn()
      .mockResolvedValueOnce(catalogOf('/a', 'a1.md'))
      .mockRejectedValueOnce(new Error('cannot list'))
    install(listCatalog)
    const catalog = useFileCatalogStore()
    setFolder('/a')
    await catalog.hydrate()

    setFolder('/b')
    await flushAsync()

    expect(catalog.error).toBe('cannot list')
    expect(catalog.files).toEqual([])
  })

  it('keeps a change for the new folder that arrives while its catalog loads', async () => {
    const second = deferred<FileCatalogResponse>()
    const listCatalog = vi
      .fn()
      .mockResolvedValueOnce(catalogOf('/a', 'a1.md'))
      .mockReturnValueOnce(second.promise)
    const { changed } = install(listCatalog)
    const catalog = useFileCatalogStore()
    setFolder('/a')
    await catalog.hydrate()

    setFolder('/b')
    changed[0]?.({ type: 'upsert', file: catalogEntry('b-new.md') })
    second.resolve(catalogOf('/b', 'b1.md'))
    await flushAsync()

    expect(catalog.files.map((file) => file.sourcePath).sort()).toEqual(['b-new.md', 'b1.md'])
  })

  it('never lets a load that was still running for the old folder land after the screen using it is gone', async () => {
    const first = deferred<FileCatalogResponse>()
    const listCatalog = vi.fn().mockReturnValueOnce(first.promise)
    install(listCatalog)
    const catalog = useFileCatalogStore()
    setFolder('/a')
    const hydrating = catalog.hydrate()
    catalog.unbind()

    setFolder('/b')
    first.resolve(catalogOf('/a', 'a1.md'))
    await hydrating
    await flushAsync()

    expect(catalog.files).toEqual([])
    expect(catalog.notesRoot).toBeNull()
    expect(catalog.loading).toBe(false)
  })

  it('forgets a failed load of the old folder when the folder changes', async () => {
    const listCatalog = vi.fn().mockRejectedValueOnce(new Error('cannot list'))
    install(listCatalog)
    const catalog = useFileCatalogStore()
    setFolder('/a')
    await catalog.hydrate()
    expect(catalog.error).toBe('cannot list')
    catalog.unbind()

    setFolder('/b')

    expect(catalog.error).toBeNull()
  })

  it('cancels a refresh that was waiting for the old folder, so it does not load twice', async () => {
    vi.useFakeTimers()
    const listCatalog = vi
      .fn()
      .mockResolvedValueOnce(catalogOf('/a', 'a1.md'))
      .mockResolvedValue(catalogOf('/b', 'b1.md'))
    const { changed } = install(listCatalog)
    const catalog = useFileCatalogStore()
    setFolder('/a')
    await catalog.hydrate()
    changed[0]?.()

    setFolder('/b')
    await vi.advanceTimersByTimeAsync(300)
    await flushAsync()

    expect(listCatalog).toHaveBeenCalledTimes(2)
  })
})

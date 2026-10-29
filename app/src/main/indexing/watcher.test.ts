import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  watch: vi.fn(),
  close: vi.fn(),
  notifyFileChanged: vi.fn(),
  notifyFileRemoved: vi.fn()
}))

vi.mock('chokidar', () => ({
  default: { watch: mocks.watch }
}))

vi.mock('./indexer-service', () => ({
  indexerService: {
    notifyFileChanged: mocks.notifyFileChanged,
    notifyFileRemoved: mocks.notifyFileRemoved
  }
}))

import { Watcher } from './watcher'

type Handler = (path: string) => void

interface Deferred {
  promise: Promise<void>
  resolve: () => void
}

function createDeferred(): Deferred {
  let resolve!: () => void
  const promise = new Promise<void>((settle) => {
    resolve = settle
  })
  return { promise, resolve }
}

describe('Watcher', () => {
  let handlers: Map<string, Handler>

  beforeEach(() => {
    vi.clearAllMocks()
    handlers = new Map()
    const fsw = {
      on: vi.fn((event: string, handler: Handler) => {
        handlers.set(event, handler)
        return fsw
      }),
      close: mocks.close.mockResolvedValue(undefined)
    }
    mocks.watch.mockReturnValue(fsw)
  })

  it('notifies the indexer and file tree subscribers when markdown files are added', () => {
    const watcher = new Watcher()
    const onTreeChanged = vi.fn()
    const onCatalogChanged = vi.fn()
    watcher.onTreeChanged(onTreeChanged)
    watcher.onCatalogChanged(onCatalogChanged)
    watcher.start('/notes')

    expect(mocks.watch).toHaveBeenCalledWith(
      '/notes',
      expect.objectContaining({ ignoreInitial: true, persistent: true })
    )

    handlers.get('add')?.('/notes/new.md')

    expect(onTreeChanged).toHaveBeenCalledOnce()
    expect(onCatalogChanged).toHaveBeenCalledWith({
      type: 'upsert',
      path: '/notes/new.md',
      notesRoot: '/notes'
    })
    expect(mocks.notifyFileChanged).toHaveBeenCalledWith('/notes/new.md')
  })

  it('ignores non-markdown file events from the watched notes root', () => {
    const watcher = new Watcher()
    const onTreeChanged = vi.fn()
    const onCatalogChanged = vi.fn()
    watcher.onTreeChanged(onTreeChanged)
    watcher.onCatalogChanged(onCatalogChanged)
    watcher.start('/notes')

    handlers.get('add')?.('/notes/ignored.txt')
    handlers.get('change')?.('/notes/ignored.txt')
    handlers.get('unlink')?.('/notes/ignored.txt')

    expect(onTreeChanged).not.toHaveBeenCalled()
    expect(onCatalogChanged).not.toHaveBeenCalled()
    expect(mocks.notifyFileChanged).not.toHaveBeenCalled()
    expect(mocks.notifyFileRemoved).not.toHaveBeenCalled()
  })

  it('notifies the indexer and file tree subscribers when markdown files are removed', () => {
    const watcher = new Watcher()
    const onTreeChanged = vi.fn()
    const onCatalogChanged = vi.fn()
    watcher.onTreeChanged(onTreeChanged)
    watcher.onCatalogChanged(onCatalogChanged)
    watcher.start('/notes')

    handlers.get('unlink')?.('/notes/old.md')

    expect(onTreeChanged).toHaveBeenCalledOnce()
    expect(onCatalogChanged).toHaveBeenCalledWith({
      type: 'remove',
      path: '/notes/old.md',
      notesRoot: '/notes'
    })
    expect(mocks.notifyFileRemoved).toHaveBeenCalledWith('/notes/old.md')
  })

  it('notifies file tree but not catalog subscribers when folders are added or removed', () => {
    const watcher = new Watcher()
    const onTreeChanged = vi.fn()
    const onCatalogChanged = vi.fn()
    watcher.onTreeChanged(onTreeChanged)
    watcher.onCatalogChanged(onCatalogChanged)
    watcher.start('/notes')

    handlers.get('addDir')?.('/notes/new-folder')
    handlers.get('unlinkDir')?.('/notes/old-folder')

    expect(onTreeChanged).toHaveBeenCalledTimes(2)
    expect(onCatalogChanged).not.toHaveBeenCalled()
  })

  it('emits catalog but not file tree changes for content-only changes', () => {
    const watcher = new Watcher()
    const onTreeChanged = vi.fn()
    const onCatalogChanged = vi.fn()
    watcher.onTreeChanged(onTreeChanged)
    watcher.onCatalogChanged(onCatalogChanged)
    watcher.start('/notes')

    handlers.get('change')?.('/notes/existing.md')

    expect(onTreeChanged).not.toHaveBeenCalled()
    expect(onCatalogChanged).toHaveBeenCalledWith({
      type: 'upsert',
      path: '/notes/existing.md',
      notesRoot: '/notes'
    })
    expect(mocks.notifyFileChanged).toHaveBeenCalledWith('/notes/existing.md')
  })

  it('serializes and coalesces repeated change events for the same markdown file', () => {
    const watcher = new Watcher()
    const indexing = createDeferred()
    mocks.notifyFileChanged.mockImplementation(() => indexing.promise)
    watcher.start('/notes')

    handlers.get('change')?.('/notes/existing.md')
    handlers.get('change')?.('/notes/existing.md')
    handlers.get('change')?.('/notes/existing.md')

    expect(mocks.notifyFileChanged).toHaveBeenCalledTimes(1)
    indexing.resolve()
  })
})

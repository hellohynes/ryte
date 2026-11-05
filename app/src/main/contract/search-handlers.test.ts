import { describe, expect, it, vi } from 'vitest'

import { contract } from '../../contract'
import type { SearchSnapshotFreshness, SearchSnapshotFreshnessInput } from '../../contract/search'
import { createSearchHandlers } from './search-handlers'
import { registerOperations, type IpcMainLike } from './register'

const sender = { id: 'sender' } as never
const ctx = { sender }

const input: SearchSnapshotFreshnessInput = {
  query: 'jira plans',
  retrievalMode: 'keyword',
  generatedAt: 100,
  sourcePaths: ['plans/jira.md']
}

const current: SearchSnapshotFreshness = {
  state: 'current',
  changedSourcePaths: [],
  relevantSourcePaths: []
}

const updates: SearchSnapshotFreshness = {
  state: 'updates-available',
  changedSourcePaths: ['plans/jira.md', 'other.md'],
  relevantSourcePaths: ['plans/jira.md']
}

function service(result: SearchSnapshotFreshness | Error = current): {
  checkSnapshotFreshness: ReturnType<typeof vi.fn>
} {
  return {
    checkSnapshotFreshness: vi.fn(async () => {
      if (result instanceof Error) throw result
      return result
    })
  }
}

describe('search.checkSnapshotFreshness handler', () => {
  it('passes the input to the service and returns the current result unchanged', async () => {
    const svc = service(current)
    const handlers = createSearchHandlers({ getSearchService: () => svc })

    await expect(handlers.checkSnapshotFreshness(input, ctx)).resolves.toBe(current)
    expect(svc.checkSnapshotFreshness.mock.calls).toEqual([[input]])
  })

  it('returns the updates-available result unchanged', async () => {
    const svc = service(updates)
    const handlers = createSearchHandlers({ getSearchService: () => svc })

    await expect(handlers.checkSnapshotFreshness(input, ctx)).resolves.toBe(updates)
  })

  it('rejects with exactly "Indexer not initialized" when there is no service', async () => {
    const getSearchService = vi.fn(() => null)
    const handlers = createSearchHandlers({ getSearchService })

    const result = handlers.checkSnapshotFreshness(input, ctx)
    await expect(result).rejects.toThrow(/^Indexer not initialized$/)
    await expect(result).rejects.toBeInstanceOf(Error)
    expect(getSearchService).toHaveBeenCalledTimes(1)
  })

  it('lets a failure of the service reach the caller', async () => {
    const failure = new Error('index closed')
    const handlers = createSearchHandlers({ getSearchService: () => service(failure) })

    await expect(handlers.checkSnapshotFreshness(input, ctx)).rejects.toBe(failure)
  })

  it('asks for the service on every call, since it is replaced after a rebuild', async () => {
    const first = service(current)
    const second = service(updates)
    let active: ReturnType<typeof service> | null = null
    const getSearchService = vi.fn(() => active)
    const handlers = createSearchHandlers({ getSearchService })

    active = first
    await expect(handlers.checkSnapshotFreshness(input, ctx)).resolves.toBe(current)
    active = second
    await expect(handlers.checkSnapshotFreshness(input, ctx)).resolves.toBe(updates)
    active = null
    await expect(handlers.checkSnapshotFreshness(input, ctx)).rejects.toThrow(
      'Indexer not initialized'
    )

    expect(getSearchService).toHaveBeenCalledTimes(3)
    expect(first.checkSnapshotFreshness).toHaveBeenCalledTimes(1)
    expect(second.checkSnapshotFreshness).toHaveBeenCalledTimes(1)
  })

  it('does not ask for the service when it is built', () => {
    const getSearchService = vi.fn(() => null)
    createSearchHandlers({ getSearchService })
    expect(getSearchService).not.toHaveBeenCalled()
  })
})

describe('search operations through the registrar', () => {
  function register(svc: ReturnType<typeof service> | null = service()): {
    invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
    channels: string[]
    svc: ReturnType<typeof service> | null
    getSearchService: ReturnType<typeof vi.fn>
  } {
    const registered = new Map<string, (event: { sender: never }, ...args: unknown[]) => unknown>()
    const ipc: IpcMainLike = {
      handle: (channel, listener) => void registered.set(channel, listener as never)
    }
    const getSearchService = vi.fn(() => svc)
    registerOperations(
      ipc,
      { search: contract.search },
      { search: createSearchHandlers({ getSearchService }) }
    )
    return {
      svc,
      getSearchService,
      channels: [...registered.keys()],
      invoke: async (channel, ...args) => registered.get(channel)!({ sender }, ...args)
    }
  }

  it('registers the channel with its wire name, and only that one', () => {
    expect(register().channels).toEqual(['search:check-snapshot-freshness'])
  })

  it('hands the service the trimmed query and the paths without repeats', async () => {
    const { invoke, svc } = register(service(updates))

    await expect(
      invoke('search:check-snapshot-freshness', {
        query: '  jira plans \n',
        retrievalMode: 'auto',
        generatedAt: 0,
        sourcePaths: ['b.md', 'a.md', 'b.md', 'c.md', 'a.md']
      })
    ).resolves.toBe(updates)

    expect(svc!.checkSnapshotFreshness.mock.calls).toEqual([
      [
        {
          query: 'jira plans',
          retrievalMode: 'auto',
          generatedAt: 0,
          sourcePaths: ['b.md', 'a.md', 'c.md']
        }
      ]
    ])
  })

  it('ignores a stray second argument, as the old handler did', async () => {
    const { invoke, svc } = register()

    await invoke('search:check-snapshot-freshness', input, { sourcePaths: ['other.md'] }, 'extra')

    expect(svc!.checkSnapshotFreshness.mock.calls).toEqual([[input]])
  })

  it('never reaches the service, or asks for it, with a rejected input', async () => {
    const { invoke, svc, getSearchService } = register()

    for (const rejected of [
      undefined,
      null,
      {},
      { ...input, extra: 1 },
      { ...input, query: '   ' },
      { ...input, retrievalMode: 'semantic' },
      { ...input, generatedAt: -1 },
      { ...input, generatedAt: Number.NaN },
      { ...input, sourcePaths: Array.from({ length: 101 }, (_, i) => `n${i}.md`) },
      { ...input, sourcePaths: [''] }
    ]) {
      await expect(invoke('search:check-snapshot-freshness', rejected)).rejects.toThrow(
        /^Invalid search\.checkSnapshotFreshness input/
      )
    }

    expect(svc!.checkSnapshotFreshness).not.toHaveBeenCalled()
    expect(getSearchService).not.toHaveBeenCalled()
  })

  it('answers "Indexer not initialized" for a valid input when there is no service', async () => {
    const { invoke } = register(null)

    await expect(invoke('search:check-snapshot-freshness', input)).rejects.toThrow(
      /^Indexer not initialized$/
    )
  })
})

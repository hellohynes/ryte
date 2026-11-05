import { describe, expect, it, vi } from 'vitest'

import { contract } from '../../contract'
import type { SearchSnapshotFreshness, SearchSnapshotFreshnessInput } from '../../contract/search'
import { createSearch, type SearchDependencies } from './search-handlers'
import {
  createEmitter,
  registerOperations,
  type EmitTo,
  type IpcMainLike,
  type WindowLike
} from './register'

const events = contract.search.events

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

/** A window that can be destroyed, as the real one tells its listeners. */
function makeWindow(): {
  isDestroyed: () => boolean
  send: ReturnType<typeof vi.fn>
  once: ReturnType<typeof vi.fn>
  removeListener: ReturnType<typeof vi.fn>
  destroy: () => void
} {
  let destroyListener: (() => void) | undefined
  let destroyed = false
  return {
    isDestroyed: () => destroyed,
    send: vi.fn(),
    once: vi.fn((event: string, listener: () => void) => {
      if (event === 'destroyed') destroyListener = listener
    }),
    removeListener: vi.fn((_event: string, listener: () => void) => {
      if (destroyListener === listener) destroyListener = undefined
    }),
    destroy: () => {
      destroyed = true
      destroyListener?.()
    }
  }
}

type FakeWindow = ReturnType<typeof makeWindow>

interface FakeService {
  checkSnapshotFreshness: ReturnType<typeof vi.fn>
  search: ReturnType<typeof vi.fn>
  cancel: ReturnType<typeof vi.fn>
}

// A search that never finishes, like a long one; a test settles it by hand when it needs to.
function service(result: SearchSnapshotFreshness | Error = current): FakeService {
  return {
    checkSnapshotFreshness: vi.fn(async () => {
      if (result instanceof Error) throw result
      return result
    }),
    search: vi.fn(() => new Promise<void>(() => undefined)),
    cancel: vi.fn()
  }
}

interface SearchCallbacks {
  onStage(stage: string): void
  onToken(token: string): void
  onSources(sources: unknown[]): void
  onCitation(citation: unknown): void
  onNotice(notice: unknown): void
  onDone(): void
  onError(error: string): void
}

const callbacksOf = (svc: FakeService, call = 0): SearchCallbacks =>
  svc.search.mock.calls[call]?.[2] as SearchCallbacks

/** Everything `createSearch` needs, with the scheduler under the test's control. */
function setup(
  options: {
    svc?: FakeService | null
    ids?: string[]
  } = {}
): {
  search: ReturnType<typeof createSearch>
  svc: FakeService | null
  getSearchService: ReturnType<typeof vi.fn>
  emitTo: ReturnType<typeof vi.fn>
  tasks: Array<() => void>
  flush: () => void
  setService: (next: FakeService | null) => void
} {
  let active: FakeService | null = options.svc === undefined ? service() : options.svc
  const ids = [...(options.ids ?? [])]
  let counter = 0
  const getSearchService = vi.fn(() => active)
  const emitTo = vi.fn()
  const tasks: Array<() => void> = []
  const dependencies: SearchDependencies = {
    getSearchService,
    emitTo: emitTo as unknown as EmitTo,
    randomUUID: () => ids.shift() ?? `request-${++counter}`,
    schedule: (task) => void tasks.push(task)
  }
  return {
    search: createSearch(dependencies),
    get svc() {
      return active
    },
    getSearchService,
    emitTo,
    tasks,
    flush: () => {
      for (const task of tasks.splice(0)) task()
    },
    setService: (next) => {
      active = next
    }
  }
}

const FIRST_ID = '00000000-0000-4000-8000-000000000001'

const ctxOf = (sender: FakeWindow): { sender: never } => ({ sender: sender as never })

describe('search.checkSnapshotFreshness handler', () => {
  it('passes the input to the service and returns the current result unchanged', async () => {
    const svc = service(current)
    const { search } = setup({ svc })

    await expect(search.handlers.checkSnapshotFreshness(input, ctxOf(makeWindow()))).resolves.toBe(
      current
    )
    expect(svc.checkSnapshotFreshness.mock.calls).toEqual([[input]])
  })

  it('returns the updates-available result unchanged', async () => {
    const { search } = setup({ svc: service(updates) })

    await expect(search.handlers.checkSnapshotFreshness(input, ctxOf(makeWindow()))).resolves.toBe(
      updates
    )
  })

  it('rejects with exactly "Indexer not initialized" when there is no service', async () => {
    const { search, getSearchService } = setup({ svc: null })

    const result = search.handlers.checkSnapshotFreshness(input, ctxOf(makeWindow()))
    await expect(result).rejects.toThrow(/^Indexer not initialized$/)
    await expect(result).rejects.toBeInstanceOf(Error)
    expect(getSearchService).toHaveBeenCalledTimes(1)
  })

  it('lets a failure of the service reach the caller', async () => {
    const failure = new Error('index closed')
    const { search } = setup({ svc: service(failure) })

    await expect(search.handlers.checkSnapshotFreshness(input, ctxOf(makeWindow()))).rejects.toBe(
      failure
    )
  })

  it('asks for the service on every call, since it is replaced after a rebuild', async () => {
    const first = service(current)
    const second = service(updates)
    const { search, getSearchService, setService } = setup({ svc: first })
    const ctx = ctxOf(makeWindow())

    await expect(search.handlers.checkSnapshotFreshness(input, ctx)).resolves.toBe(current)
    setService(second)
    await expect(search.handlers.checkSnapshotFreshness(input, ctx)).resolves.toBe(updates)
    setService(null)
    await expect(search.handlers.checkSnapshotFreshness(input, ctx)).rejects.toThrow(
      'Indexer not initialized'
    )

    expect(getSearchService).toHaveBeenCalledTimes(3)
    expect(first.checkSnapshotFreshness).toHaveBeenCalledTimes(1)
    expect(second.checkSnapshotFreshness).toHaveBeenCalledTimes(1)
  })

  it('does not ask for the service when it is built', () => {
    const { getSearchService } = setup()
    expect(getSearchService).not.toHaveBeenCalled()
  })
})

describe('search.query handler', () => {
  it('returns the id before the search starts or any event is sent', async () => {
    const t = setup({ ids: ['id-1'] })
    const owner = makeWindow()

    const id = await t.search.handlers.query({ query: 'release plan' }, ctxOf(owner))

    expect(id).toBe('id-1')
    expect(t.tasks).toHaveLength(1)
    expect(t.svc!.search).not.toHaveBeenCalled()
    expect(t.emitTo).not.toHaveBeenCalled()

    t.flush()
    expect(t.svc!.search).toHaveBeenCalledTimes(1)
  })

  it('starts the search with the query, the id and only the options that were sent', async () => {
    const t = setup({ ids: ['id-1', 'id-2', 'id-3'] })
    const owner = makeWindow()

    await t.search.handlers.query({ query: 'plain' }, ctxOf(owner))
    await t.search.handlers.query({ query: 'one', answerMode: 'local-only' }, ctxOf(owner))
    await t.search.handlers.query(
      { query: 'both', retrievalMode: 'hybrid', answerMode: 'settings' },
      ctxOf(owner)
    )
    t.flush()

    const calls = t.svc!.search.mock.calls
    expect(calls.map((call) => [call[0], call[1]])).toEqual([
      ['plain', 'id-1'],
      ['one', 'id-2'],
      ['both', 'id-3']
    ])
    expect(calls[0]?.[3]).toStrictEqual({})
    expect(calls[1]?.[3]).toStrictEqual({ answerMode: 'local-only' })
    expect(calls[2]?.[3]).toStrictEqual({ retrievalMode: 'hybrid', answerMode: 'settings' })
  })

  it('sends each event to the asking window only, with the request id and its fields', async () => {
    const t = setup({ ids: ['id-1'] })
    const owner = makeWindow()
    await t.search.handlers.query({ query: 'release plan' }, ctxOf(owner))
    t.flush()
    const callbacks = callbacksOf(t.svc!)
    const source = {
      index: 1,
      sourcePath: 'plans/a.md',
      headingPath: ['Plan'],
      preview: 'a preview',
      matchCount: 2,
      retrievalMode: 'keyword'
    }
    const notice = { code: 'no-local-sources', message: 'No local sources found.' }

    callbacks.onStage('searching-local')
    callbacks.onToken('A token')
    callbacks.onSources([source])
    callbacks.onCitation({ index: 1, sourcePath: 'plans/a.md', headingPath: ['Plan'] })
    callbacks.onNotice(notice)
    callbacks.onDone()
    // After done the request is still registered until the search settles; an error is sent as well.
    callbacks.onError('boom')

    expect(t.emitTo.mock.calls).toEqual([
      [owner, events.stage, { requestId: 'id-1', stage: 'searching-local' }],
      [owner, events.streamToken, { requestId: 'id-1', token: 'A token' }],
      [owner, events.sources, { requestId: 'id-1', sources: [source] }],
      [
        owner,
        events.citation,
        { requestId: 'id-1', index: 1, sourcePath: 'plans/a.md', headingPath: ['Plan'] }
      ],
      [owner, events.notice, { requestId: 'id-1', notice }],
      [owner, events.done, { requestId: 'id-1' }],
      [owner, events.error, { requestId: 'id-1', error: 'boom' }]
    ])
  })

  it('sends the citation flat, with its fields beside the request id', async () => {
    const t = setup({ ids: ['id-1'] })
    await t.search.handlers.query({ query: 'q' }, ctxOf(makeWindow()))
    t.flush()

    callbacksOf(t.svc!).onCitation({ index: 2, sourcePath: 'b.md', headingPath: [] })

    expect(Object.keys(t.emitTo.mock.calls[0]?.[2] as object).sort()).toEqual([
      'headingPath',
      'index',
      'requestId',
      'sourcePath'
    ])
  })

  it('does not hand the second window the events of the first, through the real emitter', async () => {
    const asker = makeWindow()
    const other = makeWindow()
    const windows: WindowLike[] = [{ webContents: other }, { webContents: asker }]
    const emitter = createEmitter(() => windows)
    const tasks: Array<() => void> = []
    const svc = service()
    const search = createSearch({
      getSearchService: () => svc,
      emitTo: emitter.to,
      randomUUID: () => 'id-1',
      schedule: (task) => void tasks.push(task)
    })

    await search.handlers.query({ query: 'q' }, ctxOf(asker))
    tasks.splice(0).forEach((task) => task())
    const callbacks = callbacksOf(svc)
    callbacks.onStage('searching-local')
    callbacks.onToken('t')
    callbacks.onSources([])
    callbacks.onDone()

    expect(asker.send.mock.calls).toEqual([
      ['search:stage', { requestId: 'id-1', stage: 'searching-local' }],
      ['search:stream-token', { requestId: 'id-1', token: 't' }],
      ['search:sources', { requestId: 'id-1', sources: [] }],
      ['search:done', { requestId: 'id-1' }]
    ])
    expect(other.send).not.toHaveBeenCalled()
  })

  it('keeps two windows apart: each gets only the events of its own request', async () => {
    const first = makeWindow()
    const second = makeWindow()
    const t = setup({ ids: ['id-1', 'id-2'] })
    await t.search.handlers.query({ query: 'one' }, ctxOf(first))
    await t.search.handlers.query({ query: 'two' }, ctxOf(second))
    t.flush()

    callbacksOf(t.svc!, 1).onToken('for the second')
    callbacksOf(t.svc!, 0).onToken('for the first')

    expect(t.emitTo.mock.calls).toEqual([
      [second, events.streamToken, { requestId: 'id-2', token: 'for the second' }],
      [first, events.streamToken, { requestId: 'id-1', token: 'for the first' }]
    ])
  })

  it('does not let a second query cancel the first', async () => {
    const t = setup({ ids: ['id-1', 'id-2'] })
    const owner = makeWindow()
    await t.search.handlers.query({ query: 'one' }, ctxOf(owner))
    await t.search.handlers.query({ query: 'two' }, ctxOf(owner))
    t.flush()

    callbacksOf(t.svc!, 0).onToken('still running')

    expect(t.svc!.cancel).not.toHaveBeenCalled()
    expect(t.emitTo).toHaveBeenCalledTimes(1)
  })

  it('asks for the service on every query, since it is replaced after a rebuild', async () => {
    const first = service()
    const second = service()
    const t = setup({ svc: first, ids: ['id-1', 'id-2'] })
    const owner = makeWindow()

    await t.search.handlers.query({ query: 'one' }, ctxOf(owner))
    t.setService(second)
    await t.search.handlers.query({ query: 'two' }, ctxOf(owner))
    t.flush()

    expect(t.getSearchService).toHaveBeenCalledTimes(2)
    expect(first.search).toHaveBeenCalledTimes(1)
    expect(second.search).toHaveBeenCalledTimes(1)
  })

  describe('when the index is not ready', () => {
    it('sends an error with an empty request id to the asking window only, and returns null', async () => {
      const t = setup({ svc: null })
      const owner = makeWindow()

      const id = await t.search.handlers.query({ query: 'q' }, ctxOf(owner))

      expect(id).toBeNull()
      expect(t.emitTo.mock.calls).toEqual([
        [owner, events.error, { requestId: '', error: 'Indexer not initialized' }]
      ])
      expect(t.tasks).toHaveLength(0)
      expect(owner.once).not.toHaveBeenCalled()
    })

    it('goes through the real emitter to the asker and no other window, and not to a destroyed one', async () => {
      const asker = makeWindow()
      const other = makeWindow()
      const emitter = createEmitter(() => [{ webContents: asker }, { webContents: other }])
      const search = createSearch({
        getSearchService: () => null,
        emitTo: emitter.to,
        randomUUID: () => 'unused',
        schedule: () => undefined
      })

      await search.handlers.query({ query: 'q' }, ctxOf(asker))
      expect(asker.send.mock.calls).toEqual([
        ['search:error', { requestId: '', error: 'Indexer not initialized' }]
      ])
      expect(other.send).not.toHaveBeenCalled()

      asker.destroy()
      await search.handlers.query({ query: 'q' }, ctxOf(asker))
      expect(asker.send).toHaveBeenCalledTimes(1)
    })
  })

  describe('the request registry', () => {
    it('is cleared when the search settles, so nothing is cancelled or sent for it afterwards', async () => {
      const t = setup({ ids: ['id-1'] })
      let finish: () => void = () => undefined
      t.svc!.search.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve
          })
      )
      const owner = makeWindow()
      await t.search.handlers.query({ query: 'q' }, ctxOf(owner))
      t.flush()
      const callbacks = callbacksOf(t.svc!)

      finish()
      await Promise.resolve()
      await Promise.resolve()
      expect(owner.removeListener).toHaveBeenCalledTimes(1)

      callbacks.onToken('late')
      await t.search.handlers.cancel({ requestId: 'id-1' }, ctxOf(owner))
      t.search.cancelAll()
      owner.destroy()
      expect(t.emitTo).not.toHaveBeenCalled()
      expect(t.svc!.cancel).not.toHaveBeenCalled()
    })

    it('is cleared when the search fails with an error event, which is the last event it sends', async () => {
      const t = setup({ ids: ['id-1'] })
      t.svc!.search.mockImplementation(async (_q: string, _id: string, cb: SearchCallbacks) => {
        cb.onStage('searching-local')
        cb.onError('the index closed')
      })
      const owner = makeWindow()

      await t.search.handlers.query({ query: 'q' }, ctxOf(owner))
      t.flush()
      await Promise.resolve()
      await Promise.resolve()

      expect(t.emitTo.mock.calls.map((call) => (call[1] as { channel: string }).channel)).toEqual([
        'search:stage',
        'search:error'
      ])
      expect(owner.removeListener).toHaveBeenCalledTimes(1)
    })
  })
})

describe('search.cancel handler', () => {
  async function started(): Promise<{
    t: ReturnType<typeof setup>
    owner: FakeWindow
    other: FakeWindow
    callbacks: SearchCallbacks
  }> {
    const t = setup({ ids: ['id-1'] })
    const owner = makeWindow()
    const other = makeWindow()
    await t.search.handlers.query({ query: 'q' }, ctxOf(owner))
    t.flush()
    return { t, owner, other, callbacks: callbacksOf(t.svc!) }
  }

  it('cancels the request of the calling window in the service and forgets it', async () => {
    const { t, owner, callbacks } = await started()

    await expect(t.search.handlers.cancel({ requestId: 'id-1' }, ctxOf(owner))).resolves.toBe(
      undefined
    )

    expect(t.svc!.cancel.mock.calls).toEqual([['id-1']])
    expect(owner.removeListener).toHaveBeenCalledTimes(1)
    callbacks.onToken('late token')
    callbacks.onDone()
    expect(t.emitTo).not.toHaveBeenCalled()
  })

  it('does nothing for a request that another window started, and says nothing', async () => {
    const { t, other, callbacks } = await started()

    await expect(t.search.handlers.cancel({ requestId: 'id-1' }, ctxOf(other))).resolves.toBe(
      undefined
    )

    expect(t.svc!.cancel).not.toHaveBeenCalled()
    expect(t.emitTo).not.toHaveBeenCalled()
    callbacks.onToken('still running')
    expect(t.emitTo).toHaveBeenCalledTimes(1)
  })

  it('does nothing, and throws nothing, for an id that is not running', async () => {
    const { t, owner } = await started()
    const unknown = '3f9c1d2e-7a4b-4c8e-9d1f-0a2b3c4d5e6f'

    await expect(t.search.handlers.cancel({ requestId: unknown }, ctxOf(owner))).resolves.toBe(
      undefined
    )
    await expect(t.search.handlers.cancel({ requestId: 'id-1' }, ctxOf(owner))).resolves.toBe(
      undefined
    )
    // The second cancel of the same id is unknown by now.
    await expect(t.search.handlers.cancel({ requestId: 'id-1' }, ctxOf(owner))).resolves.toBe(
      undefined
    )

    expect(t.svc!.cancel.mock.calls).toEqual([['id-1']])
    expect(t.emitTo).not.toHaveBeenCalled()
  })

  it('sends no terminal event for a cancelled search', async () => {
    const { t, owner, callbacks } = await started()
    callbacks.onStage('searching-local')

    await t.search.handlers.cancel({ requestId: 'id-1' }, ctxOf(owner))
    callbacks.onDone()
    callbacks.onError('aborted')

    expect(t.emitTo.mock.calls.map((call) => (call[1] as { channel: string }).channel)).toEqual([
      'search:stage'
    ])
  })
})

describe('closing the window that asked', () => {
  it('cancels the request when the window is destroyed, and drops what the search sends after', async () => {
    const t = setup({ ids: ['id-1'] })
    const owner = makeWindow()
    await t.search.handlers.query({ query: 'q' }, ctxOf(owner))
    t.flush()
    const callbacks = callbacksOf(t.svc!)

    owner.destroy()

    expect(t.svc!.cancel.mock.calls).toEqual([['id-1']])
    callbacks.onToken('late token')
    expect(t.emitTo).not.toHaveBeenCalled()
  })

  it('cancels the request when an event finds the window already destroyed, and sends nothing', async () => {
    const t = setup({ ids: ['id-1'] })
    const owner = makeWindow()
    await t.search.handlers.query({ query: 'q' }, ctxOf(owner))
    t.flush()
    const callbacks = callbacksOf(t.svc!)
    // The window is gone but its `destroyed` listener has not run.
    owner.isDestroyed = () => true

    callbacks.onToken('token')

    expect(t.emitTo).not.toHaveBeenCalled()
    expect(t.svc!.cancel.mock.calls).toEqual([['id-1']])
    callbacks.onToken('again')
    expect(t.svc!.cancel).toHaveBeenCalledTimes(1)
  })

  it('leaves the request of another window running', async () => {
    const t = setup({ ids: ['id-1', 'id-2'] })
    const closing = makeWindow()
    const staying = makeWindow()
    await t.search.handlers.query({ query: 'one' }, ctxOf(closing))
    await t.search.handlers.query({ query: 'two' }, ctxOf(staying))
    t.flush()

    closing.destroy()

    expect(t.svc!.cancel.mock.calls).toEqual([['id-1']])
    callbacksOf(t.svc!, 1).onToken('still here')
    expect(t.emitTo.mock.calls).toEqual([
      [staying, events.streamToken, { requestId: 'id-2', token: 'still here' }]
    ])
  })
})

describe('cancelAll', () => {
  it('cancels the running search of every window, once each, and forgets them', async () => {
    const t = setup({ ids: ['id-1', 'id-2', 'id-3'] })
    const first = makeWindow()
    const second = makeWindow()
    await t.search.handlers.query({ query: 'one' }, ctxOf(first))
    await t.search.handlers.query({ query: 'two' }, ctxOf(second))
    await t.search.handlers.query({ query: 'three' }, ctxOf(first))
    t.flush()

    t.search.cancelAll()
    t.search.cancelAll()

    expect(t.svc!.cancel.mock.calls.map((call) => call[0]).sort()).toEqual(['id-1', 'id-2', 'id-3'])
    for (const index of [0, 1, 2]) callbacksOf(t.svc!, index).onToken('late')
    expect(t.emitTo).not.toHaveBeenCalled()
    expect(first.removeListener).toHaveBeenCalledTimes(2)
    expect(second.removeListener).toHaveBeenCalledTimes(1)
  })

  it('cancels each request in the service that started it, not the current one', async () => {
    const old = service()
    const t = setup({ svc: old, ids: ['id-1', 'id-2'] })
    const owner = makeWindow()
    await t.search.handlers.query({ query: 'one' }, ctxOf(owner))
    const replacement = service()
    t.setService(replacement)
    await t.search.handlers.query({ query: 'two' }, ctxOf(owner))
    t.flush()

    t.search.cancelAll()

    expect(old.cancel.mock.calls).toEqual([['id-1']])
    expect(replacement.cancel.mock.calls).toEqual([['id-2']])
  })

  it('does nothing when nothing is running', () => {
    const t = setup()
    expect(() => t.search.cancelAll()).not.toThrow()
  })
})

describe('search operations through the registrar', () => {
  function register(svc: FakeService | null = service()): {
    invoke: (sender: FakeWindow, channel: string, ...args: unknown[]) => Promise<unknown>
    channels: string[]
    svc: FakeService | null
    getSearchService: ReturnType<typeof vi.fn>
    emitTo: ReturnType<typeof vi.fn>
    tasks: Array<() => void>
  } {
    const registered = new Map<string, (event: { sender: never }, ...args: unknown[]) => unknown>()
    const ipc: IpcMainLike = {
      handle: (channel, listener) => void registered.set(channel, listener as never)
    }
    const getSearchService = vi.fn(() => svc)
    const emitTo = vi.fn()
    const tasks: Array<() => void> = []
    let counter = 0
    // Real UUIDs, so the id a query returns is one `search.cancel` accepts.
    const nextId = (): string => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`
    registerOperations(
      ipc,
      { search: contract.search },
      {
        search: createSearch({
          getSearchService,
          emitTo: emitTo as unknown as EmitTo,
          randomUUID: nextId,
          schedule: (task) => void tasks.push(task)
        }).handlers
      }
    )
    return {
      svc,
      getSearchService,
      emitTo,
      tasks,
      channels: [...registered.keys()],
      invoke: async (sender, channel, ...args) =>
        registered.get(channel)!({ sender: sender as never }, ...args)
    }
  }

  it('registers the three channels with their wire names, and only those', () => {
    expect(register().channels).toEqual([
      'search:query',
      'search:cancel',
      'search:check-snapshot-freshness'
    ])
  })

  it('replies with the id before the first event, because the search starts after the reply', async () => {
    const r = register()
    const owner = makeWindow()
    const order: string[] = []
    r.svc!.search.mockImplementation((_q: string, _id: string, cb: SearchCallbacks) => {
      order.push('search started')
      cb.onStage('searching-local')
      return new Promise<void>(() => undefined)
    })
    r.emitTo.mockImplementation(() => order.push('event sent'))

    const reply = r.invoke(owner, 'search:query', { query: 'q' }).then((id) => {
      order.push(`reply ${String(id)}`)
      return id
    })
    await expect(reply).resolves.toBe(FIRST_ID)
    expect(order).toEqual([`reply ${FIRST_ID}`])

    r.tasks.splice(0).forEach((task) => task())
    expect(order).toEqual([`reply ${FIRST_ID}`, 'search started', 'event sent'])
  })

  it('hands the service the trimmed query and the options that were sent', async () => {
    const r = register()

    await r.invoke(makeWindow(), 'search:query', {
      query: '  jira plans \n',
      answerMode: 'local-only'
    })
    r.tasks.splice(0).forEach((task) => task())

    expect(r.svc!.search.mock.calls.map((call) => [call[0], call[3]])).toEqual([
      ['jira plans', { answerMode: 'local-only' }]
    ])
  })

  it('never reaches the service, or asks for it, with a rejected query or cancel', async () => {
    const r = register()
    const owner = makeWindow()

    for (const rejected of [
      undefined,
      null,
      'jira plans',
      {},
      { query: '   ' },
      { query: 'q', extra: 1 },
      { query: 'q', retrievalMode: 'semantic' },
      { query: 'q', answerMode: 'cloud' },
      { query: 'q', retrievalMode: undefined },
      { query: 'q', answerMode: undefined }
    ]) {
      await expect(r.invoke(owner, 'search:query', rejected)).rejects.toThrow(
        /^Invalid search\.query input/
      )
    }
    for (const rejected of [
      undefined,
      'id-1',
      {},
      { requestId: 'id-1' },
      { requestId: '3f9c1d2e-7a4b-6c8e-9d1f-0a2b3c4d5e6f' },
      { requestId: '3f9c1d2e-7a4b-4c8e-9d1f-0a2b3c4d5e6f', extra: 1 }
    ]) {
      await expect(r.invoke(owner, 'search:cancel', rejected)).rejects.toThrow(
        /^Invalid search\.cancel input/
      )
    }

    expect(r.getSearchService).not.toHaveBeenCalled()
    expect(r.svc!.search).not.toHaveBeenCalled()
    expect(r.svc!.cancel).not.toHaveBeenCalled()
    expect(r.emitTo).not.toHaveBeenCalled()
  })

  it('answers null and an error event, and does not start a search, when there is no service', async () => {
    const r = register(null)
    const owner = makeWindow()

    await expect(r.invoke(owner, 'search:query', { query: 'q' })).resolves.toBeNull()

    expect(r.emitTo.mock.calls).toEqual([
      [owner, events.error, { requestId: '', error: 'Indexer not initialized' }]
    ])
    expect(r.tasks).toHaveLength(0)
  })

  it('cancels by the id it returned, and only for the window that asked', async () => {
    const r = register()
    const owner = makeWindow()
    const other = makeWindow()
    const id = (await r.invoke(owner, 'search:query', { query: 'q' })) as string
    r.tasks.splice(0).forEach((task) => task())

    await expect(r.invoke(other, 'search:cancel', { requestId: id })).resolves.toBeUndefined()
    expect(r.svc!.cancel).not.toHaveBeenCalled()

    await expect(r.invoke(owner, 'search:cancel', { requestId: id })).resolves.toBeUndefined()
    expect(r.svc!.cancel.mock.calls).toEqual([[id]])
  })

  it('answers "Indexer not initialized" for a valid freshness input when there is no service', async () => {
    const r = register(null)

    await expect(r.invoke(makeWindow(), 'search:check-snapshot-freshness', input)).rejects.toThrow(
      /^Indexer not initialized$/
    )
  })

  it('hands the service the trimmed query and the paths without repeats for a freshness check', async () => {
    const r = register(service(updates))

    await expect(
      r.invoke(makeWindow(), 'search:check-snapshot-freshness', {
        query: '  jira plans \n',
        retrievalMode: 'auto',
        generatedAt: 0,
        sourcePaths: ['b.md', 'a.md', 'b.md', 'c.md', 'a.md']
      })
    ).resolves.toBe(updates)

    expect(r.svc!.checkSnapshotFreshness.mock.calls).toEqual([
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
    const r = register()

    await r.invoke(
      makeWindow(),
      'search:check-snapshot-freshness',
      input,
      { sourcePaths: ['other.md'] },
      'extra'
    )

    expect(r.svc!.checkSnapshotFreshness.mock.calls).toEqual([[input]])
  })

  it('never reaches the service, or asks for it, with a rejected freshness input', async () => {
    const r = register()

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
      await expect(
        r.invoke(makeWindow(), 'search:check-snapshot-freshness', rejected)
      ).rejects.toThrow(/^Invalid search\.checkSnapshotFreshness input/)
    }

    expect(r.svc!.checkSnapshotFreshness).not.toHaveBeenCalled()
    expect(r.getSearchService).not.toHaveBeenCalled()
  })
})

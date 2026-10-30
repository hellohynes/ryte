import { describe, expect, it, vi } from 'vitest'

import { manifest } from '../contract/manifest.generated'
import {
  createContractApi,
  mergeContractApi,
  type ContractManifest,
  type IpcRendererLike
} from './contract-api'

type Listener = (event: unknown, ...args: unknown[]) => void

function fakeIpc(): {
  ipc: IpcRendererLike
  invoke: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
  removeListener: ReturnType<typeof vi.fn>
  emit: (channel: string, ...payload: unknown[]) => void
} {
  const listeners = new Map<string, Set<Listener>>()
  const invoke = vi.fn(async () => 'result')
  const on = vi.fn((channel: string, listener: Listener) => {
    listeners.set(channel, (listeners.get(channel) ?? new Set()).add(listener))
  })
  const removeListener = vi.fn((channel: string, listener: Listener) => {
    listeners.get(channel)?.delete(listener)
  })
  return {
    ipc: { invoke, on, removeListener },
    invoke,
    on,
    removeListener,
    emit: (channel, ...payload) => {
      for (const listener of listeners.get(channel) ?? []) listener({ sender: 'main' }, ...payload)
    }
  }
}

// The wire strings, copied from the pre-contract code (recorded at a9ce30b in channels.baseline.json, since
// retired). They are the contract with the main process, so they are pinned here as literals.
const TASKS_REQUEST_CHANNELS = ['tasks:list', 'tasks:refresh', 'tasks:toggle']
const TASKS_EVENT_CHANNELS = ['tasks:changed']

const toggleInput = {
  sourcePath: 'folder/tasks.md',
  line: 3,
  checkboxColumn: 2,
  checked: true,
  expectedLine: '- [ ] Follow up'
}

describe('createContractApi from the generated manifest', () => {
  it('exposes exactly the manifest, with nothing extra', () => {
    const { ipc } = fakeIpc()
    const api = createContractApi(ipc)

    expect(Object.keys(api)).toEqual(['tasks'])
    // Exactly the manifest, nothing more: a method per operation and an on<Event> per event.
    const names = manifest.tasks
    const expected = [
      ...Object.keys(names.operations),
      ...Object.keys(names.events).map(
        (event) => `on${event.charAt(0).toUpperCase()}${event.slice(1)}`
      )
    ].sort()
    expect(Object.keys(api.tasks).sort()).toEqual(expected)
    // The pre-contract members are all still there.
    expect(Object.keys(api.tasks)).toEqual(
      expect.arrayContaining(['list', 'onChanged', 'refresh', 'toggle'])
    )
  })

  it('invokes and subscribes only to the tasks channels recorded before the change', async () => {
    const { ipc, invoke, on } = fakeIpc()
    const api = createContractApi(ipc)

    await api.tasks.list()
    await api.tasks.refresh()
    await api.tasks.toggle(toggleInput)
    api.tasks.onChanged(() => undefined)

    const invoked = invoke.mock.calls.map((call) => call[0]).sort()
    expect(invoked).toEqual(TASKS_REQUEST_CHANNELS)
    expect(on.mock.calls.map((call) => call[0])).toEqual(TASKS_EVENT_CHANNELS)
  })

  it('forwards at most the first argument: none for list() and refresh(), the input otherwise', async () => {
    const { ipc, invoke } = fakeIpc()
    const api = createContractApi(ipc)

    await api.tasks.list()
    await api.tasks.list({ checked: false, limit: 1 })
    await api.tasks.refresh()
    await api.tasks.toggle(toggleInput)
    await (api.tasks.toggle as (...args: unknown[]) => Promise<unknown>)(toggleInput, 'extra')

    expect(invoke.mock.calls).toEqual([
      ['tasks:list'],
      ['tasks:list', { checked: false, limit: 1 }],
      ['tasks:refresh'],
      ['tasks:toggle', toggleInput],
      ['tasks:toggle', toggleInput]
    ])
  })

  it('returns the invoke result', async () => {
    const { ipc } = fakeIpc()
    await expect(createContractApi(ipc).tasks.refresh()).resolves.toBe('result')
  })

  it('subscribes with a callback that gets no arguments and unsubscribes with the same listener', () => {
    const { ipc, on, removeListener, emit } = fakeIpc()
    const callback = vi.fn()
    const unsubscribe = createContractApi(ipc).tasks.onChanged(callback)

    emit('tasks:changed')
    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledWith()

    unsubscribe()
    expect(removeListener).toHaveBeenCalledTimes(1)
    expect(removeListener.mock.calls[0]?.[0]).toBe('tasks:changed')
    expect(removeListener.mock.calls[0]?.[1], 'the same listener that was registered').toBe(
      on.mock.calls[0]?.[1]
    )

    emit('tasks:changed')
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('keeps subscriptions independent', () => {
    const { ipc, emit } = fakeIpc()
    const api = createContractApi(ipc)
    const first = vi.fn()
    const second = vi.fn()
    const stopFirst = api.tasks.onChanged(first)
    api.tasks.onChanged(second)

    stopFirst()
    emit('tasks:changed')

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })
})

describe('createContractApi with a payload-bearing event and another area', () => {
  const fixture: ContractManifest = {
    fixture: {
      operations: { whoAmI: 'fixture:who-am-i' },
      events: { status: 'fixture:status-event' }
    }
  }

  it('delivers the event payload to the callback', () => {
    const { ipc, emit } = fakeIpc()
    const api = createContractApi<{
      fixture: {
        whoAmI(): Promise<unknown>
        onStatus(cb: (payload: { phase: string }) => void): () => void
      }
    }>(ipc, fixture)
    const callback = vi.fn()
    api.fixture.onStatus(callback)

    emit('fixture:status-event', { phase: 'idle' })

    expect(Object.keys(api.fixture).sort()).toEqual(['onStatus', 'whoAmI'])
    expect(callback).toHaveBeenCalledWith({ phase: 'idle' })
  })

  it('builds nothing that is not in the manifest it is given', () => {
    const { ipc } = fakeIpc()
    expect(Object.keys(createContractApi(ipc, {}))).toEqual([])
    expect(Object.keys(createContractApi(ipc, fixture))).toEqual(['fixture'])
  })
})

describe('mergeContractApi', () => {
  it('keeps hand-written methods and areas and adds the built ones to a shared area', () => {
    const open = vi.fn()
    const legacyMethod = vi.fn()
    const whoAmI = vi.fn()
    const legacy = { workspace: { open }, fixture: { legacyMethod } }
    const built = { fixture: { whoAmI } }

    const merged = mergeContractApi(legacy, built)

    expect(merged.workspace.open).toBe(open)
    expect(merged.fixture.legacyMethod).toBe(legacyMethod)
    expect(merged.fixture.whoAmI).toBe(whoAmI)
    expect(Object.keys(legacy.fixture)).toEqual(['legacyMethod'])
  })

  it('lets the contract method win a name clash', () => {
    const legacy = { fixture: { whoAmI: vi.fn() } }
    const built = { fixture: { whoAmI: vi.fn() } }

    expect(mergeContractApi(legacy, built).fixture.whoAmI).toBe(built.fixture.whoAmI)
  })

  it('builds the real manifest into the same areas the manifest lists', () => {
    const api = createContractApi(fakeIpc().ipc)
    expect(Object.keys(api)).toEqual(Object.keys(manifest))
  })
})

// Compile-time only: these lines must be type errors. The function is never called.
export function typeLevelChecks(): void {
  const api = createContractApi(fakeIpc().ipc)
  // @ts-expect-error toggle requires an input
  void api.tasks.toggle()
  // @ts-expect-error refresh takes no argument
  void api.tasks.refresh('extra')
  // @ts-expect-error the callback of a payload-less event takes no argument
  api.tasks.onChanged((payload: string) => payload)
  void api.tasks.list()
  void api.tasks.list({ checked: true })
}

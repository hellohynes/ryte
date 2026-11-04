import { describe, expect, it, vi } from 'vitest'

import { contract } from '../../contract'
import { createWorkspaceHandlers, type WorkspaceHandlerDependencies } from './workspace-handlers'
import { registerOperations, type IpcMainLike } from './register'

type Store = WorkspaceHandlerDependencies['store']
type StoreMethod = keyof Store

const sender = { id: 'sender' } as never
const ctx = { sender }

const METHODS: StoreMethod[] = [
  'publicState',
  'updateShell',
  'updateLibrary',
  'focusTab',
  'closeTab',
  'updateTabViewMode',
  'setOutlineCollapsed',
  'setOutlineWidth'
]

/** A fake store whose every method returns its own marker, so a handler that calls the wrong one is caught. */
function setup(): {
  store: Store
  handlers: ReturnType<typeof createWorkspaceHandlers>
  results: Record<StoreMethod, object>
} {
  const results = {} as Record<StoreMethod, object>
  const store = {} as Record<StoreMethod, ReturnType<typeof vi.fn>>
  for (const method of METHODS) {
    results[method] = { returnedBy: method }
    store[method] = vi.fn(() => results[method])
  }
  const typed = store as unknown as Store
  return { store: typed, handlers: createWorkspaceHandlers({ store: typed }), results }
}

const callsOf = (store: Store, method: StoreMethod): unknown[][] =>
  (store[method] as unknown as ReturnType<typeof vi.fn>).mock.calls

/** Every store method other than `used` was never called. */
function expectOnlyCalled(store: Store, used: StoreMethod): void {
  for (const method of METHODS) {
    if (method !== used) expect(callsOf(store, method), `${method} was not called`).toEqual([])
  }
}

const cases: [string, StoreMethod, unknown][] = [
  ['updateShell', 'updateShell', { sidebarWidth: 280 }],
  ['updateLibrary', 'updateLibrary', { scrollTop: 5, folderSortModes: { docs: 'za' } }],
  ['focusTab', 'focusTab', { tabId: 'tab-1' }],
  ['closeTab', 'closeTab', { tabId: 'tab-1' }],
  ['updateTabViewMode', 'updateTabViewMode', { tabId: 'tab-1', viewMode: 'source' }],
  ['setOutlineCollapsed', 'setOutlineCollapsed', { sourcePath: 'a.md', collapsed: true }],
  ['setOutlineWidth', 'setOutlineWidth', { width: 240 }]
]

describe('workspace handlers', () => {
  it('has a handler for exactly the eight state-only operations', () => {
    expect(Object.keys(setup().handlers).sort()).toEqual(
      Object.keys(contract.workspace.operations).sort()
    )
  })

  it('returns the store state for getState, calling nothing else', async () => {
    const { store, handlers, results } = setup()

    await expect(handlers.getState(undefined, ctx)).resolves.toBe(results.publicState)

    expect(callsOf(store, 'publicState')).toEqual([[]])
    expectOnlyCalled(store, 'publicState')
  })

  it.each(cases)(
    '%s passes the validated input to the matching store method and returns its result unchanged',
    async (name, method, input) => {
      const { store, handlers, results } = setup()
      const handler = handlers[name as keyof typeof handlers] as (
        input: unknown,
        context: { sender: never }
      ) => Promise<unknown>

      await expect(handler(input, ctx)).resolves.toBe(results[method])

      expect(callsOf(store, method)).toEqual([[input]])
      expectOnlyCalled(store, method)
    }
  )

  it('rejects when the store throws, without swallowing the error', async () => {
    const { store, handlers } = setup()
    vi.mocked(store.focusTab).mockImplementation(() => {
      throw new Error('Workspace tab not found')
    })

    await expect(handlers.focusTab({ tabId: 'missing' }, ctx)).rejects.toThrow(
      'Workspace tab not found'
    )
  })

  it('keeps the store `this` so a real store method can use its own state', async () => {
    const seen: unknown[] = []
    const store = {
      publicState() {
        seen.push(this)
        return {} as never
      }
    } as unknown as Store
    // Only getState is exercised: the other methods are never reached.
    const handlers = createWorkspaceHandlers({ store })

    await handlers.getState(undefined, ctx)

    expect(seen).toEqual([store])
  })
})

describe('workspace operations through the registrar', () => {
  function register(): {
    store: Store
    invoke: (channel: string, input?: unknown) => Promise<unknown>
    channels: string[]
  } {
    const { store, handlers } = setup()
    const registered = new Map<string, (event: { sender: never }, ...args: unknown[]) => unknown>()
    const ipc: IpcMainLike = {
      handle: (channel, listener) => void registered.set(channel, listener as never)
    }
    registerOperations(ipc, { workspace: contract.workspace }, { workspace: handlers })
    return {
      store,
      channels: [...registered.keys()],
      invoke: async (channel, input) => registered.get(channel)!({ sender }, input)
    }
  }

  it('registers the eight channels and not the window update', () => {
    expect(register().channels).toEqual([
      'workspace:get-state',
      'workspace:update-shell',
      'workspace:update-library',
      'workspace:focus-tab',
      'workspace:close-tab',
      'workspace:update-tab-view-mode',
      'workspace:set-outline-collapsed',
      'workspace:set-outline-width'
    ])
  })

  it('hands the store the normalized input, not the raw one', async () => {
    const { store, invoke } = register()

    await invoke('workspace:set-outline-collapsed', {
      sourcePath: './docs//a.md',
      collapsed: false
    })
    await invoke('workspace:update-library', { folderSortModes: { './docs': 'recency' } })

    expect(callsOf(store, 'setOutlineCollapsed')).toEqual([
      [{ sourcePath: 'docs/a.md', collapsed: false }]
    ])
    expect(callsOf(store, 'updateLibrary')).toEqual([[{ folderSortModes: { docs: 'recency' } }]])
  })

  it('never reaches the store with a rejected input', async () => {
    const { store, invoke } = register()

    for (const [channel, input] of [
      ['workspace:focus-tab', { tabId: 'a\n' }],
      ['workspace:close-tab', { tabId: 'a', extra: 1 }],
      ['workspace:update-tab-view-mode', { tabId: 'a', viewMode: undefined }],
      ['workspace:update-shell', { sidebarWidth: 4001 }],
      ['workspace:update-library', { scrollTop: undefined }],
      ['workspace:set-outline-width', { width: 1000.5 }],
      ['workspace:get-state', {}]
    ] as const) {
      await expect(invoke(channel, input), channel).rejects.toThrow(/^Invalid workspace\./)
    }

    for (const method of METHODS) expect(callsOf(store, method), method).toEqual([])
  })
})

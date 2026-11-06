import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it, vi, type Mock } from 'vitest'

import { contract } from '../../contract'
import type { WorkspaceFileRef } from '../../shared/workspace'
import { fileRefForPickedMarkdownFile } from '../picked-file'
import { createWorkspaceHandlers, type WorkspaceHandlerDependencies } from './workspace-handlers'
import { registerOperations, type IpcMainLike } from './register'

interface FakeWindow {
  id: string
}

type Deps = WorkspaceHandlerDependencies<FakeWindow>
type Store = Deps['store']
type StoreMethod = keyof Store
type ShowOpenDialog = Deps['showOpenDialog']
type PickedFileHelper = Deps['fileRefForPickedMarkdownFile']

const sender = { id: 'sender' } as never
const ctx = { sender }
const askingWindow: FakeWindow = { id: 'asking-window' }
const NOTES_ROOT = '/notes-root'

const METHODS: StoreMethod[] = [
  'publicState',
  'updateShell',
  'updateLibrary',
  'focusTab',
  'closeTab',
  'updateTabViewMode',
  'setOutlineCollapsed',
  'setOutlineWidth',
  'openFile',
  'openRecentFile',
  'openPickedFile',
  'recordRecent',
  'pruneMissingFileRefs'
]

interface SetupOptions {
  dialogResult?: { canceled: boolean; filePaths: string[] }
  windowFor?: () => FakeWindow | null
  pickedFileRef?: WorkspaceFileRef
  helper?: PickedFileHelper
  notesRoot?: () => string
}

/**
 * A fake store whose every method returns its own marker, so a handler that calls the wrong one is caught. Store
 * calls and menu refreshes append to one log, so the tests can assert their order.
 */
function setup(options: SetupOptions = {}): {
  store: Store
  handlers: ReturnType<typeof createWorkspaceHandlers<FakeWindow>>
  results: Record<StoreMethod, object>
  log: string[]
  refreshAppMenu: Mock<() => void>
  showOpenDialog: Mock<ShowOpenDialog>
  windowFor: Mock<Deps['windowFor']>
  helper: Mock<PickedFileHelper>
} {
  const log: string[] = []
  const results = {} as Record<StoreMethod, object>
  const store = {} as Record<StoreMethod, ReturnType<typeof vi.fn>>
  for (const method of METHODS) {
    results[method] = { returnedBy: method }
    store[method] = vi.fn(() => {
      log.push(`store.${method}`)
      return results[method]
    })
  }
  const typed = store as unknown as Store
  const refreshAppMenu = vi.fn<() => void>(() => void log.push('menu'))
  const showOpenDialog = vi.fn<ShowOpenDialog>(
    async () => options.dialogResult ?? { canceled: false, filePaths: ['/picked/a.md'] }
  )
  const windowFor = vi.fn<Deps['windowFor']>(options.windowFor ?? (() => askingWindow))
  const helper = vi.fn<PickedFileHelper>(
    options.helper ?? (async () => options.pickedFileRef ?? { sourcePath: 'picked/a.md' })
  )
  const handlers = createWorkspaceHandlers<FakeWindow>({
    store: typed,
    refreshAppMenu,
    getNotesRoot: options.notesRoot ?? (() => NOTES_ROOT),
    windowFor,
    showOpenDialog,
    fileRefForPickedMarkdownFile: helper
  })
  return { store: typed, handlers, results, log, refreshAppMenu, showOpenDialog, windowFor, helper }
}

const callsOf = (store: Store, method: StoreMethod): unknown[][] =>
  (store[method] as unknown as ReturnType<typeof vi.fn>).mock.calls

/** Every store method other than `used` was never called. */
function expectOnlyCalled(store: Store, used: StoreMethod): void {
  for (const method of METHODS) {
    if (method !== used) expect(callsOf(store, method), `${method} was not called`).toEqual([])
  }
}

type AnyHandler = (input: unknown, context: { sender: never }) => Promise<unknown>

const stateOnlyCases: [string, StoreMethod, unknown][] = [
  ['updateShell', 'updateShell', { sidebarWidth: 280 }],
  ['updateLibrary', 'updateLibrary', { scrollTop: 5, folderSortModes: { docs: 'za' } }],
  ['focusTab', 'focusTab', { tabId: 'tab-1' }],
  ['closeTab', 'closeTab', { tabId: 'tab-1' }],
  ['updateTabViewMode', 'updateTabViewMode', { tabId: 'tab-1', viewMode: 'source' }],
  ['setOutlineCollapsed', 'setOutlineCollapsed', { sourcePath: 'a.md', collapsed: true }],
  ['setOutlineWidth', 'setOutlineWidth', { width: 240 }]
]

/** The four operations that call one store method and then refresh the menu. */
const menuCases: [string, StoreMethod, unknown][] = [
  ['openFile', 'openFile', { sourcePath: 'docs/a.md' }],
  ['openRecentFile', 'openRecentFile', { externalPath: '/tmp/outside/a.md' }],
  ['recordRecent', 'recordRecent', { sourcePath: 'docs/a.md' }],
  ['pruneMissingFileRefs', 'pruneMissingFileRefs', undefined]
]

describe('workspace handlers', () => {
  it('has a handler for exactly the thirteen operations', () => {
    const { handlers } = setup()
    expect(Object.keys(handlers).sort()).toEqual(Object.keys(contract.workspace.operations).sort())
    expect(Object.keys(handlers)).toHaveLength(13)
  })

  it('returns the store state for getState, calling nothing else and not the menu', async () => {
    const { store, handlers, results, refreshAppMenu } = setup()

    await expect(handlers.getState(undefined, ctx)).resolves.toBe(results.publicState)

    expect(callsOf(store, 'publicState')).toEqual([[]])
    expectOnlyCalled(store, 'publicState')
    expect(refreshAppMenu).not.toHaveBeenCalled()
  })

  it.each(stateOnlyCases)(
    '%s passes the validated input to the matching store method, returns its result unchanged and leaves the menu alone',
    async (name, method, input) => {
      const { store, handlers, results, refreshAppMenu } = setup()
      const handler = handlers[name as keyof typeof handlers] as AnyHandler

      await expect(handler(input, ctx)).resolves.toBe(results[method])

      expect(callsOf(store, method)).toEqual([[input]])
      expectOnlyCalled(store, method)
      expect(refreshAppMenu).not.toHaveBeenCalled()
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
    const base = setup()
    const store = {
      publicState() {
        seen.push(this)
        return {} as never
      }
    } as unknown as Store
    const handlers = createWorkspaceHandlers<FakeWindow>({
      store,
      refreshAppMenu: () => undefined,
      getNotesRoot: () => NOTES_ROOT,
      windowFor: base.windowFor,
      showOpenDialog: base.showOpenDialog,
      fileRefForPickedMarkdownFile: base.helper
    })

    await handlers.getState(undefined, ctx)

    expect(seen).toEqual([store])
  })
})

describe('workspace handlers that refresh the app menu', () => {
  it.each(menuCases)(
    '%s passes the validated input to the matching store method and returns its result unchanged',
    async (name, method, input) => {
      const { store, handlers, results } = setup()
      const handler = handlers[name as keyof typeof handlers] as AnyHandler

      await expect(handler(input, ctx)).resolves.toBe(results[method])

      expect(callsOf(store, method)).toEqual(input === undefined ? [[]] : [[input]])
      expectOnlyCalled(store, method)
    }
  )

  it.each(menuCases)(
    '%s refreshes the menu exactly once, after the store call and before it returns',
    async (name, method, input) => {
      const { handlers, log, refreshAppMenu } = setup()
      const handler = handlers[name as keyof typeof handlers] as AnyHandler

      await handler(input, ctx)

      expect(refreshAppMenu).toHaveBeenCalledTimes(1)
      expect(log).toEqual([`store.${method}`, 'menu'])
    }
  )

  it.each(menuCases)(
    '%s neither refreshes the menu nor swallows the error when the store call throws',
    async (name, method, input) => {
      const { store, handlers, refreshAppMenu } = setup()
      vi.mocked(store[method] as () => unknown).mockRejectedValue(new Error('store failed'))
      const handler = handlers[name as keyof typeof handlers] as AnyHandler

      await expect(handler(input, ctx)).rejects.toThrow('store failed')

      expect(refreshAppMenu).not.toHaveBeenCalled()
    }
  )
})

describe('workspace handlers: openNativeFile', () => {
  it('parents the dialog to the window of the asking sender', async () => {
    const { handlers, showOpenDialog, windowFor } = setup()

    await handlers.openNativeFile(undefined, ctx)

    expect(windowFor).toHaveBeenCalledWith(sender)
    expect(showOpenDialog.mock.calls[0]?.[0]).toBe(askingWindow)
  })

  it('shows the dialog unparented when the sender has no window', async () => {
    const { handlers, showOpenDialog, results } = setup({ windowFor: () => null })

    await expect(handlers.openNativeFile(undefined, ctx)).resolves.toBe(results.openPickedFile)

    expect(showOpenDialog).toHaveBeenCalledTimes(1)
    expect(showOpenDialog.mock.calls[0]?.[0]).toBeNull()
  })

  it('opens a Markdown file picker in the notes folder, exactly as before', async () => {
    const { handlers, showOpenDialog } = setup()

    await handlers.openNativeFile(undefined, ctx)

    expect(showOpenDialog.mock.calls[0]?.[1]).toStrictEqual({
      defaultPath: NOTES_ROOT,
      filters: [{ name: 'Markdown', extensions: ['md'] }],
      properties: ['openFile']
    })
  })

  it('reads the notes folder when asked, not when the handlers were built', async () => {
    let root = '/first'
    const { handlers, showOpenDialog, helper } = setup({ notesRoot: () => root })

    await handlers.openNativeFile(undefined, ctx)
    root = '/second'
    await handlers.openNativeFile(undefined, ctx)

    expect(showOpenDialog.mock.calls.map((call) => call[1].defaultPath)).toEqual([
      '/first',
      '/second'
    ])
    expect(helper.mock.calls.map((call) => call[1])).toEqual(['/first', '/second'])
  })

  it.each([
    ['cancelled', { canceled: true, filePaths: ['/picked/a.md'] }],
    ['nothing selected', { canceled: false, filePaths: [] }]
  ])(
    'returns the stored state and touches nothing else when the picker was %s',
    async (_name, dialogResult) => {
      const { store, handlers, results, helper, refreshAppMenu, log } = setup({ dialogResult })

      await expect(handlers.openNativeFile(undefined, ctx)).resolves.toBe(results.publicState)

      expect(helper).not.toHaveBeenCalled()
      expect(refreshAppMenu).not.toHaveBeenCalled()
      expect(callsOf(store, 'openPickedFile')).toEqual([])
      expect(log).toEqual(['store.publicState'])
    }
  )

  it('turns the first picked file into a reference, opens it, refreshes the menu once and returns the state', async () => {
    const pickedFileRef = { externalPath: '/elsewhere/a.md' }
    const { store, handlers, results, helper, refreshAppMenu, log } = setup({
      dialogResult: { canceled: false, filePaths: ['/elsewhere/a.md', '/elsewhere/b.md'] },
      pickedFileRef
    })

    await expect(handlers.openNativeFile(undefined, ctx)).resolves.toBe(results.openPickedFile)

    expect(helper.mock.calls).toEqual([['/elsewhere/a.md', NOTES_ROOT]])
    expect(callsOf(store, 'openPickedFile')).toEqual([[pickedFileRef]])
    expect(refreshAppMenu).toHaveBeenCalledTimes(1)
    expect(log).toEqual(['store.openPickedFile', 'menu'])
    expectOnlyCalled(store, 'openPickedFile')
  })

  it('lets a refused file reach the renderer with its own message and changes nothing', async () => {
    const { store, handlers, refreshAppMenu } = setup({
      helper: async () => {
        throw new Error('Selected file must be a Markdown file')
      }
    })

    const failure = handlers.openNativeFile(undefined, ctx)

    await expect(failure).rejects.toThrow(
      expect.objectContaining({
        name: 'Error',
        message: 'Selected file must be a Markdown file'
      })
    )
    expect(callsOf(store, 'openPickedFile')).toEqual([])
    expect(refreshAppMenu).not.toHaveBeenCalled()
  })

  it('does not refresh the menu when opening the picked file fails', async () => {
    const { store, handlers, refreshAppMenu } = setup()
    vi.mocked(store.openPickedFile).mockRejectedValue(new Error('Workspace file not found'))

    await expect(handlers.openNativeFile(undefined, ctx)).rejects.toThrow(
      'Workspace file not found'
    )

    expect(refreshAppMenu).not.toHaveBeenCalled()
  })

  // Preload unwraps Electron's invocation error using the manifest channel (covered through the
  // renderer store test), so the helper must keep throwing a plain Error with this message.
  it('throws the real helper message as a plain Error for a file that is not Markdown', async () => {
    const dir = await realpath(await mkdtemp(join(tmpdir(), 'ryte-native-')))
    try {
      const picked = join(dir, 'a.txt')
      await writeFile(picked, 'x')
      const { handlers } = setup({
        dialogResult: { canceled: false, filePaths: [picked] },
        helper: fileRefForPickedMarkdownFile
      })

      let failure: unknown
      try {
        await handlers.openNativeFile(undefined, ctx)
      } catch (error) {
        failure = error
      }

      expect(failure).toBeInstanceOf(Error)
      expect(Object.getPrototypeOf(failure)).toBe(Error.prototype)
      expect((failure as Error).message).toBe('Selected file must be a Markdown file')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('workspace operations through the registrar', () => {
  function register(options?: SetupOptions): ReturnType<typeof setup> & {
    invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
    channels: string[]
  } {
    const made = setup(options)
    const registered = new Map<string, (event: { sender: never }, ...args: unknown[]) => unknown>()
    const ipc: IpcMainLike = {
      handle: (channel, listener) => void registered.set(channel, listener as never)
    }
    registerOperations(ipc, { workspace: contract.workspace }, { workspace: made.handlers })
    return {
      ...made,
      channels: [...registered.keys()],
      invoke: async (channel, ...args) => registered.get(channel)!({ sender }, ...args)
    }
  }

  it('registers the thirteen channels, the wire names unchanged, and not the window update', () => {
    expect(register().channels).toEqual([
      'workspace:get-state',
      'workspace:update-shell',
      'workspace:update-library',
      'workspace:focus-tab',
      'workspace:close-tab',
      'workspace:update-tab-view-mode',
      'workspace:set-outline-collapsed',
      'workspace:set-outline-width',
      'workspace:open-file',
      'workspace:open-recent-file',
      'workspace:open-native-file',
      'workspace:record-recent',
      'workspace:prune-missing-file-refs'
    ])
  })

  it('hands the store the normalized input, not the raw one', async () => {
    const { store, invoke } = register()

    await invoke('workspace:set-outline-collapsed', {
      sourcePath: './docs//a.md',
      collapsed: false
    })
    await invoke('workspace:update-library', { folderSortModes: { './docs': 'recency' } })
    await invoke('workspace:open-file', { sourcePath: './docs//a.md' })
    await invoke('workspace:record-recent', { sourcePath: './docs//b.md' })
    await invoke('workspace:open-recent-file', { sourcePath: './docs//c.md' })

    expect(callsOf(store, 'setOutlineCollapsed')).toEqual([
      [{ sourcePath: 'docs/a.md', collapsed: false }]
    ])
    expect(callsOf(store, 'updateLibrary')).toEqual([[{ folderSortModes: { docs: 'recency' } }]])
    expect(callsOf(store, 'openFile')).toEqual([[{ sourcePath: 'docs/a.md' }]])
    expect(callsOf(store, 'recordRecent')).toEqual([[{ sourcePath: 'docs/b.md' }]])
    expect(callsOf(store, 'openRecentFile')).toEqual([[{ sourcePath: 'docs/c.md' }]])
  })

  it('hands the store only the key that was set for a recent file', async () => {
    const { store, invoke } = register()

    await invoke('workspace:open-recent-file', { sourcePath: 'a.md', externalPath: undefined })
    await invoke('workspace:open-recent-file', { externalPath: '/tmp/a.md', sourcePath: undefined })

    const [first, second] = callsOf(store, 'openRecentFile').map(([input]) => input as object)
    expect(Object.keys(first!)).toEqual(['sourcePath'])
    expect(Object.keys(second!)).toEqual(['externalPath'])
  })

  it('never reaches the store or the menu with a rejected input', async () => {
    const { store, invoke, refreshAppMenu } = register()

    for (const [channel, input] of [
      ['workspace:focus-tab', { tabId: 'a\n' }],
      ['workspace:close-tab', { tabId: 'a', extra: 1 }],
      ['workspace:update-tab-view-mode', { tabId: 'a', viewMode: undefined }],
      ['workspace:update-shell', { sidebarWidth: 4001 }],
      ['workspace:update-library', { scrollTop: undefined }],
      ['workspace:set-outline-width', { width: 1000.5 }],
      ['workspace:get-state', {}],
      ['workspace:open-file', { sourcePath: '../a.md' }],
      ['workspace:open-file', { externalPath: '/tmp/a.md' }],
      ['workspace:open-file', { sourcePath: 'a.md', externalPath: undefined }],
      ['workspace:open-recent-file', {}],
      ['workspace:open-recent-file', { sourcePath: 'a.md', externalPath: '/tmp/a.md' }],
      ['workspace:open-recent-file', { externalPath: '/tmp/a.txt' }],
      ['workspace:record-recent', { sourcePath: 'a.md', title: 'A' }],
      ['workspace:record-recent', undefined],
      ['workspace:open-native-file', {}],
      ['workspace:prune-missing-file-refs', {}]
    ] as const) {
      await expect(invoke(channel, input), channel).rejects.toThrow(/^Invalid workspace\./)
    }

    for (const method of METHODS) expect(callsOf(store, method), method).toEqual([])
    expect(refreshAppMenu).not.toHaveBeenCalled()
  })

  it('takes the dialog window from the sender of the IPC call', async () => {
    const { invoke, windowFor, showOpenDialog } = register()

    await invoke('workspace:open-native-file')

    expect(windowFor).toHaveBeenCalledWith(sender)
    expect(showOpenDialog.mock.calls[0]?.[0]).toBe(askingWindow)
  })
})

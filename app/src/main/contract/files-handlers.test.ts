import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it, vi, type Mock } from 'vitest'

import { contract } from '../../contract'
import type { FileCatalogResponse } from '../../shared/files'
import type { WorkspaceFileRef } from '../../shared/workspace'
import { resolveExternalMarkdownFile } from '../picked-file'
import { readSourceFileSafe, readSourceTitleSafe } from '../viewer/file-reader'
import { createFilesHandlers, type FilesHandlerDependencies } from './files-handlers'
import { registerOperations, type IpcMainLike } from './register'

interface FakeWindow {
  id: string
}

type Deps = FilesHandlerDependencies<FakeWindow>
type Store = Deps['store']
type StoreMethod = keyof Store
type ShowMessageBox = Deps['showMessageBox']

const sender = { id: 'sender' } as never
const ctx = { sender }
const askingWindow: FakeWindow = { id: 'asking-window' }
const NOTES_ROOT = '/notes-root'
const RESOLVED = '/notes-root/docs/a.md'

const METHODS: StoreMethod[] = [
  'fileRefForTab',
  'resolveFilePath',
  'renameFile',
  'removeFileRef',
  'publicState'
]

interface SetupOptions {
  tabFileRef?: WorkspaceFileRef | null
  response?: number
  windowFor?: () => FakeWindow | null
  notesRoot?: () => string
  walked?: string[]
  catalog?: FileCatalogResponse
  overrides?: Partial<Deps>
}

/**
 * A fake store whose every method returns its own marker, so a handler that calls the wrong one is caught. Store
 * calls, the clipboard, Finder, the Trash and menu refreshes append to one log, so the tests can assert order.
 */
function setup(options: SetupOptions = {}): {
  store: Store
  handlers: ReturnType<typeof createFilesHandlers<FakeWindow>>
  results: Record<StoreMethod, unknown>
  log: string[]
  refreshAppMenu: Mock<() => void>
  showMessageBox: Mock<ShowMessageBox>
  windowFor: Mock<Deps['windowFor']>
  clipboard: { writeText: Mock<(text: string) => void> }
  shell: {
    showItemInFolder: Mock<(path: string) => void>
    trashItem: Mock<(path: string) => Promise<void>>
  }
  walkNotes: Mock<Deps['walkNotes']>
  listFileCatalog: Mock<Deps['listFileCatalog']>
  readTextFile: Mock<Deps['readTextFile']>
  readSourceFile: Mock<Deps['readSourceFile']>
  readSourceTitle: Mock<Deps['readSourceTitle']>
  resolveExternalMarkdownFile: Mock<Deps['resolveExternalMarkdownFile']>
} {
  const log: string[] = []
  const results = {} as Record<StoreMethod, unknown>
  const store = {} as Record<StoreMethod, ReturnType<typeof vi.fn>>
  for (const method of METHODS) {
    results[method] = { returnedBy: method }
    store[method] = vi.fn(() => {
      log.push(`store.${method}`)
      return results[method]
    })
  }
  // The store answers a path for a file reference and a reference for a tab, not a marker.
  results.resolveFilePath = RESOLVED
  store.resolveFilePath = vi.fn(async () => {
    log.push('store.resolveFilePath')
    return RESOLVED
  })
  store.fileRefForTab = vi.fn(() => {
    log.push('store.fileRefForTab')
    return options.tabFileRef === undefined ? { sourcePath: 'docs/a.md' } : options.tabFileRef
  })
  const typed = store as unknown as Store

  const refreshAppMenu = vi.fn<() => void>(() => void log.push('menu'))
  const showMessageBox = vi.fn<ShowMessageBox>(async () => {
    log.push('dialog')
    return { response: options.response ?? 0 }
  })
  const windowFor = vi.fn<Deps['windowFor']>(options.windowFor ?? (() => askingWindow))
  const clipboard = { writeText: vi.fn((text: string) => void log.push(`clipboard:${text}`)) }
  const shell = {
    showItemInFolder: vi.fn((path: string) => void log.push(`finder:${path}`)),
    trashItem: vi.fn(async (path: string) => void log.push(`trash:${path}`))
  }
  const walkNotes = vi.fn<Deps['walkNotes']>(async () => options.walked ?? [])
  const catalog = options.catalog ?? { notesRoot: NOTES_ROOT, files: [] }
  const listFileCatalog = vi.fn<Deps['listFileCatalog']>(async () => catalog)
  const readTextFile = vi.fn<Deps['readTextFile']>(async (path) => `text of ${path}`)
  const readSourceFile = vi.fn<Deps['readSourceFile']>(
    async (sourcePath) => `note text of ${sourcePath}`
  )
  const readSourceTitle = vi.fn<Deps['readSourceTitle']>(async () => 'A title')
  const resolveExternal = vi.fn<Deps['resolveExternalMarkdownFile']>(
    async (absPath) => `/real${absPath}`
  )

  const handlers = createFilesHandlers<FakeWindow>({
    store: typed,
    getNotesRoot: options.notesRoot ?? (() => NOTES_ROOT),
    walkNotes,
    listFileCatalog,
    readTextFile,
    readSourceFile,
    readSourceTitle,
    resolveExternalMarkdownFile: resolveExternal,
    clipboard,
    shell,
    windowFor,
    showMessageBox,
    refreshAppMenu,
    ...options.overrides
  })
  return {
    store: typed,
    handlers,
    results,
    log,
    refreshAppMenu,
    showMessageBox,
    windowFor,
    clipboard,
    shell,
    walkNotes,
    listFileCatalog,
    readTextFile,
    readSourceFile,
    readSourceTitle,
    resolveExternalMarkdownFile: resolveExternal
  }
}

const callsOf = (store: Store, method: StoreMethod): unknown[][] =>
  (store[method] as unknown as ReturnType<typeof vi.fn>).mock.calls

describe('list-tree and list-catalog', () => {
  it('returns the notes folder and the paths relative to it, sorted by code unit', async () => {
    const { handlers, walkNotes } = setup({
      walked: [
        `${NOTES_ROOT}/b/z.md`,
        `${NOTES_ROOT}/a.md`,
        `${NOTES_ROOT}/B.md`,
        `${NOTES_ROOT}/b/a.md`
      ]
    })

    await expect(handlers.listTree(undefined, ctx)).resolves.toStrictEqual({
      notesRoot: NOTES_ROOT,
      paths: ['B.md', 'a.md', 'b/a.md', 'b/z.md']
    })
    expect(walkNotes).toHaveBeenCalledWith(NOTES_ROOT)
  })

  it('reads the notes folder when asked, not when the handlers were built', async () => {
    let root = '/first'
    const { handlers, walkNotes, listFileCatalog } = setup({ notesRoot: () => root })

    await handlers.listTree(undefined, ctx)
    await handlers.listCatalog(undefined, ctx)
    root = '/second'
    await handlers.listTree(undefined, ctx)
    await handlers.listCatalog(undefined, ctx)

    expect(walkNotes.mock.calls.map((call) => call[0])).toEqual(['/first', '/second'])
    expect(listFileCatalog.mock.calls.map((call) => call[0])).toEqual(['/first', '/second'])
  })

  it('returns the catalog as the lister built it', async () => {
    const catalog: FileCatalogResponse = { notesRoot: NOTES_ROOT, files: [] }
    const { handlers, listFileCatalog } = setup({ catalog })

    await expect(handlers.listCatalog(undefined, ctx)).resolves.toBe(catalog)
    expect(listFileCatalog).toHaveBeenCalledWith(NOTES_ROOT)
  })
})

describe('read-source-title', () => {
  it('reads the title of the note through the root-checked reader and returns it', async () => {
    const { handlers, readSourceTitle, readTextFile } = setup()

    await expect(handlers.readSourceTitle({ sourcePath: 'docs/a.md' }, ctx)).resolves.toBe(
      'A title'
    )

    expect(readSourceTitle.mock.calls).toEqual([['docs/a.md', NOTES_ROOT]])
    expect(readTextFile).not.toHaveBeenCalled()
  })

  it('keeps a missing title as null, not an empty string', async () => {
    const { handlers } = setup({ overrides: { readSourceTitle: async () => null } })

    await expect(handlers.readSourceTitle({ sourcePath: 'docs/a.md' }, ctx)).resolves.toBeNull()
  })

  it('lets a refusal from the reader reach the caller', async () => {
    const { handlers } = setup({
      overrides: {
        readSourceTitle: async () => {
          throw new Error('path outside notes root: /x')
        }
      }
    })

    await expect(handlers.readSourceTitle({ sourcePath: 'a.md' }, ctx)).rejects.toThrow(
      'path outside notes root'
    )
  })
})

describe('read-workspace-tab', () => {
  it('throws when no tab has that id, and reads nothing', async () => {
    const { handlers, store, readSourceFile, readTextFile, resolveExternalMarkdownFile } = setup({
      tabFileRef: null
    })

    await expect(handlers.readWorkspaceTab({ tabId: 'gone' }, ctx)).rejects.toThrow(
      'Workspace tab not found'
    )

    expect(callsOf(store, 'fileRefForTab')).toEqual([['gone']])
    expect(readSourceFile).not.toHaveBeenCalled()
    expect(readTextFile).not.toHaveBeenCalled()
    expect(resolveExternalMarkdownFile).not.toHaveBeenCalled()
  })

  it('reads a note through the root-checked reader with the notes folder', async () => {
    const { handlers, readSourceFile, readTextFile, resolveExternalMarkdownFile } = setup({
      tabFileRef: { sourcePath: 'docs/a.md' }
    })

    await expect(handlers.readWorkspaceTab({ tabId: 't1' }, ctx)).resolves.toBe(
      'note text of docs/a.md'
    )

    expect(readSourceFile.mock.calls).toEqual([['docs/a.md', NOTES_ROOT]])
    expect(readTextFile).not.toHaveBeenCalled()
    expect(resolveExternalMarkdownFile).not.toHaveBeenCalled()
  })

  it('reads a file from outside the notes folder by its resolved path, without the root check', async () => {
    const { handlers, readSourceFile, readTextFile, resolveExternalMarkdownFile } = setup({
      tabFileRef: { externalPath: '/elsewhere/a.md' }
    })

    await expect(handlers.readWorkspaceTab({ tabId: 't1' }, ctx)).resolves.toBe(
      'text of /real/elsewhere/a.md'
    )

    expect(resolveExternalMarkdownFile.mock.calls).toEqual([['/elsewhere/a.md']])
    expect(readTextFile.mock.calls).toEqual([['/real/elsewhere/a.md']])
    expect(readSourceFile).not.toHaveBeenCalled()
  })

  it('reads the notes folder when asked', async () => {
    let root = '/first'
    const { handlers, readSourceFile } = setup({ notesRoot: () => root })

    await handlers.readWorkspaceTab({ tabId: 't1' }, ctx)
    root = '/second'
    await handlers.readWorkspaceTab({ tabId: 't1' }, ctx)

    expect(readSourceFile.mock.calls.map((call) => call[1])).toEqual(['/first', '/second'])
  })
})

describe('copy-content, copy-path and show-in-finder', () => {
  const file = { sourcePath: 'docs/a.md' }

  it('copies the text of the resolved file to the clipboard, and nothing else', async () => {
    const { handlers, store, clipboard, readTextFile, shell, log } = setup()

    await expect(handlers.copyContent(file, ctx)).resolves.toBeUndefined()

    expect(callsOf(store, 'resolveFilePath')).toEqual([[file]])
    expect(readTextFile.mock.calls).toEqual([[RESOLVED]])
    expect(clipboard.writeText.mock.calls).toEqual([[`text of ${RESOLVED}`]])
    expect(shell.showItemInFolder).not.toHaveBeenCalled()
    expect(log).toEqual(['store.resolveFilePath', `clipboard:text of ${RESOLVED}`])
  })

  it('copies the path, not the text, and does not read the file', async () => {
    const { handlers, store, clipboard, readTextFile } = setup()

    await expect(handlers.copyPath({ externalPath: '/tmp/a.md' }, ctx)).resolves.toBeUndefined()

    expect(callsOf(store, 'resolveFilePath')).toEqual([[{ externalPath: '/tmp/a.md' }]])
    expect(clipboard.writeText.mock.calls).toEqual([[RESOLVED]])
    expect(readTextFile).not.toHaveBeenCalled()
  })

  it('reveals the resolved path in Finder once, and copies nothing', async () => {
    const { handlers, store, shell, clipboard } = setup()

    await expect(handlers.showInFinder(file, ctx)).resolves.toBeUndefined()

    expect(callsOf(store, 'resolveFilePath')).toEqual([[file]])
    expect(shell.showItemInFolder.mock.calls).toEqual([[RESOLVED]])
    expect(clipboard.writeText).not.toHaveBeenCalled()
    expect(shell.trashItem).not.toHaveBeenCalled()
  })

  it('does nothing when the file cannot be resolved', async () => {
    const { handlers, store, clipboard, shell } = setup()
    vi.mocked(store.resolveFilePath).mockRejectedValue(new Error('Workspace file not found: x'))

    await expect(handlers.copyContent(file, ctx)).rejects.toThrow('Workspace file not found')
    await expect(handlers.copyPath(file, ctx)).rejects.toThrow('Workspace file not found')
    await expect(handlers.showInFinder(file, ctx)).rejects.toThrow('Workspace file not found')

    expect(clipboard.writeText).not.toHaveBeenCalled()
    expect(shell.showItemInFolder).not.toHaveBeenCalled()
  })
})

describe('rename', () => {
  const input = { sourcePath: 'docs/a.md', name: 'b.md' }

  it('renames through the store, refreshes the menu once after it, and returns the result', async () => {
    const { handlers, store, results, refreshAppMenu, log } = setup()

    await expect(handlers.rename(input, ctx)).resolves.toBe(results.renameFile)

    expect(callsOf(store, 'renameFile')).toEqual([[input]])
    expect(refreshAppMenu).toHaveBeenCalledTimes(1)
    expect(log).toEqual(['store.renameFile', 'menu'])
  })

  it('leaves the menu alone when the store refuses', async () => {
    const { handlers, store, refreshAppMenu } = setup()
    vi.mocked(store.renameFile).mockRejectedValue(new Error('A file with that name already exists'))

    await expect(handlers.rename(input, ctx)).rejects.toThrow('already exists')

    expect(refreshAppMenu).not.toHaveBeenCalled()
  })
})

describe('move-to-trash', () => {
  const file = { sourcePath: 'docs/a.md' }

  it('asks over the window of the asking page, with the exact options', async () => {
    const { handlers, showMessageBox, windowFor } = setup({ response: 1 })

    await handlers.moveToTrash(file, ctx)

    expect(windowFor).toHaveBeenCalledWith(sender)
    expect(showMessageBox).toHaveBeenCalledTimes(1)
    expect(showMessageBox.mock.calls[0]?.[0]).toBe(askingWindow)
    expect(showMessageBox.mock.calls[0]?.[1]).toStrictEqual({
      type: 'warning',
      buttons: ['Move to Trash', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
      message: 'Move "a.md" to Trash?',
      detail: 'The file can be recovered from the Trash.'
    })
  })

  it('asks without a parent window when the page has none', async () => {
    const { handlers, showMessageBox } = setup({ response: 1, windowFor: () => null })

    await handlers.moveToTrash(file, ctx)

    expect(showMessageBox.mock.calls[0]?.[0]).toBeNull()
  })

  it('names the file in the question by its resolved path', async () => {
    const { handlers, showMessageBox, store } = setup({ response: 1 })
    vi.mocked(store.resolveFilePath).mockResolvedValue('/elsewhere/My Note.md')

    await handlers.moveToTrash({ externalPath: '/tmp/x.md' }, ctx)

    expect(showMessageBox.mock.calls[0]?.[1].message).toBe('Move "My Note.md" to Trash?')
  })

  it('declining trashes nothing, changes nothing, refreshes nothing, and returns the stored state', async () => {
    const { handlers, store, results, shell, refreshAppMenu, log } = setup({ response: 1 })

    await expect(handlers.moveToTrash(file, ctx)).resolves.toStrictEqual({
      trashed: false,
      workspace: results.publicState
    })

    expect(shell.trashItem).not.toHaveBeenCalled()
    expect(callsOf(store, 'removeFileRef')).toEqual([])
    expect(refreshAppMenu).not.toHaveBeenCalled()
    expect(log).toEqual(['store.resolveFilePath', 'dialog', 'store.publicState'])
  })

  it('confirming trashes the file, then drops it from the store, then refreshes the menu once', async () => {
    const { handlers, store, results, shell, refreshAppMenu, log } = setup({ response: 0 })

    await expect(handlers.moveToTrash(file, ctx)).resolves.toStrictEqual({
      trashed: true,
      workspace: results.removeFileRef
    })

    expect(shell.trashItem.mock.calls).toEqual([[RESOLVED]])
    expect(callsOf(store, 'removeFileRef')).toEqual([[file]])
    expect(refreshAppMenu).toHaveBeenCalledTimes(1)
    expect(log).toEqual([
      'store.resolveFilePath',
      'dialog',
      `trash:${RESOLVED}`,
      'store.removeFileRef',
      'menu'
    ])
  })

  it('does not ask when the file cannot be resolved', async () => {
    const { handlers, store, showMessageBox, shell } = setup()
    vi.mocked(store.resolveFilePath).mockRejectedValue(new Error('Workspace file not found: x'))

    await expect(handlers.moveToTrash(file, ctx)).rejects.toThrow('Workspace file not found')

    expect(showMessageBox).not.toHaveBeenCalled()
    expect(shell.trashItem).not.toHaveBeenCalled()
  })

  it('leaves the store and the menu alone when the Trash refuses the file', async () => {
    const { handlers, store, shell, refreshAppMenu } = setup({ response: 0 })
    shell.trashItem.mockRejectedValue(new Error('Could not move to the Trash'))

    await expect(handlers.moveToTrash(file, ctx)).rejects.toThrow('Could not move to the Trash')

    expect(callsOf(store, 'removeFileRef')).toEqual([])
    expect(refreshAppMenu).not.toHaveBeenCalled()
  })

  it('trashes nothing when the dialog fails', async () => {
    const { handlers, showMessageBox, shell, refreshAppMenu } = setup()
    showMessageBox.mockRejectedValue(new Error('dialog failed'))

    await expect(handlers.moveToTrash(file, ctx)).rejects.toThrow('dialog failed')

    expect(shell.trashItem).not.toHaveBeenCalled()
    expect(refreshAppMenu).not.toHaveBeenCalled()
  })
})

// Real files, real symlinks and the real readers: the notes-root check is the reader's, and the handlers have to
// keep going through it.
describe('the notes-root check with real files', () => {
  async function withNotes(
    run: (paths: { root: string; outside: string }) => Promise<void>
  ): Promise<void> {
    const base = await realpath(await mkdtemp(join(tmpdir(), 'ryte-files-')))
    try {
      const root = join(base, 'notes')
      const outside = join(base, 'outside')
      await mkdir(join(root, 'docs'), { recursive: true })
      await mkdir(outside)
      // A sibling whose name starts with the notes folder's name, to catch a prefix test without a separator.
      await mkdir(join(base, 'notes-evil'))
      await writeFile(join(root, 'docs', 'a.md'), '# Inside\n')
      await writeFile(join(outside, 'secret.md'), '# Secret\n')
      await writeFile(join(base, 'notes-evil', 'secret.md'), '# Evil\n')
      await symlink(join(outside, 'secret.md'), join(root, 'docs', 'leak.md'))
      await symlink(join(base, 'notes-evil', 'secret.md'), join(root, 'docs', 'evil.md'))
      await run({ root, outside })
    } finally {
      await rm(base, { recursive: true, force: true })
    }
  }

  const realHandlers = (
    root: string,
    tabFileRef: WorkspaceFileRef | null
  ): ReturnType<typeof setup>['handlers'] =>
    setup({
      tabFileRef,
      notesRoot: () => root,
      overrides: {
        readSourceFile: readSourceFileSafe,
        readSourceTitle: readSourceTitleSafe,
        resolveExternalMarkdownFile,
        readTextFile: (path) => readFile(path, 'utf8')
      }
    }).handlers

  it('reads a note inside the notes folder, its title and its text', async () => {
    await withNotes(async ({ root }) => {
      const handlers = realHandlers(root, { sourcePath: 'docs/a.md' })

      await expect(handlers.readSourceTitle({ sourcePath: 'docs/a.md' }, ctx)).resolves.toBe(
        'Inside'
      )
      await expect(handlers.readWorkspaceTab({ tabId: 't1' }, ctx)).resolves.toBe('# Inside\n')
    })
  })

  it.each(['docs/leak.md', 'docs/evil.md'])(
    'refuses %s, a symlink that leaves the notes folder, for the title and for a tab',
    async (sourcePath) => {
      await withNotes(async ({ root }) => {
        const handlers = realHandlers(root, { sourcePath })

        await expect(handlers.readSourceTitle({ sourcePath }, ctx)).rejects.toThrow(
          /^path outside notes root: /
        )
        await expect(handlers.readWorkspaceTab({ tabId: 't1' }, ctx)).rejects.toThrow(
          /^path outside notes root: /
        )
      })
    }
  )

  it('reads a file opened from outside the notes folder, which is not held to the root', async () => {
    await withNotes(async ({ root, outside }) => {
      const handlers = realHandlers(root, { externalPath: join(outside, 'secret.md') })

      await expect(handlers.readWorkspaceTab({ tabId: 't1' }, ctx)).resolves.toBe('# Secret\n')
    })
  })

  it('still refuses an external file that is not Markdown', async () => {
    await withNotes(async ({ root, outside }) => {
      await writeFile(join(outside, 'x.txt'), 'x')
      const handlers = realHandlers(root, { externalPath: join(outside, 'x.txt') })

      await expect(handlers.readWorkspaceTab({ tabId: 't1' }, ctx)).rejects.toThrow(
        'Selected file must be a Markdown file'
      )
    })
  })
})

describe('files operations through the registrar', () => {
  function register(options?: SetupOptions): ReturnType<typeof setup> & {
    invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
    channels: string[]
  } {
    const made = setup(options)
    const registered = new Map<string, (event: { sender: never }, ...args: unknown[]) => unknown>()
    const ipc: IpcMainLike = {
      handle: (channel, listener) => void registered.set(channel, listener as never)
    }
    // The two watch operations have their own handlers and tests (`files-watch.test.ts`).
    const { operations, events } = contract.files
    const statelessFiles = {
      name: contract.files.name,
      operations: {
        listTree: operations.listTree,
        listCatalog: operations.listCatalog,
        readSourceTitle: operations.readSourceTitle,
        readWorkspaceTab: operations.readWorkspaceTab,
        copyContent: operations.copyContent,
        copyPath: operations.copyPath,
        showInFinder: operations.showInFinder,
        rename: operations.rename,
        moveToTrash: operations.moveToTrash
      },
      events
    }
    registerOperations(ipc, { files: statelessFiles }, { files: made.handlers })
    return {
      ...made,
      channels: [...registered.keys()],
      invoke: async (channel, ...args) => registered.get(channel)!({ sender }, ...args)
    }
  }

  it('registers the nine channels, the wire names unchanged, and not read or read-source', () => {
    expect(register().channels).toEqual([
      'files:list-tree',
      'files:list-catalog',
      'files:read-source-title',
      'files:read-workspace-tab',
      'files:copy-content',
      'files:copy-path',
      'files:show-in-finder',
      'files:rename',
      'files:move-to-trash'
    ])
  })

  it('hands the handlers the normalized input, with only the key that was set', async () => {
    const { store, invoke, readSourceTitle } = register()

    await invoke('files:copy-path', { sourcePath: './docs//a.md', externalPath: undefined })
    await invoke('files:rename', {
      externalPath: '/tmp/x.md',
      sourcePath: undefined,
      name: 'b.MD'
    })
    await invoke('files:read-source-title', { sourcePath: './docs//a.md' })

    expect(callsOf(store, 'resolveFilePath')).toEqual([[{ sourcePath: 'docs/a.md' }]])
    expect(callsOf(store, 'renameFile')).toEqual([[{ externalPath: '/tmp/x.md', name: 'b.MD' }]])
    expect(Object.keys(callsOf(store, 'renameFile')[0]![0] as object)).toEqual([
      'externalPath',
      'name'
    ])
    expect(readSourceTitle.mock.calls).toEqual([['docs/a.md', NOTES_ROOT]])
  })

  it('never reaches the store, the clipboard, Finder, the Trash or the menu with a rejected input', async () => {
    const { store, invoke, clipboard, shell, showMessageBox, refreshAppMenu, readSourceTitle } =
      register()

    for (const [channel, input] of [
      ['files:copy-content', {}],
      ['files:copy-content', { sourcePath: 'a.md', externalPath: '/tmp/a.md' }],
      ['files:copy-path', { sourcePath: '../a.md' }],
      ['files:show-in-finder', { externalPath: '/tmp/a.txt' }],
      ['files:show-in-finder', undefined],
      ['files:move-to-trash', { sourcePath: 'a.md', extra: 1 }],
      ['files:move-to-trash', { externalPath: 'relative.md' }],
      ['files:rename', { sourcePath: 'a.md', name: '../b.md' }],
      ['files:rename', { sourcePath: 'a.md', name: 'b.txt' }],
      ['files:rename', { sourcePath: 'a.md' }],
      ['files:rename', { name: 'b.md' }],
      ['files:read-source-title', { externalPath: '/tmp/a.md' }],
      ['files:read-source-title', { sourcePath: '/etc/a.md' }],
      ['files:read-workspace-tab', { tabId: 'a\n' }],
      ['files:read-workspace-tab', { tabId: 'a', extra: 1 }],
      ['files:list-tree', {}],
      ['files:list-catalog', {}]
    ] as const) {
      await expect(invoke(channel, input), channel).rejects.toThrow(/^Invalid files\./)
    }

    for (const method of METHODS) expect(callsOf(store, method), method).toEqual([])
    expect(clipboard.writeText).not.toHaveBeenCalled()
    expect(shell.showItemInFolder).not.toHaveBeenCalled()
    expect(shell.trashItem).not.toHaveBeenCalled()
    expect(showMessageBox).not.toHaveBeenCalled()
    expect(refreshAppMenu).not.toHaveBeenCalled()
    expect(readSourceTitle).not.toHaveBeenCalled()
  })

  it('takes the dialog window from the sender of the IPC call', async () => {
    const { invoke, windowFor, showMessageBox } = register({ response: 1 })

    await invoke('files:move-to-trash', { sourcePath: 'docs/a.md' })

    expect(windowFor).toHaveBeenCalledWith(sender)
    expect(showMessageBox.mock.calls[0]?.[0]).toBe(askingWindow)
  })
})

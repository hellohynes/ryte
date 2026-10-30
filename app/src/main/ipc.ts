import { randomUUID } from 'node:crypto'
import { readFile, realpath, stat } from 'node:fs/promises'
import { basename, extname, relative, resolve, sep } from 'node:path'

import { app, BrowserWindow, clipboard, dialog, ipcMain, shell, type WebContents } from 'electron'

import { refreshAppMenu } from './app-menu'
import { applyColorMode } from './appearance'
import { createEmitter, registerOperations } from './contract/register'
import { createTaskHandlers } from './contract/tasks-handlers'
import { contract } from '../contract'
import { taskFactsService } from './facts/task-facts-service'
import { indexerService } from './indexing/indexer-service'
import { walkNotes } from './indexing/walker'
import { watcher } from './indexing/watcher'
import {
  assertValidAbsolutePath,
  assertValidFileRenameInput,
  assertValidProviderId,
  assertValidRequestId,
  assertValidSearchSnapshotFreshnessInput,
  assertValidSearchOptions,
  assertValidSearchQuery,
  assertValidSourceFileInput,
  assertValidSettingsPatch,
  assertValidWorkspaceCloseTabInput,
  assertValidWorkspaceFileRefInput,
  assertValidWorkspaceFocusTabInput,
  assertValidWorkspaceLibraryPatch,
  assertValidWorkspaceOpenFileInput,
  assertValidWorkspaceOpenRecentFileInput,
  assertValidWorkspaceRecordRecentInput,
  assertValidWorkspaceSetOutlineCollapsedInput,
  assertValidWorkspaceSetOutlineWidthInput,
  assertValidWorkspaceShellPatch,
  assertValidWorkspaceTabFileInput,
  assertValidWorkspaceUpdateTabViewModeInput,
  assertValidWorkspaceWindowPatch
} from './ipc-validation'
import { SearchService } from './search/search-service'
import { settingsStore, type SettingsFile, type SettingsUpdate } from './settings/settings-store'
import { listAuthorizedOpenAIModels, validateProviderKey } from './settings/key-validation'
import {
  readFileSafe,
  readSourceFileSafe,
  readSourceTitleSafe,
  resolveSourcePathUnderRoot
} from './viewer/file-reader'
import { fileCatalogEntryFor, listFileCatalog } from './viewer/file-catalog'
import { sourcePathForViewerChange } from './viewer/source-change-path'
import { viewerWatcher } from './viewer/viewer-watcher'
import { workspaceStore } from './workspace/workspace-store'
import { type FileCatalogChangeEvent } from '../shared/files'
import { isWorkspaceSourceFileRef, type WorkspaceFileRef } from '../shared/workspace'

let searchService: SearchService | null = null
let watchedViewerSourcePath: string | null = null
let watchedViewerTabId: string | null = null

interface ActiveSearchRequest {
  owner: WebContents
  service: SearchService
  onOwnerDestroyed: () => void
}

const activeSearchRequests = new Map<string, ActiveSearchRequest>()

function clearActiveSearchRequest(requestId: string): void {
  const activeRequest = activeSearchRequests.get(requestId)
  if (!activeRequest) return
  activeRequest.owner.removeListener('destroyed', activeRequest.onOwnerDestroyed)
  activeSearchRequests.delete(requestId)
}

function cancelActiveSearchRequest(requestId: string): void {
  const activeRequest = activeSearchRequests.get(requestId)
  if (!activeRequest) return
  activeRequest.service.cancel(requestId)
  clearActiveSearchRequest(requestId)
}

function cancelAllActiveSearchRequests(): void {
  for (const requestId of [...activeSearchRequests.keys()]) {
    cancelActiveSearchRequest(requestId)
  }
}

function registerActiveSearchRequest(
  requestId: string,
  owner: WebContents,
  service: SearchService
): void {
  const onOwnerDestroyed = (): void => cancelActiveSearchRequest(requestId)
  activeSearchRequests.set(requestId, { owner, service, onOwnerDestroyed })
  owner.once('destroyed', onOwnerDestroyed)
}

function sendSearchEvent(
  requestId: string,
  channel: string,
  payload: Record<string, unknown>
): void {
  const activeRequest = activeSearchRequests.get(requestId)
  if (!activeRequest) return
  if (activeRequest.owner.isDestroyed()) {
    cancelActiveSearchRequest(requestId)
    return
  }
  activeRequest.owner.send(channel, payload)
}

async function resolveExternalMarkdownFile(absPath: string): Promise<string> {
  const safePath = await realpath(resolve(absPath))
  if (extname(safePath).toLowerCase() !== '.md') {
    throw new Error('Selected file must be a Markdown file')
  }

  const fileStat = await stat(safePath)
  if (!fileStat.isFile()) throw new Error(`Workspace file not found: ${absPath}`)
  return safePath
}

async function fileRefForPickedMarkdownFile(
  absPath: string,
  notesRoot: string
): Promise<WorkspaceFileRef> {
  const safePath = await resolveExternalMarkdownFile(absPath)
  const resolvedRoot = await realpath(resolve(notesRoot))
  if (safePath === resolvedRoot || safePath.startsWith(resolvedRoot + sep)) {
    return { sourcePath: relative(resolvedRoot, safePath).split(sep).join('/') }
  }
  return { externalPath: safePath }
}

async function fileRefForWorkspaceTab(tabId: string): Promise<WorkspaceFileRef> {
  const fileRef = workspaceStore.fileRefForTab(tabId)
  if (!fileRef) throw new Error('Workspace tab not found')
  if (isWorkspaceSourceFileRef(fileRef)) return fileRef
  return { externalPath: await resolveExternalMarkdownFile(fileRef.externalPath) }
}

async function readWorkspaceTabFile(tabId: string, notesRoot: string): Promise<string> {
  const fileRef = await fileRefForWorkspaceTab(tabId)
  if (isWorkspaceSourceFileRef(fileRef)) {
    return readSourceFileSafe(fileRef.sourcePath, notesRoot)
  }
  return readFile(fileRef.externalPath, 'utf8')
}

function settingsPatchRequiresIndexerRestart(
  patch: SettingsUpdate,
  before: SettingsFile,
  after: SettingsFile
): boolean {
  return (
    before.notesRoot !== after.notesRoot ||
    patch.openaiKey !== undefined ||
    patch.deleteProviderKeys?.includes('openai') === true ||
    before.semanticIndexEnabled !== after.semanticIndexEnabled ||
    before.embeddingProvider !== after.embeddingProvider ||
    before.embeddingModel !== after.embeddingModel
  )
}

function getOrCreateSearchService(): SearchService | null {
  const vs = indexerService.getVectorStore()
  if (!vs) return null
  if (!searchService) {
    searchService = new SearchService(indexerService, vs, settingsStore)
  }
  return searchService
}

const emit = createEmitter(() => BrowserWindow.getAllWindows())

/**
 * Register all IPC handlers once during app.whenReady(). Search and indexing
 * handlers preserve their not-ready responses while the index initializes
 * after the first window is visible.
 */
export function registerIpc(): void {
  ipcMain.handle('app:get-version', () => app.getVersion())

  ipcMain.handle('settings:get-state', () => settingsStore.publicState())

  ipcMain.handle('workspace:get-state', () => workspaceStore.publicState())

  ipcMain.handle('workspace:update-shell', (_event, patch: unknown) => {
    return workspaceStore.updateShell(assertValidWorkspaceShellPatch(patch))
  })

  ipcMain.handle('workspace:update-window', (_event, patch: unknown) => {
    return workspaceStore.updateWindow(assertValidWorkspaceWindowPatch(patch))
  })

  ipcMain.handle('workspace:update-library', (_event, patch: unknown) => {
    return workspaceStore.updateLibrary(assertValidWorkspaceLibraryPatch(patch))
  })

  ipcMain.handle('workspace:open-file', async (_event, input: unknown) => {
    const next = await workspaceStore.openFile(assertValidWorkspaceOpenFileInput(input))
    refreshAppMenu()
    return next
  })

  ipcMain.handle('workspace:open-recent-file', async (_event, input: unknown) => {
    const next = await workspaceStore.openRecentFile(assertValidWorkspaceOpenRecentFileInput(input))
    refreshAppMenu()
    return next
  })

  ipcMain.handle('workspace:open-native-file', async (event) => {
    const notesRoot = settingsStore.load().notesRoot
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = win
      ? await dialog.showOpenDialog(win, {
          defaultPath: notesRoot,
          filters: [{ name: 'Markdown', extensions: ['md'] }],
          properties: ['openFile']
        })
      : await dialog.showOpenDialog({
          defaultPath: notesRoot,
          filters: [{ name: 'Markdown', extensions: ['md'] }],
          properties: ['openFile']
        })
    if (result.canceled || result.filePaths.length === 0) return workspaceStore.publicState()

    const fileRef = await fileRefForPickedMarkdownFile(result.filePaths[0]!, notesRoot)
    const next = await workspaceStore.openPickedFile(fileRef)
    refreshAppMenu()
    return next
  })

  ipcMain.handle('workspace:focus-tab', (_event, input: unknown) => {
    return workspaceStore.focusTab(assertValidWorkspaceFocusTabInput(input))
  })

  ipcMain.handle('workspace:close-tab', (_event, input: unknown) => {
    return workspaceStore.closeTab(assertValidWorkspaceCloseTabInput(input))
  })

  ipcMain.handle('workspace:update-tab-view-mode', (_event, input: unknown) => {
    return workspaceStore.updateTabViewMode(assertValidWorkspaceUpdateTabViewModeInput(input))
  })

  ipcMain.handle('workspace:record-recent', async (_event, input: unknown) => {
    const next = await workspaceStore.recordRecent(assertValidWorkspaceRecordRecentInput(input))
    refreshAppMenu()
    return next
  })

  ipcMain.handle('workspace:set-outline-collapsed', (_event, input: unknown) => {
    return workspaceStore.setOutlineCollapsed(assertValidWorkspaceSetOutlineCollapsedInput(input))
  })

  ipcMain.handle('workspace:set-outline-width', (_event, input: unknown) => {
    return workspaceStore.setOutlineWidth(assertValidWorkspaceSetOutlineWidthInput(input))
  })

  ipcMain.handle('workspace:prune-missing-file-refs', async () => {
    const next = await workspaceStore.pruneMissingFileRefs()
    refreshAppMenu()
    return next
  })

  ipcMain.handle('settings:save', async (_, patch: unknown) => {
    const validatedPatch = assertValidSettingsPatch(patch)
    const previousSettings = settingsStore.load()
    const next = settingsStore.update(validatedPatch)
    if (validatedPatch.colorMode !== undefined) applyColorMode(validatedPatch.colorMode)
    if (
      settingsPatchRequiresIndexerRestart(validatedPatch, previousSettings, settingsStore.load())
    ) {
      // Re-init indexer and restart watcher so new notesRoot / embedding settings take effect.
      await watcher.stop()
      cancelAllActiveSearchRequests()
      indexerService.close()
      searchService = null // vectorStore is replaced; recreate on next search
      const ready = indexerService.init()
      if (ready) {
        watcher.start(settingsStore.load().notesRoot)
      }
    }
    return next
  })

  ipcMain.handle('settings:validate-key', async (_, provider: unknown) => {
    const validProvider = assertValidProviderId(provider)
    const apiKey = settingsStore.getSecret(validProvider)
    if (!apiKey) {
      return {
        ok: false,
        provider: validProvider,
        validatedAt: null,
        error: 'No saved API key to validate.'
      }
    }
    const result = await validateProviderKey(validProvider, apiKey)
    if (result.ok && result.validatedAt) {
      settingsStore.markKeyValidated(validProvider, result.validatedAt)
    }
    return result
  })

  ipcMain.handle('settings:list-models', async (_, provider: unknown) => {
    const validProvider = assertValidProviderId(provider)
    if (validProvider !== 'openai')
      throw new Error('Model discovery is not available for this provider')
    const apiKey = settingsStore.getSecret(validProvider)
    if (!apiKey) throw new Error('No saved API key to list models')
    const models = await listAuthorizedOpenAIModels(apiKey)
    // The list belongs to the key that fetched it. If the key was replaced or removed while the
    // request ran, the list is for a key that is gone: say so rather than hand it back as current.
    if (settingsStore.getSecret(validProvider) !== apiKey) {
      throw new Error('Your API key changed while the models were loading. Refresh again.')
    }
    try {
      settingsStore.recordDiscoveredOpenAIModels(models)
    } catch {
      // Not remembering the list is no reason to lose what was just fetched; the pane notices that
      // it was not saved.
    }
    return models
  })

  ipcMain.handle('dialog:open-folder', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = win
      ? await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('dialog:open-file', async (event) => {
    const notesRoot = settingsStore.load().notesRoot
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = win
      ? await dialog.showOpenDialog(win, {
          defaultPath: notesRoot,
          filters: [{ name: 'Markdown', extensions: ['md'] }],
          properties: ['openFile']
        })
      : await dialog.showOpenDialog({
          defaultPath: notesRoot,
          filters: [{ name: 'Markdown', extensions: ['md'] }],
          properties: ['openFile']
        })
    if (result.canceled || result.filePaths.length === 0) return null

    return fileRefForPickedMarkdownFile(result.filePaths[0]!, notesRoot)
  })

  ipcMain.handle('indexer:get-status', () => indexerService.getStatus())

  ipcMain.handle('indexer:trigger-reindex', () => {
    // Fire-and-forget. Renderer subscribes via indexer:status-event for progress.
    void indexerService.triggerReindex()
  })

  ipcMain.handle('indexer:clear-and-rebuild', async () => {
    await indexerService.clearAndRebuild(() => {
      // A search still running would read from the store while it is emptied. This runs only once
      // the rebuild is certain, so a refused or failed rebuild never kills the user's search.
      cancelAllActiveSearchRequests()
      searchService = null
    })
  })

  // Push status events to all renderer windows.
  indexerService.subscribe((status) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('indexer:status-event', status)
    }
  })

  ipcMain.handle('files:list-tree', async () => {
    const notesRoot = settingsStore.load().notesRoot
    const absolutePaths = await walkNotes(notesRoot)
    const paths = absolutePaths.map((p) => relative(notesRoot, p)).sort()
    return { notesRoot, paths }
  })

  ipcMain.handle('files:list-catalog', async () => {
    const notesRoot = settingsStore.load().notesRoot
    return listFileCatalog(notesRoot)
  })

  ipcMain.handle('files:copy-content', async (_event, input: unknown) => {
    const file = assertValidWorkspaceFileRefInput(input)
    const path = await workspaceStore.resolveFilePath(file)
    clipboard.writeText(await readFile(path, 'utf8'))
  })

  ipcMain.handle('files:copy-path', async (_event, input: unknown) => {
    const file = assertValidWorkspaceFileRefInput(input)
    clipboard.writeText(await workspaceStore.resolveFilePath(file))
  })

  ipcMain.handle('files:show-in-finder', async (_event, input: unknown) => {
    const file = assertValidWorkspaceFileRefInput(input)
    shell.showItemInFolder(await workspaceStore.resolveFilePath(file))
  })

  ipcMain.handle('files:rename', async (_event, input: unknown) => {
    const result = await workspaceStore.renameFile(assertValidFileRenameInput(input))
    refreshAppMenu()
    return result
  })

  ipcMain.handle('files:move-to-trash', async (event, input: unknown) => {
    const file = assertValidWorkspaceFileRefInput(input)
    const path = await workspaceStore.resolveFilePath(file)
    const options = {
      type: 'warning' as const,
      buttons: ['Move to Trash', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
      message: `Move "${basename(path)}" to Trash?`,
      detail: 'The file can be recovered from the Trash.'
    }
    const win = BrowserWindow.fromWebContents(event.sender)
    const confirmation = win
      ? await dialog.showMessageBox(win, options)
      : await dialog.showMessageBox(options)
    if (confirmation.response !== 0) {
      return { trashed: false, workspace: workspaceStore.publicState() }
    }

    await shell.trashItem(path)
    const workspace = workspaceStore.removeFileRef(file)
    refreshAppMenu()
    return { trashed: true, workspace }
  })

  registerOperations(ipcMain, contract, {
    tasks: createTaskHandlers({ service: taskFactsService, settings: settingsStore, emit })
  })

  ipcMain.handle('files:read', async (_event, absPath: unknown) => {
    const notesRoot = settingsStore.load().notesRoot
    return readFileSafe(assertValidAbsolutePath(absPath), notesRoot)
  })

  ipcMain.handle('files:read-source', async (_event, input: unknown) => {
    const notesRoot = settingsStore.load().notesRoot
    const { sourcePath } = assertValidSourceFileInput(input)
    return readSourceFileSafe(sourcePath, notesRoot)
  })

  ipcMain.handle('files:read-workspace-tab', async (_event, input: unknown) => {
    const notesRoot = settingsStore.load().notesRoot
    const { tabId } = assertValidWorkspaceTabFileInput(input)
    return readWorkspaceTabFile(tabId, notesRoot)
  })

  ipcMain.handle('files:read-source-title', async (_event, input: unknown) => {
    const notesRoot = settingsStore.load().notesRoot
    const { sourcePath } = assertValidSourceFileInput(input)
    return readSourceTitleSafe(sourcePath, notesRoot)
  })

  ipcMain.handle('files:watch', async (_event, absPath: unknown) => {
    const notesRoot = settingsStore.load().notesRoot
    const safePath = await resolveSourcePathUnderRoot(assertValidAbsolutePath(absPath), notesRoot)
    watchedViewerSourcePath = null
    watchedViewerTabId = null
    await viewerWatcher.watch(safePath)
  })

  ipcMain.handle('files:watch-source', async (_event, input: unknown) => {
    const notesRoot = settingsStore.load().notesRoot
    const { sourcePath } = assertValidSourceFileInput(input)
    const safePath = await resolveSourcePathUnderRoot(sourcePath, notesRoot)
    watchedViewerSourcePath = null
    watchedViewerTabId = null
    await viewerWatcher.watch(safePath)
    watchedViewerSourcePath = sourcePath
  })

  ipcMain.handle('files:watch-workspace-tab', async (_event, input: unknown) => {
    const notesRoot = settingsStore.load().notesRoot
    const { tabId } = assertValidWorkspaceTabFileInput(input)
    const fileRef = await fileRefForWorkspaceTab(tabId)
    const safePath = isWorkspaceSourceFileRef(fileRef)
      ? await resolveSourcePathUnderRoot(fileRef.sourcePath, notesRoot)
      : fileRef.externalPath

    watchedViewerSourcePath = null
    watchedViewerTabId = null
    await viewerWatcher.watch(safePath)
    watchedViewerTabId = tabId
    if (isWorkspaceSourceFileRef(fileRef)) {
      watchedViewerSourcePath = fileRef.sourcePath
    }
  })

  ipcMain.handle('files:unwatch', async () => {
    watchedViewerSourcePath = null
    watchedViewerTabId = null
    await viewerWatcher.stop()
  })

  // Push viewer-watcher change events to all renderer windows.
  viewerWatcher.onChange((path) => {
    const notesRoot = settingsStore.load().notesRoot
    const sourcePath = sourcePathForViewerChange(path, notesRoot, watchedViewerSourcePath)
    if (sourcePath) {
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('viewer:source-changed', sourcePath)
      }
    }
    if (watchedViewerTabId) {
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('viewer:workspace-tab-changed', watchedViewerTabId)
      }
    }
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('viewer:file-changed', path)
    }
  })

  watcher.onTreeChanged(() => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('files:tree-changed')
    }
  })

  watcher.onCatalogChanged((event) => {
    const notesRoot = settingsStore.load().notesRoot
    // Settings update their persisted root before the previous watcher has
    // finished closing. Do not resolve a final old-root event against the new
    // corpus root.
    if (event.notesRoot !== notesRoot) return

    taskFactsService.markStale()
    emit(contract.tasks.events.changed)

    void (async () => {
      let catalogChange: FileCatalogChangeEvent | undefined
      if (event.type === 'remove') {
        catalogChange = {
          type: 'remove',
          sourcePath: relative(notesRoot, event.path).split(sep).join('/')
        }
      } else {
        try {
          catalogChange = {
            type: 'upsert',
            file: await fileCatalogEntryFor(notesRoot, event.path)
          }
        } catch {
          // A rapid follow-up rename/delete can invalidate an upsert before it is read.
          // Preserve the previous full-refresh fallback for that exceptional race.
        }
      }

      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('files:catalog-changed', catalogChange)
      }
    })()
  })

  ipcMain.handle('search:query', (event, rawQuery: unknown, rawOptions: unknown) => {
    const query = assertValidSearchQuery(rawQuery)
    const options = assertValidSearchOptions(rawOptions)
    const svc = getOrCreateSearchService()
    if (!svc) {
      if (!event.sender.isDestroyed()) {
        event.sender.send('search:error', { requestId: '', error: 'Indexer not initialized' })
      }
      return null
    }
    const requestId = randomUUID()
    registerActiveSearchRequest(requestId, event.sender, svc)
    setImmediate(() => {
      void svc
        .search(
          query,
          requestId,
          {
            onStage: (stage) => sendSearchEvent(requestId, 'search:stage', { requestId, stage }),
            onToken: (token) =>
              sendSearchEvent(requestId, 'search:stream-token', { requestId, token }),
            onSources: (sources) =>
              sendSearchEvent(requestId, 'search:sources', { requestId, sources }),
            onCitation: (citation) =>
              sendSearchEvent(requestId, 'search:citation', { requestId, ...citation }),
            onNotice: (notice) =>
              sendSearchEvent(requestId, 'search:notice', { requestId, notice }),
            onDone: () => sendSearchEvent(requestId, 'search:done', { requestId }),
            onError: (error) => sendSearchEvent(requestId, 'search:error', { requestId, error })
          },
          options
        )
        .finally(() => clearActiveSearchRequest(requestId))
    })
    return requestId
  })

  ipcMain.handle('search:cancel', (event, requestId: unknown) => {
    const validRequestId = assertValidRequestId(requestId)
    const activeRequest = activeSearchRequests.get(validRequestId)
    if (activeRequest?.owner === event.sender) {
      cancelActiveSearchRequest(validRequestId)
    }
  })

  ipcMain.handle('search:check-snapshot-freshness', async (_event, rawInput: unknown) => {
    const svc = getOrCreateSearchService()
    if (!svc) throw new Error('Indexer not initialized')
    return svc.checkSnapshotFreshness(assertValidSearchSnapshotFreshnessInput(rawInput))
  })
}

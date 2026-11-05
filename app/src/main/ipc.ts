import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'

import { app, BrowserWindow, clipboard, dialog, ipcMain, shell, type WebContents } from 'electron'

import { refreshAppMenu } from './app-menu'
import { applyColorMode } from './appearance'
import { createAppHandlers } from './contract/app-handlers'
import { createDialogHandlers } from './contract/dialog-handlers'
import { createFilesHandlers } from './contract/files-handlers'
import { createViewerWatch, forwardFileChanges } from './contract/files-watch'
import {
  createIndexerHandlers,
  forwardEmbeddingStatus,
  forwardIndexerStatus,
  forwardRebuildNotice
} from './contract/indexer-handlers'
import { createEmitter, registerOperations } from './contract/register'
import { createSearchHandlers } from './contract/search-handlers'
import { createSettingsHandlers } from './contract/settings-handlers'
import { createTaskHandlers } from './contract/tasks-handlers'
import { createWorkspaceHandlers } from './contract/workspace-handlers'
import { contract } from '../contract'
import { taskFactsService } from './facts/task-facts-service'
import { createIndexerRestarter } from './indexer-restart'
import { indexerService } from './indexing/indexer-service'
import { walkNotes } from './indexing/walker'
import { watcher } from './indexing/watcher'
import {
  assertValidRequestId,
  assertValidSearchOptions,
  assertValidSearchQuery
} from './ipc-validation'
import { fileRefForPickedMarkdownFile, resolveExternalMarkdownFile } from './picked-file'
import { SearchService } from './search/search-service'
import { settingsStore } from './settings/settings-store'
import { listAuthorizedOpenAIModels, validateProviderKey } from './settings/key-validation'
import {
  readSourceFileSafe,
  readSourceTitleSafe,
  resolveSourcePathUnderRoot
} from './viewer/file-reader'
import { fileCatalogEntryFor, listFileCatalog } from './viewer/file-catalog'
import { sourcePathForViewerChange } from './viewer/source-change-path'
import { viewerWatcher } from './viewer/viewer-watcher'
import { fileRefForWorkspaceTab as tabFileRef } from './workspace-tab-file'
import { workspaceStore } from './workspace/workspace-store'

let searchService: SearchService | null = null

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

const fileRefForWorkspaceTab = (tabId: string): ReturnType<typeof tabFileRef> =>
  tabFileRef(tabId, { store: workspaceStore, resolveExternalMarkdownFile })

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
  // A search still running would read from the store while it is emptied. The indexer calls this only once
  // the rebuild is certain, so a refused or failed rebuild never kills the user's search.
  const stopSearchesBeforeClear = (): void => {
    cancelAllActiveSearchRequests()
    searchService = null
  }

  forwardIndexerStatus(indexerService, emit)
  forwardRebuildNotice(indexerService, emit)
  forwardEmbeddingStatus(indexerService, emit)

  const restartIndexer = createIndexerRestarter({
    watcher,
    indexer: indexerService,
    cancelSearches: cancelAllActiveSearchRequests,
    resetSearchService: () => {
      searchService = null // vectorStore is replaced; recreate on next search
    },
    notesRoot: () => settingsStore.load().notesRoot,
    startReindex: () => indexerService.triggerReindex()
  })

  const viewerWatch = createViewerWatch({
    viewerWatcher,
    getNotesRoot: () => settingsStore.load().notesRoot,
    fileRefForWorkspaceTab,
    resolveSourcePathUnderRoot,
    sourcePathForViewerChange,
    emit
  })

  forwardFileChanges({
    watcher,
    getNotesRoot: () => settingsStore.load().notesRoot,
    fileCatalogEntryFor,
    markTasksStale: () => taskFactsService.markStale(),
    emit
  })

  registerOperations(ipcMain, contract, {
    app: createAppHandlers({ getVersion: () => app.getVersion() }),
    dialog: createDialogHandlers({
      windowFor: (sender) => BrowserWindow.fromWebContents(sender),
      showOpenDialog: (win, options) =>
        win ? dialog.showOpenDialog(win, options) : dialog.showOpenDialog(options)
    }),
    files: {
      ...createFilesHandlers({
        store: workspaceStore,
        getNotesRoot: () => settingsStore.load().notesRoot,
        walkNotes,
        listFileCatalog,
        readTextFile: (path) => readFile(path, 'utf8'),
        readSourceFile: readSourceFileSafe,
        readSourceTitle: readSourceTitleSafe,
        resolveExternalMarkdownFile,
        clipboard,
        shell,
        windowFor: (sender) => BrowserWindow.fromWebContents(sender),
        showMessageBox: (win, options) =>
          win ? dialog.showMessageBox(win, options) : dialog.showMessageBox(options),
        refreshAppMenu
      }),
      ...viewerWatch
    },
    indexer: createIndexerHandlers({
      service: indexerService,
      beforeClear: stopSearchesBeforeClear
    }),
    search: createSearchHandlers({ getSearchService: getOrCreateSearchService }),
    settings: createSettingsHandlers({
      store: settingsStore,
      applyColorMode,
      restartIndexing: restartIndexer,
      validateProviderKey,
      listAuthorizedOpenAIModels
    }),
    tasks: createTaskHandlers({ service: taskFactsService, settings: settingsStore, emit }),
    workspace: createWorkspaceHandlers({
      store: workspaceStore,
      refreshAppMenu,
      getNotesRoot: () => settingsStore.load().notesRoot,
      windowFor: (sender) => BrowserWindow.fromWebContents(sender),
      showOpenDialog: (win, options) =>
        win ? dialog.showOpenDialog(win, options) : dialog.showOpenDialog(options),
      fileRefForPickedMarkdownFile
    })
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
}

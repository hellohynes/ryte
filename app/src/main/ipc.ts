import { randomUUID } from 'node:crypto'
import { appendFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'

import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron'

import { refreshAppMenu } from './app-menu'
import { applyColorMode } from './appearance'
import { createAppHandlers } from './contract/app-handlers'
import { createDialogHandlers } from './contract/dialog-handlers'
import { createCodeHandlers } from './contract/code-handlers'
import { createFilesHandlers } from './contract/files-handlers'
import { createViewerWatch, forwardFileChanges } from './contract/files-watch'
import {
  createIndexerHandlers,
  forwardEmbeddingStatus,
  forwardIndexerStatus,
  forwardRebuildNotice
} from './contract/indexer-handlers'
import { createLocalhostHandlers } from './contract/localhost-handlers'
import { createPageHandlers } from './contract/page-handlers'
import { createPicturesHandlers } from './contract/pictures-handlers'
import { createEmitter, registerOperations } from './contract/register'
import { createSearch } from './contract/search-handlers'
import { createSettingsHandlers } from './contract/settings-handlers'
import { createTaskHandlers } from './contract/tasks-handlers'
import { createVideoHandlers } from './contract/video-handlers'
import { createWorkspaceHandlers } from './contract/workspace-handlers'
import { contract } from '../contract'
import { taskFactsService } from './facts/task-facts-service'
import { createIndexerRestarter } from './indexer-restart'
import { indexerService } from './indexing/indexer-service'
import { walkLibrary } from './indexing/walker'
import { watcher } from './indexing/watcher'
import { openExternalIfSafe } from './navigation'
import { approvals } from './localhost/approvals-store'
import { createLocalBox } from './page/local-box'
import { createPageBox } from './page/page-box'
import { OPENABLE_PROTOCOLS } from './page/page-links'
import { fileRefForPickedMarkdownFile, resolveExternalMarkdownFile } from './picked-file'
import { recentRealInput } from './real-input'
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

// Only a web address or a mail link leaves a page. A launch check sets RYTE_TEST_OPEN_EXTERNAL_LOG so a link is
// written to that file instead of opening a browser (never in a packaged build).
function openPageLink(url: string): void {
  const logPath = app.isPackaged ? undefined : process.env['RYTE_TEST_OPEN_EXTERNAL_LOG']
  if (logPath) appendFileSync(logPath, `${url}\n`)
  else openExternalIfSafe(url, OPENABLE_PROTOCOLS)
}

/**
 * Register all IPC handlers once during app.whenReady(). Search and indexing
 * handlers preserve their not-ready responses while the index initializes
 * after the first window is visible.
 */
export function registerIpc(): void {
  const search = createSearch({
    getSearchService: getOrCreateSearchService,
    emitTo: emit.to,
    randomUUID,
    schedule: (task) => void setImmediate(task)
  })

  // A search still running would read from the store while it is emptied. The indexer calls this only once
  // the rebuild is certain, so a refused or failed rebuild never kills the user's search.
  const stopSearchesBeforeClear = (): void => {
    search.cancelAll()
    searchService = null
  }

  forwardIndexerStatus(indexerService, emit)
  forwardRebuildNotice(indexerService, emit)
  forwardEmbeddingStatus(indexerService, emit)

  const restartIndexer = createIndexerRestarter({
    watcher,
    indexer: indexerService,
    cancelSearches: search.cancelAll,
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
        walkLibrary,
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
    code: createCodeHandlers({
      getNotesRoot: () => settingsStore.load().notesRoot,
      openPath: (path) => shell.openPath(path)
    }),
    indexer: createIndexerHandlers({
      service: indexerService,
      beforeClear: stopSearchesBeforeClear
    }),
    localhost: createLocalhostHandlers({
      approvals,
      openAddressTab: (url) => workspaceStore.openAddress(url),
      box: createLocalBox({ emitTo: emit.to, openExternal: openPageLink }),
      openInBrowser: (url) => openExternalIfSafe(url, OPENABLE_PROTOCOLS),
      hadRealInput: recentRealInput
    }),
    page: createPageHandlers({
      box: createPageBox({
        getNotesRoot: () => settingsStore.load().notesRoot,
        emitTo: emit.to,
        openExternal: openPageLink
      }),
      getNotesRoot: () => settingsStore.load().notesRoot,
      openPath: (path) => shell.openPath(path)
    }),
    pictures: createPicturesHandlers({
      getNotesRoot: () => settingsStore.load().notesRoot,
      openPath: (path) => shell.openPath(path)
    }),
    search: search.handlers,
    settings: createSettingsHandlers({
      store: settingsStore,
      applyColorMode,
      restartIndexing: restartIndexer,
      validateProviderKey,
      listAuthorizedOpenAIModels
    }),
    tasks: createTaskHandlers({ service: taskFactsService, settings: settingsStore, emit }),
    video: createVideoHandlers({
      getNotesRoot: () => settingsStore.load().notesRoot,
      openPath: (path) => shell.openPath(path)
    }),
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
}

import { relative, sep } from 'node:path'

import { contract, type Contract } from '../../contract'
import type { FileCatalogChange, FileCatalogEntry } from '../../contract/files'
import { isWorkspaceSourceFileRef, type WorkspaceFileRef } from '../../shared/workspace'
import type { CatalogChangeEvent } from '../indexing/watcher'
import type { Emit, Handlers } from './register'

type FilesHandlers = Handlers<Contract>['files']

/** The two watch operations, which share the one watched file. `createFilesHandlers` has the rest. */
export type FilesWatchHandlers = Pick<FilesHandlers, 'watchWorkspaceTab' | 'unwatch'>

export interface ViewerWatchDependencies {
  /** The one watcher for the file a tab shows. */
  viewerWatcher: {
    watch(path: string): Promise<void>
    stop(): Promise<void>
    onChange(callback: (path: string) => void): unknown
  }
  getNotesRoot: () => string
  /** The file an open tab shows; throws when no tab has that id. */
  fileRefForWorkspaceTab: (tabId: string) => Promise<WorkspaceFileRef>
  /** The real path of a note, refusing one that resolves outside the notes root. */
  resolveSourcePathUnderRoot: (sourcePath: string, notesRoot: string) => Promise<string>
  /** The notes-relative path of a changed file, or null when it cannot be told. */
  sourcePathForViewerChange: (
    changedPath: string,
    notesRoot: string,
    watchedSourcePath: string | null
  ) => string | null
  emit: Emit
}

/**
 * Owns what the viewer watches (one file for the whole app, so the last watch wins) and sends the change events
 * to every window. Subscribes to the watcher once, here.
 *
 * Every watch first forgets the previous file, then starts the new one, then remembers it: a watch that fails
 * leaves nothing remembered, so a late change of the old file is not reported as a change of the new one. A
 * file opened from outside the notes folder is watched as is and has no source path.
 */
export function createViewerWatch({
  viewerWatcher,
  getNotesRoot,
  fileRefForWorkspaceTab,
  resolveSourcePathUnderRoot,
  sourcePathForViewerChange,
  emit
}: ViewerWatchDependencies): FilesWatchHandlers {
  let watchedSourcePath: string | null = null
  let watchedTabId: string | null = null

  viewerWatcher.onChange((changedPath) => {
    const sourcePath = sourcePathForViewerChange(changedPath, getNotesRoot(), watchedSourcePath)
    if (sourcePath) emit(contract.files.events.sourceChange, sourcePath)
    if (watchedTabId) emit(contract.files.events.workspaceTabChange, watchedTabId)
  })

  return {
    watchWorkspaceTab: async ({ tabId }) => {
      const notesRoot = getNotesRoot()
      const fileRef = await fileRefForWorkspaceTab(tabId)
      const safePath = isWorkspaceSourceFileRef(fileRef)
        ? await resolveSourcePathUnderRoot(fileRef.sourcePath, notesRoot)
        : fileRef.externalPath

      watchedSourcePath = null
      watchedTabId = null
      await viewerWatcher.watch(safePath)
      watchedTabId = tabId
      if (isWorkspaceSourceFileRef(fileRef)) {
        watchedSourcePath = fileRef.sourcePath
      }
    },

    unwatch: async () => {
      watchedSourcePath = null
      watchedTabId = null
      await viewerWatcher.stop()
    }
  }
}

export interface FileChangeForwardingDependencies {
  watcher: {
    onTreeChanged(callback: () => void): () => void
    onCatalogChanged(callback: (event: CatalogChangeEvent) => void): () => void
  }
  getNotesRoot: () => string
  fileCatalogEntryFor: (notesRoot: string, path: string) => Promise<FileCatalogEntry>
  /** The task facts read the notes, so a changed note makes them stale. */
  markTasksStale: () => void
  emit: Emit
}

/**
 * Sends the notes folder's file changes to every window: the tree event as it is, and one catalog change per file
 * event. An event from a watcher of a previous notes folder is dropped. An accepted one marks the task facts stale
 * and tells the windows the tasks changed, then sends the catalog change once it is described. When the file
 * cannot be read any more (a rapid rename or delete), the payload is `undefined`, which tells the windows to
 * refresh the whole catalog.
 */
export function forwardFileChanges({
  watcher,
  getNotesRoot,
  fileCatalogEntryFor,
  markTasksStale,
  emit
}: FileChangeForwardingDependencies): () => void {
  const stopTree = watcher.onTreeChanged(() => emit(contract.files.events.treeChanged))

  const stopCatalog = watcher.onCatalogChanged((event) => {
    const notesRoot = getNotesRoot()
    // Settings update their persisted root before the previous watcher has finished closing. Do not resolve a
    // final old-root event against the new root.
    if (event.notesRoot !== notesRoot) return

    markTasksStale()
    emit(contract.tasks.events.changed)

    void (async () => {
      let change: FileCatalogChange | undefined
      if (event.type === 'remove') {
        change = {
          type: 'remove',
          sourcePath: relative(notesRoot, event.path).split(sep).join('/')
        }
      } else {
        try {
          change = { type: 'upsert', file: await fileCatalogEntryFor(notesRoot, event.path) }
        } catch {
          // A rapid rename or delete can invalidate an upsert before it is read. Send no change, which means
          // refresh everything.
        }
      }
      emit(contract.files.events.catalogChanged, change)
    })()
  })

  return () => {
    stopTree()
    stopCatalog()
  }
}

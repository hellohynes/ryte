import { basename, relative } from 'node:path'

import type { WebContents } from 'electron'

import type { Contract } from '../../contract'
import type { FileCatalogResponse } from '../../shared/files'
import { isWorkspaceSourceFileRef } from '../../shared/workspace'
import type { WorkspaceTabFileDependencies } from '../workspace-tab-file'
import { fileRefForWorkspaceTab } from '../workspace-tab-file'
import type { WorkspaceStore } from '../workspace/workspace-store'
import type { FilesWatchHandlers } from './files-watch'
import type { Handlers } from './register'

/** The subset of Electron's message-box options the trash confirmation uses. */
export interface MessageBoxOptions {
  type: 'warning'
  buttons: string[]
  defaultId: number
  cancelId: number
  noLink: boolean
  message: string
  detail: string
}

export interface FilesHandlerDependencies<TWindow> extends WorkspaceTabFileDependencies {
  store: Pick<
    WorkspaceStore,
    'fileRefForTab' | 'resolveFilePath' | 'renameFile' | 'removeFileRef' | 'publicState'
  >
  getNotesRoot: () => string
  walkNotes: (notesRoot: string) => Promise<string[]>
  listFileCatalog: (notesRoot: string) => Promise<FileCatalogResponse>
  readTextFile: (path: string) => Promise<string>
  /** Reads a note, refusing a path that resolves outside the notes root. */
  readSourceFile: (sourcePath: string, notesRoot: string) => Promise<string>
  /** Reads a note's title, refusing a path that resolves outside the notes root. */
  readSourceTitle: (sourcePath: string, notesRoot: string) => Promise<string | null>
  clipboard: { writeText: (text: string) => void }
  shell: { showItemInFolder: (path: string) => void; trashItem: (path: string) => Promise<void> }
  /** The window that owns the asking page, or null when it has none; the dialog is parented to it. */
  windowFor: (sender: WebContents) => TWindow | null
  showMessageBox: (
    window: TWindow | null,
    options: MessageBoxOptions
  ) => Promise<{ response: number }>
  /** Rebuilds the application menu, whose recent files and tabs come from the workspace. */
  refreshAppMenu: () => void
}

/**
 * The handlers for the file operations except the two that watch (`createViewerWatch`, which owns the watched
 * file). Input is already validated. Notes are read through the notes-root check;
 * a file opened from outside the notes root is read as is. Rename and move-to-trash refresh the application menu
 * after the store call succeeds, so a failed or declined call leaves the menu alone.
 */
export function createFilesHandlers<TWindow>({
  store,
  getNotesRoot,
  walkNotes,
  listFileCatalog,
  readTextFile,
  readSourceFile,
  readSourceTitle,
  resolveExternalMarkdownFile,
  clipboard,
  shell,
  windowFor,
  showMessageBox,
  refreshAppMenu
}: FilesHandlerDependencies<TWindow>): Omit<Handlers<Contract>['files'], keyof FilesWatchHandlers> {
  return {
    listTree: async () => {
      const notesRoot = getNotesRoot()
      const absolutePaths = await walkNotes(notesRoot)
      const paths = absolutePaths.map((p) => relative(notesRoot, p)).sort()
      return { notesRoot, paths }
    },
    listCatalog: async () => listFileCatalog(getNotesRoot()),
    readSourceTitle: async ({ sourcePath }) => readSourceTitle(sourcePath, getNotesRoot()),
    readWorkspaceTab: async ({ tabId }) => {
      const notesRoot = getNotesRoot()
      const fileRef = await fileRefForWorkspaceTab(tabId, { store, resolveExternalMarkdownFile })
      if (isWorkspaceSourceFileRef(fileRef)) return readSourceFile(fileRef.sourcePath, notesRoot)
      return readTextFile(fileRef.externalPath)
    },
    copyContent: async (file) => {
      const path = await store.resolveFilePath(file)
      clipboard.writeText(await readTextFile(path))
    },
    copyPath: async (file) => {
      clipboard.writeText(await store.resolveFilePath(file))
    },
    showInFinder: async (file) => {
      shell.showItemInFolder(await store.resolveFilePath(file))
    },
    rename: async (input) => {
      const result = await store.renameFile(input)
      refreshAppMenu()
      return result
    },
    moveToTrash: async (file, { sender }) => {
      const path = await store.resolveFilePath(file)
      const confirmation = await showMessageBox(windowFor(sender), {
        type: 'warning',
        buttons: ['Move to Trash', 'Cancel'],
        defaultId: 1,
        cancelId: 1,
        noLink: true,
        message: `Move "${basename(path)}" to Trash?`,
        detail: 'The file can be recovered from the Trash.'
      })
      if (confirmation.response !== 0) {
        return { trashed: false, workspace: store.publicState() }
      }

      await shell.trashItem(path)
      const workspace = store.removeFileRef(file)
      refreshAppMenu()
      return { trashed: true, workspace }
    }
  }
}

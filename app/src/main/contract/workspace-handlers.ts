import type { Contract } from '../../contract'
import type { WorkspaceFileRef } from '../../shared/workspace'
import type { WorkspaceStore } from '../workspace/workspace-store'
import type { OpenDialogDependencies } from './dialog-handlers'
import type { Handlers } from './register'

export interface WorkspaceHandlerDependencies<TWindow> extends OpenDialogDependencies<TWindow> {
  store: Pick<
    WorkspaceStore,
    | 'publicState'
    | 'updateShell'
    | 'updateLibrary'
    | 'focusTab'
    | 'closeTab'
    | 'updateTabViewMode'
    | 'setOutlineCollapsed'
    | 'setOutlineWidth'
    | 'openFile'
    | 'openRecentFile'
    | 'openPickedFile'
    | 'recordRecent'
    | 'pruneMissingFileRefs'
  >
  /** Rebuilds the application menu, whose recent files and tabs come from the workspace. */
  refreshAppMenu: () => void
  getNotesRoot: () => string
  /** Checks a picked file and names it as a notes-relative or an external reference; throws when it is refused. */
  fileRefForPickedMarkdownFile: (absPath: string, notesRoot: string) => Promise<WorkspaceFileRef>
}

/**
 * The handlers for the workspace operations. Input is already validated. Each handler returns what the store
 * returns, and the ones that change the open files or the recent files refresh the application menu after the
 * store call succeeds, so a failed call leaves the menu alone.
 */
export function createWorkspaceHandlers<TWindow>({
  store,
  refreshAppMenu,
  getNotesRoot,
  windowFor,
  showOpenDialog,
  fileRefForPickedMarkdownFile
}: WorkspaceHandlerDependencies<TWindow>): Handlers<Contract>['workspace'] {
  return {
    getState: async () => store.publicState(),
    updateShell: async (patch) => store.updateShell(patch),
    updateLibrary: async (patch) => store.updateLibrary(patch),
    focusTab: async (input) => store.focusTab(input),
    closeTab: async (input) => store.closeTab(input),
    updateTabViewMode: async (input) => store.updateTabViewMode(input),
    setOutlineCollapsed: async (input) => store.setOutlineCollapsed(input),
    setOutlineWidth: async (input) => store.setOutlineWidth(input),
    openFile: async (input) => {
      const next = await store.openFile(input)
      refreshAppMenu()
      return next
    },
    openRecentFile: async (input) => {
      const next = await store.openRecentFile(input)
      refreshAppMenu()
      return next
    },
    openNativeFile: async (_input, { sender }) => {
      const notesRoot = getNotesRoot()
      const result = await showOpenDialog(windowFor(sender), {
        defaultPath: notesRoot,
        filters: [{ name: 'Markdown', extensions: ['md'] }],
        properties: ['openFile']
      })
      if (result.canceled || result.filePaths.length === 0) return store.publicState()

      // A refused file throws a plain Error. The renderer reads its message out of Electron's wrapped text.
      const fileRef = await fileRefForPickedMarkdownFile(result.filePaths[0]!, notesRoot)
      const next = await store.openPickedFile(fileRef)
      refreshAppMenu()
      return next
    },
    recordRecent: async (input) => {
      const next = await store.recordRecent(input)
      refreshAppMenu()
      return next
    },
    pruneMissingFileRefs: async () => {
      const next = await store.pruneMissingFileRefs()
      refreshAppMenu()
      return next
    }
  }
}

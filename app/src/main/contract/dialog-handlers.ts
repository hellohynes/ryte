import type { WebContents } from 'electron'

import type { Contract } from '../../contract'
import type { Handlers } from './register'

/** The subset of Electron's open-dialog options the handlers use. */
export interface OpenDialogOptions {
  defaultPath?: string
  filters?: { name: string; extensions: string[] }[]
  properties: ('openFile' | 'openDirectory')[]
}

/** The native open dialog and the window lookup, injected so a handler runs without Electron. */
export interface OpenDialogDependencies<TWindow> {
  /** The window that owns the asking page, or null when it has none; the dialog is parented to it. */
  windowFor: (sender: WebContents) => TWindow | null
  showOpenDialog: (
    window: TWindow | null,
    options: OpenDialogOptions
  ) => Promise<{ canceled: boolean; filePaths: string[] }>
}

export type DialogHandlerDependencies<TWindow> = OpenDialogDependencies<TWindow>

/** The dialog and the window lookup are injected so the handler runs without Electron. */
export function createDialogHandlers<TWindow>({
  windowFor,
  showOpenDialog
}: DialogHandlerDependencies<TWindow>): Handlers<Contract>['dialog'] {
  return {
    openFolder: async (_input, { sender }) => {
      const result = await showOpenDialog(windowFor(sender), { properties: ['openDirectory'] })
      if (result.canceled || result.filePaths.length === 0) return null
      return result.filePaths[0]!
    }
  }
}

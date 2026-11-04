import type { WebContents } from 'electron'

import type { Contract } from '../../contract'
import type { Handlers } from './register'

export interface DialogHandlerDependencies<TWindow> {
  /** The window that owns the asking page, or null when it has none; the dialog is parented to it. */
  windowFor: (sender: WebContents) => TWindow | null
  showOpenDialog: (
    window: TWindow | null,
    options: { properties: ['openDirectory'] }
  ) => Promise<{ canceled: boolean; filePaths: string[] }>
}

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

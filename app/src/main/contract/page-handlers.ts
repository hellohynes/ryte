import type { Contract } from '../../contract'
import { isHtmlPagePath } from '../../shared/page-box'
import { locateNoteFile } from '../viewer/note-files'
import type { PageBox } from '../page/page-box'
import type { Handlers } from './register'

export interface PageHandlerDependencies {
  box: PageBox
  getNotesRoot: () => string
  /** Electron's `shell.openPath`: resolves to an error message, or '' when the file opened. */
  openPath: (path: string) => Promise<string>
}

const isHtmlExtension = (extension: string): boolean => isHtmlPagePath(`x.${extension}`)

/** The HTML page view. The view belongs to the window that asked; the box shows one page per window and keeps the others alive, hidden. */
export function createPageHandlers({
  box,
  getNotesRoot,
  openPath
}: PageHandlerDependencies): Handlers<Contract>['page'] {
  return {
    show: async ({ path, bounds }, { sender }) => ({
      status: await box.show(sender, path, bounds)
    }),
    setBounds: ({ bounds }, { sender }) => box.setBounds(sender, bounds),
    hide: async (_input, { sender }) => ({ still: await box.hide(sender) }),
    park: ({ path }, { sender }) => box.park(sender, path),
    close: ({ path }, { sender }) => box.close(sender, path),
    retain: ({ paths }, { sender }) => box.retain(sender, paths),
    openInBrowser: async ({ path }) => {
      const located = await locateNoteFile(path, getNotesRoot(), isHtmlExtension)
      if (!located.ok) return { opened: false }
      return { opened: (await openPath(located.realPath)) === '' }
    }
  }
}

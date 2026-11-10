import type { Contract } from '../../contract'
import { noteVideoContentType } from '../../shared/note-videos'
import { locateNoteFile } from '../viewer/note-files'
import type { Handlers } from './register'

export interface VideoHandlerDependencies {
  getNotesRoot: () => string
  /** Electron's `shell.openPath`: resolves to an error message, or '' when the file opened. */
  openPath: (path: string) => Promise<string>
}

const isVideoExtension = (extension: string): boolean =>
  noteVideoContentType(extension) !== undefined

/**
 * Videos in notes that did not play. Both operations check the path against the notes folder read fresh from
 * settings, the same way the `ryte-file` scheme does.
 */
export function createVideoHandlers({
  getNotesRoot,
  openPath
}: VideoHandlerDependencies): Handlers<Contract>['video'] {
  return {
    explain: async ({ path }) => {
      const located = await locateNoteFile(path, getNotesRoot(), isVideoExtension)
      if (!located.ok) return { reason: located.reason, sizeBytes: null }
      return { reason: 'unplayable', sizeBytes: located.size }
    },
    openInDefaultApp: async ({ path }) => {
      const located = await locateNoteFile(path, getNotesRoot(), isVideoExtension)
      if (!located.ok) return { opened: false }
      return { opened: (await openPath(located.realPath)) === '' }
    }
  }
}

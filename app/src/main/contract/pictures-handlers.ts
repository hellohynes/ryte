import type { Contract } from '../../contract'
import { RASTER_NOTE_PICTURE_EXTENSIONS } from '../../shared/note-pictures'
import { checkNotePicture, locateNotePicture } from '../viewer/note-files'
import type { Handlers } from './register'

export interface PicturesHandlerDependencies {
  getNotesRoot: () => string
  /** Electron's `shell.openPath`: resolves to an error message, or '' when the file opened. */
  openPath: (path: string) => Promise<string>
}

/**
 * Pictures in notes that could not be shown inline. Both operations check the path against the notes folder
 * read fresh from settings, the same way the `ryte-file` scheme does.
 */
export function createPicturesHandlers({
  getNotesRoot,
  openPath
}: PicturesHandlerDependencies): Handlers<Contract>['pictures'] {
  return {
    explain: async ({ path }) => {
      const check = await checkNotePicture(path, getNotesRoot())
      if (check.ok) return { reason: 'unreadable', sizeBytes: check.size }
      return { reason: check.reason, sizeBytes: check.size ?? null }
    },
    openInDefaultApp: async ({ path }) => {
      const located = await locateNotePicture(path, getNotesRoot())
      if (!located.ok || !RASTER_NOTE_PICTURE_EXTENSIONS.has(located.extension)) {
        return { opened: false }
      }
      return { opened: (await openPath(located.realPath)) === '' }
    }
  }
}

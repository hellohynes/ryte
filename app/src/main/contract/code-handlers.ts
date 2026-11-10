import type { Contract } from '../../contract'
import { locateOpenableCodeFile, readCodeFile } from '../viewer/code-files'
import type { Handlers } from './register'

export interface CodeHandlerDependencies {
  getNotesRoot: () => string
  /** Electron's `shell.openPath`: resolves to an error message, or '' when the file opened. */
  openPath: (path: string) => Promise<string>
}

/** Code files from the notes folder. The notes folder is read fresh from settings for every call. */
export function createCodeHandlers({
  getNotesRoot,
  openPath
}: CodeHandlerDependencies): Handlers<Contract>['code'] {
  return {
    read: ({ path }) => readCodeFile(path, getNotesRoot()),
    openInDefaultApp: async ({ path }) => {
      const realPath = await locateOpenableCodeFile(path, getNotesRoot())
      if (realPath === null) return { opened: false }
      return { opened: (await openPath(realPath)) === '' }
    }
  }
}

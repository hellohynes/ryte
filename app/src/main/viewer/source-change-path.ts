import { relative } from 'node:path'

import { assertValidSourceFileInput } from '../ipc-validation'

export function sourcePathForViewerChange(
  changedPath: string,
  notesRoot: string,
  watchedSourcePath: string | null
): string | null {
  if (watchedSourcePath) return watchedSourcePath

  try {
    return assertValidSourceFileInput({ sourcePath: relative(notesRoot, changedPath) }).sourcePath
  } catch {
    return null
  }
}

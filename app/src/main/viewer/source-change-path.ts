import { relative } from 'node:path'

import { normalizeWorkspaceSourcePath } from '../../shared/source-path'

export function sourcePathForViewerChange(
  changedPath: string,
  notesRoot: string,
  watchedSourcePath: string | null
): string | null {
  if (watchedSourcePath) return watchedSourcePath

  try {
    return normalizeWorkspaceSourcePath(relative(notesRoot, changedPath))
  } catch {
    return null
  }
}

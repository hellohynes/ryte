import { realpath, stat } from 'node:fs/promises'
import { extname, relative, resolve, sep } from 'node:path'

import type { WorkspaceFileRef } from '../shared/workspace'

/** The real path of a Markdown file; anything else, or a path that is not a regular file, is refused. */
export async function resolveExternalMarkdownFile(absPath: string): Promise<string> {
  const safePath = await realpath(resolve(absPath))
  if (extname(safePath).toLowerCase() !== '.md') {
    throw new Error('Selected file must be a Markdown file')
  }

  const fileStat = await stat(safePath)
  if (!fileStat.isFile()) throw new Error(`Workspace file not found: ${absPath}`)
  return safePath
}

/** A picked Markdown file as a notes-relative reference when it is inside the notes folder, otherwise as an external path. */
export async function fileRefForPickedMarkdownFile(
  absPath: string,
  notesRoot: string
): Promise<WorkspaceFileRef> {
  const safePath = await resolveExternalMarkdownFile(absPath)
  const resolvedRoot = await realpath(resolve(notesRoot))
  if (safePath === resolvedRoot || safePath.startsWith(resolvedRoot + sep)) {
    return { sourcePath: relative(resolvedRoot, safePath).split(sep).join('/') }
  }
  return { externalPath: safePath }
}

import type { WorkspaceFileRef } from '../shared/workspace'
import { isWorkspaceSourceFileRef } from '../shared/workspace'
import type { WorkspaceStore } from './workspace/workspace-store'

export interface WorkspaceTabFileDependencies {
  store: Pick<WorkspaceStore, 'fileRefForTab'>
  /** The real path of an external Markdown file; throws when it is not one. */
  resolveExternalMarkdownFile: (absPath: string) => Promise<string>
}

/**
 * The file an open tab shows: a note as its notes-relative path, an external file as its real path. Throws when
 * no tab has that id. Whoever reads a note from it still has to check it against the notes root.
 */
export async function fileRefForWorkspaceTab(
  tabId: string,
  { store, resolveExternalMarkdownFile }: WorkspaceTabFileDependencies
): Promise<WorkspaceFileRef> {
  const fileRef = store.fileRefForTab(tabId)
  if (!fileRef) throw new Error('Workspace tab not found')
  if (isWorkspaceSourceFileRef(fileRef)) return fileRef
  return { externalPath: await resolveExternalMarkdownFile(fileRef.externalPath) }
}

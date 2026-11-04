// FROZEN SNAPSHOT of the hand-written declarations of the `files` area, copied from `src/shared/files.ts`,
// `src/shared/workspace.ts` and `LegacyRyteApi.files` in `src/preload/index.ts` at bb14ce4 (the operations) and
// 4b68b43 (the watch operations and the change subscribers), before the contract replaced them. It is the oracle for
// the type-equality check in `files.wire-types.check.ts`: the types inferred from the contract must equal it.
// `watch`, `watchSource` and `onChange` had no caller and were deleted; they are not here. Do not edit.

import type { WorkspaceState } from './workspace.wire-types'

interface WorkspaceSourceFileRef {
  sourcePath: string
  externalPath?: never
}

interface WorkspaceExternalFileRef {
  externalPath: string
  sourcePath?: never
}

type WorkspaceFileRef = WorkspaceSourceFileRef | WorkspaceExternalFileRef

export type WorkspaceOpenFileInput = WorkspaceSourceFileRef

export interface WorkspaceTabFileInput {
  tabId: string
}

export interface FileTreeResponse {
  notesRoot: string
  paths: string[]
}

export interface FileCatalogEntry {
  sourcePath: string
  title: string
  directory: string
  searchableText: string
  pathDate: string | null
  modifiedAt: string
  modifiedAtMs: number
  createdAt: string | null
  createdAtMs: number | null
  sizeBytes: number
}

export interface FileCatalogResponse {
  notesRoot: string
  files: FileCatalogEntry[]
}

export type FileCatalogChangeEvent =
  | { type: 'upsert'; file: FileCatalogEntry }
  | { type: 'remove'; sourcePath: string }

export type FileRenameInput =
  | (WorkspaceSourceFileRef & { name: string })
  | (WorkspaceExternalFileRef & { name: string })

export interface FileRenameResult {
  file: WorkspaceFileRef
  workspace: WorkspaceState
}

export interface FileTrashResult {
  trashed: boolean
  workspace: WorkspaceState
}

/** All of `window.ryte.files` now. `read`, `readSource`, `watch`, `watchSource` and `onChange` were deleted. */
export interface FilesApi {
  listTree(): Promise<FileTreeResponse>
  listCatalog(): Promise<FileCatalogResponse>
  copyContent(input: WorkspaceFileRef): Promise<void>
  copyPath(input: WorkspaceFileRef): Promise<void>
  showInFinder(input: WorkspaceFileRef): Promise<void>
  rename(input: FileRenameInput): Promise<FileRenameResult>
  moveToTrash(input: WorkspaceFileRef): Promise<FileTrashResult>
  readSourceTitle(input: WorkspaceOpenFileInput): Promise<string | null>
  readWorkspaceTab(input: WorkspaceTabFileInput): Promise<string>
  watchWorkspaceTab(input: WorkspaceTabFileInput): Promise<void>
  unwatch(): Promise<void>
  onSourceChange(cb: (sourcePath: string) => void): () => void
  onWorkspaceTabChange(cb: (tabId: string) => void): () => void
  onTreeChanged(cb: () => void): () => void
  onCatalogChanged(cb: (event?: FileCatalogChangeEvent) => void): () => void
}

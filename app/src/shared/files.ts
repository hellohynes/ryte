import type {
  WorkspaceExternalFileRef,
  WorkspaceFileRef,
  WorkspaceSourceFileRef,
  WorkspaceState
} from './workspace'

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

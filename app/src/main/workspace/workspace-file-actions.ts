import { realpath, rename, stat } from 'node:fs/promises'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'

import type { FileRenameInput } from '../../shared/files'
import {
  isWorkspaceSourceFileRef,
  type WorkspaceFileRef,
  type WorkspaceSourceFileRef
} from '../../shared/workspace'

const MAX_FILE_NAME_LENGTH = 255

function requireFileName(value: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_FILE_NAME_LENGTH ||
    value === '.' ||
    value === '..' ||
    value.includes('/') ||
    value.includes('\\') ||
    value.includes('\0') ||
    extname(value).toLowerCase() !== '.md'
  ) {
    throw new Error('Invalid file name')
  }
  return value
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

async function resolveSourceFilePath(
  file: WorkspaceSourceFileRef,
  notesRoot: string
): Promise<string> {
  const root = await realpath(resolve(notesRoot))
  const unresolvedTarget = resolve(root, file.sourcePath)
  let resolvedTarget: string
  try {
    resolvedTarget = await realpath(unresolvedTarget)
  } catch {
    throw new Error(`Workspace file not found: ${file.sourcePath}`)
  }

  if (resolvedTarget !== root && !resolvedTarget.startsWith(root + sep)) {
    throw new Error('Workspace file outside notes root')
  }

  const fileStat = await stat(resolvedTarget)
  if (!fileStat.isFile()) throw new Error(`Workspace file not found: ${file.sourcePath}`)
  return unresolvedTarget
}

async function resolveExternalFilePath(externalPath: string): Promise<string> {
  const unresolvedTarget = resolve(externalPath)
  let resolvedTarget: string
  try {
    resolvedTarget = await realpath(unresolvedTarget)
  } catch {
    throw new Error(`Workspace file not found: ${externalPath}`)
  }

  if (extname(resolvedTarget).toLowerCase() !== '.md') {
    throw new Error('Selected file must be a Markdown file')
  }

  const fileStat = await stat(resolvedTarget)
  if (!fileStat.isFile()) throw new Error(`Workspace file not found: ${externalPath}`)
  return unresolvedTarget
}

/** Resolve an existing workspace file without exposing unchecked renderer paths. */
export async function resolveWorkspaceFilePath(
  file: WorkspaceFileRef,
  notesRoot: string
): Promise<string> {
  return isWorkspaceSourceFileRef(file)
    ? resolveSourceFilePath(file, notesRoot)
    : resolveExternalFilePath(file.externalPath)
}

/** Rename a workspace file within its current directory without overwriting another file. */
export async function renameWorkspaceFile(
  input: FileRenameInput,
  notesRoot: string
): Promise<WorkspaceFileRef> {
  const name = requireFileName(input.name)
  const currentPath = await resolveWorkspaceFilePath(input, notesRoot)
  const nextPath = join(dirname(currentPath), name)

  if (currentPath !== nextPath) {
    const currentStat = await stat(currentPath)
    try {
      const nextStat = await stat(nextPath)
      if (nextStat.dev !== currentStat.dev || nextStat.ino !== currentStat.ino) {
        throw new Error('A file with that name already exists')
      }
    } catch (error) {
      if (!isNotFoundError(error)) throw error
    }
    await rename(currentPath, nextPath)
  }

  if (!isWorkspaceSourceFileRef(input)) return { externalPath: nextPath }
  const root = await realpath(resolve(notesRoot))
  return { sourcePath: relative(root, nextPath).split(sep).join('/') }
}

import { isAbsolute, normalize, sep, win32 } from 'node:path'

export const MAX_PATH_LENGTH = 4096

function hasParentTraversal(value: string): boolean {
  return value.split(/[\\/]+/).some((segment) => segment === '..')
}

/**
 * Validates and normalizes a notes-root-relative file path. Shared by the legacy IPC validators and the
 * contract's `sourcePath` primitive so there is one implementation of the traversal rules.
 */
export function normalizeWorkspaceSourcePath(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_PATH_LENGTH ||
    value.includes('\0') ||
    isAbsolute(value) ||
    win32.isAbsolute(value) ||
    hasParentTraversal(value)
  ) {
    throw new Error('Invalid workspace source path')
  }

  const sourcePath = normalize(value)
  if (
    sourcePath === '.' ||
    sourcePath === '..' ||
    sourcePath.includes('\0') ||
    isAbsolute(sourcePath) ||
    win32.isAbsolute(sourcePath) ||
    sourcePath.startsWith(`..${sep}`)
  ) {
    throw new Error('Invalid workspace source path')
  }

  return sourcePath
}

import { readdir } from 'node:fs/promises'
import { join, relative } from 'node:path'

import { listedKindOf } from '../../shared/supported-types'

/**
 * Walk a notes root recursively, returning sorted absolute paths to all .md files, in any letter case
 * (the watcher accepts `.MD` too). Follows the user decision: no path exclusions for V1.
 */
export async function walkNotes(notesRoot: string): Promise<string[]> {
  const entries = await readdir(notesRoot, { withFileTypes: true, recursive: true })
  const paths: string[] = []
  for (const entry of entries) {
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      paths.push(join(entry.parentPath, entry.name))
    }
  }
  return paths.sort()
}

/**
 * Walk a notes root recursively for everything Ryte lists: notes exactly as `walkNotes` lists them, plus
 * supported pictures and code files outside `node_modules` and dot folders. Sorted absolute paths. The indexer and
 * the task facts keep `walkNotes`; pictures and code files are listed, never indexed.
 */
export async function walkLibrary(notesRoot: string): Promise<string[]> {
  const entries = await readdir(notesRoot, { withFileTypes: true, recursive: true })
  const paths: string[] = []
  for (const entry of entries) {
    if (!entry.isFile()) continue
    const path = join(entry.parentPath, entry.name)
    if (listedKindOf(relative(notesRoot, path))) paths.push(path)
  }
  return paths.sort()
}

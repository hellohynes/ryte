import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Walk a notes root recursively, returning sorted absolute paths to all .md files.
 * Follows the user decision: no path exclusions for V1.
 */
export async function walkNotes(notesRoot: string): Promise<string[]> {
  const entries = await readdir(notesRoot, { withFileTypes: true, recursive: true })
  const paths: string[] = []
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.md')) {
      paths.push(join(entry.parentPath, entry.name))
    }
  }
  return paths.sort()
}

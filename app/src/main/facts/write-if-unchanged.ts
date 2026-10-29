import { stat, writeFile } from 'node:fs/promises'

/**
 * Writes a note's new content only if it has not been modified since `expectedMtimeMs`. Returns
 * false, touching nothing, when it has, so an edit saved elsewhere in the meantime is never
 * overwritten with a stale copy. The write is in place, so the file keeps its identity: hard
 * links, permissions (a read-only note stays unwritable), tags and other metadata.
 *
 * SHORTCUT: a save by another program in the instant between the check and the write is still
 * overwritten, and a crash or a full disk mid-write could truncate the note. A temp file and rename would close
 * both, but it replaces the file's identity and drops Finder tags and extended attributes, which
 * matter more for notes. Revisit if notes are routinely edited by something that saves in the
 * background.
 */
export async function writeFileIfUnchanged(
  path: string,
  expectedMtimeMs: number,
  content: string
): Promise<boolean> {
  if ((await stat(path)).mtimeMs !== expectedMtimeMs) return false
  await writeFile(path, content, 'utf-8')
  return true
}

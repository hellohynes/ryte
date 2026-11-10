import { MAX_CODE_FILE_BYTES, canOpenCodeExtension, isCodeExtension } from '../../shared/code-files'
import { locateNoteFile, readLocatedNoteFile } from './note-files'

export type CodeReadResult =
  | { status: 'ok'; text: string; bytes: number }
  | { status: 'too-large'; sizeBytes: number }
  | { status: 'missing' }
  | { status: 'blocked' }

/**
 * Reads a notes-relative code file as UTF-8 for the code view. The checks match the picture path: a code type
 * before and after following links, inside the notes folder after following links, a regular file, and the
 * size checked before anything is read. The file that was checked is the file that is read.
 */
export async function readCodeFile(
  notesRelativePath: string,
  notesRoot: string
): Promise<CodeReadResult> {
  const located = await locateNoteFile(notesRelativePath, notesRoot, isCodeExtension)
  if (!located.ok) return { status: located.reason }
  if (located.size > MAX_CODE_FILE_BYTES) return { status: 'too-large', sizeBytes: located.size }

  const buffer = await readLocatedNoteFile(located, MAX_CODE_FILE_BYTES)
  if (!buffer) return { status: 'missing' }
  // The decoder drops a leading byte order mark and replaces bytes that are not UTF-8.
  return { status: 'ok', text: new TextDecoder('utf-8').decode(buffer), bytes: buffer.byteLength }
}

/** The real path of a code file that may be handed to the default app, or null. */
export async function locateOpenableCodeFile(
  notesRelativePath: string,
  notesRoot: string
): Promise<string | null> {
  const located = await locateNoteFile(notesRelativePath, notesRoot, canOpenCodeExtension)
  return located.ok ? located.realPath : null
}

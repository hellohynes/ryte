import { codeLanguageOf } from './code-files'
import { isSupportedNotePicture } from './note-pictures'
import { isSupportedNoteVideo } from './note-videos'
import { isHtmlPagePath } from './page-box'

/**
 * What Ryte lists in the folder tree and quick open. Later steps add rows here when their viewers ship.
 * Notes are searched and indexed; pictures, videos, code files and HTML pages are only listed.
 */
export type SupportedKind = 'note' | 'picture' | 'video' | 'code' | 'html'

/** Folders whose pictures, videos, code files and HTML pages are not listed: dependencies and hidden folders. Notes inside them are still listed. */
export function isSkippedFolder(name: string): boolean {
  return name === 'node_modules' || name.startsWith('.')
}

/** The kind a file name has by its extension (any letter case), or null when Ryte does not list it. */
export function supportedKindOf(path: string): SupportedKind | null {
  if (path.toLowerCase().endsWith('.md')) return 'note'
  if (isSupportedNotePicture(path)) return 'picture'
  if (isSupportedNoteVideo(path)) return 'video'
  if (codeLanguageOf(path) !== null) return 'code'
  if (isHtmlPagePath(path)) return 'html'
  return null
}

/**
 * The kind a file has when listed from the notes folder, given its path relative to it (either separator).
 * A picture, video, code or HTML file under `node_modules` or a dot folder is not listed; a note is listed wherever it is.
 */
export function listedKindOf(relativePath: string): SupportedKind | null {
  const kind = supportedKindOf(relativePath)
  if (kind === null || kind === 'note') return kind
  const folders = relativePath.split(/[\\/]/).slice(0, -1)
  return folders.some(isSkippedFolder) ? null : kind
}

import { isSupportedNotePicture } from './note-pictures'

/**
 * What Ryte lists in the folder tree and quick open. Later steps add rows here when their viewers ship.
 * Notes are searched and indexed; pictures are only listed.
 */
export type SupportedKind = 'note' | 'picture'

/** Folders whose pictures are not listed: dependencies and hidden folders. Notes inside them are still listed. */
export function isSkippedPictureFolder(name: string): boolean {
  return name === 'node_modules' || name.startsWith('.')
}

/** The kind a file name has by its extension (any letter case), or null when Ryte does not list it. */
export function supportedKindOf(path: string): SupportedKind | null {
  if (path.toLowerCase().endsWith('.md')) return 'note'
  if (isSupportedNotePicture(path)) return 'picture'
  return null
}

/**
 * The kind a file has when listed from the notes folder, given its path relative to it (either separator).
 * A picture under `node_modules` or a dot folder is not listed; a note is listed wherever it is.
 */
export function listedKindOf(relativePath: string): SupportedKind | null {
  const kind = supportedKindOf(relativePath)
  if (kind !== 'picture') return kind
  const folders = relativePath.split(/[\\/]/).slice(0, -1)
  return folders.some(isSkippedPictureFolder) ? null : kind
}

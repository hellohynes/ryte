import { noteFileUrl } from '../../../shared/note-pictures'
import { supportedKindOf } from '../../../shared/supported-types'
import type { LightboxPicture } from './lightbox-model'
import type { SidebarTreeNode } from './sidebar-tree-model'

/** The folder part of a notes-relative path ('' for the notes folder itself). */
function folderOf(sourcePath: string): string {
  const slash = sourcePath.lastIndexOf('/')
  return slash < 0 ? '' : sourcePath.slice(0, slash)
}

function fileNameOf(sourcePath: string): string {
  return sourcePath.slice(sourcePath.lastIndexOf('/') + 1)
}

/**
 * The supported pictures in the same folder as `sourcePath`, in the order the folder tree shows them, and the
 * position of `sourcePath` in that list. The tree decides the order, so a folder sorted Z-A or by recency steps
 * the same way. Null when the picture is not in the tree.
 */
export function folderPictureList(
  tree: readonly SidebarTreeNode[],
  sourcePath: string
): { paths: string[]; start: number } | null {
  let siblings: readonly SidebarTreeNode[] = tree
  const folder = folderOf(sourcePath)
  if (folder !== '') {
    for (const segment of folder.split('/')) {
      const next = siblings.find((node) => node.isFolder && node.name === segment)
      if (!next) return null
      siblings = next.children
    }
  }

  const paths = siblings
    .filter((node) => !node.isFolder && supportedKindOf(node.relPath) === 'picture')
    .map((node) => node.relPath)
  const start = paths.indexOf(sourcePath)
  return start < 0 ? null : { paths, start }
}

/** The lightbox's pictures for a list of notes-relative picture paths; the file name is the description. */
export function lightboxPicturesFor(paths: readonly string[]): LightboxPicture[] {
  return paths.map((path) => ({ src: noteFileUrl(path), alt: fileNameOf(path), origin: path }))
}

/** A file size for the picture's caption: bytes, then KB and MB with one decimal. */
export function formatPictureFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

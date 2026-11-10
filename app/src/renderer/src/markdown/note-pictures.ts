import {
  isSupportedNotePicture,
  noteFileUrl,
  notePictureExtension
} from '../../../shared/note-pictures'

const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i

/** A target with no scheme and no host: a path that may point at a file in the notes folder. */
export function isNoteRelativeTarget(target: string): boolean {
  return !SCHEME_RE.test(target) && !target.startsWith('//')
}

/**
 * Resolves a picture target, as markdown-it normalized it, against the note's own notes-relative path.
 * Relative (`a.png`, `./a.png`, `../a.png`) and root-relative (`/a.png`) targets resolve; anything that
 * leaves the notes folder, has a scheme, a backslash or a NUL byte, or belongs to a note outside the notes
 * folder returns null.
 */
export function resolveNotePicturePath(
  target: string,
  notePath: string | undefined
): string | null {
  if (!notePath || !isNoteRelativeTarget(target)) return null

  const end = target.search(/[?#]/)
  let path: string
  try {
    path = decodeURIComponent(end >= 0 ? target.slice(0, end) : target)
  } catch {
    return null
  }
  if (!path || path.includes('\0') || path.includes('\\')) return null

  const segments = path.startsWith('/') ? [] : notePath.split('/').slice(0, -1)
  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') {
      if (segments.length === 0) return null
      segments.pop()
      continue
    }
    segments.push(segment)
  }
  return segments.length > 0 ? segments.join('/') : null
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function fileName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

/**
 * The markup for a relative picture that can't be resolved inside the notes folder (it leaves the folder, or
 * the note itself is outside it): a quiet notice with the description, so nothing is requested and no
 * broken-picture icon shows.
 */
export function renderUnresolvedNotePicture(target: string, alt: string): string {
  const label = alt || fileName(target) || 'Picture'
  return [
    '<span class="note-picture-notice" data-note-picture-notice="unresolved">',
    `<span class="note-picture-notice-alt">${escapeHtml(label)}</span>`,
    '</span>'
  ].join('')
}

/**
 * The markup for a picture that resolved inside the notes folder. A type Ryte can't show becomes a small
 * notice instead, so nothing is requested for it.
 */
export function renderNotePicture(picturePath: string, alt: string, title: string | null): string {
  if (!isSupportedNotePicture(picturePath)) {
    const extension = notePictureExtension(picturePath)
    const detail = extension
      ? `Ryte can't show .${escapeHtml(extension)} pictures yet.`
      : "Ryte can't show this kind of picture yet."
    return [
      '<span class="note-picture-notice" data-note-picture-notice="unsupported">',
      `<span class="note-picture-notice-alt">${escapeHtml(alt || fileName(picturePath))}</span>`,
      `<span class="note-picture-notice-detail">${detail}</span>`,
      '</span>'
    ].join('')
  }

  const titleAttribute = title ? ` title="${escapeHtml(title)}"` : ''
  return `<img src="${escapeHtml(noteFileUrl(picturePath))}" alt="${escapeHtml(alt)}"${titleAttribute} loading="lazy" decoding="async">`
}

/**
 * Wraps a shown picture in a button that opens the lightbox. The button carries the picture's position in
 * reading order, the same way task buttons carry their source line.
 */
export function renderPictureButton(pictureHtml: string, index: number, alt: string): string {
  const label = alt ? `Open picture: ${alt}` : 'Open picture'
  return `<button type="button" class="note-picture-button" aria-label="${escapeHtml(label)}" data-note-picture-index="${index}">${pictureHtml}</button>`
}

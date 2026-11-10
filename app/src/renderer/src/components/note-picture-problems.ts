import {
  NOTE_FILE_URL_PREFIX,
  RASTER_NOTE_PICTURE_EXTENSIONS,
  notePictureExtension,
  parseNoteFileUrl
} from '../../../shared/note-pictures'

export type PictureProblem = Awaited<ReturnType<Window['ryte']['pictures']['explain']>>

export interface PictureProblemText {
  detail: string
  /** Offer to open it in the default app: only for a raster picture that is too large to show. */
  canOpen: boolean
}

const MEGABYTE = 1024 * 1024

// Only pictures over the 50 MB cap show a size, so whole megabytes are enough.
function formatPictureSize(bytes: number): string {
  return `${Math.round(bytes / MEGABYTE)} MB`
}

export function describePictureProblem(problem: PictureProblem, path: string): PictureProblemText {
  const name = path.slice(path.lastIndexOf('/') + 1)
  switch (problem.reason) {
    case 'too-large':
      return {
        detail:
          problem.sizeBytes === null
            ? `${name} is too large to show here.`
            : `${name}, ${formatPictureSize(problem.sizeBytes)}, too large to show here.`,
        canOpen: RASTER_NOTE_PICTURE_EXTENSIONS.has(notePictureExtension(path))
      }
    case 'missing':
      return { detail: `${name} wasn't found.`, canOpen: false }
    case 'blocked':
      return { detail: `Ryte can't show ${name}.`, canOpen: false }
    case 'unreadable':
      return { detail: `Ryte couldn't read ${name}.`, canOpen: false }
  }
}

/** The notes-relative path of a picture that loads through `ryte-file`, or null for any other picture. */
export function notePicturePathOf(img: HTMLImageElement): string | null {
  const src = img.getAttribute('src') ?? ''
  return src.startsWith(NOTE_FILE_URL_PREFIX) ? parseNoteFileUrl(src) : null
}

/**
 * The notice that takes a failed picture's place, built from text nodes so nothing in the description or path
 * is read as markup. The open button looks like a secondary small `StButton`.
 */
export function buildPictureProblemNotice(
  document: Document,
  problem: PictureProblem,
  path: string,
  alt: string
): HTMLElement {
  const text = describePictureProblem(problem, path)
  const notice = document.createElement('span')
  notice.className = 'note-picture-notice'
  notice.dataset.notePictureNotice = problem.reason

  if (alt) {
    const altEl = document.createElement('span')
    altEl.className = 'note-picture-notice-alt'
    altEl.textContent = alt
    notice.append(altEl)
  }

  const detail = document.createElement('span')
  detail.className = 'note-picture-notice-detail'
  detail.textContent = text.detail
  notice.append(detail)

  if (text.canOpen) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'st-button note-picture-open'
    button.dataset.stVariant = 'secondary'
    button.dataset.stSize = 'sm'
    button.dataset.notePictureOpen = path
    button.textContent = 'Open in Preview'
    notice.append(button)
  }

  return notice
}

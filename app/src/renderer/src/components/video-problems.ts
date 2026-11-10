import { NOTE_FILE_URL_PREFIX, parseNoteFileUrl } from '../../../shared/note-pictures'
import type { VideoProblem } from '../../../contract/video'

export type { VideoProblem }

export interface VideoProblemText {
  detail: string
  /** Offer to open it in the default app: only for a video that passes every check but would not play. */
  canOpen: boolean
}

export function describeVideoProblem(problem: VideoProblem, path: string): VideoProblemText {
  const name = path.slice(path.lastIndexOf('/') + 1)
  switch (problem.reason) {
    case 'missing':
      return { detail: `${name} wasn't found.`, canOpen: false }
    case 'blocked':
      return { detail: `Ryte can't play ${name}.`, canOpen: false }
    case 'unplayable':
      return { detail: `Ryte can't play ${name}. Its format may not be supported.`, canOpen: true }
  }
}

/** Opens a video in its default app; the button is disabled meanwhile and says so when it could not open. */
export async function openVideoInDefaultApp(
  button: HTMLButtonElement,
  path: string
): Promise<void> {
  button.disabled = true
  try {
    const { opened } = await window.ryte.video.openInDefaultApp({ path })
    if (!opened) button.textContent = "Couldn't open it"
  } finally {
    button.disabled = false
  }
}

/** The notes-relative path of a video that loads through `ryte-file`, or null for any other video. */
export function noteVideoPathOf(video: HTMLVideoElement): string | null {
  const src = video.getAttribute('src') ?? ''
  return src.startsWith(NOTE_FILE_URL_PREFIX) ? parseNoteFileUrl(src) : null
}

/**
 * The notice that takes a failed video's place, built from text nodes so nothing in the description or path
 * is read as markup. It is the same box a failed picture gets, and the open button looks like a secondary
 * small `StButton`.
 */
export function buildVideoProblemNotice(
  document: Document,
  problem: VideoProblem,
  path: string,
  alt: string
): HTMLElement {
  const text = describeVideoProblem(problem, path)
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
    button.dataset.noteVideoOpen = path
    button.textContent = 'Open in default app'
    notice.append(button)
  }

  return notice
}

/** A length for the video's caption: m:ss, or h:mm:ss from an hour on. Null when the length is not known. */
export function formatVideoDuration(seconds: number): string | null {
  if (!Number.isFinite(seconds) || seconds < 0) return null
  const total = Math.round(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const rest = String(total % 60).padStart(2, '0')
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`
}

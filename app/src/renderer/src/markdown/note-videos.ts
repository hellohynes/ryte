import { noteFileUrl } from '../../../shared/note-pictures'
import { isSupportedNoteVideo } from '../../../shared/note-videos'
import { escapeHtml, fileName } from './note-pictures'

/** Whether a link with a scheme points at a video on the web, by the extension of its path. */
export function isWebVideoTarget(target: string): boolean {
  try {
    const url = new URL(target)
    return url.protocol === 'https:' && isSupportedNoteVideo(url.pathname)
  } catch {
    return false
  }
}

/**
 * The markup for a video that resolved inside the notes folder: the standard controls, only the first frame
 * read until it is played, and never autoplay. The description labels the wrapper, so the video itself carries
 * nothing the sanitizer would remove.
 */
export function renderNoteVideo(videoPath: string, alt: string): string {
  const label = alt || fileName(videoPath)
  return (
    `<span class="note-video" role="group" aria-label="${escapeHtml(label)}">` +
    `<video src="${escapeHtml(noteFileUrl(videoPath))}" controls preload="metadata"></video></span>`
  )
}

/** A video on the web is never loaded: the note shows a link to it instead. */
export function renderWebVideoLink(target: string, alt: string): string {
  return `<a href="${escapeHtml(target)}" target="_blank" rel="noreferrer noopener">${escapeHtml(alt || target)}</a>`
}

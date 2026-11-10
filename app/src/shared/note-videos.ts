import { notePictureExtension } from './note-pictures'

/**
 * Videos load through the same `ryte-file` scheme as pictures, from inside the notes folder only. They are
 * streamed in pieces, so there is no size cap.
 */
export const NOTE_VIDEO_CONTENT_TYPES: Readonly<Record<string, string>> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime'
}

/** The content type for a video extension (lowercase, no dot), or undefined when Ryte does not play it. */
export function noteVideoContentType(extension: string): string | undefined {
  return Object.hasOwn(NOTE_VIDEO_CONTENT_TYPES, extension)
    ? NOTE_VIDEO_CONTENT_TYPES[extension]
    : undefined
}

/** Whether the path names a video type Ryte plays, in any letter case. */
export function isSupportedNoteVideo(path: string): boolean {
  return noteVideoContentType(notePictureExtension(path)) !== undefined
}
